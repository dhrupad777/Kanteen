import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { normalizeOrderCore } from '@/lib/order-normalize';

/**
 * Public API endpoint to fetch Ready and Preparing orders
 * No authentication required - for display boards and logged-out users
 * GET /api/orders/public
 */
export async function GET() {
    try {
        const db = getAdminDb();

        // Fetch Ready orders (limit 200) - no orderBy to avoid index requirement
        const readySnapshot = await db.collection('orders')
            .where('status', '==', 'Ready')
            .limit(200)
            .get();

        // Fetch Preparing orders (limit 100)
        const preparingSnapshot = await db.collection('orders')
            .where('status', '==', 'Preparing')
            .limit(100)
            .get();

        // This payload is polled every 5s by every visitor's dashboard, so a single
        // malformed document here reaches every client. Normalize before it leaves
        // the server — never ship undefined numerics to the UI.
        const toPublicOrder = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
            const data = doc.data();
            // This endpoint is unauthenticated: drop the customer PII that
            // normalizeOrderCore carries for the authenticated dashboards.
            const { userEmail, userName, ...safe } = normalizeOrderCore(doc.id, data);
            return {
                ...safe,
                createdAt: data.createdAt?.toDate()?.toISOString() ?? null,
            };
        };

        const orders = [
            ...readySnapshot.docs.map(toPublicOrder),
            ...preparingSnapshot.docs.map(toPublicOrder),
        ];

        return NextResponse.json({ orders });
    } catch (error: any) {
        console.error('Error fetching public orders:', error instanceof Error ? error.message : 'Unknown error');
        return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }
}
