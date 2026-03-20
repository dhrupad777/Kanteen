"use client";

import { useState, useEffect, useCallback } from 'react';

export type NotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported';

interface UsePushNotificationsReturn {
    /** Browser supports Web Push at all */
    supported: boolean;
    /** Current browser permission state */
    permission: NotificationPermission;
    /** Whether this device is currently subscribed */
    subscribed: boolean;
    /** True on iOS Safari when the app hasn't been installed as a PWA yet */
    iosNeedsInstall: boolean;
    /** Subscribe this device — pass a fresh Firebase ID token */
    subscribe: (authToken: string) => Promise<void>;
    /** Unsubscribe this device */
    unsubscribe: (authToken: string) => Promise<void>;
    loading: boolean;
}

function isIos(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode(): boolean {
    if (typeof window === 'undefined') return false;
    return ('standalone' in window.navigator && (window.navigator as any).standalone === true)
        || window.matchMedia('(display-mode: standalone)').matches;
}

export function usePushNotifications(): UsePushNotificationsReturn {
    const [supported, setSupported] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission>('unsupported');
    const [subscribed, setSubscribed] = useState(false);
    const [iosNeedsInstall, setIosNeedsInstall] = useState(false);
    const [loading, setLoading] = useState(false);
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

    useEffect(() => {
        const pushSupported =
            typeof window !== 'undefined' &&
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window;

        setSupported(pushSupported);

        if (!pushSupported) return;

        // iOS: push only works when installed as a PWA
        if (isIos() && !isInStandaloneMode()) {
            setIosNeedsInstall(true);
            setPermission('default');
            return;
        }

        setPermission(Notification.permission as NotificationPermission);

        // Get the active service worker registration
        navigator.serviceWorker.ready.then((reg) => {
            setRegistration(reg);
            // Check if already subscribed
            reg.pushManager.getSubscription().then((sub) => {
                setSubscribed(!!sub);
            });
        }).catch(() => {});

        // Keep permission state in sync
        if ('permissions' in navigator) {
            navigator.permissions.query({ name: 'notifications' }).then((status) => {
                const update = () => setPermission(status.state === 'prompt' ? 'default' : status.state as NotificationPermission);
                status.addEventListener('change', update);
            }).catch(() => {});
        }
    }, []);

    const subscribe = useCallback(async (authToken: string) => {
        if (!supported || !registration) return;
        setLoading(true);
        try {
            const perm = await Notification.requestPermission();
            setPermission(perm as NotificationPermission);
            if (perm !== 'granted') return;

            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (!vapidKey) throw new Error('VAPID public key not configured');

            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidKey),
            });

            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({ subscription: sub.toJSON() }),
            });

            setSubscribed(true);
        } catch (err) {
            console.error('push subscribe error:', err);
        } finally {
            setLoading(false);
        }
    }, [supported, registration]);

    const unsubscribe = useCallback(async (authToken: string) => {
        if (!supported || !registration) return;
        setLoading(true);
        try {
            const sub = await registration.pushManager.getSubscription();
            if (!sub) { setSubscribed(false); return; }

            await fetch('/api/push/unsubscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({ endpoint: sub.endpoint }),
            });

            await sub.unsubscribe();
            setSubscribed(false);
        } catch (err) {
            console.error('push unsubscribe error:', err);
        } finally {
            setLoading(false);
        }
    }, [supported, registration]);

    return { supported, permission, subscribed, iosNeedsInstall, subscribe, unsubscribe, loading };
}

/** Convert a URL-safe base64 VAPID public key to a Uint8Array */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const arr = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
    return arr.buffer;
}
