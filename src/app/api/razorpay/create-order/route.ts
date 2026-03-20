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
const PARCEL_CHARGE = 5; // rupees — must match what the client shows the user

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
        const { items, note } = body;
        // Coerce to boolean so non-boolean truthy values can't cause unexpected behaviour
        const isParcel = body.isParcel === true;
        const platformCharges = body.platformCharges ?? 0;

        // Validate note (max 200 chars)
        const sanitizedNote = note ? String(note).substring(0, 200).trim() : undefined;

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

            // ====== PRICE LOOKUP — daily menu vs regular menu_items ======
            let serverPrice: number;

            if (item.itemId.startsWith('daily_')) {
                // Daily menu item — look up price from canteen_state/today
                const field = item.itemId.slice(6); // 'daily_sabji' → 'sabji'
                const dailyMenuDoc = await db.collection('canteen_state').doc('today').get();
                if (!dailyMenuDoc.exists) {
                    return NextResponse.json({ error: `Daily menu is not available` }, { status: 400 });
                }
                const dailyData = dailyMenuDoc.data()!;
                const itemName: unknown = dailyData?.main?.[field];
                const itemPrice: unknown = dailyData?.main?.prices?.[field];

                if (typeof itemName !== 'string' || !itemName.trim()) {
                    return NextResponse.json({ error: `Daily menu item "${field}" is not set today` }, { status: 400 });
                }
                if (typeof itemPrice !== 'number' || itemPrice <= 0) {
                    return NextResponse.json({ error: `Daily menu item "${itemName}" is not available for online order` }, { status: 400 });
                }
                serverPrice = itemPrice;
            } else {
                // Regular menu item — look up from menu_items collection
                const menuItemDoc = await menuItemsRef.doc(item.itemId).get();
                if (!menuItemDoc.exists) {
                    return NextResponse.json({ error: `Item ${i + 1}: Item not found in menu` }, { status: 400 });
                }
                const menuItemData = menuItemDoc.data()!;
                if (!menuItemData?.isAvailable || !menuItemData?.isActive) {
                    return NextResponse.json({ error: `Item "${item.name}" is currently unavailable` }, { status: 400 });
                }
                serverPrice = menuItemData.price;
                if (typeof serverPrice !== 'number' || serverPrice < 0 || serverPrice > MAX_PRICE_PER_ITEM) {
                    return NextResponse.json({ error: `Item ${i + 1}: Invalid price configuration` }, { status: 400 });
                }
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

        // Daily menu items are parcel-only — enforce server-side regardless of client flag
        const hasDailyItems = validatedItems.some(i => i.itemId.startsWith('daily_'));
        const effectiveIsParcel = isParcel || hasDailyItems;

        // Add parcel charge server-side — never trust the client for this
        if (effectiveIsParcel) {
            serverCalculatedTotal += PARCEL_CHARGE;
        }

        // Platform charges (currently ₹0 — guard against negative values from client)
        const sanitizedPlatformCharges = Math.max(0, Number(platformCharges) || 0);
        serverCalculatedTotal += sanitizedPlatformCharges;

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
        const orderData: Record<string, any> = {
            studentId: uid,
            userName: decodedToken.name || '',
            userEmail: decodedToken.email || '',
            items: formattedItems,
            totalPrice: serverCalculatedTotal,
            isParcel: effectiveIsParcel,
            parcelCharge: effectiveIsParcel ? PARCEL_CHARGE : 0,
            platformCharges: sanitizedPlatformCharges,
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
            dateKey: dateKey,
            payment: {
                provider: 'razorpay',
                razorpayOrderId: razorpayOrder.id,
                status: 'created',
            },
        };

        // Add note only if provided (to save storage)
        if (sanitizedNote) {
            orderData.note = sanitizedNote;
        }

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
