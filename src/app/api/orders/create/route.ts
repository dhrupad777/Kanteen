import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

async function hashOTP(otp: string): Promise<string> {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const { items, totalPrice } = await request.json();

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'Invalid items' }, { status: 400 });
        }

        // 1. Generate Daily Token & OTP
        const now = new Date();
        const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const counterRef = adminDb.collection('order_counters').doc(dateKey);

        const result = await adminDb.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let nextToken = 201;

            if (counterDoc.exists) {
                const data = counterDoc.data();
                const current = data?.nextOnlineToken ?? 201;
                nextToken = current;

                if (nextToken > 999) {
                    throw new Error('ONLINE_ORDERS_CLOSED');
                }
            }

            transaction.set(counterRef, {
                nextOnlineToken: nextToken + 1
            }, { merge: true });

            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const otpHash = await hashOTP(otp);

            const orderData = {
                studentId: uid,
                items: items.map((i: any) => ({
                    name: i.name,
                    quantity: i.qty,
                    price: i.price
                })),
                totalPrice,
                token: nextToken,
                otpHash,
                status: 'Preparing',
                createdAt: FieldValue.serverTimestamp(),
                dateKey
            };

            const orderRef = adminDb.collection('orders').doc();
            transaction.set(orderRef, orderData);

            return { orderId: orderRef.id, token: nextToken, otp };
        });

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Order creation error:', error);
        if (error.message === 'ONLINE_ORDERS_CLOSED') {
            return NextResponse.json({ error: 'Online orders are closed for today (limit reached).' }, { status: 429 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
