import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, getClientIP } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
    try {
        // Rate limit by IP (5 report generations per minute - expensive operation)
        const clientIP = getClientIP(request);
        const { success: rateLimitOk, resetIn } = rateLimit(`generate-report:${clientIP}`, 5, 60000);
        if (!rateLimitOk) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: { 'Retry-After': Math.ceil(resetIn / 1000).toString() }
                }
            );
        }

        const { date } = await request.json(); // Expected format: YYYY-MM-DD

        // Input validation for date
        if (!date || typeof date !== 'string') {
            return NextResponse.json({ error: 'Date is required in YYYY-MM-DD format' }, { status: 400 });
        }

        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
        }

        // Validate it's a real date
        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) {
            return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
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

        // Verify manager
        const allowlistRef = adminDb.collection('manager_allowlist').doc(email.toLowerCase());
        const allowlistSnap = await allowlistRef.get();
        if (!allowlistSnap.exists || allowlistSnap.data()?.enabled !== true) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Query only completed/picked up orders for the specific date
        const ordersSnapshot = await adminDb.collection('orders')
            .where('dateKey', '==', date)
            .where('status', 'in', ['Completed', 'PICKED_UP'])
            .get();

        let totalOrders = 0;
        let totalRevenue = 0;
        const itemSummary: { [name: string]: number } = {};

        ordersSnapshot.docs.forEach(doc => {
            const data = doc.data();
            totalOrders++;
            totalRevenue += data.totalPrice || 0;

            if (data.items && Array.isArray(data.items)) {
                data.items.forEach((item: any) => {
                    const name = item.name || 'Unknown';
                    const qty = item.quantity || 0;
                    itemSummary[name] = (itemSummary[name] || 0) + qty;
                });
            }
        });

        const reportData = {
            date,
            totalOrders,
            totalRevenue,
            itemSummary,
            generatedAt: FieldValue.serverTimestamp(),
            generatedBy: userId
        };

        await adminDb.collection('daily_reports').doc(date).set(reportData);

        return NextResponse.json({ success: true, report: reportData });

    } catch (error: any) {
        console.error('Report generation error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

