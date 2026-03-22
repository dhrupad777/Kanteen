// Kanteen Service Worker — push notifications + asset caching

const STATIC_CACHE = 'kanteen-static-v1';
const PAGE_CACHE   = 'kanteen-pages-v1';
const KEEP_CACHES  = [STATIC_CACHE, PAGE_CACHE];

// ── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            self.skipWaiting(),
            // Pre-cache offline fallback so it's available from the very first visit
            caches.open(STATIC_CACHE).then(cache => cache.add('/offline.html')),
        ])
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            // Remove stale caches from old SW versions
            caches.keys().then(keys =>
                Promise.all(keys.filter(k => !KEEP_CACHES.includes(k)).map(k => caches.delete(k)))
            ),
        ])
    );
});

// ── Asset Caching ────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle GET requests from our origin
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    // Next.js static bundles & optimized images — cache-first
    // (immutable filenames, already have 1yr Cache-Control, SW adds redundancy
    //  for low-storage devices that evict browser cache aggressively)
    if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/_next/image/')) {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                return fetch(request).then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
                    }
                    return res;
                });
            })
        );
        return;
    }

    // Public static assets (icons, manifest, sw itself) — cache-first
    if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json') {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                return fetch(request).then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
                    }
                    return res;
                });
            })
        );
        return;
    }

    // HTML page navigations — network-first, fall back to cache, then offline page
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).then(res => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(PAGE_CACHE).then(cache => cache.put(request, clone));
                }
                return res;
            }).catch(() =>
                caches.match(request).then(cached => cached || caches.match('/offline.html'))
            )
        );
        return;
    }

    // Everything else (API routes, Firestore, Razorpay): pass through untouched
});

// ── Push Notifications ───────────────────────────────────────────────────────

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
        tag: `kanteen-${Date.now()}`,
        renotify: true,
    };

    event.waitUntil(
        Promise.all([
            self.registration.showNotification(title, options),
            // Tell open pages to play the in-app chime
            // (covers cases where OS notification sound is muted/blocked)
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then(cs => cs.forEach(c => c.postMessage({ type: 'KANTEEN_ORDER_READY' }))),
        ])
    );
});

// ── Notification Click ───────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
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
            if (clients.openWindow) return clients.openWindow(target);
        })
    );
});

// ── FCM Token Rotation (Chinese OEMs) ────────────────────────────────────────

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
