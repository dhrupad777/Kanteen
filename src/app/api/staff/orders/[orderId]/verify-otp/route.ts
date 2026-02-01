import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { hashOTP, timingSafeEqual } from '@/lib/crypto-utils';
import { validateTransition, getActorRoleFromToken } from '@/lib/order-state-machine';
import { logAuditEvent, getClientIP, getUserAgent } from '@/lib/audit-logger';
import { updateDailyReportTransaction } from '@/lib/reports-admin';
import { rateLimit } from '@/lib/rate-limit';

const MAX_OTP_ATTEMPTS = 5;
const OTP_LOCKOUT_MINUTES = 10;

/**
 * Verify OTP for order pickup
 * POST /api/staff/orders/{orderId}/verify-otp
 * 
 * Security measures:
 * - Rate limiting by IP + orderId
 * - OTP expiry check
 * - Lockout after max attempts
 * - Timing-safe hash comparison
 * - State machine enforcement
 * - Audit logging
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    const clientIP = getClientIP(request);
    const userAgent = getUserAgent(request);

    try {
        const { orderId } = await params;
        const { otp } = await request.json();

        // ====== INPUT VALIDATION ======
        if (!otp || typeof otp !== 'string') {
            return NextResponse.json({ error: 'OTP is required' }, { status: 400 });
        }
        if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
            return NextResponse.json({ error: 'Invalid OTP format. Must be 6 digits.' }, { status: 400 });
        }
        if (!orderId || typeof orderId !== 'string' || orderId.length > 100) {
            return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
        }

        // ====== RATE LIMITING: IP + ORDER ======
        const rateLimitKey = `verify-otp:${orderId}:${clientIP}`;
        const { success: rateLimitOk, resetIn } = rateLimit(rateLimitKey, 10, 60000);
        if (!rateLimitOk) {
            return NextResponse.json(
                { error: 'Too many attempts. Please wait before trying again.' },
                {
                    status: 429,
                    headers: { 'Retry-After': Math.ceil(resetIn / 1000).toString() }
                }
            );
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

        // ====== VERIFY MANAGER PERMISSIONS ======
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

        // ====== RUN ATOMIC TRANSACTION ======
        const orderRef = adminDb.collection('orders').doc(orderId);

        await adminDb.runTransaction(async (transaction) => {
            const orderDoc = await transaction.get(orderRef);

            if (!orderDoc.exists) {
                throw new Error('ORDER_NOT_FOUND');
            }

            const orderData = orderDoc.data()!;

            // ====== STATE MACHINE: VALIDATE TRANSITION ======
            const transitionResult = validateTransition(orderData.status, 'PICKED_UP', 'kitchen_staff');
            if (!transitionResult.valid) {
                await logAuditEvent({
                    eventType: 'INVALID_TRANSITION',
                    actorId: userId,
                    actorRole,
                    orderId,
                    ip: clientIP,
                    userAgent,
                    details: { from: orderData.status, to: 'PICKED_UP', error: transitionResult.error },
                });
                throw new Error('INVALID_STATUS');
            }

            // ====== CHECK IF ALREADY PICKED UP ======
            if (orderData.status === 'PICKED_UP') {
                throw new Error('ALREADY_PICKED_UP');
            }

            // ====== CHECK OTP LOCKOUT ======
            if (orderData.otpLockedUntil) {
                const lockedUntil = orderData.otpLockedUntil.toDate ? orderData.otpLockedUntil.toDate() : new Date(orderData.otpLockedUntil);
                if (new Date() < lockedUntil) {
                    const remainingMs = lockedUntil.getTime() - Date.now();
                    const remainingMins = Math.ceil(remainingMs / 60000);
                    throw new Error(`OTP_LOCKED:${remainingMins}`);
                }
            }

            // ====== CHECK OTP EXPIRY ======
            if (orderData.otpExpiresAt) {
                const expiresAt = orderData.otpExpiresAt.toDate ? orderData.otpExpiresAt.toDate() : new Date(orderData.otpExpiresAt);
                if (new Date() > expiresAt) {
                    throw new Error('OTP_EXPIRED');
                }
            }

            // ====== CHECK ATTEMPT COUNT ======
            const attempts = orderData.otpAttempts || 0;
            if (attempts >= MAX_OTP_ATTEMPTS) {
                // Lock the order for OTP verification
                const lockUntil = new Date(Date.now() + OTP_LOCKOUT_MINUTES * 60 * 1000);
                transaction.update(orderRef, {
                    otpLockedUntil: lockUntil,
                });
                await logAuditEvent({
                    eventType: 'OTP_LOCKED',
                    actorId: userId,
                    actorRole,
                    orderId,
                    ip: clientIP,
                    userAgent,
                    details: { attempts, lockUntil: lockUntil.toISOString() },
                });
                throw new Error('TOO_MANY_ATTEMPTS');
            }

            // ====== VERIFY OTP WITH TIMING-SAFE COMPARISON ======
            const submittedHash = hashOTP(otp, orderData.otpSalt);
            const storedHash = orderData.otpHash;

            if (!timingSafeEqual(submittedHash, storedHash)) {
                // Increment attempts
                transaction.update(orderRef, {
                    otpAttempts: FieldValue.increment(1),
                });
                await logAuditEvent({
                    eventType: 'OTP_FAILED',
                    actorId: userId,
                    actorRole,
                    orderId,
                    ip: clientIP,
                    userAgent,
                    details: { attempt: attempts + 1 },
                });
                throw new Error('INVALID_OTP');
            }

            // ====== SUCCESS: UPDATE ORDER AND REPORT ======
            // IMPORTANT: Must perform all READS before WRITES in a transaction.
            await updateDailyReportTransaction(transaction, { ...orderData, status: 'PICKED_UP' });

            transaction.update(orderRef, {
                status: 'PICKED_UP',
                'otp.verifiedAt': FieldValue.serverTimestamp(),
                'kitchen.pickedUpAt': FieldValue.serverTimestamp(),
                'kitchen.updatedBy': userId,
                'audit.updatedAt': FieldValue.serverTimestamp(),
                'audit.updatedBy': userId,
            });

            await logAuditEvent({
                eventType: 'OTP_VERIFIED',
                actorId: userId,
                actorRole,
                orderId,
                ip: clientIP,
                userAgent,
                details: { token: orderData.token },
            });
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('OTP verification error:', error instanceof Error ? error.message : 'Unknown error');

        // Handle locked error with remaining time
        if (error.message?.startsWith('OTP_LOCKED:')) {
            const remainingMins = error.message.split(':')[1];
            return NextResponse.json(
                { error: `Too many attempts. Try again in ${remainingMins} minute(s).` },
                { status: 429 }
            );
        }

        const errorMessages: Record<string, { message: string; status: number }> = {
            ORDER_NOT_FOUND: { message: 'Order not found', status: 404 },
            ALREADY_PICKED_UP: { message: 'Order already picked up', status: 400 },
            INVALID_STATUS: { message: 'Order is not ready for pickup', status: 400 },
            TOO_MANY_ATTEMPTS: { message: 'Too many attempts. Order locked.', status: 429 },
            INVALID_OTP: { message: 'Invalid OTP', status: 400 },
            OTP_EXPIRED: { message: 'OTP has expired. Please ask customer to regenerate.', status: 400 },
        };

        const errorInfo = errorMessages[error.message];
        if (errorInfo) {
            return NextResponse.json({ error: errorInfo.message }, { status: errorInfo.status });
        }

        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
