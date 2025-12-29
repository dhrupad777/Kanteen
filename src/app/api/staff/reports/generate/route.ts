import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
    try {
        const { date } = await request.json(); // Expected format: YYYY-MM-DD

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

        // Verify manager
        const allowlistRef = adminDb.collection('manager_allowlist').doc(email.toLowerCase());
        const allowlistSnap = await allowlistRef.get();
        if (!allowlistSnap.exists || allowlistSnap.data()?.enabled !== true) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Aggregate orders for the date
        // Query completed or picked up orders
        const ordersSnapshot = await adminDb.collection('orders')
            .where('status', 'in', ['Completed', 'PICKED_UP'])
            .get();

        const targetedDate = new Date(date);
        targetedDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(targetedDate);
        nextDay.setDate(nextDay.getDate() + 1);

        let totalOrders = 0;
        let totalRevenue = 0;
        const itemSummary: { [name: string]: number } = {};

        ordersSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const createdAt = data.createdAt.toDate();

            if (createdAt >= targetedDate && createdAt < nextDay) {
                totalOrders++;
                totalRevenue += data.totalPrice || 0;

                if (data.items && Array.isArray(data.items)) {
                    data.items.forEach((item: any) => {
                        const name = item.name || 'Unknown';
                        const qty = item.quantity || 0;
                        itemSummary[name] = (itemSummary[name] || 0) + qty;
                    });
                }
            }
        });

        const reportData = {
            date,
            totalOrders,
            totalRevenue,
            itemSummary,
            generatedAt: FieldValue.serverTimestamp(),
            generatedBy: decodedToken.uid
        };

        await adminDb.collection('daily_reports').doc(date).set(reportData);

        return NextResponse.json({ success: true, report: reportData });

    } catch (error: any) {
        console.error('Report generation error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
