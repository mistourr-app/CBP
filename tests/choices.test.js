// Генератор выбора: ровно четыре варианта, «Подождать» есть, недоступного нет.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BALANCE } from '../js/balance.js';
import { generateChoices } from '../js/game/choices.js';
import { makeSession, setup } from './helpers.js';

const SLOTS = BALANCE.choices.slots;

// Длина выборки для проверок, где нужно увидеть редкие варианты
const DAYS_SAMPLE = 400;

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

  it('«Подождать» стоит последним', () => {
    for (let day = 1; day <= 60; day += 1) {
      const { engine, rng } = freshDay({ seed: day, day });
      const choices = generateChoices(engine, rng);

      assert.equal(choices.at(-1).id, 'wait', `день ${day}: «Подождать» не последний`);
      assert.ok(choices.at(-1).isWait, `день ${day}: не помечен как ожидание`);
    }
  });

  it('«Подождать» единственный, даже если другие действия недоступны', () => {
    const { engine, rng } = freshDay();
    const choices = generateChoices(engine, rng);

    assert.equal(choices.filter((c) => c.isWait).length, 1);
    assert.equal(choices.at(-1).id, 'wait');
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

  it('требования описаны данными, без текста: иконки и числа', () => {
    const { state, engine, rng } = freshDay();
    setup(state, {
      buildings: { houses: 8, farms: 3, lumberMills: 3, quarries: 3, markets: 2, taverns: 1, well: 1 },
    });
    state.setResource('gold', 100000);
    state.setResource('wood', 100000);
    state.setResource('stone', 100000);
    state.setResource('food', 100000);
    state.setResource('population', 80);

    for (let day = 1; day <= DAYS_SAMPLE; day += 1) {
      state.data.day = day;
      engine.rollOffers();
      for (const choice of generateChoices(engine, rng)) {
        assert.equal(choice.costText, undefined, `${choice.id}: остался текст стоимости`);
        for (const req of choice.requirements ?? []) {
          assert.ok(BALANCE.resources[req.resource], `${choice.id}: нет ресурса ${req.resource}`);
          assert.ok(Number.isInteger(req.amount) && req.amount > 0, `${choice.id}: ${req.amount}`);
        }
      }
    }
  });

  it('названия зданий без слова «Построить»', () => {
    const { state, engine, rng } = freshDay();
    setup(state, { resources: { gold: 100000, wood: 100000, stone: 100000, food: 100000 } });
    for (const choice of generateChoices(engine, rng)) {
      assert.doesNotMatch(choice.label, /Построить|Построй/, choice.id);
    }
  });

  it('производственное здание показывает иконку ресурса, который оно даёт', () => {
    const { engine } = freshDay();
    const farm = engine.availableActions().find((a) => a.id === 'build:farms');
    assert.equal(farm.icon, BALANCE.resources.food.icon);
  });

  it('здания с рабочими показывают их число, без рабочих — нет', () => {
    const { state, engine } = freshDay();
    setup(state, { resources: { gold: 1000, wood: 1000, stone: 1000 }, buildings: { houses: 1 } });
    const actions = engine.availableActions();
    assert.equal(actions.find((a) => a.id === 'build:farms').workers, 2);
    assert.equal(actions.find((a) => a.id === 'build:houses').workers, 0);
  });
});

describe('доступность', () => {
  it('не предлагает здания, которое ещё не открыто', () => {
    const { state, engine, rng } = freshDay();
    const ids = generateChoices(engine, rng).map((c) => c.id);

    // На старте доступно только то, что строится на первом уровне
    assert.ok(ids.includes('build:farms'), 'ферма должна быть на первом уровне');
    assert.ok(!ids.includes('build:markets'), 'рынок — второй уровень, не первый');
    assert.ok(!ids.includes('build:taverns'), 'таверна — второй уровень, не первый');
    assert.ok(!ids.includes('build:sawmills'), 'пилорама — второй уровень');
  });

  it('открывает рынок на втором уровне', () => {
    const { state, engine, rng } = freshDay();
    state.data.tier = 2;
    setup(state, { resources: { gold: 500 } });
    state.setResource('population', 30);

    let seenMarket = false;
    for (let day = 1; day <= DAYS_SAMPLE && !seenMarket; day += 1) {
      state.data.day = day;
      seenMarket = generateChoices(engine, rng).some((c) => c.id === 'build:markets');
    }
    assert.ok(seenMarket, 'рынок так и не появился на втором уровне');
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
    // Второй уровень: открыто всё, что строится на нём
    state.data.tier = 2;
    setup(state, {
      buildings: { houses: 8, farms: 3, lumberMills: 2, quarries: 2, markets: 1, taverns: 1 },
    });
    state.setResource('gold', 100000);
    state.setResource('wood', 100000);
    state.setResource('stone', 100000);
    state.setResource('food', 100000);
    state.setResource('population', 80);

    // Выдача случайная: редкие здания выпадают реже, поэтому смотрим на длинном отрезке
    const seen = new Set();
    for (let day = 1; day <= DAYS_SAMPLE; day += 1) {
      state.data.day = day;
      for (const choice of generateChoices(engine, rng)) seen.add(choice.id);
    }

    const expected = ['sawmills', 'brickworks', 'mills', 'weavings', 'markets', 'taverns', 'fireBrigades'];
    for (const key of expected) {
      assert.ok(seen.has(`build:${key}`), `${key} не показывался за ${DAYS_SAMPLE} дней`);
    }
  });
});