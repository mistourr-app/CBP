// ============================================================================
// RNG — детерминированный генератор случайных чисел.
//
// Обычный Math.random() не позволяет воспроизвести партию и прогнать
// симуляцию (SYSTEMS_SPEC §7: «правкой одного файла и прогонять симуляции»).
// Сид хранится в сохранении партии, поэтому один и тот же сид всегда даёт
// одну и ту же последовательность событий.
// ============================================================================

/** mulberry32 — быстрый генератор с хорошим распределением для наших целей. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.calls = 0;
    this._next = mulberry32(this.seed);
  }

  /** [0, 1) */
  float() {
    this.calls += 1;
    return this._next();
  }

  /** Целое в диапазоне [min, max] включительно. */
  int(min, max) {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** Число с плавающей точкой в диапазоне [min, max). */
  range(min, max) {
    return min + this.float() * (max - min);
  }

  /** true с вероятностью p. */
  chance(p) {
    return this.float() < p;
  }

  /** Случайный элемент массива. */
  pick(items) {
    if (!items.length) return undefined;
    return items[Math.floor(this.float() * items.length)];
  }

  /**
   * Выбор по весам. Веса не обязаны быть нормированными.
   * items — массив объектов с полем weight.
   */
  pickWeighted(items) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    if (total <= 0) return this.pick(items);

    let roll = this.float() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }

  /** Перемешивание Фишера — Йетса на месте. */
  shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.float() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /**
   * Состояние для сохранения. Сохраняем сам сид и число вызовов:
   * этого достаточно, чтобы восстановить позицию в последовательности.
   */
  serialize() {
    return { seed: this.seed, calls: this.calls };
  }

  restore({ seed, calls }) {
    this.seed = seed >>> 0;
    this.calls = calls >>> 0;
    this._next = mulberry32(this.seed);
    // Пропускаем уже сделанные вызовы, чтобы восстановить позицию
    for (let i = 0; i < this.calls; i += 1) this._next();
  }
}