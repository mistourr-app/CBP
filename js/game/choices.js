// ============================================================================
// Choices — генерация четырёх вариантов действий на ход.
//
// В прототипе это была цепочка примерно из 200 строк if-условий, а стоимость
// зданий дублировалась ещё в двух местах (проверка показа и блокировка
// кнопки). Теперь условия и цены берутся из balance.js через
// engine.availableActions().
//
// Гарантии, которые проверяются тестами:
//   * ровно BALANCE.choices.slots вариантов;
//   * «Подождать» присутствует всегда;
//   * нет недоступных по условиям разблокировки действий;
//   * нет повторов.
// ============================================================================

import { BALANCE } from '../balance.js';
import { formatResource } from './content.js';

const { slots, priority, actions } = BALANCE.choices;

const priorityIndex = new Map(priority.map((id, index) => [id, index]));

function priorityOf(actionId) {
  return priorityIndex.has(actionId) ? priorityIndex.get(actionId) : priority.length;
}

/** Подпись вида «20 древесины, 10 камня» для кнопки. */
function describeEffects(cost = {}, gain = {}) {
  const parts = [];

  for (const [resource, amount] of Object.entries(cost)) {
    if (!amount) continue;
    parts.push(formatResource(amount, BALANCE.resources[resource].unit));
  }
  for (const [resource, amount] of Object.entries(gain)) {
    if (!amount) continue;
    parts.push(`+${formatResource(amount, BALANCE.resources[resource].unit)}`);
  }

  return parts.join(', ');
}

function buildWait() {
  return {
    id: 'wait',
    label: actions.wait.label,
    icon: actions.wait.icon,
    cost: {},
    gain: {},
    affordable: true,
    isWait: true,
  };
}

/**
 * Собирает варианты на текущий ход.
 *
 * @param {Engine} engine
 * @param {Rng}    rng
 * @returns {Array<{id,label,icon,cost,gain,affordable,costText,isWait}>}
 */
export function generateChoices(engine, rng) {
  const candidates = engine.availableActions()
    .map((action) => ({
      ...action,
      cost: action.cost ?? {},
      gain: action.gain ?? {},
      affordable: action.affordable !== false,
      isWait: action.id === 'wait',
    }))
    .sort((a, b) => priorityOf(a.id) - priorityOf(b.id));

  // Сдвиг приоритета по номеру дня.
  //
  // В прототипе порядок был жёстко фиксирован, и в четыре слота попадали
  // только первые четыре типа зданий: рынки, храмы, школы, стены, башни и
  // все технологии становились недостижимы — их просто никогда не
  // показывали. Сдвиг сохраняет взаимный порядок внутри списка, но за цикл
  // показывает каждый вариант.
  const shift = (engine.state.day - 1) % Math.max(1, priority.length);
  const rotated = rotate(candidates, shift);

  const picked = [];
  const seen = new Set();

  // Выборы одного приоритета перемешиваются, чтобы последовательность
  // не повторялась день за днём
  for (const choice of shuffleByPriority(rotated, rng)) {
    if (seen.has(choice.id)) continue;
    seen.add(choice.id);
    picked.push(choice);
    if (picked.length >= slots) break;
  }

  // «Подождать» есть всегда: если для него не нашлось места, отдаём ему
  // последний слот — так же поступал прототип.
  if (!picked.some((choice) => choice.isWait)) {
    if (picked.length >= slots) picked[slots - 1] = buildWait();
    else picked.push(buildWait());
  }

  return picked.slice(0, slots).map((choice) => ({
    ...choice,
    costText: describeEffects(choice.cost, choice.gain),
  }));
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