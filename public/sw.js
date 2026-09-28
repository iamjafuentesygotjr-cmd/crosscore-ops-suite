/* Cross Core Ops Suite — service worker for device notifications (push).
   Shows a notification when the portal sends one, groups a conversation under one notification (same tag),
   and opens the exact place in the portal when the notification is clicked. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Cross Core', body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'Cross Core';
  const opts = {
    body: d.body || '',
    tag: d.tag || undefined,
    renotify: !!(d.tag && d.renotify),
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    timestamp: d.at ? Date.parse(d.at) : Date.now(),
    data: { link: d.link || null, nid: d.nid || null, chat: d.chat || null, at: d.at || null, person: d.person || null },
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const msg = { type: 'cc-open', link: data.link, nid: data.nid, chat: data.chat };
  e.waitUntil((async () => {
    const scope = self.registration.scope;
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(scope));
    if (win) { await win.focus(); win.postMessage(msg); return; }
    await self.clients.openWindow(scope + '#cc=' + encodeURIComponent(JSON.stringify(msg)));
  })());
});
