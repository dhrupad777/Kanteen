import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { generateSecureOTP, hashOTP, generateOTPSalt } from '@/lib/crypto-utils';
import { logAuditEvent, getClientIP, getUserAgent } from '@/lib/audit-logger';
import { rateLimit } from '@/lib/rate-limit';

const OTP_EXPIRY_MINUTES = 30;

/**
 * Regenerate OTP for an order
 * POST /api/orders/{orderId}/regenerate-otp
 * 
 * Allows the order owner to regenerate their OTP if they lost it.
 * 
 * Security measures:
 * - Requires authentication
 * - Verifies order ownership
 * - Only allowed before pickup
 * - Rate limited
 * - Audit logging
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    const clientIP = getClientIP(request);
    const userAgent = getUserAgent(request);

    try {
        const db = getAdminDb();
        const auth = getAdminAuth();

        const { orderId } = await params;

        // Input validation
        if (!orderId || typeof orderId !== 'string' || orderId.length > 100) {
            return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
        }

        // ====== RATE LIMITING ======
        const rateLimitKey = `regenerate-otp:${clientIP}`;
        const { success: rateLimitOk, resetIn } = rateLimit(rateLimitKey, 5, 60000);
        if (!rateLimitOk) {
            return NextResponse.json(
                { error: 'Too many requests. Please wait before trying again.' },
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
        const decodedToken = await auth.verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // ====== GET ORDER ======
        const orderRef = db.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();

        if (!orderSnap.exists) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const orderData = orderSnap.data()!;

        // ====== VERIFY OWNERSHIP ======
        if (orderData.studentId !== uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // ====== CHECK ORDER STATUS ======
        if (orderData.status === 'PICKED_UP') {
            return NextResponse.json({ error: 'Order already picked up' }, { status: 400 });
        }

        if (orderData.status === 'pending') {
            return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
        }

        if (orderData.status === 'EXPIRED' || orderData.status === 'CANCELLED') {
            return NextResponse.json({ error: 'Order is no longer active' }, { status: 400 });
        }

        // ====== GENERATE NEW OTP ======
        const now = new Date();
        const otp = generateSecureOTP();
        const otpSalt = generateOTPSalt();
        const otpHash = hashOTP(otp, otpSalt);
        const otpExpiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

        // ====== UPDATE ORDER ======
        await orderRef.update({
            otpHash: otpHash,
            otpSalt: otpSalt,
            otpExpiresAt: otpExpiresAt,
            otpAttempts: 0,
            otpLockedUntil: FieldValue.delete(), // Clear any lockout
            'audit.otpRegeneratedAt': FieldValue.serverTimestamp(),
            'audit.updatedAt': FieldValue.serverTimestamp(),
            'audit.updatedBy': uid,
        });

        // ====== LOG AUDIT EVENT ======
        await logAuditEvent({
            eventType: 'OTP_REGENERATED',
            actorId: uid,
            orderId,
            ip: clientIP,
            userAgent,
            details: { token: orderData.token },
        });

        return NextResponse.json({
            success: true,
            otp: otp, // Return plaintext OTP once
            expiresAt: otpExpiresAt.toISOString(),
        });

    } catch (error: any) {
        console.error('Regenerate OTP error:', error instanceof Error ? error.message : 'Unknown error');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
