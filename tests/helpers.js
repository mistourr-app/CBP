// Общие помощники для тестов.

import { BALANCE } from '../js/balance.js';
import { EventBus } from '../js/core/bus.js';
import { Rng } from '../js/core/rng.js';
import { Engine } from '../js/game/engine.js';
import { createInitialState, GameState } from '../js/game/state.js';

/** Создаёт партию с фиксированным сидом — результат воспроизводим. */
export function makeSession(seed = 1) {
  const state = new GameState(createInitialState());
  const rng = new Rng(seed);
  const engine = new Engine(state, rng, new EventBus());
  return { state, rng, engine };
}

/** Кладёт ресурсы напрямую, минуя игровые ограничения. */
export function give(state, amounts) {
  for (const [key, amount] of Object.entries(amounts)) state.addResource(key, amount);
}

/** Настраивает состояние под конкретный сценарий. */
export function setup(state, { buildings = {}, resources = {}, workers = {} } = {}) {
  for (const [key, count] of Object.entries(buildings)) state.addBuilding(key, count);
  for (const [key, amount] of Object.entries(resources)) state.setResource(key, amount);
  for (const [key, count] of Object.entries(workers)) state.workers[key] = count;
}

export function seasonId(state) {
  return BALANCE.seasons[state.seasonIndex].id;
}