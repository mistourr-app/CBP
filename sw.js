// ============================================================================
// Service Worker City Builder.
//
// Регистрация вызывается из js/core/pwa.js. Здесь только кэширование.
//
// Главное решение: для файлов игры сначала обращаемся к сети, и только
// если она недоступна — берём из кэша. Раньше было наоборот (сначала
// кэш), из-за чего браузер месяцами держал старую версию: чтобы увидеть
// правку, приходилось дважды перезагружать страницу. Теперь файл на
// диске всегда свежий, а из кэша читается только офлайн.
//
// Кэш обновляется при каждом успешном запросе, поэтому отдельная версия
// кэша не нужна: она менялась вручную и однажды забылась.
//
// Что исправлено относительно исходного прототипа:
//   * кэшировались абсолютные пути ('/', '/js/...'). При публикации на
//     GitHub Pages из подпапки /CBP/ эти пути указывают внутрь чужого
//     домена и ничего не находят. Теперь пути считаются от расположения
//     самого service worker;
//   * остались обработчики push и periodicSync, на которые никто не
//     подписывался.
// ============================================================================

const CACHE_NAME = 'cbp-game';

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

const OFFLINE_MESSAGE =
  'Игра недоступна офлайн: ещё не было успешного запуска при подключённой сети.';

// --- Установка --------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Файлы кладём по одному: одна недостающая картинка не должна
    // помешать включить офлайн-режим целиком
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (error) {
        console.warn('[sw] не удалось закэшировать', url, error);
      }
    }));
    await self.skipWaiting();
  })());
});

// --- Активация -------------------------------------------------------------

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
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

  // Навигация: сеть, затем кэш оболочки, затем понятное сообщение
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(request);
        if (fresh.ok) cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await cache.match('./index.html'))
          ?? (await cache.match('./'))
          ?? new Response(OFFLINE_MESSAGE, {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    try {
      // Сеть первой: на сервере всегда актуальная версия файла
      const fresh = await fetch(request);
      if (fresh.ok && fresh.type === 'basic') {
        cache.put(request, fresh.clone());
      }
      return fresh;
    } catch {
      // Офлайн: отдаём последнее сохранённое
      const cached = await cache.match(request);
      if (cached) return cached;

      // Путь мог быть записан относительно корня — ищем по имени файла
      const fallback = await cache.match(`./${url.pathname.split('/').pop()}`);
      return fallback ?? new Response('', { status: 504 });
    }
  })());
});

// --- Обновление по команде страницы ---------------------------------------

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});