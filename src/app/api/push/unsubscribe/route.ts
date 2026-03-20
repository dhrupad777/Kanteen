import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { getClientIP } from '@/lib/rate-limit';
import { createHash } from 'crypto';

/**
 * Remove a Web Push subscription for the authenticated user.
 * POST /api/push/unsubscribe
 * Body: { endpoint: string }
 */
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const auth = getAdminAuth();
        const decodedToken = await auth.verifyIdToken(authHeader.split('Bearer ')[1]);
        const uid = decodedToken.uid;

        const { endpoint } = await request.json();
        if (!endpoint || typeof endpoint !== 'string') {
            return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
        }

        const endpointHash = createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
        const docId = `${uid}_${endpointHash}`;

        const db = getAdminDb();
        await db.collection('push_subscriptions').doc(docId).delete();

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('push/unsubscribe error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
