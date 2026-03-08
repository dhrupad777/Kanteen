import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { recoverStaleJobs } from '@/lib/print-queue';

/**
 * POST /api/print/recover
 *
 * Recovers stale print jobs stuck in 'printing' state.
 * Called when the print station page loads or when the printer reconnects.
 * 
 * This ensures ACID-like delivery guarantee:
 *   If the printer crashes mid-print, jobs don't get lost forever.
 *   They are automatically recovered back to 'queued' and reprinted.
 */
export async function POST(request: NextRequest) {
    try {
        const auth = getAdminAuth();
        const db = getAdminDb();

        // Authenticate
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

        const recovered = await recoverStaleJobs();

        return NextResponse.json({ success: true, recovered });
    } catch (error: any) {
        console.error('Recover stale jobs error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
