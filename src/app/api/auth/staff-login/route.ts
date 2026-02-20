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

/**
 * POST /api/auth/staff-login
 *
 * Verifies staff email + password against Firestore `staff_credentials/config`.
 * On success, returns a Firebase custom token so the client can sign in
 * with signInWithCustomToken() and use user.getIdToken() for API calls.
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

        // ── Create Firebase custom token with role claim ──────────────────────────
        // The role claim is read by getActorRoleFromToken() in existing API routes,
        // so OTP verification, status updates, etc. work without any changes.
        const customToken = await getAdminAuth().createCustomToken(account.email, {
            role: account.role,
        });

        return NextResponse.json({
            customToken,
            email: account.email,
            role: account.role,
        });

    } catch (error: any) {
        console.error('[staff-login] Error:', error?.message ?? error);
        // If createCustomToken fails (service account permission issue), surface a helpful message
        if (error?.code === 'app/invalid-credential' || error?.message?.includes('service account')) {
            return NextResponse.json(
                { error: 'Server configuration error: custom token signing unavailable. Add FIREBASE_SERVICE_ACCOUNT_KEY to env vars.' },
                { status: 503 }
            );
        }
        return NextResponse.json({ error: 'Authentication failed. Please try again.' }, { status: 500 });
    }
}
