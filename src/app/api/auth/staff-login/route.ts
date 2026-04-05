import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getAdminAuth } from '@/lib/firebase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIP } from '@/lib/audit-logger';

interface StaffAccount {
    email: string;
    password: string;
    // Must be one of Firebase ActorRole values used in order-state-machine
    role: 'kitchen_staff' | 'kitchen_manager' | 'admin';
}

// Owner emails live server-side only — never exposed in the client bundle.
// These accounts get isOwner: true in their Firebase custom claims.
const OWNER_EMAILS = [
    "dhrupadrajpurohit@gmail.com",
    "manager.mrc@gmail.com",
];

/**
 * POST /api/auth/staff-login
 *
 * Verifies staff email + password against Firestore `staff_credentials/config`.
 * On success, sets Firebase custom claims (role, isOwner) on the user's Auth record
 * and returns the email + role. Client then signs in with signInWithEmailAndPassword
 * and force-refreshes the token to pick up the new claims.
 *
 * Credentials are stored in Firestore and can be changed via Firebase Console:
 *   Collection: staff_credentials
 *   Document:   config
 *   Field:      accounts (array of { email, password, role })
 */
export async function POST(request: NextRequest) {
    const ip = getClientIP(request);

    // Rate-limit: 10 attempts per IP per minute
    const { success: ok } = rateLimit(`staff-login:${ip}`, 10, 60_000);
    if (!ok) {
        return NextResponse.json(
            { error: 'Too many attempts. Please wait before trying again.' },
            { status: 429 }
        );
    }

    try {
        const body = await request.json();
        const { email, password } = body ?? {};

        if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
            return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
        }

        // ── Read credentials from Firestore (server-side only, never exposed to client) ──
        const configSnap = await adminDb.collection('staff_credentials').doc('config').get();

        if (!configSnap.exists) {
            console.error('[staff-login] staff_credentials/config document not found. Run /api/auth/staff-setup first.');
            return NextResponse.json({ error: 'Staff credentials not configured.' }, { status: 503 });
        }

        const { accounts } = configSnap.data() as { accounts: StaffAccount[] };

        // Find matching account (case-insensitive email)
        const account = (accounts ?? []).find(
            (a) => a.email.toLowerCase() === email.toLowerCase() && a.password === password
        );

        if (!account) {
            // Fixed delay to prevent timing attacks
            await new Promise((r) => setTimeout(r, 600));
            return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
        }

        // ── Set custom claims on the Firebase Auth user ───────────────────────────
        // setCustomUserClaims only requires Firebase Auth admin access (no token-signing
        // IAM permission needed), so this works on App Hosting without extra IAM roles.
        // The client will call signInWithEmailAndPassword + getIdToken(true) to pick up claims.
        const isOwner = account.role === 'kitchen_manager' &&
            OWNER_EMAILS.includes(account.email.toLowerCase());

        let userRecord;
        try {
            userRecord = await getAdminAuth().getUserByEmail(account.email);
        } catch (e: any) {
            if (e?.code === 'auth/user-not-found') {
                console.error(`[staff-login] Firebase Auth user not found for ${account.email}. Create the user in Firebase Console or run the staff-setup script.`);
                return NextResponse.json({ error: 'Staff account not provisioned. Contact admin.' }, { status: 503 });
            }
            throw e;
        }

        await getAdminAuth().setCustomUserClaims(userRecord.uid, {
            role: account.role,
            isOwner,
        });

        return NextResponse.json({
            email: account.email,
            role: account.role,
        });

    } catch (error: any) {
        console.error('[staff-login] Error:', error?.code, error?.message ?? error);
        return NextResponse.json({ error: 'Authentication failed. Please try again.' }, { status: 500 });
    }
}
