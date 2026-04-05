import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getAdminAuth } from '@/lib/firebase-admin';

/**
 * POST /api/auth/staff-setup
 *
 * Creates / updates Firebase Auth users with email+password and sets the
 * `role` custom claim on each.  Also writes to Firestore for reference.
 *
 * Protected by STAFF_SETUP_SECRET env var.
 *
 * Request body:
 * {
 *   "accounts": [
 *     { "email": "kitchen.mrc@gmail.com", "password": "<pass>", "role": "kitchen_staff" },
 *     { "email": "manager.mrc@gmail.com", "password": "<pass>", "role": "kitchen_manager" }
 *   ]
 * }
 *
 * After setup, passwords can be changed in Firebase Console → Authentication → Users.
 * Roles can be updated by re-running this endpoint.
 */
export async function POST(request: NextRequest) {
    const secret = request.headers.get('x-setup-secret');
    const expectedSecret = process.env.STAFF_SETUP_SECRET;

    if (!expectedSecret) {
        return NextResponse.json({ error: 'STAFF_SETUP_SECRET env var not configured.' }, { status: 503 });
    }
    if (secret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    let body: { accounts?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const accounts = body?.accounts;
    if (!Array.isArray(accounts) || accounts.length === 0) {
        return NextResponse.json({ error: 'Request body must include a non-empty "accounts" array.' }, { status: 400 });
    }

    const VALID_ROLES = ['kitchen_staff', 'kitchen_manager', 'admin'];
    for (const acc of accounts) {
        if (
            typeof acc !== 'object' || acc === null ||
            typeof (acc as any).email !== 'string' ||
            typeof (acc as any).password !== 'string' ||
            !VALID_ROLES.includes((acc as any).role)
        ) {
            return NextResponse.json(
                { error: 'Each account must have email (string), password (string), and a valid role.' },
                { status: 400 }
            );
        }
    }

    const adminAuth = getAdminAuth();
    const results: { email: string; role: string; action: string }[] = [];

    try {
        for (const account of accounts as { email: string; password: string; role: string }[]) {
            let uid: string;
            let action: string;

            try {
                // Update existing user
                const existing = await adminAuth.getUserByEmail(account.email);
                await adminAuth.updateUser(existing.uid, { password: account.password });
                uid = existing.uid;
                action = 'updated';
            } catch (e: any) {
                if (e?.code === 'auth/user-not-found') {
                    // Create new user
                    const created = await adminAuth.createUser({
                        email: account.email,
                        password: account.password,
                        displayName: account.role,
                    });
                    uid = created.uid;
                    action = 'created';
                } else {
                    throw e;
                }
            }

            // Set role claim
            await adminAuth.setCustomUserClaims(uid, { role: account.role });
            results.push({ email: account.email, role: account.role, action });
        }

        // Write accounts WITH passwords to Firestore — staff-login reads this to verify credentials
        // before setting custom claims. Firestore security rules must restrict this collection
        // to server-side access only (no client reads allowed).
        await adminDb.collection('staff_credentials').doc('config').set({
            accounts: (accounts as any[]).map(a => ({ email: a.email, password: a.password, role: a.role })),
            setupAt: new Date().toISOString(),
        });

        const batch = adminDb.batch();
        for (const account of accounts as any[]) {
            const ref = adminDb.collection('manager_allowlist').doc(account.email.toLowerCase());
            batch.set(ref, { enabled: true, role: account.role }, { merge: true });
        }
        await batch.commit();

        return NextResponse.json({ success: true, accounts: results });

    } catch (error: any) {
        console.error('[staff-setup] Error:', error?.message ?? error);
        return NextResponse.json({ error: 'Setup failed.' }, { status: 500 });
    }
}
