import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { rateLimit, getClientIP } from '@/lib/rate-limit';

// Input validation constants
const MAX_ITEMS = 50;
const MAX_ITEM_QUANTITY = 20;
const MAX_PRICE_PER_ITEM = 10000;
const MAX_TOTAL_PRICE = 50000;
const MAX_ITEM_NAME_LENGTH = 100;

async function hashOTP(otp: string): Promise<string> {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

export async function POST(request: NextRequest) {
    try {
        // Rate limit by IP (5 orders per minute)
        const clientIP = getClientIP(request);
        const { success: rateLimitOk, resetIn } = rateLimit(`create-order:${clientIP}`, 5, 60000);
        if (!rateLimitOk) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: { 'Retry-After': Math.ceil(resetIn / 1000).toString() }
                }
            );
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const { items, totalPrice, isParcel, platformCharges } = await request.json();

        // ====== INPUT VALIDATION ======

        // Validate items array
        if (!items || !Array.isArray(items)) {
            return NextResponse.json({ error: 'Items must be an array' }, { status: 400 });
        }
        if (items.length === 0) {
            return NextResponse.json({ error: 'Order must have at least one item' }, { status: 400 });
        }
        if (items.length > MAX_ITEMS) {
            return NextResponse.json({ error: `Maximum ${MAX_ITEMS} items allowed per order` }, { status: 400 });
        }

        // Validate each item
        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (!item.name || typeof item.name !== 'string') {
                return NextResponse.json({ error: `Item ${i + 1}: Name is required` }, { status: 400 });
            }
            if (item.name.length > MAX_ITEM_NAME_LENGTH) {
                return NextResponse.json({ error: `Item ${i + 1}: Name too long` }, { status: 400 });
            }
            if (typeof item.qty !== 'number' || !Number.isInteger(item.qty) || item.qty < 1) {
                return NextResponse.json({ error: `Item ${i + 1}: Invalid quantity` }, { status: 400 });
            }
            if (item.qty > MAX_ITEM_QUANTITY) {
                return NextResponse.json({ error: `Item ${i + 1}: Maximum ${MAX_ITEM_QUANTITY} per item` }, { status: 400 });
            }
            if (typeof item.price !== 'number' || item.price < 0) {
                return NextResponse.json({ error: `Item ${i + 1}: Invalid price` }, { status: 400 });
            }
            if (item.price > MAX_PRICE_PER_ITEM) {
                return NextResponse.json({ error: `Item ${i + 1}: Price exceeds maximum` }, { status: 400 });
            }
        }

        // Validate total price
        if (typeof totalPrice !== 'number' || totalPrice < 0) {
            return NextResponse.json({ error: 'Invalid total price' }, { status: 400 });
        }
        if (totalPrice > MAX_TOTAL_PRICE) {
            return NextResponse.json({ error: 'Total price exceeds maximum allowed' }, { status: 400 });
        }

        // Validate optional fields
        if (isParcel !== undefined && typeof isParcel !== 'boolean') {
            return NextResponse.json({ error: 'Invalid parcel flag' }, { status: 400 });
        }
        if (platformCharges !== undefined && (typeof platformCharges !== 'number' || platformCharges < 0)) {
            return NextResponse.json({ error: 'Invalid platform charges' }, { status: 400 });
        }

        // ====== END VALIDATION ======

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
                userEmail: decodedToken.email || "",
                userName: decodedToken.name || "",
                items: items.map((i: any) => ({
                    name: String(i.name).substring(0, MAX_ITEM_NAME_LENGTH),
                    quantity: Math.min(Math.max(1, Math.floor(i.qty)), MAX_ITEM_QUANTITY),
                    price: Math.min(Math.max(0, Number(i.price)), MAX_PRICE_PER_ITEM)
                })),
                totalPrice: Math.min(totalPrice, MAX_TOTAL_PRICE),
                isParcel: isParcel || false,
                platformCharges: platformCharges || 0,
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
