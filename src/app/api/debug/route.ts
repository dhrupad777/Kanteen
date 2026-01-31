import { NextResponse } from 'next/server';
import { getAdminDb, getFirebaseAdmin } from '@/lib/firebase-admin';

/**
 * Debug endpoint - DELETE AFTER CONFIRMING RAZORPAY WORKS
 * GET /api/debug
 */
export async function GET() {
    const diagnostics: Record<string, any> = {
        timestamp: new Date().toISOString(),
        nodeEnv: process.env.NODE_ENV,
        projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'using hardcoded',
    };

    // Test Firebase Admin using our singleton
    try {
        const admin = getFirebaseAdmin();
        diagnostics.firebaseAdmin = {
            appsCount: admin.apps.length,
        };

        // Get Firestore using our getter
        const db = getAdminDb();
        diagnostics.firebaseAdmin.firestoreInstance = '✅ Got instance';

        // Try actual query
        const docs = await db.collection('menu_items').limit(1).get();
        diagnostics.firebaseAdmin.firestoreRead = `✅ Read ${docs.size} doc(s)`;
        diagnostics.firebaseAdmin.status = '✅ WORKING';
    } catch (error: any) {
        diagnostics.firebaseAdmin = {
            status: `❌ ${error.message}`,
            stack: error.stack?.split('\n').slice(0, 3),
        };
    }

    // Test Razorpay
    try {
        const Razorpay = (await import('razorpay')).default;
        if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
            new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET,
            });
            diagnostics.razorpay = '✅ WORKING';
        } else {
            diagnostics.razorpay = '❌ Credentials missing';
        }
    } catch (rpErr: any) {
        diagnostics.razorpay = `❌ ${rpErr.message}`;
    }

    return NextResponse.json(diagnostics);
}
