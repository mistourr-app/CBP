// ============================================================================
// Choices — выдача вариантов действий на ход.
//
// Выдача случайная, с весами по категориям (BALANCE.choices.weights):
//   production — производственные здания: основа выборов, выпадают чаще всего;
//   house      — дома;
//   trade      — торговля и экспедиция;
//   rare       — социальные здания, технологии, дороги, чудо света: редкие бонусы.
// Налог стоит между ними: появляется с шансом taxChance и занимает случайную
// позицию. «Подождать» всегда последний.
//
// Гарантии, которые проверяются тестами:
//   * не больше BALANCE.choices.slots вариантов, «Подождать» всегда есть;
//   * нет недоступных по условиям разблокировки действий;
//   * нет повторов.
// ============================================================================

import { BALANCE } from '../balance.js';

const { slots, actions, weights } = BALANCE.choices;

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

/** Категория действия для весов выдачи. */
export function categoryOf(action) {
  if (action.id.startsWith('build:')) {
    const def = BALANCE.buildings[action.id.slice('build:'.length)];
    if (def?.kind === 'production') return 'production';
    if (def?.kind === 'house') return 'house';
    return 'rare'; // социальные, дороги, чудо света
  }
  if (action.id.startsWith('develop:')) return 'rare';
  if (action.id === 'trade' || action.id === 'expedition') return 'trade';
  return 'rare';
}

/**
 * Выбирает до `count` вариантов без повторов: сначала категорию по весам,
 * затем случайное действие внутри неё. Так редкие категории появляются реже,
 * но не исчезают совсем.
 */
function drawWeighted(pool, count, rng) {
  const groups = new Map();
  for (const action of pool) {
    const key = categoryOf(action);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(action);
  }

  const picked = [];
  while (picked.length < count && groups.size > 0) {
    let total = 0;
    for (const key of groups.keys()) total += weights[key] ?? 1;

    let roll = rng.float() * total;
    let chosenKey = null;
    for (const key of groups.keys()) {
      roll -= weights[key] ?? 1;
      if (roll < 0) { chosenKey = key; break; }
    }
    if (chosenKey == null) chosenKey = [...groups.keys()].at(-1);

    const list = groups.get(chosenKey);
    const index = Math.floor(rng.float() * list.length);
    picked.push(list.splice(index, 1)[0]);
    if (list.length === 0) groups.delete(chosenKey);
  }

  return picked;
}

/**
 * Собирает варианты на текущий ход.
 *
 * @param {Engine} engine
 * @param {Rng}    rng
 * @returns {Array<{id,label,icon,requirements,workers,chance,effects,affordable,isWait}>}
 */
export function generateChoices(engine, rng) {
  const available = engine.availableActions();
  const tax = available.find((action) => action.group === 'tax');

  const pool = available
    .filter((action) => action.id !== 'wait' && action.group !== 'tax')
    .map(normalize);

  // Налог — случайный вариант: резервируем под него слот в выпавший день
  const taxOffered = Boolean(tax) && rng.chance(BALANCE.choices.taxChance);
  const capacity = slots - 1 - (taxOffered ? 1 : 0);

  const picked = drawWeighted(pool, capacity, rng);

  if (taxOffered) {
    const at = rng.int(0, picked.length);
    picked.splice(at, 0, normalize(tax));
  }

  return [...picked, buildWait()];
}
