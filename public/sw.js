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
