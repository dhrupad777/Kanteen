import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import Razorpay from 'razorpay';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import type { CreateRazorpayOrderRequest, CreateRazorpayOrderResponse, CheckoutItem } from '@/types';
import { calculatePaymentBreakdown } from '@/lib/payment-fee';
import { isNoParcelCategory } from '@/lib/parcel-categories';
import { calculateParcelCharge, type ParcelItem } from '@/lib/parcel-calc';

/**
 * Kitchen hours: 8:00 AM – 8:45 PM IST.
 * A 5-minute grace window (until 8:50 PM IST) covers checkouts initiated
 * just before closing where network latency pushes the request past 8:45.
 */
function isKitchenOpen(): boolean {
    const now = new Date();
    // Convert UTC → IST (UTC+5:30)
    const istMs = now.getTime() + (5 * 60 + 30) * 60_000;
    const ist = new Date(istMs);
    const total = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    return total >= 8 * 60 && total < 20 * 60 + 50; // 08:00–20:50 IST (8:45 + 5 min grace)
}

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

        // Fetch canteen settings once — used for both the 24/7 override and the maintenance gate
        const settingsSnap = await db.collection('canteen_state').doc('settings').get();
        const settingsData = settingsSnap.exists ? settingsSnap.data() : null;
        const kitchen24x7 = settingsData?.kitchen24x7 === true;

        // Kitchen hours gate — reject orders outside 8:00 AM–8:45 PM IST unless staff has enabled 24/7 mode
        if (!kitchen24x7 && !isKitchenOpen()) {
            return NextResponse.json(
                { error: 'Kitchen is closed. Online ordering is available 8:00 AM – 8:45 PM.' },
                { status: 403 }
            );
        }

        // Maintenance mode gate — reject orders when student ordering is disabled
        if (settingsData?.studentOrderingEnabled === false) {
            return NextResponse.json(
                { error: 'Online ordering is temporarily unavailable. Please check back soon.' },
                { status: 503 }
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
        const parcelItems: ParcelItem[] = [];
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

            // ====== PRICE LOOKUP ======
            const menuItemDoc = await menuItemsRef.doc(item.itemId).get();
            if (!menuItemDoc.exists) {
                return NextResponse.json({ error: `Item ${i + 1}: Item not found in menu` }, { status: 400 });
            }
            const menuItemData = menuItemDoc.data()!;
            if (!menuItemData?.isAvailable || !menuItemData?.isActive) {
                return NextResponse.json({ error: `Item "${item.name}" is currently unavailable` }, { status: 400 });
            }
            const serverPrice = menuItemData.price;
            if (typeof serverPrice !== 'number' || serverPrice < 0 || serverPrice > MAX_PRICE_PER_ITEM) {
                return NextResponse.json({ error: `Item ${i + 1}: Invalid price configuration` }, { status: 400 });
            }

            // Determine effective wantParcel from server-known category
            const serverCategory = (menuItemData.category as string) || '';
            let effectiveWantParcel: boolean;
            if (serverCategory === 'daily_menu') {
                effectiveWantParcel = true; // always parcelled
            } else if (isNoParcelCategory(serverCategory)) {
                effectiveWantParcel = false; // never parcelled
            } else {
                effectiveWantParcel = item.wantParcel === true; // trust client toggle
            }

            parcelItems.push({
                category: serverCategory,
                qty: item.qty,
                wantParcel: effectiveWantParcel,
            });

            const itemTotal = serverPrice * item.qty;
            serverCalculatedTotal += itemTotal;

            validatedItems.push({
                itemId: item.itemId,
                name: String(item.name).substring(0, MAX_ITEM_NAME_LENGTH),
                qty: item.qty,
                price: serverPrice,
            });
        }

        // Server-side parcel charge calculation (shared with client)
        const parcelBreakdown = calculateParcelCharge(parcelItems);
        const totalParcelCharge = parcelBreakdown.totalParcelCharge;
        const effectiveIsParcel = parcelBreakdown.isParcel;

        serverCalculatedTotal += totalParcelCharge;

        // Platform charges (currently ₹0 — guard against negative values from client)
        const sanitizedPlatformCharges = Math.max(0, Number(platformCharges) || 0);
        serverCalculatedTotal += sanitizedPlatformCharges;

        // Gross up so the merchant nets serverCalculatedTotal after Razorpay's 2.36% deduction.
        // The customer is charged grossTotal; gatewayFee is the transparency line item.
        const { targetRevenue, gatewayFee, grossTotal } = calculatePaymentBreakdown(serverCalculatedTotal);

        if (grossTotal > MAX_TOTAL_PRICE) {
            return NextResponse.json({ error: 'Total exceeds maximum allowed' }, { status: 400 });
        }

        const amountPaise = Math.round(grossTotal * 100);

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

        // Format items to match existing order format (include parcel flag for receipt)
        const formattedItems = validatedItems.map((item, idx) => ({
            name: item.name,
            quantity: item.qty,
            price: item.price,
            wantParcel: parcelItems[idx]?.wantParcel ?? false,
        }));

        const orderRef = db.collection('orders').doc();
        const orderData: Record<string, any> = {
            studentId: uid,
            userName: decodedToken.name || '',
            userEmail: decodedToken.email || '',
            items: formattedItems,
            totalPrice: grossTotal,
            subtotal: targetRevenue,
            paymentGatewayFee: gatewayFee,
            isParcel: effectiveIsParcel,
            parcelCharge: totalParcelCharge,
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
        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }
}
