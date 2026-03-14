/**
 * service-worker.js — Cache offline + Background sync GPS
 */

const CACHE_NAME  = 'geotracer-v14';
const SYNC_TAG    = 'sync-gps-points';

// Fichiers à mettre en cache pour le mode offline
const CACHE_FILES = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/activities.html',
  '/detail.html',
  '/tracker.html',
  '/import.html',
  '/stats.html',
  '/profile.html',
  '/sports.html',
  '/watch.html',
  '/components/sidebar.html',
  '/components/topbar.html',
  '/components/bottom-nav.html',
  '/css/style.css',
  '/css/themes.css',
  '/js/utils.js',
  '/js/auth.js',
  '/js/api.js',
  '/js/charts.js',
  '/js/components.js',
  '/js/activities.js',
  '/js/dashboard.js',
  '/js/detail.js',
  '/js/tracker.js',
  '/js/import.js',
  '/js/stats.js',
  '/js/profile.js',
  '/js/theme.js',
];

// ── Installation ────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_FILES))
  );
  self.skipWaiting();
});

// ── Activation ──────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch — cache first pour les assets, network first pour l'API ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // JS files → network first pour toujours avoir la dernière version
  if (url.pathname.endsWith('.js')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // API calls → network only (pas de cache)
  if (url.hostname.includes('geoapi') || url.port === '8000' || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() =>
      new Response(JSON.stringify({ error: 'offline' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    ));
    return;
  }

  // Assets → cache first, fallback network (GET uniquement)
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
    )
  );
});

// ── Background Sync — envoie les points GPS en attente ──
self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(_flushPendingPoints());
  }
});

async function _flushPendingPoints() {
  const db     = await _openDb();
  const points = await _getAllPending(db);

  for (const item of points) {
    try {
      await fetch(`https://geoapi.laurentjouron.dev/activities/${item.activityId}/points`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${item.token}`,
        },
        body: JSON.stringify(item.point),
      });
      await _deletePending(db, item.id);
    } catch {
      // Sera retenté au prochain sync
      break;
    }
  }
}

// ── IndexedDB pour stocker les points hors-ligne ────────
function _openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('geotracer-offline', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('pending_points', {
        keyPath: 'id', autoIncrement: true,
      });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e);
  });
}

function _getAllPending(db) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('pending_points', 'readonly');
    const req = tx.objectStore('pending_points').getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e);
  });
}

function _deletePending(db, id) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('pending_points', 'readwrite');
    const req = tx.objectStore('pending_points').delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = e  => reject(e);
  });
}