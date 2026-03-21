// Kanteen Service Worker — handles background push notifications

// Activate immediately so push events are handled from the first install
self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

// Take control of all open clients right away (no page reload needed)
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { title: 'Kanteen', body: event.data ? event.data.text() : '' };
    }

    const title = data.title ?? 'Kanteen';
    const options = {
        body: data.body ?? 'You have a new update.',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        data: { url: data.url ?? '/student' },
        requireInteraction: true,
        vibrate: [200, 100, 200],
        // Unique tag per notification — prevents Android from silently collapsing duplicates
        tag: `kanteen-${Date.now()}`,
        renotify: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    // Use absolute URL — required for Android Chrome to navigate correctly
    const base = self.location.origin;
    const target = base + (event.notification.data?.url ?? '/student');

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(target);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(target);
            }
        })
    );
});

// FCM token rotated (common on Xiaomi/OPPO/Vivo) — auto-resubscribe silently
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(
        self.registration.pushManager
            .subscribe(event.oldSubscription.options)
            .then((newSub) =>
                fetch('/api/push/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subscription: newSub,
                        oldEndpoint: event.oldSubscription?.endpoint,
                    }),
                })
            )
    );
});
