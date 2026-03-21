import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { validateTransition, getActorRoleFromToken, OrderStatus } from '@/lib/order-state-machine';
import { generateSecureOTP, hashOTP, generateOTPSalt } from '@/lib/crypto-utils';
import { logAuditEvent, getClientIP, getUserAgent } from '@/lib/audit-logger';
import { updateDailyReportOnCompletion } from '@/lib/reports-admin';
import { sendOrderReadyNotification } from '@/lib/push-notifications';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Update order status
 * POST /api/staff/orders/{orderId}/status
 * 
 * Security measures:
 * - State machine enforcement
 * - RBAC with fallback to manager_allowlist
 * - Audit logging
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    const clientIP = getClientIP(request);
    const userAgent = getUserAgent(request);

    try {
        // Rate limit by IP (20 status updates per minute)
        const { success: rateLimitOk, resetIn } = rateLimit(`status-update:${clientIP}`, 20, 60000);
        if (!rateLimitOk) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: { 'Retry-After': Math.ceil(resetIn / 1000).toString() }
                }
            );
        }

        const { orderId } = await params;
        const { status } = await request.json();

        // Input validation
        if (!orderId || typeof orderId !== 'string' || orderId.length > 100) {
            return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
        }

        if (!status || typeof status !== 'string') {
            return NextResponse.json({ error: 'Status is required' }, { status: 400 });
        }

        // ====== AUTHENTICATE REQUEST ======
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const email = decodedToken.email;
        const userId = decodedToken.uid;

        if (!email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ====== CHECK AUTHORIZATION ======
        // First check custom claims (RBAC)
        const actorRole = getActorRoleFromToken(decodedToken);
        let isAuthorized = actorRole === 'kitchen_staff' || actorRole === 'kitchen_manager' || actorRole === 'admin';

        // Fallback to manager_allowlist for backward compatibility
        if (!isAuthorized) {
            const allowlistRef = adminDb.collection('manager_allowlist').doc(email.toLowerCase());
            const allowlistSnap = await allowlistRef.get();
            isAuthorized = allowlistSnap.exists && allowlistSnap.data()?.enabled === true;
        }

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // ====== GET ORDER AND VALIDATE TRANSITION ======
        const orderRef = adminDb.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const orderData = orderSnap.data()!;
        const currentStatus = orderData.status as OrderStatus;

        // ====== STATE MACHINE ENFORCEMENT ======
        const transitionResult = validateTransition(currentStatus, status as OrderStatus, 'kitchen_staff');

        if (!transitionResult.valid) {
            await logAuditEvent({
                eventType: 'INVALID_TRANSITION',
                actorId: userId,
                actorRole,
                orderId,
                ip: clientIP,
                userAgent,
                details: {
                    from: currentStatus,
                    to: status,
                    error: transitionResult.error,
                },
            });
            return NextResponse.json(
                { error: transitionResult.error || `Cannot transition from ${currentStatus} to ${status}` },
                { status: 400 }
            );
        }

        // ====== SPECIAL CASE: PICKED_UP REQUIRES OTP ======
        if (transitionResult.requiresOtp) {
            return NextResponse.json(
                { error: 'This transition requires OTP verification. Use the verify-otp endpoint.' },
                { status: 400 }
            );
        }

        // ====== BUILD UPDATE DATA ======
        const updateData: Record<string, any> = {
            status,
            'kitchen.updatedBy': userId,
            'audit.updatedAt': FieldValue.serverTimestamp(),
            'audit.updatedBy': userId,
        };

        if (status === 'Preparing') {
            updateData['kitchen.markedPreparingAt'] = FieldValue.serverTimestamp();
            updateData['kitchen.markedPreparingBy'] = userId;
        } else if (status === 'Ready') {
            updateData['kitchen.readyAt'] = FieldValue.serverTimestamp();
            updateData['kitchen.markedReadyBy'] = userId;

            // Auto-generate new OTP when marked Ready
            const newOtp = generateSecureOTP();
            const newSalt = generateOTPSalt();
            const newHash = hashOTP(newOtp, newSalt);
            const expiryMinutes = 45;
            const now = new Date();
            const expiresAt = new Date(now.getTime() + expiryMinutes * 60000);

            updateData['secretOtp'] = newOtp;
            updateData['otpHash'] = newHash;
            updateData['otpSalt'] = newSalt;
            updateData['otpExpiresAt'] = expiresAt;
            // Clear any previous attempts/locks
            updateData['otpAttempts'] = 0;
            updateData['otpLockedUntil'] = FieldValue.delete();
        }

        await orderRef.update(updateData);

        // ====== LOG AUDIT EVENT ======
        await logAuditEvent({
            eventType: 'STATUS_CHANGED',
            actorId: userId,
            actorRole,
            orderId,
            ip: clientIP,
            userAgent,
            details: {
                from: currentStatus,
                to: status,
                token: orderData.token,
            },
        });

        // Send push notification when order is marked Ready
        if (status === 'Ready' && orderData.studentId) {
            sendOrderReadyNotification(orderId, orderData.studentId, orderData.token, orderData.userName).catch(() => {});
        }

        // If newly completed, update the daily report and cleanup note
        if (status === 'Completed' && orderData.status !== 'Completed') {
            await updateDailyReportOnCompletion({ ...orderData, status: 'Completed' });
            // Cleanup note to save storage (no longer needed after completion)
            if (orderData.note) {
                await orderRef.update({ note: FieldValue.delete() });
            }
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Status update error:', error instanceof Error ? error.message : 'Unknown error');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
