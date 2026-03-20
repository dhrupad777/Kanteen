// Kanteen Service Worker — handles background push notifications

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
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url ?? '/student';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If the app is already open, focus it
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
