// SolarOps service worker - Web Push receiver
// Handles push events and notification clicks.
// No caching strategy - the app uses Vite's asset hashing + no-cache headers.

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data?.json() ?? {}; } catch { /* non-JSON payload */ }

  const title = d.title ?? 'SolarOps';
  const options = {
    body:    d.body  ?? '',
    icon:    '/favicon-192.png',
    badge:   '/favicon-32.png',
    tag:     'solarops-mention',
    renotify: true,
    data:    d,
  };

  event.waitUntil(
    self.registration.showNotification(title, options),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const match = list.find(c => new URL(c.url).origin === self.location.origin);
      return match ? match.focus() : clients.openWindow(url);
    }),
  );
});

// Re-subscribe if the push subscription expires
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options)
      .then(sub => {
        const token = self._vapidToken; // set by the main page after login
        if (!token) return;
        return fetch('/api/push-subscribe', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ subscription: sub.toJSON() }),
        });
      })
      .catch(() => {}),
  );
});
