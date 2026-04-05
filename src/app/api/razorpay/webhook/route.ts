import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import Razorpay from 'razorpay';
import { verifyWebhookSignature, generateSecureOTP, hashOTP, generateOTPSalt } from '@/lib/crypto-utils';
import { logAuditEvent } from '@/lib/audit-logger';
import { enqueuePrintJobTransaction } from '@/lib/print-queue';

const CAMPUS_ID = 'default';
const OTP_EXPIRY_MINUTES = 45;

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
        // Both the secret and signature header MUST be present and valid.
        // Skipping this check would allow anyone to forge payment.captured events.
        if (!webhookSecret) {
            console.error('RAZORPAY_WEBHOOK_SECRET is not configured — rejecting webhook');
            return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
        }
        if (!signature) {
            await logAuditEvent({
                eventType: 'SIGNATURE_INVALID',
                actorId: 'webhook',
                ip: clientIP,
                details: { source: 'razorpay_webhook', error: 'missing_signature_header' },
            });
            return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
        }
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
            // Credentials are mandatory — if absent, reject immediately.
            // Skipping this verification would allow orders to be confirmed using
            // only the webhook payload (which is signed but not independently verified).
            const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
            const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

            if (!razorpayKeyId || !razorpayKeySecret) {
                console.error('Webhook: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured — rejecting');
                return NextResponse.json({ error: 'Payment service misconfigured' }, { status: 500 });
            }

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
                console.error('Webhook: Failed to fetch payment from Razorpay — aborting to prevent fraud');
                return NextResponse.json({ status: 'payment_fetch_failed' }, { status: 502 });
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

            // ── Phase 1: Confirm the order (MUST always succeed) ──────────────────────
            // The print job is NOT inside this transaction. If print job creation
            // fails for any reason, the order is still confirmed and visible to staff.
            const confirmedResult = await db.runTransaction(async (transaction) => {
                const currentOrderDoc = await transaction.get(orderRef);
                if (!currentOrderDoc.exists) {
                    throw new Error('Order not found');
                }

                const currentOrderData = currentOrderDoc.data()!;

                // Double-check not already paid (idempotent)
                if (currentOrderData.payment?.status === 'paid') {
                    return null; // Already processed — nothing to do
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

                // Return data needed for print job (created outside this transaction)
                return {
                    token: nextToken,
                    items: currentOrderData.items,
                    userName: currentOrderData.userName,
                    userEmail: currentOrderData.userEmail,
                    note: currentOrderData.note,
                    isParcel: currentOrderData.isParcel,
                    totalPrice: currentOrderData.totalPrice,
                    parcelCharge: currentOrderData.parcelCharge,
                };
            });

            // ── Phase 2: Enqueue print job (best-effort, separate from order confirmation) ──
            // A failure here never affects the order status or manager visibility.
            // If this fails, the job can be re-queued manually from the manager dashboard.
            if (confirmedResult) {
                try {
                    await db.runTransaction(async (tx) => {
                        enqueuePrintJobTransaction(tx, orderId, {
                            orderId,
                            token: confirmedResult.token,
                            items: confirmedResult.items.map((item: any) => ({ name: item.name, qty: item.quantity })),
                            totalPrice: confirmedResult.totalPrice || 0,
                            parcelCharge: confirmedResult.parcelCharge || 0,
                            studentName: confirmedResult.userName || undefined,
                            studentEmail: confirmedResult.userEmail || undefined,
                            note: confirmedResult.note || undefined,
                            isParcel: confirmedResult.isParcel || false,
                            createdAt: now.toISOString(),
                        });
                    });
                } catch (printErr: any) {
                    // Non-fatal: print job may already exist (created by verify-payment).
                    // Order is already confirmed. Log and move on.
                    console.error('Webhook: print job enqueue failed (non-fatal):', printErr?.message);
                }
            }

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
                const orderRef = db.collection('orders').doc(orderId);

                // Atomic: order update + webhook dedup marker in one transaction
                await db.runTransaction(async (tx) => {
                    tx.update(orderRef, {
                        'payment.status': 'failed',
                        'payment.failedAt': FieldValue.serverTimestamp(),
                        'payment.errorCode': paymentEntity.error_code,
                        'payment.errorDescription': paymentEntity.error_description,
                        'audit.updatedAt': FieldValue.serverTimestamp(),
                        'audit.updatedBy': 'webhook',
                    });
                    tx.set(webhookEventRef, {
                        processedAt: FieldValue.serverTimestamp(),
                        orderId,
                        status: 'failure_recorded',
                    });
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
        // Return 500 so Razorpay retries the webhook. A 200 response would tell
        // Razorpay "delivered OK" and it would never retry, silently losing the payment.
        return NextResponse.json({ status: 'error' }, { status: 500 });
    }
}
