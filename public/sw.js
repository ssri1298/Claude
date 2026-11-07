// Minimal service worker: lets the daily plan reminder show as a system notification
// and brings the Scalpel tab to the front when it is clicked.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if (new URL(c.url).origin === self.location.origin) {
          await c.focus();
          c.postMessage({ type: 'open-checkin' });
          return;
        }
      }
      await self.clients.openWindow('/#/today');
    })(),
  );
});
