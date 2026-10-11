// Население при переходе на тир: название сословия меняется, размер — нет.
// Причина сброса в игре — случайные события вроде эпидемии, не переход.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BALANCE } from '../js/balance.js';
import { makeSession, setup } from './helpers.js';

describe('сословия по тирам', () => {
  it('у каждого тира свое название сословия', () => {
    const names = BALANCE.development.levels.map((level) => level.populationName);
    assert.equal(names.length, 5);
    assert.ok(names.every(Boolean), 'у каждого тира есть сословие');
    assert.equal(new Set(names).size, names.length, 'названия не повторяются');
  });

  it('переход на тир не меняет число жителей, если в тот день не было события', () => {
    // Перебираем сиды: в одних днях выпадает событие (оно меняет население),
    // в других — нет. Переход сам население трогать не должен.
    let checked = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const { engine, state } = makeSession(seed);
      setup(state, { resources: { wood: 100, stone: 100, food: 200, population: 40 } });
      const before = state.population;
      const notesBefore = engine.chronicle.entries.length;

      engine.advanceDay();

      if (state.tier !== 2) continue;
      const events = engine.chronicle.entries
        .slice(0, engine.chronicle.entries.length - notesBefore)
        .filter((entry) => !/перешло на новый уровень|Поздравляем/.test(entry.text));
      if (events.length > 0) continue; // событие дня могло изменить население
      checked += 1;
      assert.equal(state.population, before, `сид ${seed}: переход изменил население`);
    }
    assert.ok(checked > 0, 'нужны дни перехода без событий, чтобы проверить');
  });

  it('попап перехода называет новое сословие', () => {
    const { engine, state } = makeSession(2);
    setup(state, { resources: { wood: 100, stone: 100, food: 200 } });

    engine.advanceDay();

    assert.equal(state.tier, 2);
    assert.match(state.data.popup.text, /новое сословие: Фермеры/);
  });
});
