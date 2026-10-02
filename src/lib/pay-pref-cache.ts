import type { PayPref, VerifyPaymentResponse } from '@/types';

/**
 * Per-device cache of the student's last-used payment details, used to pre-fill the
 * Razorpay modal so a returning student skips the phone-entry and method-list screens.
 *
 * This is only a cache. The durable copy lives on `users/{uid}.payPref`, written by the
 * server on both confirmation paths (see lib/pay-pref.ts) and handed back by
 * create-order. That one survives a cleared cache and follows the student to a new
 * phone; this one just avoids waiting on a read.
 *
 * Shared by use-razorpay and use-pending-payment so the storage key is defined once —
 * two copies of `kanteen_pay_` drifting apart would silently lose every saved pre-fill.
 */

const PAY_PREF_PREFIX = 'kanteen_pay_';

export type SavedPayPref = PayPref;

export function loadPayPref(uid: string): SavedPayPref {
    try {
        return JSON.parse(localStorage.getItem(`${PAY_PREF_PREFIX}${uid}`) || '{}');
    } catch {
        return {};
    }
}

export function savePayPref(uid: string, update: SavedPayPref) {
    try {
        const existing = loadPayPref(uid);
        localStorage.setItem(
            `${PAY_PREF_PREFIX}${uid}`,
            JSON.stringify({ ...existing, ...update })
        );
    } catch { /* ignore storage errors */ }
}

/** Picks the pre-fill fields out of a verify-payment response, if it carried any. */
export function cachePayPrefFromVerify(uid: string, data: VerifyPaymentResponse) {
    if (!uid) return;
    const next: SavedPayPref = {};
    if (data.paymentContact) next.contact = data.paymentContact;
    if (data.paymentMethod) next.method = data.paymentMethod;
    if (data.paymentVpa) next.vpa = data.paymentVpa;
    if (Object.keys(next).length > 0) savePayPref(uid, next);
}
