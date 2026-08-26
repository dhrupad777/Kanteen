import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { toOrderNumber, normalizeOrderItems } from '@/lib/order-normalize';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import type { StudentDirectoryEntry, StudentDirectoryResponse, StudentOrderSummary } from '@/types';

/**
 * Owner-only student directory for one month.
 * GET /api/staff/students?month=YYYY-MM   (defaults to the current month)
 *
 * Returns every registered student plus, for those who ordered, their paid
 * orders for the month. The whole month is ~130KB, so search runs client-side —
 * no per-keystroke requests, no search index.
 *
 * This payload carries student EMAIL ADDRESSES and full spending history, so it
 * is gated on the isOwner claim with no lesser tier. `users` cannot be listed
 * from the client at all (firestore.rules), so this route is the only way in.
 */

/** Never-paid checkouts and dead orders. `pending` is the one that actually
 *  occurs today — 172 of 744 orders all-time are abandoned payments. */
const EXCLUDED_STATUSES = new Set(['pending', 'EXPIRED', 'CANCELLED', 'Archived']);

/** Collected — what the ₹ total sums, matching the leaderboard's definition. */
const COLLECTED_STATUSES = new Set(['PICKED_UP', 'Completed']);

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: StudentDirectoryResponse; expires: number }>();

/** 'YYYY-MM' -> the first day of the following month, as a dateKey string. */
function nextMonthStart(month: string): string {
    const [y, m] = month.split('-').map(Number);
    return m === 12
        ? `${y + 1}-01-01`
        : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

function toIso(value: any): string | null {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function buildDirectory(month: string): Promise<StudentDirectoryResponse> {
    const cached = cache.get(month);
    if (cached && cached.expires > Date.now()) return cached.data;

    const db = getAdminDb();

    const [ordersSnap, usersSnap, allowlistSnap] = await Promise.all([
        // Range on a single field — automatic index, no composite needed.
        // Note dateKey is UTC-derived; for a monthly bucket that only misplaces
        // orders in the first 5.5h of the 1st (IST), when the canteen is shut.
        db.collection('orders')
            .where('dateKey', '>=', `${month}-01`)
            .where('dateKey', '<', nextMonthStart(month))
            .get(),
        db.collection('users').get(),
        // Staff accounts live here (kitchen.mrc@, counter.mrc@, …) and don't
        // belong in a list labelled "Students".
        db.collection('manager_allowlist').get(),
    ]);

    const staffEmails = new Set(allowlistSnap.docs.map((d) => d.id.toLowerCase()));

    const byUid = new Map<string, { orders: StudentOrderSummary[]; spent: number; fallbackName: string }>();

    for (const doc of ordersSnap.docs) {
        const data = doc.data();
        if (EXCLUDED_STATUSES.has(data.status)) continue;

        // Counter/coupon orders use a synthetic id and can't be tied to a person.
        const uid = data.studentId;
        if (typeof uid !== 'string' || !uid || data.type === 'manual' || uid.startsWith('student-')) continue;

        const entry = byUid.get(uid) ?? { orders: [], spent: 0, fallbackName: '' };

        // toOrderNumber, not `|| 0`: a manual order written without totalPrice
        // once crashed every dashboard. See @/lib/order-normalize.
        const totalPrice = toOrderNumber(data.totalPrice);
        if (COLLECTED_STATUSES.has(data.status)) entry.spent += totalPrice;
        if (!entry.fallbackName && typeof data.userName === 'string') entry.fallbackName = data.userName;

        entry.orders.push({
            id: doc.id,
            token: toOrderNumber(data.token),
            status: data.status,
            totalPrice,
            items: normalizeOrderItems(data.items),
            isParcel: data.isParcel ?? false,
            note: data.note,
            createdAt: toIso(data.createdAt),
            pickedUpAt: toIso(data.kitchen?.pickedUpAt),
        });

        byUid.set(uid, entry);
    }

    const students: StudentDirectoryEntry[] = [];

    for (const doc of usersSnap.docs) {
        const data = doc.data();
        const email = typeof data?.email === 'string' ? data.email : '';
        if (email && staffEmails.has(email.toLowerCase())) continue;

        const found = byUid.get(doc.id);
        byUid.delete(doc.id);

        // users/{uid}.name is the stable one — auth-provider never overwrites it
        // after first sign-in. Then the order's denormalized name, then email.
        const name = (typeof data?.name === 'string' && data.name.trim())
            || found?.fallbackName
            || email.split('@')[0]
            || 'Student';

        students.push({
            uid: doc.id,
            name,
            email,
            photoURL: typeof data?.photoURL === 'string' && data.photoURL ? data.photoURL : null,
            // totalPrice is fractional (Razorpay fee gross-up), so an unrounded
            // sum renders as ₹745.5800000000002.
            spent: Math.round((found?.spent ?? 0) * 100) / 100,
            orderCount: found?.orders.length ?? 0,
            orders: (found?.orders ?? []).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
        });
    }

    // Anyone who ordered but has no users/{uid} doc — shouldn't happen, since
    // ordering requires sign-in, but don't silently drop their transactions.
    for (const [uid, found] of byUid) {
        students.push({
            uid,
            name: found.fallbackName || 'Unknown student',
            email: '',
            photoURL: null,
            spent: Math.round(found.spent * 100) / 100,
            orderCount: found.orders.length,
            orders: found.orders.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
        });
    }

    // Active students first by spend, then everyone else alphabetically — the
    // default view is useful, and search reaches the rest.
    students.sort((a, b) => {
        if (a.orderCount > 0 !== b.orderCount > 0) return a.orderCount > 0 ? -1 : 1;
        if (a.orderCount > 0) return b.spent - a.spent || b.orderCount - a.orderCount;
        return a.name.localeCompare(b.name);
    });

    const data: StudentDirectoryResponse = { month, students };
    cache.set(month, { data, expires: Date.now() + CACHE_TTL_MS });
    return data;
}

export async function GET(request: NextRequest) {
    const clientIP = getClientIP(request);

    try {
        const { success: rateLimitOk } = rateLimit(`students:${clientIP}`, 30, 60000);
        if (!rateLimitOk) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Distinguish a bad/expired token (401) from a genuine server fault (500).
        let decodedToken;
        try {
            decodedToken = await getAdminAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
        } catch {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Signed in, but not the owner. Same claim /report itself gates on —
        // deliberately not manager_allowlist, which includes kitchen and counter
        // staff; student emails are not theirs to read.
        if (decodedToken.isOwner !== true) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const monthParam = request.nextUrl.searchParams.get('month');
        const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam ?? '')
            ? monthParam!
            : new Date().toISOString().slice(0, 7);

        return NextResponse.json(await buildDirectory(month));
    } catch (error: any) {
        console.error('Student directory error:', error instanceof Error ? error.message : 'Unknown error');
        return NextResponse.json({ error: 'Failed to load students' }, { status: 500 });
    }
}
