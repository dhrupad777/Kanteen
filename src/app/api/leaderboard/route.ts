import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { toOrderNumber } from '@/lib/order-normalize';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import type { LeaderboardEntry, LeaderboardResponse } from '@/types';

/**
 * Monthly spend leaderboard.
 * GET /api/leaderboard?month=YYYY-MM   (defaults to the current month)
 *
 * Students cannot compute this client-side and that is by design: firestore.rules
 * lets a student read only their own orders, and `users` denies `list` outright.
 * So the aggregation runs here with the Admin SDK.
 *
 * The response shape IS the privacy boundary. Every caller must be a signed-in
 * user (this endpoint returns real names), and `spent`/`orders` are attached only
 * for the owner. The uid never leaves this file.
 */

/** Orders that actually reached the student. `Completed` is the non-OTP pickup
 *  path (staff mark it from /kitchen); `PICKED_UP` is the OTP handoff. Both mean
 *  collected, and both are what the daily revenue report counts. */
const COLLECTED_STATUSES = new Set(['PICKED_UP', 'Completed']);

const TOP_N = 10;
const CACHE_TTL_MS = 60_000;

/** Aggregation is per-month and identical for every caller, so cache the raw
 *  totals (not the rendered payload — that differs per caller). At ~120 orders a
 *  month a scan is cheap, but the student dashboard mounts this on every visit. */
interface MonthTotals {
    uid: string;
    spent: number;
    orders: number;
    fallbackName: string;
}
const cache = new Map<string, { rows: MonthTotals[]; expires: number }>();

/** 'YYYY-MM' -> the first day of the following month, as a dateKey string. */
function nextMonthStart(month: string): string {
    const [y, m] = month.split('-').map(Number);
    return m === 12
        ? `${y + 1}-01-01`
        : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

/** "Dhrupad Rajpurohit" -> "Dhrupad R." Single-word names are left alone. */
function toDisplayName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'Student';
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

async function aggregateMonth(month: string): Promise<MonthTotals[]> {
    const cached = cache.get(month);
    if (cached && cached.expires > Date.now()) return cached.rows;

    const db = getAdminDb();

    // A range on a single field uses the automatic index — no composite needed,
    // which is why status is filtered in memory below rather than in the query.
    //
    // Caveat: `dateKey` is written from new Date().toISOString(), i.e. UTC. In IST
    // (UTC+5:30) an order placed between 00:00 and 05:30 lands on the previous
    // day's key. For a monthly bucket that only misattributes the first 5.5 hours
    // of the 1st, when the canteen is shut — acceptable, but don't be surprised.
    const snapshot = await db.collection('orders')
        .where('dateKey', '>=', `${month}-01`)
        .where('dateKey', '<', nextMonthStart(month))
        .get();

    const totals = new Map<string, MonthTotals>();

    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!COLLECTED_STATUSES.has(data.status)) continue;

        // Counter/coupon orders are written with a synthetic id (`student-<name>`)
        // and totalPrice 0 — they can't be tied to one real person, so they'd only
        // add duplicate, misspelled names to the board.
        const uid = data.studentId;
        if (typeof uid !== 'string' || !uid || data.type === 'manual' || uid.startsWith('student-')) continue;

        // toOrderNumber, not `|| 0`: an order written without totalPrice once took
        // down every dashboard. See the header of @/lib/order-normalize.
        const existing = totals.get(uid);
        if (existing) {
            existing.spent += toOrderNumber(data.totalPrice);
            existing.orders += 1;
        } else {
            totals.set(uid, {
                uid,
                spent: toOrderNumber(data.totalPrice),
                orders: 1,
                fallbackName: typeof data.userName === 'string' ? data.userName : '',
            });
        }
    }

    // totalPrice carries paise (the grossed-up Razorpay fee makes it e.g. 3.07),
    // so an unrounded sum surfaces as ₹9.070000000000002 in the UI.
    const rows = [...totals.values()]
        .map((r) => ({ ...r, spent: Math.round(r.spent * 100) / 100 }))
        .filter((r) => r.spent > 0)
        .sort((a, b) => b.spent - a.spent || b.orders - a.orders || a.fallbackName.localeCompare(b.fallbackName));

    cache.set(month, { rows, expires: Date.now() + CACHE_TTL_MS });
    return rows;
}

export async function GET(request: NextRequest) {
    const clientIP = getClientIP(request);

    try {
        const { success: rateLimitOk } = rateLimit(`leaderboard:${clientIP}`, 30, 60000);
        if (!rateLimitOk) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Distinguish a bad/expired token (401, client should re-auth) from a
        // genuine server fault (500).
        let decodedToken;
        try {
            decodedToken = await getAdminAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
        } catch {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const monthParam = request.nextUrl.searchParams.get('month');
        const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam ?? '')
            ? monthParam!
            : new Date().toISOString().slice(0, 7);

        const db = getAdminDb();

        // Amounts are owner-only, gated on exactly what /report gates on: the
        // isOwner claim, minted by /api/auth/staff-login for kitchen_manager
        // accounts on the owner email list.
        //
        // Deliberately NOT manager_allowlist — that collection also contains the
        // kitchen and counter staff accounts, and per-student spending totals are
        // not theirs to see.
        const isOwner = decodedToken.isOwner === true;

        const rows = await aggregateMonth(month);

        // Only the visible slice needs a name and avatar. The caller's own row is
        // fetched too when they placed outside it — the student view pins their
        // rank above the board whether or not they made the top 10.
        const callerIndex = rows.findIndex((r) => r.uid === decodedToken.uid);
        const visible = isOwner ? rows : rows.slice(0, TOP_N);
        const needsProfile = [...visible];
        if (callerIndex >= 0 && callerIndex >= visible.length) needsProfile.push(rows[callerIndex]);

        const profiles = new Map<string, { name: string; photoURL: string | null }>();
        if (needsProfile.length > 0) {
            const docs = await db.getAll(...needsProfile.map((r) => db.collection('users').doc(r.uid)));
            for (const doc of docs) {
                const data = doc.data();
                profiles.set(doc.id, {
                    // users/{uid}.name is the stable one — auth-provider deliberately
                    // never overwrites it after the first sign-in.
                    name: typeof data?.name === 'string' && data.name.trim() ? data.name : '',
                    photoURL: typeof data?.photoURL === 'string' && data.photoURL ? data.photoURL : null,
                });
            }
        }

        // Built key by key rather than spread-and-delete, so a new internal field
        // can never leak into the student payload by accident.
        const toEntry = (row: MonthTotals, rank: number): LeaderboardEntry => {
            const profile = profiles.get(row.uid);
            const entry: LeaderboardEntry = {
                rank,
                displayName: toDisplayName(profile?.name || row.fallbackName || 'Student'),
                photoURL: profile?.photoURL ?? null,
                isYou: row.uid === decodedToken.uid,
            };
            if (isOwner) {
                entry.displayName = profile?.name || row.fallbackName || 'Student';
                entry.spent = row.spent;
                entry.orders = row.orders;
            }
            return entry;
        };

        const response: LeaderboardResponse = {
            month,
            entries: visible.map((row, i) => toEntry(row, i + 1)),
            // Always present when the caller has a rank, even inside the top 10 —
            // the student view shows it as a banner above the board.
            you: callerIndex >= 0 ? toEntry(rows[callerIndex], callerIndex + 1) : null,
        };

        return NextResponse.json(response);
    } catch (error: any) {
        console.error('Leaderboard error:', error instanceof Error ? error.message : 'Unknown error');
        return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 });
    }
}
