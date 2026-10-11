// ============================================================================
// EventBus — минимальная шина событий между слоями.
//
// Позволяет UI и рендеру подписываться на изменения игры, не зная друг
// о друге и не опрашивая состояние в цикле.
// ============================================================================

export class EventBus {
  constructor() {
    this._handlers = new Map();
  }

  on(event, handler) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  once(event, handler) {
    const off = this.on(event, (...args) => {
      off();
      handler(...args);
    });
    return off;
  }

  off(event, handler) {
    this._handlers.get(event)?.delete(handler);
  }

  emit(event, payload) {
    const handlers = this._handlers.get(event);
    if (!handlers) return;

    // Копия набора: обработчик может отписаться прямо во время рассылки
    for (const handler of [...handlers]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`Ошибка обработчика события "${event}"`, error);
      }
    }
  }

  clear() {
    this._handlers.clear();
  }
}

/** Каталог событий приложения — чтобы не искать строки по проекту. */
export const EVENTS = Object.freeze({
  GAME_STARTED: 'game:started',
  GAME_RESET: 'game:reset',
  DAY_ADVANCED: 'day:advanced',
  ACTION_RESOLVED: 'action:resolved',
  STATE_CHANGED: 'state:changed',
  CHRONICLE_ADDED: 'chronicle:added',
  CHOICES_CHANGED: 'choices:changed',
  GAME_ENDED: 'game:ended',
});