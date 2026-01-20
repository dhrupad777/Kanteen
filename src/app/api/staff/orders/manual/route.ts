
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { BYPASS_AUTH } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const { couponId } = await request.json();

        let userId = 'test-user-123';

        // Skip authentication if in testing mode
        if (!BYPASS_AUTH) {
            const authHeader = request.headers.get('Authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const idToken = authHeader.split('Bearer ')[1];
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            const email = decodedToken.email;
            userId = decodedToken.uid;

            if (!email) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            // Verify Manager
            const allowlistRef = adminDb.collection('manager_allowlist').doc(email.toLowerCase());
            const allowlistSnap = await allowlistRef.get();
            if (!allowlistSnap.exists || allowlistSnap.data()?.enabled !== true) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        } else {
            console.log("🔓 AUTH BYPASS: Skipping authentication in manual order route");
        }

        const normalized = couponId.trim().replace(/^0+/, '') || '0';
        const docId = `manual-${normalized}-${Date.now()}`;
        const orderRef = adminDb.collection('orders').doc(docId);

        await orderRef.set({
            studentId: `student-${normalized}`,
            items: [{ name: 'Coupon Meal', quantity: 1, price: 0 }],
            status: 'Ready',
            token: parseInt(normalized),
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
