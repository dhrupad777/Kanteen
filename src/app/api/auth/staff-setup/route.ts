import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * POST /api/auth/staff-setup
 *
 * ONE-TIME SETUP ROUTE — seeds the initial Firestore credentials document.
 * Protected by STAFF_SETUP_SECRET env var.
 *
 * After running, manage credentials directly in Firebase Console:
 *   Firestore → staff_credentials → config → accounts array
 *
 * Request body:
 * {
 *   "accounts": [
 *     { "email": "staff@kanteen.app", "password": "<choose>", "role": "kitchen_staff" },
 *     { "email": "dhrupadrajpurohit@gmail.com", "password": "<choose>", "role": "kitchen_manager" }
 *   ]
 * }
 *
 * Example curl:
 *   curl -X POST https://<host>/api/auth/staff-setup \
 *     -H "Content-Type: application/json" \
 *     -H "x-setup-secret: <STAFF_SETUP_SECRET>" \
 *     -d '{"accounts":[{"email":"staff@kanteen.app","password":"<pass>","role":"kitchen_staff"},{"email":"dhrupadrajpurohit@gmail.com","password":"<pass>","role":"kitchen_manager"}]}'
 */
export async function POST(request: NextRequest) {
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

    let body: { accounts?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const accounts = body?.accounts;
    if (!Array.isArray(accounts) || accounts.length === 0) {
        return NextResponse.json(
            { error: 'Request body must include a non-empty "accounts" array.' },
            { status: 400 }
        );
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

    try {
        await adminDb.collection('staff_credentials').doc('config').set({
            accounts,
            setupAt: new Date().toISOString(),
            note: 'Managed via Firebase Console. Change password field directly. Role must be kitchen_staff, kitchen_manager, or admin.',
        });

        const batch = adminDb.batch();
        for (const account of accounts as any[]) {
            const ref = adminDb.collection('manager_allowlist').doc(account.email.toLowerCase());
            batch.set(ref, { enabled: true, role: account.role }, { merge: true });
        }
        await batch.commit();

        return NextResponse.json({
            success: true,
            message: 'Staff credentials seeded in Firestore.',
            accounts: (accounts as any[]).map((a) => ({ email: a.email, role: a.role })),
            note: 'Passwords stored in Firestore → staff_credentials → config. Change them in Firebase Console.',
        });

    } catch (error: any) {
        console.error('[staff-setup] Error:', error?.message ?? error);
        return NextResponse.json({ error: 'Setup failed.', detail: error?.message }, { status: 500 });
    }
}
