"use client";

import { useState, useCallback } from 'react';
import type { CreateRazorpayOrderResponse, VerifyPaymentResponse } from '@/types';

declare global {
    interface Window {
        Razorpay: any;
    }
}

const PAY_PREF_PREFIX = 'kanteen_pay_';

interface SavedPayPref {
    contact?: string;
    method?: string;  // 'upi' | 'card' | 'netbanking' | 'wallet'
    vpa?: string;     // e.g. 'user@ybl'
}

function loadPayPref(uid: string): SavedPayPref {
    try {
        return JSON.parse(localStorage.getItem(`${PAY_PREF_PREFIX}${uid}`) || '{}');
    } catch {
        return {};
    }
}

function savePayPref(uid: string, update: SavedPayPref) {
    try {
        const existing = loadPayPref(uid);
        localStorage.setItem(
            `${PAY_PREF_PREFIX}${uid}`,
            JSON.stringify({ ...existing, ...update })
        );
    } catch { /* ignore storage errors */ }
}

interface UseRazorpayOptions {
    onSuccess?: (response: VerifyPaymentResponse) => void;
    onError?: (error: string) => void;
    onCancel?: () => void;
    /** Called when the modal closes with no confirmed result (e.g. UPI app switch).
     *  Payment may still be processing — keep UI in a "checking" state. */
    onPending?: () => void;
}

interface RazorpayCheckoutOptions {
    items: {
        itemId: string;
        name: string;
        qty: number;
        price: number;
    }[];
    isParcel?: boolean;
    parcelCharge?: number;
    platformCharges?: number;
    /** Kitchen notes (e.g., "make it spicy", "less oil") */
    note?: string;
}

export function useRazorpay(options: UseRazorpayOptions = {}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Tracks the active Firestore order listener so a second checkout call cleans up the first
    const activeListenerRef = { current: null as (() => void) | null };

    const loadRazorpayScript = useCallback((): Promise<boolean> => {
        return new Promise((resolve) => {
            if (window.Razorpay) { resolve(true); return; }
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.async = true;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });
    }, []);

    const getAuthToken = useCallback(async (): Promise<string> => {
        const { auth } = await import('@/lib/firebase');
        const user = auth.currentUser;
        if (!user) throw new Error('Not authenticated');
        return user.getIdToken();
    }, []);

    const createOrder = useCallback(async (
        token: string,
        checkoutOptions: RazorpayCheckoutOptions
    ): Promise<CreateRazorpayOrderResponse> => {
        const response = await fetch('/api/razorpay/create-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                items: checkoutOptions.items,
                isParcel: checkoutOptions.isParcel,
                parcelCharge: checkoutOptions.parcelCharge,
                platformCharges: checkoutOptions.platformCharges,
                note: checkoutOptions.note,
            }),
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to create order');
        }
        return response.json();
    }, []);

    const verifyPayment = useCallback(async (
        token: string,
        razorpayOrderId: string,
        razorpayPaymentId: string,
        razorpaySignature: string,
        orderId: string
    ): Promise<VerifyPaymentResponse> => {
        const response = await fetch('/api/razorpay/verify-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                razorpay_order_id: razorpayOrderId,
                razorpay_payment_id: razorpayPaymentId,
                razorpay_signature: razorpaySignature,
                orderId,
            }),
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Payment verification failed');
        }
        return response.json();
    }, []);

    const checkout = useCallback(async (
        checkoutOptions: RazorpayCheckoutOptions
    ): Promise<VerifyPaymentResponse> => {
        setLoading(true);
        setError(null);

        // Cancel any listener from a previous checkout that never resolved
        activeListenerRef.current?.();
        activeListenerRef.current = null;

        try {
            // 1. Load Razorpay script
            const scriptLoaded = await loadRazorpayScript();
            if (!scriptLoaded) throw new Error('Failed to load payment gateway');

            // 2. Auth token + user id
            const { auth } = await import('@/lib/firebase');
            const uid = auth.currentUser?.uid ?? '';
            const token = await getAuthToken();

            // 3. Saved payment preferences (for pre-fill)
            const pref = loadPayPref(uid);

            // 4. Create order on server
            const orderData = await createOrder(token, checkoutOptions);

            // 5. Open Razorpay checkout
            return new Promise((resolve, reject) => {
                // Guard against duplicate resolution (handler vs Firestore listener)
                let resolved = false;
                let unsubscribeFirestore: (() => void) | null = null;
                // Last failure reason from payment.failed — shown when the student
                // closes the modal without retrying, so they see the real cause
                // (e.g. "Insufficient funds") not just "Payment cancelled".
                let lastFailureReason: string | null = null;

                const handleSuccess = (result: VerifyPaymentResponse, paymentMeta?: Pick<VerifyPaymentResponse, 'paymentContact' | 'paymentMethod' | 'paymentVpa'>) => {
                    if (resolved) return;
                    resolved = true;
                    unsubscribeFirestore?.();
                    activeListenerRef.current = null;

                    // Cache payment preferences for next checkout
                    const toSave: SavedPayPref = {};
                    if (paymentMeta?.paymentContact) toSave.contact = paymentMeta.paymentContact;
                    if (paymentMeta?.paymentMethod) toSave.method = paymentMeta.paymentMethod;
                    if (paymentMeta?.paymentVpa) toSave.vpa = paymentMeta.paymentVpa;
                    if (Object.keys(toSave).length > 0) savePayPref(uid, toSave);

                    setLoading(false);
                    options.onSuccess?.(result);
                    resolve(result);
                };

                // ── Firestore fallback: fires when the webhook marks the order paid ──
                // This means even if the UPI app doesn't redirect back to the browser,
                // the student sees their confirmation as soon as the payment settles.
                import('@/lib/firebase').then(({ db }) =>
                    import('firebase/firestore').then(({ doc, onSnapshot }) => {
                        const unsub = onSnapshot(
                            doc(db, 'orders', orderData.orderId),
                            (snap) => {
                                if (!snap.exists() || resolved) return;
                                const data = snap.data();
                                if (data.payment?.status === 'paid' && typeof data.token === 'number') {
                                    handleSuccess({
                                        success: true,
                                        orderId: orderData.orderId,
                                        token: data.token,
                                    });
                                }
                            },
                            () => { /* ignore snapshot errors — handler is primary path */ }
                        );
                        unsubscribeFirestore = unsub;
                        activeListenerRef.current = unsub;
                    })
                ).catch(() => { /* Firestore unavailable — handler is primary path */ });

                // ── Build pre-fill ──
                const prefill: Record<string, string> = {
                    name: orderData.prefill.name,
                    email: orderData.prefill.email,
                };
                // Pre-fill contact number — skips the phone entry screen for returning users
                if (pref.contact) prefill.contact = pref.contact;
                // Pre-fill UPI VPA — Razorpay will jump straight to UPI collect screen
                if (pref.method === 'upi' && pref.vpa) prefill.vpa = pref.vpa;

                // ── Build display config to pre-select last-used payment method ──
                // `config.display.defaultBlock` jumps the user directly to their preferred
                // payment method instead of showing the full method list.
                const config: Record<string, any> = { display: {} };
                if (pref.method === 'upi') {
                    config.display.defaultBlock = 'upi';
                    config.display.blocks = {
                        upi: { name: 'Pay via UPI', instruments: [{ method: 'upi' }] },
                        other: { name: 'Other methods' },
                    };
                    config.display.sequence = ['block.upi', 'block.other'];
                    config.display.preferences = { show_default_blocks: true };
                } else if (pref.method === 'card') {
                    config.display.defaultBlock = 'card';
                    config.display.blocks = {
                        card: { name: 'Pay via Card', instruments: [{ method: 'card' }] },
                        other: { name: 'Other methods' },
                    };
                    config.display.sequence = ['block.card', 'block.other'];
                    config.display.preferences = { show_default_blocks: true };
                }

                const razorpayOptions: Record<string, any> = {
                    key: orderData.keyId,
                    amount: orderData.amount,
                    currency: orderData.currency,
                    name: 'MRC X Kanteen',
                    description: (() => {
                        const h = new Date().getHours();
                        if (h < 11) return 'Breakfast';
                        if (h < 16) return 'Lunch';
                        if (h < 19) return 'Snacks';
                        return 'Dinner';
                    })(),
                    order_id: orderData.razorpayOrderId,
                    prefill,
                    // Only attach config when we have a method preference — avoids
                    // sending an empty config object to Razorpay on first-time users
                    ...(pref.method ? { config } : {}),
                    theme: { color: '#FF8C00' },
                    // Retry once automatically — covers transient network errors
                    retry: { enabled: true, max_count: 1 },
                    handler: async (response: any) => {
                        if (resolved) return;
                        // Do NOT set resolved=true here — let handleSuccess own that flag.
                        // This ensures handleSuccess actually calls onSuccess instead of
                        // short-circuiting, and keeps the Firestore listener alive as a
                        // fallback if verifyPayment throws.
                        try {
                            const freshToken = await getAuthToken();
                            const verifyResponse = await verifyPayment(
                                freshToken,
                                response.razorpay_order_id,
                                response.razorpay_payment_id,
                                response.razorpay_signature,
                                orderData.orderId
                            );
                            handleSuccess(verifyResponse, {
                                paymentContact: verifyResponse.paymentContact,
                                paymentMethod: verifyResponse.paymentMethod,
                                paymentVpa: verifyResponse.paymentVpa,
                            });
                        } catch (err: any) {
                            // verifyPayment failed — money may already be captured.
                            // Keep the Firestore listener alive so the webhook can still
                            // trigger handleSuccess if/when the payment settles server-side.
                            setLoading(false);
                            const errorMsg = err.message || 'Payment verification failed';
                            setError(errorMsg);
                            options.onError?.(errorMsg);
                            reject(new Error(errorMsg));
                        }
                    },
                    modal: {
                        ondismiss: () => {
                            if (!resolved) {
                                setLoading(false);
                                if (lastFailureReason) {
                                    // Confirmed payment failure (payment.failed fired earlier)
                                    unsubscribeFirestore?.();
                                    options.onError?.(lastFailureReason);
                                    reject(new Error(lastFailureReason));
                                } else if (Date.now() - modalOpenTime < 5000) {
                                    // Dismissed within 5 s of opening — user clicked X before
                                    // initiating any payment, so cancel immediately.
                                    unsubscribeFirestore?.();
                                    options.onCancel?.();
                                    reject(new Error('Payment cancelled'));
                                } else {
                                    // Modal closed after ≥5 s with no confirmed failure.
                                    // UPI apps (Google Pay, PhonePe, etc.) redirect the user
                                    // back to Chrome after payment and may not re-trigger the
                                    // Razorpay handler — but the webhook will update Firestore.
                                    // Keep the Firestore listener alive and wait for it.
                                    options.onPending?.();
                                    // Auto-cancel after 2 minutes if the webhook never arrives.
                                    setTimeout(() => {
                                        if (!resolved) {
                                            resolved = true;
                                            unsubscribeFirestore?.();
                                            options.onCancel?.();
                                            reject(new Error('Payment timed out'));
                                        }
                                    }, 2 * 60 * 1000);
                                    // Do NOT reject here — Firestore listener owns the resolve.
                                }
                            }
                            // If already resolved (payment succeeded), do nothing.
                        },
                        escape: true,
                        backdropclose: false,
                        // Prevent the Razorpay modal from closing while we're verifying
                        confirm_close: false,
                    },
                };

                // Track modal open time — used to distinguish a quick X-close from a
                // UPI app-switch dismiss (which happens after several seconds).
                const modalOpenTime = Date.now();

                const razorpay = new window.Razorpay(razorpayOptions);
                razorpay.on('payment.failed', (response: any) => {
                    if (resolved) return;
                    // Keep Firestore listener alive — student can retry within this modal.
                    // Store reason so ondismiss can show it once the modal is gone.
                    lastFailureReason = response.error?.description || 'Payment failed. Please try again.';
                    setLoading(false);
                    setError(lastFailureReason);
                });
                razorpay.open();
            });

        } catch (err: any) {
            setLoading(false);
            const errorMsg = err.message || 'Checkout failed';
            setError(errorMsg);
            options.onError?.(errorMsg);
            throw err;
        }
    }, [loadRazorpayScript, getAuthToken, createOrder, verifyPayment, options]);

    return {
        checkout,
        loading,
        error,
        clearError: () => setError(null),
    };
}
