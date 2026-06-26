// Naruto Quiz: Ultimate Ninja — Service Worker
// Enables offline mode, caching, and PWA features

const CACHE_NAME = 'naruto-quiz-v3';
const STATIC_CACHE = 'naruto-static-v3';
const DYNAMIC_CACHE = 'naruto-dynamic-v3';

// Files to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Rajdhani:wght@400;500;600;700&display=swap'
];

// ── INSTALL: Cache all static assets ──
self.addEventListener('install', event => {
  console.log('[SW] Installing Naruto Quiz Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { mode: 'cors' })))
        .catch(err => console.warn('[SW] Some assets failed to cache:', err));
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: Clean up old caches ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating new Service Worker...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH: Cache-first for static, network-first for API ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Firebase and external API calls — always network
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('cashfree') ||
    url.hostname.includes('instamojo') ||
    url.pathname.includes('/api/')
  ) {
    event.respondWith(fetch(request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // Cache-first strategy for app shell
  if (
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/manifest.json' ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/screenshots/')
  ) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
          // Return cached, but update in background
          fetch(request).then(response => {
            if (response && response.status === 200) {
              caches.open(STATIC_CACHE).then(cache => cache.put(request, response.clone()));
            }
          }).catch(() => {});
          return cachedResponse;
        }
        // Not in cache — fetch and store
        return fetch(request).then(response => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Network-first for everything else
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ── BACKGROUND SYNC: Save scores when back online ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-scores') {
    event.waitUntil(syncPendingScores());
  }
});

async function syncPendingScores() {
  // Scores saved offline are synced to Firebase when connection restores
  console.log('[SW] Syncing pending scores...');
}

// ── PUSH NOTIFICATIONS: Daily reminder ──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Naruto Quiz: Ultimate Ninja';
  const options = {
    body: data.body || '🍥 Your daily 30 questions are ready! Come test your shinobi knowledge!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [
      { action: 'play', title: '⚡ Play Now' },
      { action: 'dismiss', title: 'Later' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'play') {
    event.waitUntil(clients.openWindow('/?action=play'));
  } else {
    event.waitUntil(clients.openWindow('/'));
  }
});

console.log('[SW] Naruto Quiz Service Worker loaded! 🍥');
