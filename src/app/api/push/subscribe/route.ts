import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import { createHash } from 'crypto';

/**
 * Save a Web Push subscription for the authenticated user.
 * POST /api/push/subscribe
 * Body: { subscription: PushSubscriptionJSON }
 */
export async function POST(request: NextRequest) {
    const clientIP = getClientIP(request);

    try {
        const { success: rateLimitOk } = rateLimit(`push-subscribe:${clientIP}`, 5, 60000);
        if (!rateLimitOk) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const auth = getAdminAuth();
        const decodedToken = await auth.verifyIdToken(authHeader.split('Bearer ')[1]);
        const uid = decodedToken.uid;

        const body = await request.json();
        const sub: PushSubscriptionJSON = body.subscription;
        const oldEndpoint: string | undefined = body.oldEndpoint;

        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
            return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
        }

        // Use a hash of the endpoint as the document ID (stable, URL-safe)
        const endpointHash = createHash('sha256').update(sub.endpoint).digest('hex').slice(0, 16);
        const docId = `${uid}_${endpointHash}`;

        const db = getAdminDb();

        // Clean up stale subscription when FCM token rotates (pushsubscriptionchange)
        if (oldEndpoint && oldEndpoint !== sub.endpoint) {
            const oldHash = createHash('sha256').update(oldEndpoint).digest('hex').slice(0, 16);
            db.collection('push_subscriptions').doc(`${uid}_${oldHash}`).delete().catch(() => {});
        }

        await db.collection('push_subscriptions').doc(docId).set({
            uid,
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
            userAgent: request.headers.get('user-agent') ?? '',
            createdAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('push/subscribe error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
