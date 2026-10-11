// Симулятор стратегий: как быстро партия доходит до поражения или победы.
//
// Запуск:  node scripts/sim-strategies.mjs [число_партий] [дней]
//
// Стратегии — простые модели игрока. Нужны, чтобы видеть баланс цифрами:
// можно ли выиграть, только ожидая, как быстро наступает бунт, сколько
// партий доходит до нового тира. Браузер не нужен.

import { BALANCE } from '../js/balance.js';
import { EventBus } from '../js/core/bus.js';
import { Rng } from '../js/core/rng.js';
import { generateChoices } from '../js/game/choices.js';
import { Engine } from '../js/game/engine.js';
import { GameState, createInitialState } from '../js/game/state.js';

const PARTIES = Number(process.argv[2] ?? 200);
const DAYS = Number(process.argv[3] ?? 300);

// NO_MOODS=1: модификаторы и события с выбором отключены — базовый баланс без новой
// системы, для сравнения (что дала система, а что было и раньше).
if (process.env.NO_MOODS) {
  BALANCE.happiness.moods.waitDays = 0;
  BALANCE.happiness.moods.eventDays = 0;
  BALANCE.events.choice.chance = 0;
  console.log('РЕЖИМ: модификаторы и события с выбором отключены');
}

/** Стратегия выбирает действие из текущих выборов. */
const STRATEGIES = {
  // Только ждать: проверка, можно ли выжить без действий
  wait: (choices) => choices.find((c) => c.isWait),

  // Случайный доступный выбор (включая ожидание)
  random: (choices, rng) => {
    const usable = choices.filter((c) => c.affordable);
    return usable.length ? rng.pick(usable) : choices.find((c) => c.isWait);
  },

  // Сначала строить производственные здания, иначе ждать
  build: (choices) => {
    const production = choices.find((c) => c.affordable && c.id.startsWith('build:') && !c.isWait);
    return production ?? choices.find((c) => c.isWait);
  },

  // Разумный игрок: при нехватке еды — ферма, иначе производство, иначе ждать.
  // Не торгует (торговля съедает еду) и не ждёт, если можно строить.
  smart: (choices, rng, state) => {
    const usable = choices.filter((c) => c.affordable && !c.isWait);
    const foodNeeded = state.population * 2; // запас на два дня
    if (state.resource('food') < foodNeeded) {
      const farm = usable.find((c) => c.id === 'build:farms');
      if (farm) return farm;
    }
    const production = usable.find((c) => c.id.startsWith('build:') && c.id !== 'build:roads');
    if (production) return production;
    return choices.find((c) => c.isWait);
  },

  // Строить всё, что доступно, и ждать, когда нечего
  greedy: (choices, rng) => {
    const usable = choices.filter((c) => c.affordable && !c.isWait);
    return usable.length ? usable[0] : choices.find((c) => c.isWait);
  },
};

function playOne(strategyName, seed) {
  const state = new GameState(createInitialState());
  const rng = new Rng(seed);
  const engine = new Engine(state, rng, new EventBus());
  const pick = STRATEGIES[strategyName];

  const trace = { seed, outcome: 'alive', day: DAYS, tier: 1, lowestHappiness: 99, reason: '' };

  for (let day = 1; day <= DAYS && !state.isOver; day += 1) {
    // Игрок закрывает попап (переход, событие) до выбора — так же, как в интерфейсе
    state.data.popup = null;
    const choices = generateChoices(engine, rng);
    // Стратегия может не найти подходящего (например, все варианты события
    // дороги): тогда берём первый доступный, чтобы партия не зависла
    const choice = pick(choices, rng, state) ?? choices.find((c) => c.affordable) ?? choices[0];
    const result = engine.applyAction(choice.isWait ? 'wait' : choice.id);
    if (!result.ok) trace.stuck = (trace.stuck ?? 0) + 1;
    if (state.isOver) break;

    engine.advanceDay();
    trace.tier = Math.max(trace.tier, state.tier);
    trace.lowestHappiness = Math.min(trace.lowestHappiness, state.happinessLevel);
  }

  if (state.isOver) {
    trace.outcome = state.status;
    trace.day = state.day;
    trace.reason = state.data.endReason;
  }
  return trace;
}

function summarize(name) {
  const traces = Array.from({ length: PARTIES }, (_, i) => playOne(name, i + 1));
  const won = traces.filter((t) => t.outcome === 'won');
  const lost = traces.filter((t) => t.outcome === 'lost');
  const alive = traces.filter((t) => t.outcome === 'alive');

  const median = (xs) => {
    if (!xs.length) return '—';
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const reasons = {};
  for (const t of lost) reasons[t.reason] = (reasons[t.reason] ?? 0) + 1;

  const tiers = {};
  for (const t of traces) tiers[t.tier] = (tiers[t.tier] ?? 0) + 1;

  console.log(`\n=== ${name} (${PARTIES} партий, до ${DAYS} дней) ===`);
  console.log(`победа: ${won.length}, поражение: ${lost.length}, дожили: ${alive.length}`);
  console.log(`медианный день поражения: ${median(lost.map((t) => t.day))}`);
  console.log(`достигнутый тир (число партий): ${JSON.stringify(tiers)}`);
  console.log(`причины поражения: ${JSON.stringify(reasons)}`);
}

console.log(`Баланс: тиров ${BALANCE.development.levels.length}, стратегий ${Object.keys(STRATEGIES).length}`);
for (const name of Object.keys(STRATEGIES)) summarize(name);
