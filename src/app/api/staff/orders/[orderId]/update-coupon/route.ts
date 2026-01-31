
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { rateLimit, getClientIP } from '@/lib/rate-limit';

// Input validation constants
const MAX_COUPON_ID = 200;
const MIN_COUPON_ID = 1;

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    try {
        // Rate limit by IP (10 coupon updates per minute)
        const clientIP = getClientIP(request);
        const { success: rateLimitOk, resetIn } = rateLimit(`update-coupon:${clientIP}`, 10, 60000);
        if (!rateLimitOk) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: { 'Retry-After': Math.ceil(resetIn / 1000).toString() }
                }
            );
        }

        const { orderId } = await params;
        const { newCouponId } = await request.json();

        // Input validation
        if (!orderId || typeof orderId !== 'string' || orderId.length > 100) {
            return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
        }

        if (newCouponId === undefined || newCouponId === null) {
            return NextResponse.json({ error: 'New coupon ID is required' }, { status: 400 });
        }

        const couponNum = parseInt(String(newCouponId), 10);
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

        if (!email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify Manager
        const allowlistRef = adminDb.collection('manager_allowlist').doc(email.toLowerCase());
        const allowlistSnap = await allowlistRef.get();
        if (!allowlistSnap.exists || allowlistSnap.data()?.enabled !== true) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await adminDb.collection('orders').doc(orderId).update({
            studentId: `student-${couponNum}`,
            token: couponNum
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Update coupon error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

