// ============================================================================
// Service Worker City Builder.
//
// Регистрация вызывается из js/core/pwa.js. Здесь только кэширование.
//
// Что исправлено относительно прототипа:
//   * Кэшировались абсолютные пути ('/', '/index.html', '/js/...'). При
//     публикации на GitHub Pages из подпапки /CBP/ эти пути указывают внутрь
//     чужого домена и ничего не находят. Теперь пути считаются от расположения
//     самого service worker.
//   * Для всего подряд применялся cache-first: как только файл попадал в кэш,
//     обновления не было никогда. Теперь HTML и навигация обновляются через
//     сеть, а статика отдаётся из кэша и обновляется в фоне.
//   * В коде оставались обработчики push и periodicSync, на которые никто не
//     подписывался.
// ============================================================================

const VERSION = 'v2';
const CACHE_NAME = `cbp-${VERSION}`;

// Относительные пути — работают и на домене, и в подпапке /CBP/
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon.svg',
  './vendor/three.module.min.js',
  './styles/tokens.css',
  './styles/base.css',
  './styles/components.css',
  './styles/screens.css',
  './js/balance.js',
  './js/core/bus.js',
  './js/core/pwa.js',
  './js/core/rng.js',
  './js/core/save.js',
  './js/game/choices.js',
  './js/game/chronicle.js',
  './js/game/content.js',
  './js/game/economy.js',
  './js/game/engine.js',
  './js/game/events.js',
  './js/game/session.js',
  './js/game/state.js',
  './js/render/city.js',
  './js/render/environment.js',
  './js/render/index.js',
  './js/render/palette.js',
  './js/render/scene.js',
  './js/ui/app.js',
  './js/ui/choices-ui.js',
  './js/ui/chronicle-ui.js',
  './js/ui/dom.js',
  './js/ui/screens.js',
  './js/ui/stats.js',
];

// --- Установка --------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // addAll падает целиком при любой ошибке: кладём файлы по одному,
    // чтобы одна недостающая картинка не сломала офлайн-режим целиком
    await Promise.all(
      PRECACHE.map(async (url) => {
        try {
          await cache.add(new Request(url, { cache: 'reload' }));
        } catch (error) {
          console.warn('[sw] не удалось закэшировать', url, error);
        }
      }),
    );
    await self.skipWaiting();
  })());
});

// --- Активация -------------------------------------------------------------

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith('cbp-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

// --- Запросы ---------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Навигация: сначала сеть, при ошибке — кэш и, в крайнем случае, оболочка.
  // Иначе пользователь был бы навсегда заперт в первой загруженной версии.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('./index.html'))
          ?? (await cache.match('./'))
          ?? new Response('Игра недоступна офлайн', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
      }
    })());
    return;
  }

  // Статика: сначала кэш, обновление в фоне
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    const network = fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      network.catch(() => null);
      return cached;
    }

    const fresh = await network;
    return fresh ?? new Response('', { status: 504 });
  })());
});

// --- Обновление по команде страницы ---------------------------------------

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});