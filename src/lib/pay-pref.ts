import type { Firestore } from 'firebase-admin/firestore';

/**
 * Persists the student's last-used payment details so the next checkout can skip the
 * phone-entry, method-list and VPA screens.
 *
 * Why this lives on `users/{uid}` and not on the order document: firestore.rules lets
 * ANY signed-in student read any order in Preparing/Ready so the pickup board works
 * (see the /orders read rule). A phone number or UPI handle there would be readable by
 * the whole campus. `users/{uid}` is read-own, and the client write allowlist in the
 * rules means only the Admin SDK can set this field.
 *
 * Called from both confirmation paths — verify-payment (handler fired) and the webhook
 * (UPI app never came back). The webhook path is the one that matters most: those are
 * exactly the students who leave the browser, and before this they never got a prefill
 * saved at all.
 *
 * Always fire-and-forget. The payment is already captured and the order already
 * committed by the time this runs; a convenience write must never surface as a payment
 * failure. Callers do not await it.
 */
export function savePayPrefForUser(
    db: Firestore,
    uid: string | undefined,
    payment: { contact?: unknown; method?: unknown; vpa?: unknown },
): void {
    if (!uid) return;

    const payPref: Record<string, string> = {};
    if (typeof payment.contact === 'string' && payment.contact) payPref.contact = payment.contact;
    if (typeof payment.method === 'string' && payment.method) payPref.method = payment.method;
    if (typeof payment.vpa === 'string' && payment.vpa) payPref.vpa = payment.vpa;
    if (Object.keys(payPref).length === 0) return;

    // merge:true so this never disturbs name/email/createdAt on the profile.
    db.collection('users').doc(uid).set({ payPref }, { merge: true }).catch(() => {
        /* convenience only — next checkout just shows the normal screens */
    });
}
