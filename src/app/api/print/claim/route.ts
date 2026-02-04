import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { claimPrintJob } from '@/lib/print-queue';

/**
 * POST /api/print/claim
 *
 * Claims a print job for processing.
 * The printer should call this before attempting to print.
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

        const printerId = body.printerId || decodedToken.uid;
        const claimed = await claimPrintJob(body.jobId, printerId);

        if (!claimed) {
            return NextResponse.json({ error: 'Job not available or already claimed' }, { status: 409 });
        }

        return NextResponse.json({ success: true, claimed: true });
    } catch (error: any) {
        console.error('Claim print job error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
