// Lets habit_tracker be installed as an app, and open its screens even on a weak connection.
// It always tries the network first, so you get updates straight away; the saved copy is only a fallback.
// Your data is never stored here: it always comes from Supabase.
const CACHE = 'habit_tracker-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', 'index.html', 'css/styles.css', 'js/app.js'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

// A reminder from the notify function: show it, even when the app is closed.
self.addEventListener('push', (event) => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch { message = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(message.title || 'habit_tracker', {
    body: message.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: message.tag || undefined,
    data: { url: message.url || '#/' },
  }));
});

// Tapping a notification opens the app on the right page, reusing an open window if there is one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : '#/', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => client.url.startsWith(self.registration.scope));
    if (open) {
      await open.focus();
      return open.navigate ? open.navigate(target) : null;
    }
    return self.clients.openWindow(target);
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Only the app's own files. Supabase, YouTube and the code library are never touched.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((saved) => saved || caches.match('index.html'))),
  );
});
