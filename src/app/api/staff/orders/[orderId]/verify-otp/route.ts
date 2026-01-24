import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { updateDailyReportTransaction } from '@/lib/reports-admin';
import { BYPASS_AUTH } from '@/lib/auth';
import { rateLimit, getClientIP } from '@/lib/rate-limit';

async function hashOTP(otp: string): Promise<string> {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    try {
        // Rate limit by IP (10 OTP verifications per minute)
        const clientIP = getClientIP(request);
        const { success: rateLimitOk, resetIn } = rateLimit(`verify-otp:${clientIP}`, 10, 60000);
        if (!rateLimitOk) {
            return NextResponse.json(
                { error: 'Too many attempts. Please wait before trying again.' },
                {
                    status: 429,
                    headers: { 'Retry-After': Math.ceil(resetIn / 1000).toString() }
                }
            );
        }

        const { orderId } = await params;
        const { otp } = await request.json();

        // Validate OTP input to prevent DoS via expensive hash on large inputs
        if (!otp || typeof otp !== 'string') {
            return NextResponse.json({ error: 'OTP is required' }, { status: 400 });
        }
        if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
            return NextResponse.json({ error: 'Invalid OTP format. Must be 6 digits.' }, { status: 400 });
        }

        // Validate orderId
        if (!orderId || typeof orderId !== 'string' || orderId.length > 100) {
            return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
        }

        let userId = 'test-user-123';

        // Skip authentication if in testing mode
        if (!BYPASS_AUTH) {
            // 1. Authenticate Request
            const authHeader = request.headers.get('Authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const idToken = authHeader.split('Bearer ')[1];
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            const email = decodedToken.email;
            userId = decodedToken.uid;

            if (!email) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            // 2. Verify Manager Permissions
            const allowlistRef = adminDb.collection('manager_allowlist').doc(email.toLowerCase());
            const allowlistSnap = await allowlistRef.get();
            if (!allowlistSnap.exists || allowlistSnap.data()?.enabled !== true) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        } else {
            console.log("🔓 AUTH BYPASS: Skipping authentication in verify-otp route");
        }

        // 3. Run Atomic Transaction for Order + Report
        const orderRef = adminDb.collection('orders').doc(orderId);

        await adminDb.runTransaction(async (transaction) => {
            const orderDoc = await transaction.get(orderRef);

            if (!orderDoc.exists) {
                throw new Error('ORDER_NOT_FOUND');
            }

            const orderData = orderDoc.data();

            // Check if already picked up
            if (orderData?.status === 'PICKED_UP') {
                throw new Error('ALREADY_PICKED_UP');
            }

            // Check attempts
            const attempts = orderData?.otp?.attempts || 0;
            if (attempts >= 5) {
                throw new Error('TOO_MANY_ATTEMPTS');
            }

            // Use submitted OTP
            const submittedHash = await hashOTP(otp);

            if (submittedHash === orderData?.otpHash) {
                // SUCCESS: Update Order AND Report together
                // IMPORTANT: Must perform all READS before WRITES in a transaction.
                // updateDailyReportTransaction performs a GET, so it must be called BEFORE we do any writes.
                await updateDailyReportTransaction(transaction, { ...orderData, status: 'PICKED_UP' });

                transaction.update(orderRef, {
                    status: 'PICKED_UP',
                    'otp.verifiedAt': FieldValue.serverTimestamp(),
                    'kitchen.pickedUpAt': FieldValue.serverTimestamp(),
                    'kitchen.updatedBy': userId
                });

            } else {
                // FAILURE: Increment attempts
                transaction.update(orderRef, {
                    'otp.attempts': FieldValue.increment(1)
                });
                throw new Error('INVALID_OTP');
            }
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('OTP verification error:', error);

        switch (error.message) {
            case 'ORDER_NOT_FOUND':
                return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            case 'ALREADY_PICKED_UP':
                return NextResponse.json({ error: 'Order already picked up' }, { status: 400 });
            case 'TOO_MANY_ATTEMPTS':
                return NextResponse.json({ error: 'Too many attempts. Order locked.' }, { status: 429 });
            case 'INVALID_OTP':
                return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
            default:
                // Include actual error message for debugging
                return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
        }
    }
}
