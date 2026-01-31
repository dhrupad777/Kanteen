import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import type { VerifyPaymentRequest, VerifyPaymentResponse } from '@/types';

const CAMPUS_ID = 'default';

/**
 * Hash OTP using SHA-256
 */
function hashOTP(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

/**
 * Generate 6-digit OTP
 */
function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Verify Razorpay payment signature
 */
function verifyRazorpaySignature(
    orderId: string,
    paymentId: string,
    signature: string,
    secret: string
): boolean {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');
    return expectedSignature === signature;
}

/**
 * Verifies Razorpay payment and finalizes order
 * POST /api/razorpay/verify-payment
 */
export async function POST(request: NextRequest) {
    try {
        // Get Firebase instances (lazy initialization)
        const db = getAdminDb();
        const auth = getAdminAuth();

        // Rate limit
        const clientIP = getClientIP(request);
        const { success: rateLimitOk, resetIn } = rateLimit(`razorpay-verify:${clientIP}`, 10, 60000);
        if (!rateLimitOk) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: { 'Retry-After': Math.ceil(resetIn / 1000).toString() }
                }
            );
        }

        // Verify Firebase auth
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await auth.verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const body: VerifyPaymentRequest = await request.json();
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = body;

        // Validate input
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check Razorpay secret
        const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!razorpaySecret) {
            console.error('Razorpay secret not configured');
            return NextResponse.json(
                { error: 'Payment service not configured. Please contact support.' },
                { status: 503 }
            );
        }

        // Verify signature
        const isValidSignature = verifyRazorpaySignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            razorpaySecret
        );

        if (!isValidSignature) {
            console.error('Invalid Razorpay signature for order:', orderId);
            return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
        }

        // ====== FINALIZE ORDER IN TRANSACTION ======
        const now = new Date();
        const dateKey = now.toISOString().split('T')[0];
        const counterRef = db.collection('order_counters').doc(`${CAMPUS_ID}_${dateKey}`);
        const orderRef = db.collection('orders').doc(orderId);

        const result = await db.runTransaction(async (transaction) => {
            // Get order
            const orderDoc = await transaction.get(orderRef);
            if (!orderDoc.exists) {
                throw new Error('ORDER_NOT_FOUND');
            }

            const orderData = orderDoc.data()!;

            // Verify order belongs to user
            if (orderData.studentId !== uid) {
                throw new Error('UNAUTHORIZED');
            }

            // Verify Razorpay order ID matches
            if (orderData.payment?.razorpayOrderId !== razorpay_order_id) {
                throw new Error('ORDER_MISMATCH');
            }

            // Check if already paid (idempotent)
            if (orderData.payment?.status === 'paid') {
                // Already processed, return existing data
                return {
                    orderId: orderId,
                    token: orderData.token,
                    otp: null, // OTP was already shown once
                    alreadyProcessed: true,
                };
            }

            // Check order status
            if (orderData.status !== 'pending') {
                throw new Error('INVALID_ORDER_STATUS');
            }

            // ====== ALLOCATE TOKEN ======
            const counterDoc = await transaction.get(counterRef);
            let nextToken = 201;

            if (counterDoc.exists) {
                const counterData = counterDoc.data();
                nextToken = counterData?.nextOnlineToken ?? 201;

                if (nextToken > 999) {
                    throw new Error('ONLINE_ORDERS_FULL');
                }
            }

            // Increment counter
            transaction.set(counterRef, {
                nextOnlineToken: nextToken + 1,
                dayKey: dateKey,
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });

            // ====== GENERATE OTP ======
            const otp = generateOTP();
            const otpHash = hashOTP(otp);

            // ====== UPDATE ORDER ======
            transaction.update(orderRef, {
                status: 'Preparing',
                'payment.status': 'paid',
                'payment.razorpayPaymentId': razorpay_payment_id,
                'payment.razorpaySignature': razorpay_signature,
                'payment.paidAt': FieldValue.serverTimestamp(),
                token: nextToken,
                otpHash: otpHash,
                dateKey: dateKey,
                'audit.updatedAt': FieldValue.serverTimestamp(),
                'audit.updatedBy': uid,
            });

            return {
                orderId: orderId,
                token: nextToken,
                otp: otp, // plaintext, shown only once
                alreadyProcessed: false,
            };
        });

        // Handle already processed orders
        if (result.alreadyProcessed) {
            return NextResponse.json({
                success: true,
                orderId: result.orderId,
                token: result.token,
                message: 'Payment was already verified',
            });
        }

        const response: VerifyPaymentResponse = {
            success: true,
            orderId: result.orderId,
            token: result.token,
            otp: result.otp!, // OTP is always present for new orders
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('Razorpay verify-payment error:', error);

        const errorMessages: Record<string, { message: string; status: number }> = {
            ORDER_NOT_FOUND: { message: 'Order not found', status: 404 },
            UNAUTHORIZED: { message: 'Unauthorized', status: 403 },
            ORDER_MISMATCH: { message: 'Order mismatch', status: 400 },
            INVALID_ORDER_STATUS: { message: 'Order cannot be processed', status: 400 },
            ONLINE_ORDERS_FULL: { message: 'Online orders are full for today', status: 429 },
        };

        const errorInfo = errorMessages[error.message];
        if (errorInfo) {
            return NextResponse.json({ error: errorInfo.message }, { status: errorInfo.status });
        }

        return NextResponse.json(
            { error: 'Payment verification failed' },
            { status: 500 }
        );
    }
}
