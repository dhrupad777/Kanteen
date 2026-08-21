"use client";

import { useEffect, useRef } from 'react';
import { useAuth } from './use-auth';
import {
    loadPendingPayment,
    clearPendingPayment,
    type PendingPayment,
} from '@/lib/pending-payment';
import type { VerifyPaymentResponse } from '@/types';

/**
 * Recovers the token for a payment whose confirmation never reached the student.
 *
 * The confirmation used to live only in a sessionStorage key written by the cart page,
 * which is lost if the tab is discarded during a UPI app-switch or if the verify-payment
 * response never arrives. `use-razorpay` now also writes a localStorage record, and this
 * hook replays it on the next dashboard load.
 *
 * Runs once per mount, after auth has settled. Safe to retry: verify-payment is
 * idempotent and returns the same token for an already-confirmed order.
 */
export function usePendingPayment(onRecovered: (result: { token: number; orderId: string }) => void) {
    const { user, loading: authLoading } = useAuth();
    const ranRef = useRef(false);
    // Keep the latest callback without making it a dependency — the effect must run once.
    const onRecoveredRef = useRef(onRecovered);
    useEffect(() => { onRecoveredRef.current = onRecovered; }, [onRecovered]);

    useEffect(() => {
        if (authLoading || !user || ranRef.current) return;

        const pending = loadPendingPayment();
        if (!pending) return;

        // `ranRef` is the only guard needed — deliberately no "cancelled on unmount" flag.
        // StrictMode double-invokes effects, and aborting the first run would mean the
        // second run hits this guard and recovery never happens at all in development.
        // Letting it finish is safe: the callback is a no-op on an unmounted component.
        ranRef.current = true;

        const recover = async () => {
            const token = await resolveToken(pending, user.getIdToken.bind(user));
            if (token === 'unresolved') return; // leave the record for the next load
            clearPendingPayment();
            if (typeof token === 'number') {
                onRecoveredRef.current({ token, orderId: pending.orderId });
            }
        };

        recover().catch(() => { /* inconclusive — record stays for the next load */ });
    }, [user, authLoading]);
}

/**
 * Returns the token, `null` when the order definitively did not complete, or
 * 'unresolved' when we could not tell and should try again later.
 */
async function resolveToken(
    pending: PendingPayment,
    getIdToken: () => Promise<string>
): Promise<number | null | 'unresolved'> {
    // Path 1 — Razorpay's handler fired, so we hold the signature and can just re-verify.
    if (pending.razorpayOrderId && pending.razorpayPaymentId && pending.razorpaySignature) {
        try {
            const idToken = await getIdToken();
            const res = await fetch('/api/razorpay/verify-payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    razorpay_order_id: pending.razorpayOrderId,
                    razorpay_payment_id: pending.razorpayPaymentId,
                    razorpay_signature: pending.razorpaySignature,
                    orderId: pending.orderId,
                }),
            });

            if (res.ok) {
                const data: VerifyPaymentResponse = await res.json();
                return typeof data.token === 'number' ? data.token : null;
            }
            // 4xx means this payment will never verify (bad signature, amount mismatch,
            // not captured). Stop retrying it. 5xx may be transient — try again later.
            if (res.status >= 400 && res.status < 500) return null;
            return 'unresolved';
        } catch {
            return 'unresolved'; // offline or request failed — retry on the next load
        }
    }

    // Path 2 — the handler never fired (UPI app never redirected back). We only know the
    // orderId, so read the doc and look for a token the webhook already assigned.
    try {
        const [{ db }, { doc, getDoc }] = await Promise.all([
            import('@/lib/firebase'),
            import('firebase/firestore'),
        ]);
        const snap = await getDoc(doc(db, 'orders', pending.orderId));
        if (!snap.exists()) return null;

        const data = snap.data();
        if (data.payment?.status === 'paid' && typeof data.token === 'number') {
            return data.token;
        }
        if (data.payment?.status === 'failed') return null;
        return 'unresolved'; // still settling — the webhook may land later
    } catch {
        return 'unresolved';
    }
}
