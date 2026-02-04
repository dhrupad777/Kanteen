import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { getQueuedPrintJobs } from '@/lib/print-queue';

/**
 * GET /api/print/queue
 *
 * Returns pending print jobs for the kitchen printer.
 * The mobile device polls this endpoint to get jobs to print.
 *
 * Query params:
 * - limit: number of jobs to fetch (default 10)
 * - status: filter by status (default 'queued')
 */
export async function GET(request: NextRequest) {
    try {
        const auth = getAdminAuth();
        const db = getAdminDb();

        // Authenticate Request
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await auth.verifyIdToken(idToken);
        const email = decodedToken.email;

        if (!email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify Manager
        const allowlistRef = db.collection('manager_allowlist').doc(email.toLowerCase());
        const allowlistSnap = await allowlistRef.get();
        if (!allowlistSnap.exists || allowlistSnap.data()?.enabled !== true) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Parse query params
        const { searchParams } = new URL(request.url);
        const limitParam = parseInt(searchParams.get('limit') || '10', 10);
        const statusParam = searchParams.get('status') || 'queued';

        // Use existing print queue service for queued jobs
        if (statusParam === 'queued') {
            const jobs = await getQueuedPrintJobs(Math.min(limitParam, 50));
            return NextResponse.json({
                jobs: jobs.map(job => ({
                    id: job.jobId,
                    orderId: job.payload.orderId,
                    token: job.payload.token,
                    items: job.payload.items.map(i => ({ name: i.name, quantity: i.qty, price: 0 })),
                    customerName: job.payload.studentName,
                    isParcel: job.payload.isParcel,
                    status: job.status,
                    createdAt: job.payload.createdAt,
                    attempts: job.attempts,
                })),
                count: jobs.length,
            }, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store',
                }
            });
        }

        // For other statuses, query directly
        const snapshot = await db
            .collection('print_jobs')
            .where('status', '==', statusParam)
            .orderBy('createdAt', 'asc')
            .limit(Math.min(limitParam, 50))
            .get();

        const jobs = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                orderId: data.payload?.orderId || doc.id,
                token: data.payload?.token,
                items: data.payload?.items?.map((i: any) => ({ name: i.name, quantity: i.qty, price: 0 })) || [],
                customerName: data.payload?.studentName,
                isParcel: data.payload?.isParcel,
                status: data.status,
                createdAt: data.payload?.createdAt || data.createdAt?.toDate()?.toISOString(),
                attempts: data.attempts,
                printerId: data.printerId,
                completedAt: data.completedAt?.toDate()?.toISOString(),
            };
        });

        return NextResponse.json({
            jobs,
            count: jobs.length,
        }, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store',
            }
        });
    } catch (error: any) {
        console.error('Print queue fetch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
