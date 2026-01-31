import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

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
 * Verify Razorpay webhook signature
 */
function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');
    return expectedSignature === signature;
}

/**
 * Razorpay webhook handler (backup payment verification)
 * POST /api/razorpay/webhook
 */
export async function POST(request: NextRequest) {
    try {
        // Get Firebase instance (lazy initialization)
        const db = getAdminDb();

        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = request.headers.get('x-razorpay-signature');
        const rawBody = await request.text();

        if (webhookSecret && signature) {
            const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
            if (!isValid) {
                console.error('Invalid webhook signature');
                return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
            }
        }

        const event = JSON.parse(rawBody);
        const eventType = event.event;

        console.log('Razorpay webhook received:', eventType);

        // Handle payment.captured event
        if (eventType === 'payment.captured') {
            const payment = event.payload.payment.entity;
            const razorpayOrderId = payment.order_id;
            const razorpayPaymentId = payment.id;

            // Find order by razorpay_order_id
            const ordersQuery = await db
                .collection('orders')
                .where('payment.razorpayOrderId', '==', razorpayOrderId)
                .limit(1)
                .get();

            if (ordersQuery.empty) {
                console.error('Webhook: Order not found for razorpay_order_id:', razorpayOrderId);
                return NextResponse.json({ status: 'order_not_found' });
            }

            const orderDoc = ordersQuery.docs[0];
            const orderData = orderDoc.data();
            const orderId = orderDoc.id;

            // Check if already processed (idempotent)
            if (orderData.payment?.status === 'paid') {
                console.log('Webhook: Order already paid:', orderId);
                return NextResponse.json({ status: 'already_processed' });
            }

            // ====== FINALIZE ORDER IN TRANSACTION ======
            const now = new Date();
            const dateKey = now.toISOString().split('T')[0];
            const counterRef = db.collection('order_counters').doc(`${CAMPUS_ID}_${dateKey}`);
            const orderRef = db.collection('orders').doc(orderId);

            await db.runTransaction(async (transaction) => {
                const currentOrderDoc = await transaction.get(orderRef);
                if (!currentOrderDoc.exists) {
                    throw new Error('Order not found');
                }

                const currentOrderData = currentOrderDoc.data()!;

                // Double-check not already paid
                if (currentOrderData.payment?.status === 'paid') {
                    return; // Already processed
                }

                // ====== ALLOCATE TOKEN ======
                const counterDoc = await transaction.get(counterRef);
                let nextToken = 201;

                if (counterDoc.exists) {
                    const counterData = counterDoc.data();
                    nextToken = counterData?.nextOnlineToken ?? 201;

                    if (nextToken > 999) {
                        console.error('Webhook: Token limit reached for order:', orderId);
                        nextToken = 999;
                    }
                }

                // Increment counter
                if (nextToken < 999) {
                    transaction.set(counterRef, {
                        nextOnlineToken: nextToken + 1,
                        dayKey: dateKey,
                        updatedAt: FieldValue.serverTimestamp(),
                    }, { merge: true });
                }

                // ====== GENERATE OTP ======
                const otp = generateOTP();
                const otpHash = hashOTP(otp);

                // ====== UPDATE ORDER ======
                transaction.update(orderRef, {
                    status: 'Preparing',
                    'payment.status': 'paid',
                    'payment.razorpayPaymentId': razorpayPaymentId,
                    'payment.paidAt': FieldValue.serverTimestamp(),
                    'payment.webhookVerified': true,
                    token: nextToken,
                    otpHash: otpHash,
                    dateKey: dateKey,
                    'audit.updatedAt': FieldValue.serverTimestamp(),
                    'audit.updatedBy': 'webhook',
                });

                console.log('Webhook: Order finalized:', orderId, 'Token:', nextToken);
            });

            return NextResponse.json({ status: 'success' });
        }

        // Handle payment.failed event
        if (eventType === 'payment.failed') {
            const payment = event.payload.payment.entity;
            const razorpayOrderId = payment.order_id;

            const ordersQuery = await db
                .collection('orders')
                .where('payment.razorpayOrderId', '==', razorpayOrderId)
                .limit(1)
                .get();

            if (!ordersQuery.empty) {
                const orderDoc = ordersQuery.docs[0];
                const orderId = orderDoc.id;

                await db.collection('orders').doc(orderId).update({
                    'payment.status': 'failed',
                    'payment.failedAt': FieldValue.serverTimestamp(),
                    'payment.errorCode': payment.error_code,
                    'payment.errorDescription': payment.error_description,
                    'audit.updatedAt': FieldValue.serverTimestamp(),
                    'audit.updatedBy': 'webhook',
                });

                console.log('Webhook: Payment failed for order:', orderId);
            }

            return NextResponse.json({ status: 'failure_recorded' });
        }

        console.log('Webhook: Unhandled event type:', eventType);
        return NextResponse.json({ status: 'event_ignored' });

    } catch (error: any) {
        console.error('Razorpay webhook error:', error);
        return NextResponse.json({ status: 'error', message: error.message });
    }
}
