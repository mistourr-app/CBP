// ============================================================================
// pwa.js — регистрация Service Worker.
//
// В прототипе sw.js был написан, но нигде не подключался: игра объявляла
// офлайн-режим в документации, но на деле работала только при подключённой
// сети. Здесь регистрация выполняется явно и с защитами от типичных сбоев
// (незащищённый контекст, приватный режим браузера).
// ============================================================================

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Service Worker доступен только в защищённом контексте:
  // https, localhost или 127.0.0.1
  if (!window.isSecureContext) {
    console.info('Service Worker: пропуск — небезопасный контекст');
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' })
      .then((registration) => {
        console.info('Service Worker зарегистрирован', registration.scope);

        // Новая версия выкатывается при следующем открытии, а не сразу:
        // перезагрузка посреди партии потеряла бы ход
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              console.info('Доступна обновлённая версия — она применится после перезагрузки');
            }
          });
        });
      })
      .catch((error) => {
        console.warn('Service Worker не зарегистрирован', error);
      });
  }, { once: true });
}