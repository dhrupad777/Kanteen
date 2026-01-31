
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { rateLimit, getClientIP } from '@/lib/rate-limit';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    try {
        // Rate limit by IP (10 deletes per minute)
        const clientIP = getClientIP(request);
        const { success: rateLimitOk, resetIn } = rateLimit(`delete-order:${clientIP}`, 10, 60000);
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

        // Input validation
        if (!orderId || typeof orderId !== 'string' || orderId.length > 100) {
            return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
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

        await adminDb.collection('orders').doc(orderId).delete();

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Delete order error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

