import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';
import { toOrderNumber, normalizeOrderItems } from '@/lib/order-normalize';
import { rateLimit, getClientIP } from '@/lib/rate-limit';
import { isExcludedFromStudentLists } from '@/lib/student-roster';
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

/** What the ₹ total sums, matching the leaderboard's definition — money taken,
 *  from payment onward rather than from pickup. The two views must not diverge. */
const COUNTED_STATUSES = new Set(['PAID', 'Preparing', 'Ready', 'PICKED_UP', 'Completed']);

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
        if (COUNTED_STATUSES.has(data.status)) entry.spent += totalPrice;
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
        if (isExcludedFromStudentLists(email, staffEmails)) continue;

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
            // Show the owner what students actually see, so a photo being moderated is
            // the one on screen rather than the Google original behind it.
            photoURL: (typeof data?.customPhotoURL === 'string' && data.customPhotoURL)
                ? data.customPhotoURL
                : (typeof data?.photoURL === 'string' && data.photoURL ? data.photoURL : null),
            hasCustomPhoto: typeof data?.customPhotoURL === 'string' && !!data.customPhotoURL,
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
            hasCustomPhoto: false,
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

/**
 * DELETE /api/staff/students?uid=...
 *
 * Clears a student's custom leaderboard photo, putting them back on their Google
 * picture. Exists because those photos are visible to the whole campus: without a
 * moderation path the only remedy for an inappropriate upload would be the Firebase
 * console. Owner-only, the same gate as the directory itself.
 *
 * Does not stop them uploading again — that would need a per-student block, which was
 * deliberately left out for now.
 */
export async function DELETE(request: NextRequest) {
    const clientIP = getClientIP(request);

    try {
        const { success: rateLimitOk } = rateLimit(`students-photo:${clientIP}`, 30, 60000);
        if (!rateLimitOk) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let decodedToken;
        try {
            decodedToken = await getAdminAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
        } catch {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (decodedToken.isOwner !== true) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const uid = request.nextUrl.searchParams.get('uid');
        if (!uid || typeof uid !== 'string' || uid.length > 128) {
            return NextResponse.json({ error: 'A student uid is required' }, { status: 400 });
        }

        const db = getAdminDb();
        const userRef = db.collection('users').doc(uid);
        const snap = await userRef.get();
        if (!snap.exists) {
            return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        const storedPath = snap.data()?.customPhotoPath;

        // Firestore first: once the field is gone the photo stops rendering anywhere,
        // which is the outcome that actually matters.
        await userRef.set({
            customPhotoURL: FieldValue.delete(),
            customPhotoPath: FieldValue.delete(),
        }, { merge: true });

        // Then clear the file. Best-effort and explicitly bucket-named, because the
        // admin app is initialised without a default storageBucket. An orphaned object
        // is harmless and must not turn a successful takedown into an error.
        if (typeof storedPath === 'string' && storedPath) {
            const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
            if (bucketName) {
                try {
                    await getAdminStorage().bucket(bucketName).file(storedPath).delete();
                } catch (e: any) {
                    console.warn('Avatar file delete failed (non-fatal):', storedPath, e?.message);
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Reset student photo error:', error instanceof Error ? error.message : 'Unknown error');
        return NextResponse.json({ error: 'Failed to reset photo' }, { status: 500 });
    }
}
