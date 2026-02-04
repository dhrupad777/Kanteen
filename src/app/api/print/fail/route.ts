import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { failPrintJob } from '@/lib/print-queue';

/**
 * POST /api/print/fail
 *
 * Marks a print job as failed. Will be retried or moved to dead letter queue.
 */
export async function POST(request: NextRequest) {
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

        const body = await request.json();

        if (!body.jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        }

        const errorMessage = body.error || 'Unknown error';
        await failPrintJob(body.jobId, errorMessage);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Fail print job error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
