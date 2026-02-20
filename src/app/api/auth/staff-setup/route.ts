import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getAdminAuth } from '@/lib/firebase-admin';

/**
 * POST /api/auth/staff-setup
 *
 * ONE-TIME SETUP ROUTE — seeds the initial Firestore credentials document.
 * Protected by STAFF_SETUP_SECRET env var so it can only be called once intentionally.
 *
 * After running, manage credentials directly in Firebase Console:
 *   Firestore → staff_credentials → config → accounts array
 *
 * To change a password: update the `password` field in Firestore.
 * To add a new account: add an object to the `accounts` array.
 * To revoke access: set `enabled: false` or remove the account from the array.
 *
 * Default accounts created:
 *   - staff@kanteen.app    / Kanteen@2024  → role: kitchen_staff  (access to /counter and /kitchen)
 *   - dhrupadrajpurohit@gmail.com / Owner@2024 → role: kitchen_manager (access to /counter, /kitchen, /report)
 */
export async function POST(request: NextRequest) {
    // Guard with a secret so this can't be called accidentally
    const secret = request.headers.get('x-setup-secret');
    const expectedSecret = process.env.STAFF_SETUP_SECRET;

    if (!expectedSecret) {
        return NextResponse.json(
            { error: 'STAFF_SETUP_SECRET env var not configured.' },
            { status: 503 }
        );
    }

    if (secret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const defaultAccounts = [
        {
            email: 'staff@kanteen.app',
            password: 'Kanteen@2024',
            role: 'kitchen_staff',
        },
        {
            email: 'dhrupadrajpurohit@gmail.com',
            password: 'Owner@2024',
            role: 'kitchen_manager',
        },
    ];

    try {
        // Write credentials to Firestore
        await adminDb.collection('staff_credentials').doc('config').set({
            accounts: defaultAccounts,
            setupAt: new Date().toISOString(),
            note: 'Managed via Firebase Console. Change password field directly. Role must be kitchen_staff, kitchen_manager, or admin.',
        });

        // Also add emails to manager_allowlist for backward-compat with existing API routes
        const batch = adminDb.batch();
        for (const account of defaultAccounts) {
            const ref = adminDb.collection('manager_allowlist').doc(account.email.toLowerCase());
            batch.set(ref, { enabled: true, role: account.role }, { merge: true });
        }
        await batch.commit();

        return NextResponse.json({
            success: true,
            message: 'Staff credentials seeded in Firestore.',
            accounts: defaultAccounts.map((a) => ({ email: a.email, role: a.role })),
            note: 'Passwords stored as plain text in Firestore → staff_credentials → config. Change them in Firebase Console.',
        });

    } catch (error: any) {
        console.error('[staff-setup] Error:', error?.message ?? error);
        return NextResponse.json({ error: 'Setup failed.', detail: error?.message }, { status: 500 });
    }
}
