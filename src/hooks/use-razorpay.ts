"use client";

import { useState, useCallback } from 'react';
import type { CreateRazorpayOrderResponse, VerifyPaymentResponse } from '@/types';

declare global {
    interface Window {
        Razorpay: any;
    }
}

interface UseRazorpayOptions {
    onSuccess?: (response: VerifyPaymentResponse) => void;
    onError?: (error: string) => void;
    onCancel?: () => void;
}

interface RazorpayCheckoutOptions {
    items: {
        itemId: string;
        name: string;
        qty: number;
        price: number;
    }[];
    isParcel?: boolean;
    platformCharges?: number;
    /** Kitchen notes (e.g., "make it spicy", "less oil") */
    note?: string;
}

export function useRazorpay(options: UseRazorpayOptions = {}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Load Razorpay script dynamically
     */
    const loadRazorpayScript = useCallback((): Promise<boolean> => {
        return new Promise((resolve) => {
            if (window.Razorpay) {
                resolve(true);
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.async = true;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });
    }, []);

    /**
     * Get Firebase auth token
     */
    const getAuthToken = useCallback(async (): Promise<string> => {
        const { auth } = await import('@/lib/firebase');
        const user = auth.currentUser;
        if (!user) {
            throw new Error('Not authenticated');
        }
        return user.getIdToken();
    }, []);

    /**
     * Create Razorpay order on server
     */
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

    /**
     * Verify payment on server
     */
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
                orderId: orderId,
            }),
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Payment verification failed');
        }

        return response.json();
    }, []);

    /**
     * Main checkout function
     */
    const checkout = useCallback(async (
        checkoutOptions: RazorpayCheckoutOptions
    ): Promise<VerifyPaymentResponse> => {
        setLoading(true);
        setError(null);

        try {
            // 1. Load Razorpay script
            const scriptLoaded = await loadRazorpayScript();
            if (!scriptLoaded) {
                throw new Error('Failed to load payment gateway');
            }

            // 2. Get auth token
            const token = await getAuthToken();

            // 3. Create order on server
            const orderData = await createOrder(token, checkoutOptions);

            // 4. Open Razorpay checkout
            return new Promise((resolve, reject) => {
                const razorpayOptions = {
                    key: orderData.keyId,
                    amount: orderData.amount,
                    currency: orderData.currency,
                    name: 'Kanteen',
                    description: (() => {
                        const now = new Date();
                        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        const dayName = days[now.getDay()];
                        const hour = now.getHours();
                        let meal = 'Dinner';
                        if (hour < 11) meal = 'Breakfast';
                        else if (hour < 16) meal = 'Lunch';
                        else if (hour < 19) meal = 'Snacks';
                        return `${dayName} ${meal}`;
                    })(),
                    order_id: orderData.razorpayOrderId,
                    prefill: {
                        name: orderData.prefill.name,
                        email: orderData.prefill.email,
                    },
                    theme: {
                        color: '#FF8C00', // Primary orange
                    },
                    handler: async (response: any) => {
                        try {
                            // 5. Verify payment on server
                            const verifyResponse = await verifyPayment(
                                token,
                                response.razorpay_order_id,
                                response.razorpay_payment_id,
                                response.razorpay_signature,
                                orderData.orderId
                            );

                            setLoading(false);
                            options.onSuccess?.(verifyResponse);
                            resolve(verifyResponse);
                        } catch (err: any) {
                            setLoading(false);
                            const errorMsg = err.message || 'Payment verification failed';
                            setError(errorMsg);
                            options.onError?.(errorMsg);
                            reject(new Error(errorMsg));
                        }
                    },
                    modal: {
                        ondismiss: () => {
                            setLoading(false);
                            options.onCancel?.();
                            reject(new Error('Payment cancelled'));
                        },
                        escape: true,
                        backdropclose: false,
                    },
                };

                const razorpay = new window.Razorpay(razorpayOptions);
                razorpay.on('payment.failed', (response: any) => {
                    setLoading(false);
                    const errorMsg = response.error?.description || 'Payment failed';
                    setError(errorMsg);
                    options.onError?.(errorMsg);
                    reject(new Error(errorMsg));
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
