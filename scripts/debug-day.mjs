// Пошаговая трасса одной партии: что происходит с населением, едой и счастьем.
// Запуск: node scripts/debug-day.mjs [сид] [стратегия]
import { EventBus } from '../js/core/bus.js';
import { Rng } from '../js/core/rng.js';
import { generateChoices } from '../js/game/choices.js';
import { Engine } from '../js/game/engine.js';
import { GameState, createInitialState } from '../js/game/state.js';

const seed = Number(process.argv[2] ?? 3);
const state = new GameState(createInitialState());
const rng = new Rng(seed);
const engine = new Engine(state, rng, new EventBus());

for (let day = 1; day <= 12 && !state.isOver; day += 1) {
  const choices = generateChoices(engine, rng);
  const usable = choices.filter((c) => c.affordable && !c.isWait);
  const farm = usable.find((c) => c.id === 'build:farms');
  const needFood = state.resource('food') < state.population * 2;
  const pick = (needFood && farm) || usable.find((c) => c.id.startsWith('build:')) || choices.find((c) => c.isWait) || choices[0];
  console.log('  выборы:', choices.map((c) => c.id + (c.affordable ? '' : '✗')).join(', '), '| мood:', JSON.stringify(state.data.moods.map((m) => [m.tag, m.delta, m.daysLeft])));
  const before = { pop: state.population, food: state.resource('food'), gold: state.resource('gold') };

  // Игрок закрывает попап до выбора, как в интерфейсе
  state.data.popup = null;
  const result = engine.applyAction(pick.id);
  if (!result.ok) console.log('  действие отклонено:', pick.id);
  engine.advanceDay();

  console.log(
    `день ${day}: ${pick.id.padEnd(16)}` +
    ` жители ${before.pop}->${state.population}` +
    ` еда ${before.food}->${state.resource('food')}` +
    ` золото ${before.gold}->${state.resource('gold')}` +
    ` счастье ${state.happinessLevel}` +
    ` работают ${state.employedWorkers}`,
  );
}
console.log('итог:', state.status, state.data.endReason);
