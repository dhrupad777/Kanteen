import webpush from 'web-push';
import { getAdminDb } from '@/lib/firebase-admin';

// VAPID is configured lazily inside sendOrderReadyNotification — see note there.
// Configuring at module load means web-push validates the (possibly empty) key
// during `next build`, which breaks App Hosting builds when the secret is
// RUNTIME-only. The flag below ensures we still only configure once per process.
let vapidConfigured = false;

interface PushSubscriptionDoc {
    uid: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
}

/**
 * Sends one push notification to every device subscribed for a given student.
 * Never throws — any error is logged and swallowed so the caller is unaffected.
 */
async function sendPushToStudent(
    orderId: string,
    studentId: string,
    /** `kind` tells the service worker whether to trigger the in-app "order ready" chime. */
    notification: { title: string; body: string; url: string; kind: 'ready' | 'confirmed' }
): Promise<void> {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.warn('push-notifications: VAPID keys not configured — skipping');
        return;
    }

    if (!vapidConfigured) {
        webpush.setVapidDetails(
            process.env.VAPID_SUBJECT ?? 'mailto:admin@mrckanteen.in',
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY,
        );
        vapidConfigured = true;
    }

    try {
        const db = getAdminDb();
        const snapshot = await db
            .collection('push_subscriptions')
            .where('uid', '==', studentId)
            .get();

        if (snapshot.empty) return;

        const payload = JSON.stringify(notification);

        const staleRefs: FirebaseFirestore.DocumentReference[] = [];

        await Promise.allSettled(
            snapshot.docs.map(async (docSnap) => {
                const sub = docSnap.data() as PushSubscriptionDoc;
                try {
                    await webpush.sendNotification(
                        { endpoint: sub.endpoint, keys: sub.keys },
                        payload,
                        { TTL: 60 * 60 } // deliver within 1 hour, else drop
                    );
                } catch (err: any) {
                    // 410 Gone = subscription expired or revoked → clean up
                    if (err?.statusCode === 410 || err?.statusCode === 404) {
                        staleRefs.push(docSnap.ref);
                    } else {
                        console.error('push-notifications: send error for', sub.endpoint, err?.message);
                    }
                }
            })
        );

        // Remove stale subscriptions (fire-and-forget)
        if (staleRefs.length > 0) {
            const batch = db.batch();
            staleRefs.forEach((ref) => batch.delete(ref));
            batch.commit().catch(() => {});
        }

        console.log(`push-notifications: sent to ${snapshot.size} device(s) for order ${orderId}`);
    } catch (err: any) {
        console.error('push-notifications: failed to send notification:', err?.message);
    }
}

/** Called server-side when an order is marked "Ready". */
export async function sendOrderReadyNotification(
    orderId: string,
    studentId: string,
    token: number,
    studentName?: string
): Promise<void> {
    // Use first name if available: "Dhrupad, your order 206 is ready!"
    const firstName = studentName ? studentName.split(' ')[0] : null;
    return sendPushToStudent(orderId, studentId, {
        title: firstName
            ? `${firstName}, your order ${token} is ready! 🎉`
            : `Order ${token} is ready! 🎉`,
        body: 'Open Kanteen to see your pickup OTP',
        url: '/student',
        kind: 'ready',
    });
}

/**
 * Called server-side the moment a payment is confirmed and a token is assigned.
 * This is the only confirmation a student receives if the browser tab was closed or
 * discarded before the in-app token popup could be shown.
 */
export async function sendOrderConfirmedNotification(
    orderId: string,
    studentId: string,
    token: number,
    studentName?: string
): Promise<void> {
    const firstName = studentName ? studentName.split(' ')[0] : null;
    return sendPushToStudent(orderId, studentId, {
        title: firstName
            ? `${firstName}, your token is ${token} ✅`
            : `Order confirmed — your token is ${token} ✅`,
        body: 'Payment received. We\'ll notify you when it\'s ready to collect.',
        url: '/student',
        kind: 'confirmed',
    });
}
