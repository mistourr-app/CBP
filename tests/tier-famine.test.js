// Переход на тир не должен приводить к поражению от голода.
// Пищевой ресурс нового тира при переходе пуст: без стартового запаса житель
// съедал бы муку, которой нет, и игра заканчивалась в тот же день.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BALANCE } from '../js/balance.js';
import { makeSession, setup } from './helpers.js';

describe('переход на тир и голод', () => {
  it('переход с достаточной едой не ведёт к поражению в тот же день', () => {
    const { engine, state } = makeSession(1);
    setup(state, { resources: { wood: 100, stone: 100, food: 200 } });

    engine.advanceDay();

    assert.equal(state.tier, 2, 'переход должен состояться');
    assert.equal(state.isOver, false, 'переход не должен заканчивать игру');
    assert.equal(state.data.popup?.kind, 'tier');
  });

  it('стартовый запас нового пищевого ресурса выдаётся при переходе', () => {
    const { engine, state } = makeSession(2);
    setup(state, { resources: { wood: 100, stone: 100, food: 200 } });

    engine.advanceDay();

    const starter = BALANCE.development.levels[0].starterFood;
    assert.equal(state.resource('flour'), starter);
  });

  it('на следующий день после перехода не наступает голод', () => {
    const { engine, state } = makeSession(3);
    setup(state, { resources: { wood: 100, stone: 100, food: 200 } });
    engine.advanceDay();
    engine.dismissPopup();

    engine.advanceDay();

    assert.equal(state.isOver, false, 'поражение сразу после перехода');
    assert.ok(state.population > 0);
  });
});
