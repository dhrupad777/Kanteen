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
 *
 * Every registered student gets a rank: spend first, then — for everyone tied,
 * which is most of the roster at ₹0 — whoever joined Kanteen earliest.
 */

/** Orders that count toward spend: the money has actually been taken.
 *
 *  This deliberately starts at PAID rather than at pickup. A student checks the
 *  board right after paying and before collecting; counting only PICKED_UP made
 *  them look unranked in exactly that window. `pending` is an abandoned checkout
 *  (175 of 775 orders all-time, none with a razorpayPaymentId) and never counts. */
const COUNTED_STATUSES = new Set(['PAID', 'Preparing', 'Ready', 'PICKED_UP', 'Completed']);

const TOP_N = 10;
const ORDERS_TTL_MS = 60_000;
/** Names and join dates never change once written, so the roster is cached far
 *  longer than the order totals — a 60s TTL over 433 user docs would burn ~26k
 *  reads an hour. */
const ROSTER_TTL_MS = 15 * 60_000;

interface MonthTotals {
    spent: number;
    orders: number;
    fallbackName: string;
}

interface RosterEntry {
    name: string;
    photoURL: string | null;
    /** users/{uid}.createdAt in ms. Later joiners rank below earlier ones. */
    joinedAt: number;
}

interface Row {
    uid: string;
    spent: number;
    orders: number;
    name: string;
    photoURL: string | null;
    joinedAt: number;
}

const ordersCache = new Map<string, { totals: Map<string, MonthTotals>; expires: number }>();
let rosterCache: { roster: Map<string, RosterEntry>; staffUids: Set<string>; expires: number } | null = null;

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

function toMillis(value: any): number | null {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
}

async function getMonthTotals(month: string): Promise<Map<string, MonthTotals>> {
    const cached = ordersCache.get(month);
    if (cached && cached.expires > Date.now()) return cached.totals;

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
        if (!COUNTED_STATUSES.has(data.status)) continue;

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
                spent: toOrderNumber(data.totalPrice),
                orders: 1,
                fallbackName: typeof data.userName === 'string' ? data.userName : '',
            });
        }
    }

    ordersCache.set(month, { totals, expires: Date.now() + ORDERS_TTL_MS });
    return totals;
}

async function getRoster() {
    if (rosterCache && rosterCache.expires > Date.now()) return rosterCache;

    const db = getAdminDb();
    const [usersSnap, allowlistSnap] = await Promise.all([
        db.collection('users').get(),
        // Operational accounts (kitchen.mrc@, counter.mrc@, …) live here and have
        // no business on a student leaderboard.
        db.collection('manager_allowlist').get(),
    ]);

    const staffEmails = new Set(allowlistSnap.docs.map((d) => d.id.toLowerCase()));
    const roster = new Map<string, RosterEntry>();
    const staffUids = new Set<string>();

    for (const doc of usersSnap.docs) {
        const data = doc.data();
        const email = typeof data?.email === 'string' ? data.email : '';
        if (email && staffEmails.has(email.toLowerCase())) {
            staffUids.add(doc.id);
            continue;
        }

        roster.set(doc.id, {
            // users/{uid}.name is the stable one — auth-provider deliberately never
            // overwrites it after the first sign-in.
            name: typeof data?.name === 'string' && data.name.trim() ? data.name : '',
            // customPhotoURL wins when set: a student who replaced their Google
            // picture should see that choice on the board. Falls back silently, so a
            // cleared or malformed value just shows the Google photo again.
            photoURL: (typeof data?.customPhotoURL === 'string' && data.customPhotoURL)
                ? data.customPhotoURL
                : (typeof data?.photoURL === 'string' && data.photoURL ? data.photoURL : null),
            // No createdAt (very old docs) sorts last among equal spend.
            joinedAt: toMillis(data?.createdAt) ?? Number.MAX_SAFE_INTEGER,
        });
    }

    rosterCache = { roster, staffUids, expires: Date.now() + ROSTER_TTL_MS };
    return rosterCache;
}

async function buildRows(month: string): Promise<Row[]> {
    const [totals, { roster, staffUids }] = await Promise.all([getMonthTotals(month), getRoster()]);

    const rows: Row[] = [];

    for (const [uid, entry] of roster) {
        const t = totals.get(uid);
        rows.push({
            uid,
            // totalPrice is fractional (Razorpay fee gross-up), so an unrounded sum
            // surfaces as ₹745.5800000000002.
            spent: t ? Math.round(t.spent * 100) / 100 : 0,
            orders: t?.orders ?? 0,
            name: entry.name || t?.fallbackName || 'Student',
            photoURL: entry.photoURL,
            joinedAt: entry.joinedAt,
        });
    }

    // Ordered but has no users/{uid} doc. Shouldn't happen — ordering requires
    // sign-in, which writes the profile — but don't drop their spend if it does.
    for (const [uid, t] of totals) {
        if (roster.has(uid) || staffUids.has(uid)) continue;
        rows.push({
            uid,
            spent: Math.round(t.spent * 100) / 100,
            orders: t.orders,
            name: t.fallbackName || 'Student',
            photoURL: null,
            joinedAt: Number.MAX_SAFE_INTEGER,
        });
    }

    // Spend first; everyone tied — which is most of the roster at ₹0 — is ordered
    // by who joined Kanteen earliest. uid is the final key so the order is stable.
    rows.sort((a, b) =>
        b.spent - a.spent
        || a.joinedAt - b.joinedAt
        || a.uid.localeCompare(b.uid));

    return rows;
}

export async function GET(request: NextRequest) {
    const clientIP = getClientIP(request);

    try {
        // A whole campus sits behind one NAT'd public IP, so this ceiling is abuse
        // protection, NOT a per-student budget — at 30/min it was rejecting most
        // students at lunch, and a 429 renders as "unranked". The real per-student
        // limit is keyed on uid below. Same trap as api/feedback/route.ts:40.
        const { success: ipOk } = rateLimit(`leaderboard-ip:${clientIP}`, 600, 60000);
        if (!ipOk) {
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

        const { success: uidOk } = rateLimit(`leaderboard-uid:${decodedToken.uid}`, 20, 60000);
        if (!uidOk) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const monthParam = request.nextUrl.searchParams.get('month');
        const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam ?? '')
            ? monthParam!
            : new Date().toISOString().slice(0, 7);

        // Amounts are owner-only, gated on exactly what /report gates on: the
        // isOwner claim, minted by /api/auth/staff-login for kitchen_manager
        // accounts on the owner email list.
        //
        // Deliberately NOT manager_allowlist — that collection also contains the
        // kitchen and counter staff accounts, and per-student spending totals are
        // not theirs to see.
        const isOwner = decodedToken.isOwner === true;

        const rows = await buildRows(month);
        const callerIndex = rows.findIndex((r) => r.uid === decodedToken.uid);
        const visible = isOwner ? rows : rows.slice(0, TOP_N);

        // Built key by key rather than spread-and-delete, so a new internal field
        // can never leak into the student payload by accident.
        const toEntry = (row: Row, rank: number): LeaderboardEntry => {
            const entry: LeaderboardEntry = {
                rank,
                displayName: toDisplayName(row.name),
                photoURL: row.photoURL,
                isYou: row.uid === decodedToken.uid,
            };
            if (isOwner) {
                entry.displayName = row.name;
                entry.spent = row.spent;
                entry.orders = row.orders;
            }
            return entry;
        };

        const response: LeaderboardResponse = {
            month,
            entries: visible.map((row, i) => toEntry(row, i + 1)),
            // Always present when the caller is on the roster — the student view
            // shows it as a banner above the board, whether or not they made the
            // top 10 and whether or not they have ordered.
            you: callerIndex >= 0 ? toEntry(rows[callerIndex], callerIndex + 1) : null,
            totalRanked: rows.length,
        };

        // Per-caller payload (`isYou`, `you`, and amounts for the owner) over a
        // board that moves with every order — nothing in front of this route may
        // hold a copy. The page-HTML s-maxage rule in next.config.ts does not cover
        // /api, but say so explicitly rather than rely on that staying true.
        return NextResponse.json(response, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error: any) {
        console.error('Leaderboard error:', error instanceof Error ? error.message : 'Unknown error');
        return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 });
    }
}
