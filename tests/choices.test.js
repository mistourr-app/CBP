// Генератор выбора: ровно четыре варианта, «Подождать» есть, недоступного нет.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BALANCE } from '../js/balance.js';
import { generateChoices } from '../js/game/choices.js';
import { makeSession, setup } from './helpers.js';

const SLOTS = BALANCE.choices.slots;

function freshDay({ seed = 1, day = 1 } = {}) {
  const { state, engine, rng } = makeSession(seed);
  state.data.day = day;
  return { state, engine, rng };
}

describe('состав выбора', () => {
  it('всегда ровно четыре варианта', () => {
    for (let day = 1; day <= 60; day += 1) {
      const { engine, rng } = freshDay({ seed: day, day });
      assert.equal(generateChoices(engine, rng).length, SLOTS, `день ${day}`);
    }
  });

  it('«Подождать» присутствует всегда', () => {
    // Пустое поселение — самый бедный набор действий
    for (let day = 1; day <= 60; day += 1) {
      const { engine, rng } = freshDay({ seed: day, day });
      const choices = generateChoices(engine, rng);
      assert.ok(choices.some((c) => c.isWait), `день ${day}: нет «Подождать»`);
    }
  });

  it('нет повторяющихся действий', () => {
    for (let day = 1; day <= 60; day += 1) {
      const { engine, rng } = freshDay({ seed: day, day });
      const ids = generateChoices(engine, rng).map((c) => c.id);
      assert.equal(new Set(ids).size, ids.length, `день ${day}: ${ids.join(', ')}`);
    }
  });

  it('у каждого варианта есть подпись и иконка', () => {
    const { engine, rng } = freshDay();
    for (const choice of generateChoices(engine, rng)) {
      assert.ok(choice.label.length > 0, `пустая подпись у ${choice.id}`);
      assert.ok(choice.icon.length > 0, `нет иконки у ${choice.id}`);
    }
  });
});

describe('доступность', () => {
  it('не предлагает здания, которое ещё не открыто', () => {
    const { state, engine, rng } = freshDay();
    const ids = generateChoices(engine, rng).map((c) => c.id);

    // На старте доступны только дом и производственные здания
    assert.ok(!ids.includes('build:temples'), 'храм открыт при 1 доме');
    assert.ok(!ids.includes('build:markets'), 'рынок открыт при 0 фермах');
    assert.ok(!ids.includes('build:walls'), 'стена открыта при 1 доме');
  });

  it('открывает рынок после первой фермы', () => {
    const { state, engine, rng } = freshDay();
    setup(state, { buildings: { farms: 1 } });
    state.setResource('population', 30);

    let seenMarket = false;
    for (let day = 1; day <= 60 && !seenMarket; day += 1) {
      state.data.day = day;
      seenMarket = generateChoices(engine, rng).some((c) => c.id === 'build:markets');
    }
    assert.ok(seenMarket, 'рынок так и не появился');
  });

  it('помечает недоступные по деньгам действия как недоступные', () => {
    const { state, engine, rng } = freshDay();
    state.setResource('gold', 0);
    state.setResource('wood', 0);
    state.setResource('stone', 0);

    for (const choice of generateChoices(engine, rng)) {
      const affordable = Object.entries(choice.cost)
        .every(([key, amount]) => state.resource(key) >= amount);
      assert.equal(choice.affordable, affordable, choice.id);
    }
  });

  it('не показывает действие, которое уже изучено', () => {
    const { state, engine, rng } = freshDay();
    setup(state, { buildings: { farms: 1 } });
    state.technologies.advancedFarming = true;
    state.setResource('knowledge', 999);

    for (let day = 1; day <= 60; day += 1) {
      state.data.day = day;
      const ids = generateChoices(engine, rng).map((c) => c.id);
      assert.ok(!ids.includes('develop:advancedFarming'), `день ${day}`);
    }
  });
});

describe('достижимость всех зданий', () => {
  it('за цикл дней показывается каждое открытое здание', () => {
    const { state, engine, rng } = freshDay();
    // Состояние, в котором открыто всё
    setup(state, {
      buildings: {
        houses: 8, farms: 3, lumberMills: 2, quarries: 2,
        markets: 1, temples: 1, schools: 1, walls: 1,
      },
    });
    state.setResource('gold', 100000);
    state.setResource('wood', 100000);
    state.setResource('stone', 100000);
    state.setResource('food', 100000);
    state.setResource('population', 80);

    const seen = new Set();
    const cycle = BALANCE.choices.priority.length;
    for (let day = 1; day <= cycle; day += 1) {
      state.data.day = day;
      for (const choice of generateChoices(engine, rng)) seen.add(choice.id);
    }

    for (const key of ['farms', 'lumberMills', 'quarries', 'markets', 'temples', 'schools', 'walls']) {
      assert.ok(seen.has(`build:${key}`), `${key} не показывался за полный цикл`);
    }
  });
});