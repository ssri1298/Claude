// Pivot service worker: makes the app installable and shows push notifications.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: 'Pivot', body: event.data ? event.data.text() : '' };
  }
  const opts = {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    requireInteraction: !!d.approvalId,
    data: { url: d.url || '/', approvalId: d.approvalId || null },
  };
  // Action buttons show on Android/desktop; on iPhone a tap opens the approval screen instead.
  if (d.approvalId) opts.actions = [
    { action: 'approve', title: '✅ Approve' },
    { action: 'reject', title: '❌ Reject' },
  ];
  event.waitUntil(self.registration.showNotification(d.title || 'Pivot', opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url, approvalId } = event.notification.data || {};
  if (approvalId && (event.action === 'approve' || event.action === 'reject')) {
    event.waitUntil(
      fetch(`/api/approvals/${approvalId}/${event.action}`, { method: 'POST', credentials: 'include' })
        .then((r) => r.json())
        .then((j) => self.registration.showNotification('Pivot', { body: j.message || j.error || 'Done', icon: '/icon-192.png', tag: 'decision' }))
        .catch(() => self.clients.openWindow('/')),
    );
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const target = new URL(url || '/', self.location.origin).href;
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate?.(target);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
