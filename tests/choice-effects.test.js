// Выборы показывают эффекты зданий и технологий: без них непонятно, зачем строить.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BALANCE } from '../js/balance.js';
import { generateChoices } from '../js/game/choices.js';
import { makeSession, setup } from './helpers.js';

describe('эффекты в выборах', () => {
  it('у таверны на втором тире есть эффект счастья +1', () => {
    const { state, engine } = makeSession();
    state.data.tier = 2;
    setup(state, { resources: { gold: 1000, wood: 1000, stone: 1000, boards: 1000 } });

    const tavern = engine.availableActions().find((a) => a.id === 'build:taverns');
    assert.ok(tavern, 'таверна должна быть доступна на втором тире');
    const happy = tavern.effects.find((e) => e.icon === '😊');
    assert.ok(happy, 'у таверны должен быть эффект счастья');
    assert.equal(happy.delta, 1);
  });

  it('пожарная станция: сокращение пожара выгодно, даже со стрелкой вниз', () => {
    const { state, engine } = makeSession();
    state.data.tier = 4;
    setup(state, { resources: { gold: 10000, machines: 1000 } });

    const station = engine.availableActions().find((a) => a.id === 'build:fireStation');
    assert.ok(station, 'пожарная станция должна быть доступна');
    const fire = station.effects.find((e) => e.icon === '🔥');
    assert.ok(fire, 'у пожарной станции должен быть эффект пожара');
    assert.ok(fire.delta < 0, 'сокращение дней — стрелка вниз');
    assert.equal(fire.good, true, 'но выгода для игрока');
  });

  it('технология показывает свой бонус', () => {
    const { state, engine } = makeSession();
    setup(state, { buildings: { farms: 1 }, resources: { gold: 1000, stone: 1000 }, workers: { farms: 2 } });
    state.setResource('knowledge', 0);

    const tech = engine.availableActions().find((a) => a.id === 'develop:advancedFarming');
    assert.ok(tech, 'технология должна быть доступна');
    assert.ok(tech.effects.length > 0, 'у технологии должен быть эффект');
    assert.equal(tech.effects[0].delta, BALANCE.technologies.advancedFarming.productionBonus.amount);
  });

  it('производственное здание эффектов не показывает (выход виден иконкой)', () => {
    const { state, engine } = makeSession();
    setup(state, { resources: { gold: 1000, wood: 1000 } });

    const farm = engine.availableActions().find((a) => a.id === 'build:farms');
    assert.deepEqual(farm.effects, []);
  });

  it('выбор «Подождать» не получает особого оформления', () => {
    const { engine, state, rng } = makeSession();
    const wait = generateChoices(engine, rng).find((c) => c.isWait);
    assert.ok(wait);
    // Особый класс у «Подождать» не предусмотрен: он такой же выбор, как остальные
    assert.equal(wait.affordable, true);
    assert.equal(wait.id, 'wait');
    assert.equal(state.tier, 1);
  });
});
