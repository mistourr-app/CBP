// ============================================================================
// Chronicle — хроника поселения.
//
// В прототипе в хронику писалась строка «День N» КАЖДЫЙ день, а хранилось
// всего 20 записей. Через несколько ходов все значимые события вытеснялись
// этим шумом, и хроника переставала быть полезной.
//
// Здесь записи структурированы ({day, kind, icon, text}), шум не пишется,
// а хранится 300 записей вместо двадцати.
// ============================================================================

import { BALANCE } from '../balance.js';

const STORED = BALANCE.chronicle.storedEntries;

export class Chronicle {
  constructor(entries = []) {
    this.entries = entries;
  }

  /**
   * Добавляет запись в начало (новые сверху).
   * Повторяющиеся подряд одинаковые записи схлопываются в одну со счётчиком,
   * иначе серия однотипных событий забивает ленту.
   */
  add(state, note) {
    if (!note?.text) return null;

    const entry = {
      day: state.day,
      kind: note.kind ?? 'social',
      icon: note.icon ?? '•',
      text: note.text,
      count: 1,
    };

    // Финальная запись не схлопывается с предыдущей: итог партии должен
    // остаться в ленте даже если повторится
    if (note.final) entry.final = true;

    const previous = this.entries[0];
    if (!entry.final && previous && previous.text === entry.text && previous.day === entry.day) {
      previous.count += 1;
      return previous;
    }

    this.entries.unshift(entry);
    if (this.entries.length > STORED) this.entries.length = STORED;
    return entry;
  }

  /** Записи для отрисовки: новые сверху, ограниченное количество. */
  forDisplay(limit = BALANCE.chronicle.renderedEntries) {
    return this.entries.slice(0, limit);
  }

  serialize() {
    return this.entries;
  }

  restore(entries) {
    this.entries = Array.isArray(entries) ? entries.slice(0, STORED) : [];
    return this;
  }
}