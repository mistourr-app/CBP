// ============================================================================
// delta.js - общий паттерн отображения изменения показателя.
//
// Правило: иконка показателя, затем стрелка и величина изменения.
//   рост — зелёная стрелка вверх, падение — красная стрелка вниз,
//   без изменения — серая черта.
// Используется в выборах (эффекты налога) и везде, где нужно показать
// «что изменится». Цвет и направление всегда от знака величины.
// ============================================================================

import { h, formatNumber } from './dom.js';

/**
 * Элемент вида «😊 ▼ 1» или «💰 ▲ 3 в день».
 * @param {object} options
 * @param {string} options.icon   иконка показателя
 * @param {number} options.delta  изменение (знак задаёт стрелку и цвет)
 * @param {string} [options.unit] подпись единицы: «в день»
 */
export function deltaChip({ icon, delta, unit = '' }) {
  const rounded = Math.round(delta);
  const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '–';
  const value = direction === 'flat' ? '0' : formatNumber(Math.abs(rounded));

  const node = h('span', {
    class: `delta delta--${direction}`,
    attrs: { role: 'img', 'aria-label': describe(icon, rounded, unit) },
  });
  node.append(
    h('span', { class: 'delta__icon', text: icon }),
    h('span', { class: 'delta__arrow', text: arrow }),
    h('span', { class: 'delta__value', text: unit ? `${value} ${unit}` : value }),
  );
  return node;
}

function describe(icon, delta, unit) {
  const direction = delta > 0 ? 'рост' : delta < 0 ? 'падение' : 'без изменения';
  return `${icon} ${direction} ${Math.abs(delta)} ${unit}`.trim();
}
