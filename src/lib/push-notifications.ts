import webpush from 'web-push';
import { getAdminDb } from '@/lib/firebase-admin';

// Configure VAPID once on module load
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:admin@mrckanteen.in',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
    process.env.VAPID_PRIVATE_KEY ?? ''
);

interface PushSubscriptionDoc {
    uid: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
}

/**
 * Sends a push notification to all devices subscribed for a given student.
 * Called server-side when an order is marked "Ready".
 * Never throws — any error is logged and swallowed so the caller is unaffected.
 */
export async function sendOrderReadyNotification(
    orderId: string,
    studentId: string,
    token: number
): Promise<void> {
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.warn('push-notifications: VAPID keys not configured — skipping');
        return;
    }

    try {
        const db = getAdminDb();
        const snapshot = await db
            .collection('push_subscriptions')
            .where('uid', '==', studentId)
            .get();

        if (snapshot.empty) return;

        const payload = JSON.stringify({
            title: 'Your order is ready! 🎉',
            body: `Token #${token} — open Kanteen to see your OTP`,
            url: '/student',
        });

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
