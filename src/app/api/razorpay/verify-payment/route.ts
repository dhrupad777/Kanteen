import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import Razorpay from 'razorpay';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import { verifyRazorpaySignature } from '@/lib/crypto-utils';
import { logAuditEvent, getUserAgent } from '@/lib/audit-logger';
import { enqueuePrintJobTransaction } from '@/lib/print-queue';
import type { VerifyPaymentRequest, VerifyPaymentResponse } from '@/types';

const CAMPUS_ID = 'default';

/**
 * Verifies Razorpay payment and finalizes order
 * POST /api/razorpay/verify-payment
 * 
 * Security measures:
 * - Timing-safe signature verification
 * - Fetches payment from Razorpay to verify amount/currency/status
 * - OTP with expiry and salted hash
 * - Atomic transaction for token allocation
 * - Audit logging
 */
export async function POST(request: NextRequest) {
    const clientIP = getClientIP(request);
    const userAgent = getUserAgent(request);

    try {
        // Get Firebase instances (lazy initialization)
        const db = getAdminDb();
        const auth = getAdminAuth();

        // Rate limit
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

        // Check Razorpay credentials
        const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
        const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!razorpayKeyId || !razorpaySecret) {
            console.error('Razorpay credentials not configured');
            return NextResponse.json(
                { error: 'Payment service not configured. Please contact support.' },
                { status: 503 }
            );
        }

        // ====== STEP 1: TIMING-SAFE SIGNATURE VERIFICATION ======
        const isValidSignature = verifyRazorpaySignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            razorpaySecret
        );

        if (!isValidSignature) {
            await logAuditEvent({
                eventType: 'SIGNATURE_INVALID',
                actorId: uid,
                orderId,
                ip: clientIP,
                userAgent,
                details: { razorpay_order_id, razorpay_payment_id },
            });
            return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
        }

        // ====== STEP 2: FETCH PAYMENT FROM RAZORPAY TO VERIFY AMOUNT/CURRENCY/STATUS ======
        const razorpay = new Razorpay({
            key_id: razorpayKeyId,
            key_secret: razorpaySecret,
        });

        let payment: any;
        try {
            payment = await razorpay.payments.fetch(razorpay_payment_id);
        } catch (fetchError) {
            console.error('Failed to fetch payment from Razorpay:', fetchError instanceof Error ? fetchError.message : 'Unknown error');
            return NextResponse.json({ error: 'Failed to verify payment with gateway' }, { status: 502 });
        }

        // Verify payment belongs to the correct Razorpay order
        if (payment.order_id !== razorpay_order_id) {
            await logAuditEvent({
                eventType: 'PAYMENT_FAILED',
                actorId: uid,
                orderId,
                ip: clientIP,
                userAgent,
                details: { error: 'ORDER_ID_MISMATCH', expected: razorpay_order_id, actual: payment.order_id },
            });
            return NextResponse.json({ error: 'Payment order mismatch' }, { status: 400 });
        }

        // Verify payment status is captured
        if (payment.status !== 'captured') {
            await logAuditEvent({
                eventType: 'PAYMENT_FAILED',
                actorId: uid,
                orderId,
                ip: clientIP,
                userAgent,
                details: { error: 'PAYMENT_NOT_CAPTURED', status: payment.status },
            });
            return NextResponse.json({ error: 'Payment not captured' }, { status: 400 });
        }

        // Verify currency
        if (payment.currency !== 'INR') {
            await logAuditEvent({
                eventType: 'PAYMENT_FAILED',
                actorId: uid,
                orderId,
                ip: clientIP,
                userAgent,
                details: { error: 'CURRENCY_MISMATCH', currency: payment.currency },
            });
            return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
        }

        // ====== STEP 3: FINALIZE ORDER IN TRANSACTION ======
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

            // ====== VERIFY AMOUNT MATCHES ======
            const expectedAmountPaise = Math.round(orderData.totalPrice * 100);
            if (payment.amount !== expectedAmountPaise) {
                throw new Error('AMOUNT_MISMATCH');
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

            // ====== UPDATE ORDER ======
            // Note: OTP is NOT generated here - it will be generated when staff marks the order as "Ready"
            transaction.update(orderRef, {
                status: 'Preparing',
                'payment.status': 'paid',
                'payment.razorpayPaymentId': razorpay_payment_id,
                'payment.razorpaySignature': razorpay_signature,
                'payment.paidAt': FieldValue.serverTimestamp(),
                'payment.amount': payment.amount,
                'payment.currency': payment.currency,
                token: nextToken,
                dateKey: dateKey,
                'audit.updatedAt': FieldValue.serverTimestamp(),
                'audit.updatedBy': uid,
            });

            // ====== ENQUEUE PRINT JOB (ATOMIC WITH ORDER CONFIRMATION) ======
            enqueuePrintJobTransaction(transaction, orderId, {
                orderId,
                token: nextToken,
                items: orderData.items.map((item: any) => ({ name: item.name, qty: item.quantity })),
                studentName: orderData.userName || undefined,
                isParcel: orderData.isParcel || false,
                createdAt: now.toISOString(),
            });

            return {
                orderId: orderId,
                token: nextToken,
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

        // Log successful payment verification
        await logAuditEvent({
            eventType: 'PAYMENT_VERIFIED',
            actorId: uid,
            orderId: result.orderId,
            ip: clientIP,
            userAgent,
            details: {
                token: result.token,
                amount: payment.amount,
                razorpay_payment_id,
            },
        });

        const response: VerifyPaymentResponse = {
            success: true,
            orderId: result.orderId,
            token: result.token,
            // OTP is generated when order is marked "Ready" by staff
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('Razorpay verify-payment error:', error instanceof Error ? error.message : 'Unknown error');

        // Log amount mismatch specifically
        if (error.message === 'AMOUNT_MISMATCH') {
            await logAuditEvent({
                eventType: 'AMOUNT_MISMATCH',
                actorId: 'unknown',
                ip: clientIP,
                userAgent,
                details: { error: error.message },
            });
        }

        const errorMessages: Record<string, { message: string; status: number }> = {
            ORDER_NOT_FOUND: { message: 'Order not found', status: 404 },
            UNAUTHORIZED: { message: 'Unauthorized', status: 403 },
            ORDER_MISMATCH: { message: 'Order mismatch', status: 400 },
            AMOUNT_MISMATCH: { message: 'Payment amount mismatch', status: 400 },
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
