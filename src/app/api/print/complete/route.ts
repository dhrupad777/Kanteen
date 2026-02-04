import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { completePrintJob } from '@/lib/print-queue';
import { CompletePrintJobRequest } from '@/types';

/**
 * POST /api/print/complete
 *
 * Marks a print job as completed after the printer has processed it.
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

        const body: CompletePrintJobRequest = await request.json();

        if (!body.jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        }

        // Use existing print queue service
        await completePrintJob(body.jobId);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Complete print job error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
