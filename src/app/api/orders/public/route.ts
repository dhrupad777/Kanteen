import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

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

        const orders = [
            ...readySnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    studentId: data.studentId,
                    items: data.items,
                    status: data.status,
                    token: data.token,
                    totalPrice: data.totalPrice,
                    createdAt: data.createdAt?.toDate()?.toISOString() ?? null,
                    dateKey: data.dateKey,
                    kitchen: data.kitchen,
                };
            }),
            ...preparingSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    studentId: data.studentId,
                    items: data.items,
                    status: data.status,
                    token: data.token,
                    totalPrice: data.totalPrice,
                    createdAt: data.createdAt?.toDate()?.toISOString() ?? null,
                    dateKey: data.dateKey,
                    kitchen: data.kitchen,
                };
            }),
        ];

        return NextResponse.json({ orders });
    } catch (error: any) {
        console.error('Error fetching public orders:', error instanceof Error ? error.message : 'Unknown error');
        return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }
}
