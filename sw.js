// ============================================
// Service Worker for City Builder PWA
// ============================================

const CACHE_NAME = 'city-builder-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/manifest.json',
    '/js/gameState.js',
    '/js/system.js',
    '/js/main.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

// Install event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Cache opened');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('Assets cached');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Cache failed:', error);
            })
    );
});

// Activate event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => {
            console.log('Service worker activated');
            return self.clients.claim();
        })
    );
});

// Fetch event
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    console.log('Returning cached response for:', event.request.url);
                    return response;
                }
                
                // Clone the request
                const fetchRequest = event.request.clone();
                
                return fetch(fetchRequest).then((response) => {
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    // Clone the response
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return response;
                });
            })
            .catch((error) => {
                console.error('Fetch failed:', error);
                // Return a fallback response
                return caches.match('/index.html');
            })
    );
});

// Message event for cache control
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CACHE_ASSETS') {
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(event.data.assets);
            });
    }
});

// Push notification support
self.addEventListener('push', (event) => {
    const data = event.data.json();
    
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon || '/assets/icon-192x192.png',
            data: data.data || {}
        })
    );
});

// Background sync support
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-game-state') {
        event.waitUntil(
            // Sync game state to server if needed
            console.log('Syncing game state...')
        );
    }
});

// Periodic sync support (if available)
if ('periodicSync' in self.registration) {
    self.registration.periodicSync.register('update-game', {
        minInterval: 24 * 60 * 60 * 1000 // 24 hours
    });
}
