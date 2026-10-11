// Налог — случайный выбор наравне с остальными: появляется в части дней,
// не требует ресурсов и не закреплён за одним слотом.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BALANCE } from '../js/balance.js';
import { generateChoices } from '../js/game/choices.js';
import { makeSession, setup } from './helpers.js';

function richCity(seed) {
  const session = makeSession(seed);
  const { state } = session;
  setup(state, {
    buildings: { houses: 8, farms: 3, lumberMills: 3, quarries: 3, markets: 2, taverns: 1, well: 1 },
    resources: { gold: 5000, wood: 5000, stone: 5000, food: 5000, boards: 5000, brick: 5000, flour: 5000, clothes: 5000 },
  });
  state.data.tier = 2;
  return session;
}

describe('налог в выборах', () => {
  it('появляется в заметной части дней, а не в единицах', () => {
    const session = richCity(3);
    const { engine, rng, state } = session;
    let days = 0;
    const DAYS = 200;

    for (let day = 1; day <= DAYS; day += 1) {
      state.data.day = day;
      engine.rollOffers();
      if (generateChoices(engine, rng).some((c) => c.id === 'tax')) days += 1;
    }

    const share = days / DAYS;
    assert.ok(share > 0.3 && share < 0.7, `налог в ${days} из ${DAYS} дней (${share.toFixed(2)})`);
  });

  it('налог не требует ресурсов', () => {
    const session = richCity(4);
    const { engine, rng, state } = session;
    state.data.day = 5;
    engine.rollOffers();

    const tax = generateChoices(engine, rng).find((c) => c.id === 'tax');
    if (tax) assert.deepEqual(tax.requirements, [], 'налог не должен требовать ресурсов');
  });

  it('выборов не больше слотов, «Подождать» всегда последний', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const session = richCity(seed);
      const { engine, rng, state } = session;
      state.data.day = seed;
      engine.rollOffers();

      const choices = generateChoices(engine, rng);
      assert.ok(choices.length <= BALANCE.choices.slots, `сид ${seed}: ${choices.length} вариантов`);
      assert.equal(choices.at(-1).id, 'wait', `сид ${seed}: «Подождать» не последний`);
    }
  });

  it('налог не занимает фиксированный слот: его позиция меняется', () => {
    const positions = new Set();
    for (let seed = 1; seed <= 60; seed += 1) {
      const session = richCity(seed);
      const { engine, rng, state } = session;
      state.data.day = seed;
      engine.rollOffers();

      const choices = generateChoices(engine, rng);
      const index = choices.findIndex((c) => c.id === 'tax');
      if (index >= 0) positions.add(index);
    }
    assert.ok(positions.size > 1, `налог всегда стоит на одном месте: ${[...positions]}`);
  });
});
