// Расчёты экономики: производство, потребление, обслуживание, население.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BALANCE } from '../js/balance.js';
import { formatResource, plural } from '../js/game/content.js';
import {
  applyConsumption,
  applyPopulationGrowth,
  applyProduction,
  autoAssignWorkers,
  canAfford,
  computeDaily,
  computeFoodConsumption,
  computeMaintenance,
  computeProduction,
  spend,
} from '../js/game/economy.js';
import { makeSession, setup } from './helpers.js';

describe('производство', () => {
  it('пустое поселение ничего не производит', () => {
    const { state } = makeSession();
    assert.deepEqual(computeProduction(state), {
      gold: 0, food: 0, wood: 0, stone: 0, faith: 0, knowledge: 0,
    });
  });

  it('производит по количеству рабочих, а не по зданиям', () => {
    const { state } = makeSession();
    setup(state, {
      buildings: { farms: 3, lumberMills: 2, quarries: 1 },
      workers: { farms: 5, lumberMills: 3, quarries: 2 },
    });

    const production = computeProduction(state);
    assert.equal(production.food, 25);   // 5 × 5
    assert.equal(production.wood, 24);   // 3 × 8
    assert.equal(production.stone, 12);  // 2 × 6
  });

  it('без рабочих здания ничего не дают', () => {
    const { state } = makeSession();
    setup(state, { buildings: { farms: 5 } });
    assert.equal(computeProduction(state).food, 0);
  });

  it('зимой еда производится хуже, летом лучше', () => {
    const { state } = makeSession();
    setup(state, { buildings: { farms: 1 }, workers: { farms: 2 } });

    const bySeason = {};
    for (const season of BALANCE.seasons) {
      state.data.seasonIndex = BALANCE.seasons.indexOf(season);
      bySeason[season.id] = computeProduction(state).food;
    }

    assert.ok(bySeason.winter < bySeason.spring, 'зимой меньше, чем весной');
    assert.ok(bySeason.summer > bySeason.spring, 'летом больше, чем весной');
  });

  it('технологии умножают производство', () => {
    const { state } = makeSession();
    setup(state, { buildings: { farms: 1 }, workers: { farms: 2 } });

    const before = computeProduction(state).food;
    state.technologies.advancedFarming = true;
    const after = computeProduction(state).food;

    assert.equal(after, Math.floor(before * 1.5));
  });

  it('религия даёт счастье за рабочего в храме', () => {
    const { state } = makeSession();
    setup(state, { buildings: { temples: 1 }, workers: { temples: 1 } });
    state.technologies.religion = true;

    assert.equal(computeProduction(state).happiness, 1);
  });
});

describe('потребление', () => {
  it('еда расходуется по количеству населения', () => {
    const { state } = makeSession();
    state.setResource('population', 20);
    assert.equal(computeFoodConsumption(state), 10);
  });

  it('при нехватке еды население убывает, а еда обнуляется', () => {
    const { state } = makeSession();
    setup(state, { resources: { food: 2, population: 20 } });

    const notes = applyConsumption(state);

    assert.equal(state.resource('food'), 0);
    // не хватало 10 - 2 = 8 единиц, смертность 20% от недостачи = 1
    assert.equal(state.population, 19);
    assert.ok(notes.some((note) => note.text.includes('Голод')));
  });

  it('счастье падает на единицу за день', () => {
    const { state } = makeSession();
    const before = state.happiness;
    applyConsumption(state);
    assert.equal(state.happiness, before - BALANCE.happiness.dailyDecay);
  });

  it('нехватка золота на обслуживание не уводит баланс в минус', () => {
    const { state } = makeSession();
    setup(state, { buildings: { markets: 8 }, resources: { gold: 1 } });

    applyConsumption(state);

    assert.equal(state.resource('gold'), 0);
    assert.ok(state.resource('gold') >= 0);
  });

  it('счастье не опускается ниже нуля', () => {
    const { state } = makeSession();
    state.setResource('happiness', 0);
    applyConsumption(state);
    applyConsumption(state);
    assert.equal(state.happiness, 0);
  });
});

describe('обслуживание', () => {
  it('растёт вместе с числом зданий', () => {
    const { state } = makeSession();
    const empty = computeMaintenance(state);

    setup(state, { buildings: { houses: 10 } });
    const withHouses = computeMaintenance(state);

    assert.ok(withHouses > empty);
  });

  it('медленно растёт с номером дня', () => {
    const { state } = makeSession();
    setup(state, { buildings: { houses: 20 } });

    state.data.day = 10;
    const early = computeMaintenance(state);
    state.data.day = 900;
    const late = computeMaintenance(state);

    assert.ok(late > early);
  });
});

describe('население', () => {
  it('растёт, пока есть место в домах и хватает еды', () => {
    const { state } = makeSession();
    setup(state, { resources: { food: 500, maxPopulation: 30 } });
    state.setResource('maxPopulation', 30);

    const arrived = applyPopulationGrowth(state);

    assert.equal(arrived, BALANCE.population.growthPerDay);
    assert.equal(state.population, 11);
  });

  it('не растёт выше лимита домов', () => {
    const { state } = makeSession();
    setup(state, { resources: { food: 500 } });
    state.setResource('maxPopulation', 10);

    assert.equal(applyPopulationGrowth(state), null);
    assert.equal(state.population, 10);
  });

  it('не растёт при нехватке еды', () => {
    const { state } = makeSession();
    state.setResource('maxPopulation', 40);
    state.setResource('food', 1);

    assert.equal(applyPopulationGrowth(state), null);
  });
});

describe('рабочие', () => {
  it('назначаются только в пределах ёмкости здания', () => {
    const { state } = makeSession();
    setup(state, { buildings: { farms: 1 } }); // ёмкость 2

    const assigned = autoAssignWorkers(state);

    assert.equal(assigned, 2);
    assert.equal(state.workerCount('farms'), 2);
  });

  it('не назначаются сверх населения', () => {
    const { state } = makeSession();
    setup(state, { buildings: { farms: 5, lumberMills: 5, quarries: 5 } });

    autoAssignWorkers(state);

    assert.ok(state.employedWorkers <= state.population);
  });

  it('рабочие без рабочих мест не нужны', () => {
    const { state } = makeSession();
    setup(state, { buildings: { walls: 3, towers: 2 } });

    assert.equal(autoAssignWorkers(state), 0);
  });
});

describe('трата ресурсов', () => {
  it('canAfford проверяет все позиции сразу', () => {
    const { state } = makeSession();
    setup(state, { resources: { gold: 30, wood: 5 } });

    assert.equal(canAfford(state, { gold: 10 }), true);
    assert.equal(canAfford(state, { gold: 10, wood: 10 }), false);
  });

  it('spend не списывает, если не хватает', () => {
    const { state } = makeSession();
    setup(state, { resources: { gold: 5 } });

    assert.equal(spend(state, { gold: 10 }), false);
    assert.equal(state.resource('gold'), 5);
  });

  it('spend списывает и уменьшает остаток', () => {
    const { state } = makeSession();
    setup(state, { resources: { gold: 20 } });

    assert.equal(spend(state, { gold: 20 }), true);
    assert.equal(state.resource('gold'), 0);
  });
});

describe('сводка дня', () => {
  it('computeDaily не меняет состояние', () => {
    const { state } = makeSession();
    setup(state, { buildings: { farms: 2 }, workers: { farms: 2 }, resources: { food: 30 } });
    const snapshot = JSON.stringify(state.data);

    computeDaily(state);

    assert.equal(JSON.stringify(state.data), snapshot);
  });

  it('производство из сводки совпадает с реальным применением', () => {
    const { state } = makeSession();
    setup(state, { buildings: { farms: 3 }, workers: { farms: 4 }, resources: { food: 0 } });

    const predicted = computeDaily(state).production.food;
    const before = state.resource('food');
    applyProduction(state);

    assert.equal(state.resource('food') - before, predicted);
  });
});

describe('подписи ресурсов', () => {
  it('склоняются по-русски', () => {
    assert.equal(plural(1, 'камень', 'камня', 'камней'), 'камень');
    assert.equal(plural(2, 'камень', 'камня', 'камней'), 'камня');
    assert.equal(plural(5, 'камень', 'камня', 'камней'), 'камней');
    assert.equal(plural(11, 'камень', 'камня', 'камней'), 'камней');
    assert.equal(plural(21, 'камень', 'камня', 'камней'), 'камень');
    assert.equal(plural(22, 'камень', 'камня', 'камней'), 'камня');
    assert.equal(plural(101, 'камень', 'камня', 'камней'), 'камень');
  });

  it('у каждого ресурса заданы все три формы', () => {
    for (const [key, def] of Object.entries(BALANCE.resources)) {
      for (const form of ['one', 'few', 'many']) {
        assert.ok(def.unit?.[form], `${key}: нет формы ${form}`);
      }
    }
  });

  it('подпись стоимости читается по-русски', () => {
    assert.equal(formatResource(20, BALANCE.resources.wood.unit), '20 древесины');
    assert.equal(formatResource(5, BALANCE.resources.stone.unit), '5 камней');
    assert.equal(formatResource(1, BALANCE.resources.stone.unit), '1 камень');
    assert.equal(formatResource(15, BALANCE.resources.gold.unit), '15 золота');
    // Разряды разделяются неразрывным пробелом, чтобы число не рвалось переносом
    assert.equal(formatResource(1000, BALANCE.resources.knowledge.unit), '1 000 знаний');
    assert.equal(formatResource(1234567, BALANCE.resources.gold.unit), '1 234 567 золота');
  });
});

describe('защита от NaN', () => {
  it('после длинной игры все числа конечны', () => {
    const { state, engine } = makeSession(7);

    for (let i = 0; i < 300; i += 1) {
      engine.applyAction('wait');
      engine.advanceDay();
      if (state.isOver) break;
    }

    for (const [key, value] of Object.entries(state.data.resources)) {
      assert.ok(Number.isFinite(value), `${key} = ${value}`);
    }
    for (const [key, value] of Object.entries(state.data.buildings)) {
      assert.ok(Number.isFinite(value) && value >= 0, `${key} = ${value}`);
    }
  });
});