// ============================================================================
// Choices — генерация четырёх вариантов действий на ход.
//
// В прототипе это была цепочка примерно из 200 строк if-условий, а стоимость
// зданий дублировалась ещё в двух местах (проверка показа и блокировка
// кнопки). Теперь условия и цены берутся из balance.js через
// engine.availableActions().
//
// Гарантии, которые проверяются тестами:
//   * не больше BALANCE.choices.slots вариантов, «Подождать» всегда есть;
//   * нет недоступных по условиям разблокировки действий;
//   * нет повторов.
// ============================================================================

import { BALANCE } from '../balance.js';

const { slots, priority, actions } = BALANCE.choices;

const priorityIndex = new Map(priority.map((id, index) => [id, index]));

function priorityOf(actionId) {
  return priorityIndex.has(actionId) ? priorityIndex.get(actionId) : priority.length;
}

function buildWait() {
  return {
    id: 'wait',
    label: actions.wait.label,
    icon: actions.wait.icon,
    cost: {},
    gain: {},
    requirements: [],
    workers: 0,
    affordable: true,
    isWait: true,
  };
}

/** Приводит действие к единой форме, которую ждёт интерфейс. */
function normalize(action) {
  return {
    ...action,
    cost: action.cost ?? {},
    gain: action.gain ?? {},
    affordable: action.affordable !== false,
  };
}

/**
 * Собирает варианты на текущий ход.
 *
 * Налог — случайный вариант наравне с остальными: появляется с шансом
 * BALANCE.choices.taxChance, занимает случайный слот и не требует ресурсов.
 * «Подождать» всегда последний.
 *
 * @param {Engine} engine
 * @param {Rng}    rng
 * @returns {Array<{id,label,icon,requirements,workers,chance,effects,affordable,isWait}>}
 */
export function generateChoices(engine, rng) {
  const available = engine.availableActions();
  const tax = available.find((action) => action.group === 'tax');

  const candidates = available
    .filter((action) => action.id !== 'wait' && action.group !== 'tax')
    .map(normalize)
    .sort((a, b) => priorityOf(a.id) - priorityOf(b.id));

  // Сдвиг приоритета по номеру дня: за цикл показывается каждый вариант.
  // Без сдвига в слоты попадали бы только первые типы зданий.
  const shift = (engine.state.day - 1) % Math.max(1, priority.length);
  const rotated = rotate(candidates, shift);

  // Налог выпадает случайно: резервируем под него слот только в этот день
  const taxOffered = Boolean(tax) && rng.chance(BALANCE.choices.taxChance);
  const capacity = slots - 1 - (taxOffered ? 1 : 0);

  const picked = [];
  const seen = new Set();

  for (const choice of shuffleByPriority(rotated, rng)) {
    if (seen.has(choice.id)) continue;
    seen.add(choice.id);
    picked.push(choice);
    if (picked.length >= capacity) break;
  }

  // Налог ставим в случайную позицию среди обычных вариантов
  if (taxOffered) {
    const at = rng.int(0, picked.length);
    picked.splice(at, 0, normalize(tax));
  }

  return [...picked, buildWait()];
}

/** Циклический сдвиг списка — так же, как сдвиг его приоритета. */
function rotate(sorted, shift) {
  if (!shift || sorted.length <= 1) return sorted;
  return sorted.slice(shift).concat(sorted.slice(0, shift));
}

function shuffleByPriority(sorted, rng) {
  const result = [];

  for (let i = 0; i < sorted.length; ) {
    const groupPriority = priorityOf(sorted[i].id);
    let end = i;
    while (end < sorted.length && priorityOf(sorted[end].id) === groupPriority) end += 1;
    result.push(...rng.shuffle(sorted.slice(i, end)));
    i = end;
  }

  return result;
}
