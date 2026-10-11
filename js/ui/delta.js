// ============================================================================
// delta.js - общий паттерн отображения изменения показателя.
//
// Правило: иконка показателя, затем стрелка и величина изменения.
//   стрелка — направление величины: вверх, вниз или черта (ноль);
//   цвет    — хорошо или плохо для игрока: зелёный / красный / нейтральный.
// Цвет по умолчанию совпадает со знаком, но его можно задать явно: сокращение
// пожара — это стрелка вниз, но зелёная, потому что это выгода.
// Используется в выборах (эффекты налога, зданий и технологий).
// ============================================================================

import { h, formatNumber } from './dom.js';

/**
 * Элемент вида «😊 ▲ 1» или «🔥 ▼ 1 дн.».
 * @param {object} options
 * @param {string} options.icon   иконка показателя
 * @param {number} options.delta  изменение (знак задаёт направление стрелки)
 * @param {string} [options.unit] подпись единицы: «в день»
 * @param {boolean} [options.good] хорошо ли для игрока; по умолчанию — рост хорош
 */
export function deltaChip({ icon, delta, unit = '', good }) {
  const rounded = Math.round(delta);
  const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '–';
  const value = direction === 'flat' ? '0' : formatNumber(Math.abs(rounded));

  const isGood = good ?? rounded > 0;
  const tone = direction === 'flat' ? 'flat' : isGood ? 'good' : 'bad';

  const node = h('span', {
    class: `delta delta--${direction} delta--${tone}`,
    attrs: { role: 'img', 'aria-label': describe(icon, rounded, unit, tone) },
  });
  node.append(
    h('span', { class: 'delta__icon', text: icon }),
    h('span', { class: 'delta__arrow', text: arrow }),
    h('span', { class: 'delta__value', text: unit ? `${value} ${unit}` : value }),
  );
  return node;
}

function describe(icon, delta, unit, tone) {
  const direction = delta > 0 ? 'рост' : delta < 0 ? 'падение' : 'без изменения';
  const quality = tone === 'good' ? ', выгодно' : tone === 'bad' ? ', невыгодно' : '';
  return `${icon} ${direction} ${Math.abs(delta)} ${unit}${quality}`.trim();
}
