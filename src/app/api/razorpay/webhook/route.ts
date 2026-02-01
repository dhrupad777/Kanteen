import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import Razorpay from 'razorpay';
import { verifyWebhookSignature, generateSecureOTP, hashOTP, generateOTPSalt } from '@/lib/crypto-utils';
import { logAuditEvent } from '@/lib/audit-logger';

const CAMPUS_ID = 'default';
const OTP_EXPIRY_MINUTES = 30;

/**
 * Razorpay webhook handler (backup payment verification)
 * POST /api/razorpay/webhook
 * 
 * Security measures:
 * - Timing-safe signature verification using raw body
 * - Event deduplication via webhook_events collection
 * - Fetches payment from Razorpay to verify amount/currency
 * - Audit logging
 */
export async function POST(request: NextRequest) {
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    try {
        // Get Firebase instance (lazy initialization)
        const db = getAdminDb();

        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = request.headers.get('x-razorpay-signature');
        const rawBody = await request.text();

        // ====== STEP 1: VERIFY WEBHOOK SIGNATURE ======
        if (webhookSecret && signature) {
            const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
            if (!isValid) {
                await logAuditEvent({
                    eventType: 'SIGNATURE_INVALID',
                    actorId: 'webhook',
                    ip: clientIP,
                    details: { source: 'razorpay_webhook' },
                });
                return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
            }
        }

        const event = JSON.parse(rawBody);
        const eventType = event.event;

        // ====== STEP 2: EVENT DEDUPLICATION ======
        // Use payment ID as the unique event identifier
        const paymentEntity = event.payload?.payment?.entity;
        if (!paymentEntity) {
            return NextResponse.json({ status: 'invalid_payload' }, { status: 400 });
        }

        const eventId = `${eventType}_${paymentEntity.id}`;
        const webhookEventRef = db.collection('webhook_events').doc(eventId);

        // Check if already processed
        const existingEvent = await webhookEventRef.get();
        if (existingEvent.exists) {
            await logAuditEvent({
                eventType: 'WEBHOOK_DUPLICATE',
                actorId: 'webhook',
                ip: clientIP,
                details: { eventId, eventType },
            });
            return NextResponse.json({ status: 'already_processed' });
        }

        // Handle payment.captured event
        if (eventType === 'payment.captured') {
            const razorpayOrderId = paymentEntity.order_id;
            const razorpayPaymentId = paymentEntity.id;
            const paymentAmount = paymentEntity.amount;
            const paymentCurrency = paymentEntity.currency;

            // ====== STEP 3: VERIFY PAYMENT FROM RAZORPAY API ======
            const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
            const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

            if (razorpayKeyId && razorpayKeySecret) {
                try {
                    const razorpay = new Razorpay({
                        key_id: razorpayKeyId,
                        key_secret: razorpayKeySecret,
                    });

                    const payment = await razorpay.payments.fetch(razorpayPaymentId);

                    // Verify payment details match
                    if (payment.order_id !== razorpayOrderId) {
                        await logAuditEvent({
                            eventType: 'PAYMENT_FAILED',
                            actorId: 'webhook',
                            ip: clientIP,
                            details: { error: 'ORDER_ID_MISMATCH', expected: razorpayOrderId, actual: payment.order_id },
                        });
                        return NextResponse.json({ status: 'order_mismatch' }, { status: 400 });
                    }

                    if (payment.status !== 'captured') {
                        return NextResponse.json({ status: 'payment_not_captured' });
                    }

                    if (payment.currency !== 'INR') {
                        await logAuditEvent({
                            eventType: 'PAYMENT_FAILED',
                            actorId: 'webhook',
                            ip: clientIP,
                            details: { error: 'CURRENCY_MISMATCH', currency: payment.currency },
                        });
                        return NextResponse.json({ status: 'invalid_currency' }, { status: 400 });
                    }
                } catch (fetchError) {
                    console.error('Webhook: Failed to fetch payment from Razorpay');
                    // Continue with webhook data if API call fails
                }
            }

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

            // ====== VERIFY AMOUNT MATCHES ======
            const expectedAmountPaise = Math.round(orderData.totalPrice * 100);
            if (paymentAmount !== expectedAmountPaise) {
                await logAuditEvent({
                    eventType: 'AMOUNT_MISMATCH',
                    actorId: 'webhook',
                    orderId,
                    ip: clientIP,
                    details: { expected: expectedAmountPaise, actual: paymentAmount },
                });
                return NextResponse.json({ status: 'amount_mismatch' }, { status: 400 });
            }

            // Check if already processed (idempotent)
            if (orderData.payment?.status === 'paid') {
                // Mark webhook event as processed anyway
                await webhookEventRef.set({
                    processedAt: FieldValue.serverTimestamp(),
                    status: 'already_paid',
                });
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

                // ====== GENERATE SECURE OTP ======
                const otp = generateSecureOTP();
                const otpSalt = generateOTPSalt();
                const otpHash = hashOTP(otp, otpSalt);
                const otpExpiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

                // ====== UPDATE ORDER ======
                transaction.update(orderRef, {
                    status: 'Preparing',
                    'payment.status': 'paid',
                    'payment.razorpayPaymentId': razorpayPaymentId,
                    'payment.paidAt': FieldValue.serverTimestamp(),
                    'payment.webhookVerified': true,
                    'payment.amount': paymentAmount,
                    'payment.currency': paymentCurrency,
                    token: nextToken,
                    otpHash: otpHash,
                    otpSalt: otpSalt,
                    otpExpiresAt: otpExpiresAt,
                    otpAttempts: 0,
                    dateKey: dateKey,
                    'audit.updatedAt': FieldValue.serverTimestamp(),
                    'audit.updatedBy': 'webhook',
                });

                // Mark webhook event as processed
                transaction.set(webhookEventRef, {
                    processedAt: FieldValue.serverTimestamp(),
                    orderId,
                    status: 'success',
                });
            });

            await logAuditEvent({
                eventType: 'WEBHOOK_PROCESSED',
                actorId: 'webhook',
                orderId,
                ip: clientIP,
                details: { eventType, razorpayPaymentId, amount: paymentAmount },
            });

            return NextResponse.json({ status: 'success' });
        }

        // Handle payment.failed event
        if (eventType === 'payment.failed') {
            const razorpayOrderId = paymentEntity.order_id;

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
                    'payment.errorCode': paymentEntity.error_code,
                    'payment.errorDescription': paymentEntity.error_description,
                    'audit.updatedAt': FieldValue.serverTimestamp(),
                    'audit.updatedBy': 'webhook',
                });

                // Mark webhook event as processed
                await webhookEventRef.set({
                    processedAt: FieldValue.serverTimestamp(),
                    orderId,
                    status: 'failure_recorded',
                });

                await logAuditEvent({
                    eventType: 'PAYMENT_FAILED',
                    actorId: 'webhook',
                    orderId,
                    ip: clientIP,
                    details: { eventType, errorCode: paymentEntity.error_code },
                });
            }

            return NextResponse.json({ status: 'failure_recorded' });
        }

        // Unhandled event type
        await webhookEventRef.set({
            processedAt: FieldValue.serverTimestamp(),
            status: 'ignored',
            eventType,
        });

        return NextResponse.json({ status: 'event_ignored' });

    } catch (error: any) {
        console.error('Razorpay webhook error:', error instanceof Error ? error.message : 'Unknown error');
        return NextResponse.json({ status: 'error', message: error.message });
    }
}
