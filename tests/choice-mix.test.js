// Состав выборов: в основном производственные здания, редкие бонусы (социальные
// здания, технологии, дороги) встречаются редко, налог — между ними.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateChoices, categoryOf } from '../js/game/choices.js';
import { makeSession, setup } from './helpers.js';

function fullCity(seed, tier) {
  const session = makeSession(seed);
  const { state } = session;
  state.data.tier = tier;
  setup(state, {
    buildings: {
      houses: 10, farms: 4, lumberMills: 4, quarries: 4, markets: 3, taverns: 2, well: 2,
      sawmills: 3, brickworks: 3, mills: 3, weavings: 3,
      mines: 2, smelters: 2, forges: 2, scriptoriums: 2, cattleYards: 2,
      school: 2, hospital: 1, guard: 1, bank: 1, fireBrigades: 1, roads: 2,
      machineShops: 1, jewelers: 1, wineries: 1, gastronomies: 1, printingHouses: 1,
      townHall: 1, theater: 1, monument: 1, aqueduct: 1, harbour: 1, fireHouses: 1, fireStation: 1,
    },
    resources: {
      gold: 100000, wood: 100000, stone: 100000, food: 100000, boards: 100000, brick: 100000,
      flour: 100000, clothes: 100000, coal: 100000, metal: 100000, tools: 100000, books: 100000,
      meat: 100000, machines: 100000, jewelry: 100000, wine: 100000, delicacies: 100000, press: 100000,
    },
  });
  return session;
}

function sample(days) {
  const counts = { production: 0, house: 0, trade: 0, rare: 0, tax: 0, wait: 0 };
  for (const tier of [1, 2, 3]) {
    const { state, engine, rng } = fullCity(7, tier);
    for (let day = 1; day <= days; day += 1) {
      state.data.day = day;
      engine.rollOffers();
      for (const choice of generateChoices(engine, rng)) {
        if (choice.isWait) counts.wait += 1;
        else if (choice.group === 'tax') counts.tax += 1;
        else counts[categoryOf(choice)] += 1;
      }
    }
  }
  return counts;
}

describe('состав выборов', () => {
  const counts = sample(400);
  const ordinary = counts.production + counts.house + counts.trade + counts.rare;

  it('производственные здания — основная часть выборов', () => {
    const share = counts.production / ordinary;
    assert.ok(share > 0.5, `производственные: ${(share * 100).toFixed(0)}%`);
  });

  it('социальные здания, технологии и дороги — редкие', () => {
    const share = counts.rare / ordinary;
    assert.ok(share < 0.15, `редкие бонусы: ${(share * 100).toFixed(0)}%`);
    assert.ok(share > 0, 'редкие бонусы должны встречаться');
  });

  it('производственные встречаются чаще редких', () => {
    assert.ok(counts.production > counts.rare * 5, `${counts.production} против ${counts.rare}`);
  });

  it('налог стоит между ними: появляется заметно чаще редких бонусов', () => {
    const taxDays = counts.tax;
    assert.ok(taxDays > counts.rare, `налог ${taxDays}, редкие ${counts.rare}`);
  });
});
