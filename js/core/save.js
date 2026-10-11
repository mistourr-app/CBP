// ============================================================================
// Save — работа с localStorage.
//
// Ключ хранилища и версия схемы зафиксированы. Если после обновления игры
// формат изменился, старое сохранение несовместимо и отбрасывается — партия
// начинается заново, без полусломанных состояний.
// ============================================================================

import { BALANCE } from '../balance.js';

const KEY = 'cbp.save.v4';
const LEGACY_KEYS = ['cbp.save.v3', 'cbp.save.v2', 'cityBuilderSave'];

function storage() {
  try {
    // Приватный режим Safari и отключённые куки роняют доступ к localStorage
    const probe = '__cbp_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export const Save = {
  available() {
    return storage() !== null;
  },

  write(payload) {
    const store = storage();
    if (!store) return false;

    try {
      store.setItem(KEY, JSON.stringify({ schema: BALANCE.meta.schema, ...payload }));
      return true;
    } catch (error) {
      console.warn('Не удалось сохранить партию', error);
      return false;
    }
  },

  /** Возвращает распакованное сохранение либо null. */
  read() {
    const store = storage();
    if (!store) return null;

    try {
      const raw = store.getItem(KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (parsed?.schema !== BALANCE.meta.schema) {
        // Формат изменился — сохранение непригодно
        store.removeItem(KEY);
        return null;
      }
      return parsed;
    } catch (error) {
      console.warn('Сохранение повреждено, начинаем новую партию', error);
      store.removeItem(KEY);
      return null;
    }
  },

  clear() {
    const store = storage();
    if (!store) return;

    store.removeItem(KEY);
    for (const key of LEGACY_KEYS) store.removeItem(key);
  },
};