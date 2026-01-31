
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, getClientIP } from '@/lib/rate-limit';

// Input validation constants
const MAX_COUPON_ID = 200;
const MIN_COUPON_ID = 1;

export async function POST(request: NextRequest) {
    try {
        // Rate limit by IP (10 manual orders per minute)
        const clientIP = getClientIP(request);
        const { success: rateLimitOk, resetIn } = rateLimit(`manual-order:${clientIP}`, 10, 60000);
        if (!rateLimitOk) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: { 'Retry-After': Math.ceil(resetIn / 1000).toString() }
                }
            );
        }

        const { couponId } = await request.json();

        // Input validation
        if (couponId === undefined || couponId === null) {
            return NextResponse.json({ error: 'Coupon ID is required' }, { status: 400 });
        }

        const normalizedStr = String(couponId).trim().replace(/^0+/, '') || '0';
        const couponNum = parseInt(normalizedStr, 10);

        if (isNaN(couponNum) || couponNum < MIN_COUPON_ID || couponNum > MAX_COUPON_ID) {
            return NextResponse.json(
                { error: `Coupon ID must be between ${MIN_COUPON_ID} and ${MAX_COUPON_ID}` },
                { status: 400 }
            );
        }

        // Authenticate Request
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const email = decodedToken.email;
        const userId = decodedToken.uid;

        if (!email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify Manager
        const allowlistRef = adminDb.collection('manager_allowlist').doc(email.toLowerCase());
        const allowlistSnap = await allowlistRef.get();
        if (!allowlistSnap.exists || allowlistSnap.data()?.enabled !== true) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const normalized = normalizedStr;
        const docId = `manual-${normalized}-${Date.now()}`;
        const orderRef = adminDb.collection('orders').doc(docId);

        await orderRef.set({
            studentId: `student-${normalized}`,
            items: [{ name: 'Coupon Meal', quantity: 1, price: 0 }],
            status: 'Ready',
            token: couponNum,
            createdAt: FieldValue.serverTimestamp(),
            type: 'manual',
            'kitchen.createdBy': userId
        });

        return NextResponse.json({ success: true, id: docId });
    } catch (error: any) {
        console.error('Manual order error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
