/**
 * Records an in-flight payment in localStorage so the token can be recovered if the
 * tab dies before the confirmation is shown.
 *
 * The old handoff was sessionStorage-only, which does not survive Android Chrome
 * discarding the tab during a UPI app-switch — a student would pay and never see a
 * token. This record survives that, and `use-pending-payment` replays it on next load.
 *
 * Two shapes exist because the two failure modes differ:
 *   - Razorpay's handler fired  → we have the signature, so verify-payment can be
 *     re-POSTed (it is idempotent and returns the same token).
 *   - The handler never fired   → we only have orderId, so we read the order doc
 *     directly and look for a token the webhook already assigned.
 */

const KEY = 'kanteen_pending_payment';

/** Older than this and we stop trying — the order is long settled either way. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface PendingPayment {
    orderId: string;
    /** When the Razorpay order was created (ms since epoch). */
    ts: number;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
}

export function savePendingPayment(record: PendingPayment) {
    try {
        localStorage.setItem(KEY, JSON.stringify(record));
    } catch { /* ignore storage errors (private mode, quota) */ }
}

/** Merges into the existing record — used to attach signature fields once the handler fires. */
export function updatePendingPayment(orderId: string, update: Partial<PendingPayment>) {
    try {
        const existing = loadPendingPayment();
        if (!existing || existing.orderId !== orderId) return;
        localStorage.setItem(KEY, JSON.stringify({ ...existing, ...update }));
    } catch { /* ignore storage errors */ }
}

/** Returns the record, or null if absent, malformed, or older than MAX_AGE_MS. */
export function loadPendingPayment(): PendingPayment | null {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.orderId || typeof parsed.ts !== 'number') {
            clearPendingPayment();
            return null;
        }
        if (Date.now() - parsed.ts > MAX_AGE_MS) {
            clearPendingPayment();
            return null;
        }
        return parsed as PendingPayment;
    } catch {
        return null;
    }
}

export function clearPendingPayment() {
    try {
        localStorage.removeItem(KEY);
    } catch { /* ignore storage errors */ }
}
