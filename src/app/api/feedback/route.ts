import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import { normalizeComment, validateRating, validateTag } from '@/lib/feedback';

/**
 * Submit general feedback. Not tied to an order.
 * POST /api/feedback
 * Body: { rating: 1-5, comment?: string }
 *
 * Students cannot write the `feedback` collection directly (see firestore.rules),
 * so this route is the only way in. The submitter's identity is taken from the
 * verified ID token — never from the request body.
 */
export async function POST(request: NextRequest) {
    const clientIP = getClientIP(request);

    try {
        const { success: ipOk } = rateLimit(`feedback-ip:${clientIP}`, 10, 60000);
        if (!ipOk) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Distinguish a bad/expired token (401, client should re-auth) from a
        // genuine server fault (500) — otherwise the UI shows the wrong message.
        let decodedToken;
        try {
            decodedToken = await getAdminAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
        } catch {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const uid = decodedToken.uid;

        // There is no longer a one-per-order limit, so cap per user as well as per
        // IP — a shared campus IP would otherwise let one student exhaust the quota
        // for everyone behind it.
        const { success: userOk } = rateLimit(`feedback-uid:${uid}`, 5, 5 * 60000);
        if (!userOk) {
            return NextResponse.json(
                { error: 'You have sent a lot of feedback just now. Please try again shortly.' },
                { status: 429 },
            );
        }

        const body = await request.json().catch(() => null);

        const ratingError = validateRating(body?.rating);
        if (ratingError) {
            return NextResponse.json({ error: ratingError }, { status: 400 });
        }

        const tagError = validateTag(body?.tag);
        if (tagError) {
            return NextResponse.json({ error: tagError }, { status: 400 });
        }

        const commentResult = normalizeComment(body?.comment);
        if ('error' in commentResult) {
            return NextResponse.json({ error: commentResult.error }, { status: 400 });
        }
        const comment = commentResult.value;

        const db = getAdminDb();

        // Prefer the stored profile name (set at sign-in) and fall back to the
        // token claims, so staff always see a usable name for "who left this".
        let userName = typeof decodedToken.name === 'string' ? decodedToken.name : '';
        let userEmail = typeof decodedToken.email === 'string' ? decodedToken.email : '';
        try {
            const profile = await db.collection('users').doc(uid).get();
            if (profile.exists) {
                const data = profile.data()!;
                userName = data.name || userName;
                userEmail = data.email || userEmail;
            }
        } catch {
            // Non-critical — fall back to the token claims.
        }

        await db.collection('feedback').add({
            studentId: uid,
            userName,
            userEmail,
            rating: body.rating,
            tag: body.tag,
            comment,
            createdAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('feedback error:', err?.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
