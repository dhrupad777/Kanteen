import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import Razorpay from 'razorpay';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import type { CreateRazorpayOrderRequest, CreateRazorpayOrderResponse, CheckoutItem } from '@/types';

// Input validation constants
const MAX_ITEMS = 50;
const MAX_ITEM_QUANTITY = 20;
const MAX_PRICE_PER_ITEM = 10000; // rupees
const MAX_TOTAL_PRICE = 50000;   // rupees
const MAX_ITEM_NAME_LENGTH = 100;
const CAMPUS_ID = 'default';

/**
 * Creates a Razorpay order and stores pending order in Firestore
 * POST /api/razorpay/create-order
 */
export async function POST(request: NextRequest) {
    try {
        // Get Firebase instances (lazy initialization)
        const db = getAdminDb();
        const auth = getAdminAuth();

        // Rate limit by IP (5 orders per minute)
        const clientIP = getClientIP(request);
        const { success: rateLimitOk, resetIn } = rateLimit(`razorpay-create:${clientIP}`, 5, 60000);
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

        const body: CreateRazorpayOrderRequest = await request.json();
        const { items, isParcel = false, platformCharges = 0 } = body;

        // ====== INPUT VALIDATION ======
        if (!items || !Array.isArray(items)) {
            return NextResponse.json({ error: 'Items must be an array' }, { status: 400 });
        }
        if (items.length === 0) {
            return NextResponse.json({ error: 'Order must have at least one item' }, { status: 400 });
        }
        if (items.length > MAX_ITEMS) {
            return NextResponse.json({ error: `Maximum ${MAX_ITEMS} items allowed` }, { status: 400 });
        }

        // Validate and fetch item prices from Firestore (server-side price verification)
        const menuItemsRef = db.collection('menu_items');
        const validatedItems: CheckoutItem[] = [];
        let serverCalculatedTotal = 0;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            if (!item.itemId || typeof item.itemId !== 'string') {
                return NextResponse.json({ error: `Item ${i + 1}: Invalid item ID` }, { status: 400 });
            }
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

            // Fetch actual price from Firestore
            const menuItemDoc = await menuItemsRef.doc(item.itemId).get();
            if (!menuItemDoc.exists) {
                return NextResponse.json({ error: `Item ${i + 1}: Item not found in menu` }, { status: 400 });
            }

            const menuItemData = menuItemDoc.data();
            if (!menuItemData?.isAvailable || !menuItemData?.isActive) {
                return NextResponse.json({ error: `Item "${item.name}" is currently unavailable` }, { status: 400 });
            }

            const serverPrice = menuItemData.price; // in rupees
            if (typeof serverPrice !== 'number' || serverPrice < 0 || serverPrice > MAX_PRICE_PER_ITEM) {
                return NextResponse.json({ error: `Item ${i + 1}: Invalid price configuration` }, { status: 400 });
            }

            const itemTotal = serverPrice * item.qty;
            serverCalculatedTotal += itemTotal;

            validatedItems.push({
                itemId: item.itemId,
                name: String(item.name).substring(0, MAX_ITEM_NAME_LENGTH),
                qty: item.qty,
                price: serverPrice,
            });
        }

        // Add platform charges
        serverCalculatedTotal += platformCharges;

        if (serverCalculatedTotal > MAX_TOTAL_PRICE) {
            return NextResponse.json({ error: 'Total exceeds maximum allowed' }, { status: 400 });
        }

        const amountPaise = Math.round(serverCalculatedTotal * 100);

        // ====== CREATE RAZORPAY ORDER ======
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            console.error('Razorpay credentials not configured');
            return NextResponse.json(
                { error: 'Payment service not configured. Please contact support.' },
                { status: 503 }
            );
        }

        const razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        });

        const razorpayOrder = await razorpay.orders.create({
            amount: amountPaise,
            currency: 'INR',
            receipt: `order_${Date.now()}`,
            notes: {
                uid: uid,
                campusId: CAMPUS_ID,
            },
        });

        // ====== CREATE FIRESTORE ORDER (status: created) ======
        const now = new Date();
        const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD

        // Format items to match existing order format
        const formattedItems = validatedItems.map(item => ({
            name: item.name,
            quantity: item.qty,
            price: item.price,
        }));

        const orderRef = db.collection('orders').doc();
        const orderData = {
            studentId: uid,
            userName: decodedToken.name || '',
            userEmail: decodedToken.email || '',
            items: formattedItems,
            totalPrice: serverCalculatedTotal,
            isParcel: isParcel,
            platformCharges: platformCharges,
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
            dateKey: dateKey,
            payment: {
                provider: 'razorpay',
                razorpayOrderId: razorpayOrder.id,
                status: 'created',
            },
        };

        await orderRef.set(orderData);

        // ====== RETURN RESPONSE ======
        const response: CreateRazorpayOrderResponse = {
            razorpayOrderId: razorpayOrder.id,
            orderId: orderRef.id,
            amount: amountPaise,
            currency: 'INR',
            keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || keyId,
            prefill: {
                name: decodedToken.name || '',
                email: decodedToken.email || '',
            },
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('Razorpay create-order error:', error instanceof Error ? error.message : 'Unknown error');
        return NextResponse.json(
            { error: error.message || 'Failed to create order' },
            { status: 500 }
        );
    }
}
