// Расчёты экономики: производство, потребление, обслуживание, население.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BALANCE } from '../js/balance.js';
import { formatResource, plural } from '../js/game/content.js';
import {
  applyConsumption,
  applyHappinessOutflow,
  applyTaxIncome,
  applyProduction,
  autoAssignWorkers,
  canAfford,
  computeDaily,
  computeFoodConsumption,
  computeMaintenance,
  computeHappiness,
  computeHappinessOutflow,
  computeProduction,
  computeTaxIncome,
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

  it('настроение народа прибавляет к производству', () => {
    const { state } = makeSession();
    setup(state, { buildings: { farms: 2 }, workers: { farms: 4 } });

    state.setHappiness(0);
    const neutral = computeProduction(state).food;

    state.setHappiness(2);
    const joyful = computeProduction(state).food;

    assert.ok(joyful > neutral, 'при счастье +2 должно производиться больше');
    assert.equal(joyful, Math.floor(neutral * BALANCE.happiness.prodMult[2]));
  });

  it('на золото настроение не влияет: золото идёт от налога', () => {
    const { state } = makeSession();
    setup(state, { buildings: { markets: 2 }, workers: { markets: 2 } });

    state.setHappiness(-2);
    assert.equal(computeProduction(state).gold, 0);
  });
});

// --- Счастье и налоги (SYSTEMS_SPEC §2, §3) ---

describe('уровень счастья', () => {
  it('считается от ставки налога', () => {
    const { state } = makeSession();

    for (const [index, tax] of BALANCE.taxes.entries()) {
      state.data.taxRateIndex = index;
      assert.equal(computeHappiness(state), tax.happinessBase,
        `ставка ${Math.round(tax.rate * 100)}%`);
    }
  });

  it('поднимается на шаг с храмом и «Религией»', () => {
    const { state } = makeSession();
    state.data.taxRateIndex = 3;           // 40% -> база -1
    assert.equal(computeHappiness(state), -1);

    setup(state, { buildings: { temples: 1 } });
    assert.equal(computeHappiness(state), -1, 'храм без «Религии» ничего не даёт');

    state.technologies.religion = true;
    assert.equal(computeHappiness(state), -1 + BALANCE.happiness.religionBonus);
  });

  it('не выходит за пределы', () => {
    const { state } = makeSession();

    state.data.taxRateIndex = 4;           // 50% -> база -2
    assert.equal(computeHappiness(state), -2);

    state.data.taxRateIndex = 0;           // 10% -> база +2
    state.technologies.religion = true;
    setup(state, { buildings: { temples: 3 } });
    assert.equal(computeHappiness(state), 2, 'выше +2 не подняться');
  });

  it('отток жителей зависит от уровня', () => {
    const { state } = makeSession();

    state.setHappiness(0);
    assert.equal(computeHappinessOutflow(state), 0);
    state.setHappiness(-1);
    assert.equal(computeHappinessOutflow(state), BALANCE.happiness.leavePerDayLow);
    state.setHappiness(-2);
    assert.equal(computeHappinessOutflow(state), BALANCE.happiness.leavePerDayHigh);
    state.setHappiness(2);
    assert.equal(computeHappinessOutflow(state), 0);
  });

  it('уровень всегда в диапазоне, даже если пришёл мусор', () => {
    const { state } = makeSession();

    state.data.happiness = 99;
    state.normalize();
    assert.equal(state.happiness, BALANCE.happiness.range[1]);

    state.data.happiness = -99;
    state.normalize();
    assert.equal(state.happiness, BALANCE.happiness.range[0]);
  });
});

describe('доход от налога', () => {
  it('жители платят ставку налога', () => {
    const { state } = makeSession();
    state.setResource('population', 10);

    state.data.taxRateIndex = 0;           // 10% -> 1 золота
    assert.equal(computeTaxIncome(state), 10);
    state.data.taxRateIndex = 4;           // 50% -> 5 золота
    assert.equal(computeTaxIncome(state), 50);
  });

  it('рынки добавляют к сбору с каждого жителя', () => {
    const { state } = makeSession();
    state.setResource('population', 10);
    state.data.taxRateIndex = 0;

    const bare = computeTaxIncome(state);
    setup(state, { buildings: { markets: 3 } });
    const withMarkets = computeTaxIncome(state);

    const bonus = BALANCE.income.marketGoldPerCitizen * 10 * 3;
    assert.equal(withMarkets, bare + bonus);
  });

  it('нулевое население даёт нулевой доход', () => {
    const { state } = makeSession();
    state.setResource('population', 0);
    assert.equal(computeTaxIncome(state), 0);
  });

  it('доход попадает в казну и в статистику', () => {
    const { state } = makeSession();
    state.setResource('population', 20);
    const before = state.resource('gold');

    const gained = applyTaxIncome(state);

    assert.equal(state.resource('gold'), before + gained);
    assert.equal(state.stats.totalGoldEarned, gained);
  });
});

describe('отток из-за недовольства', () => {
  it('народ уходит сам, когда народ недоволен', () => {
    const { state } = makeSession();
    state.setResource('population', 20);
    state.setHappiness(-2);

    const leaving = applyHappinessOutflow(state);

    assert.equal(leaving, BALANCE.happiness.leavePerDayHigh);
    assert.equal(state.population, 20 - leaving);
  });

  it('при нуле недовольства никто не уходит', () => {
    const { state } = makeSession();
    state.setResource('population', 20);
    state.setHappiness(0);
    assert.equal(applyHappinessOutflow(state), 0);
  });

  it('не уходит больше, чем есть жителей', () => {
    const { state } = makeSession();
    state.setResource('population', 2);
    state.setHappiness(-2);

    applyHappinessOutflow(state);

    assert.equal(state.population, 0);
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
  it('само по себе не растёт: приток только от домов и событий', () => {
    const { engine, state } = makeSession();
    setup(state, { resources: { food: 100000 }, buildings: { farms: 1 } });
    const before = state.population;

    for (let i = 0; i < 30; i += 1) engine.advanceDay();

    assert.equal(state.population, before,
      'жители не должны прибывать сами по себе');
    assert.equal(state.stats.citizensArrived, 0);
  });

  it('дом вселяет жителя сразу при постройке', () => {
    const { engine, state } = makeSession();
    setup(state, { resources: { gold: 500, wood: 500, stone: 500 } });
    const before = state.population;

    engine.applyAction('build:houses');

    assert.equal(state.population, before + BALANCE.population.residentsPerHouse);
    assert.equal(state.stats.citizensArrived, BALANCE.population.residentsPerHouse);
  });

  it('смена налога не приводит жителей, а может только отпугнуть', () => {
    const { engine, state } = makeSession();
    state.data.day = BALANCE.taxChangeEveryDays;
    const before = state.population;

    engine.applyAction('tax');            // 30% -> 40%, народ недоволен
    engine.advanceDay();

    assert.ok(state.population <= before, `жители прибыли: ${before} -> ${state.population}`);
    assert.equal(state.stats.citizensArrived, 0);
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

// --- Смена налога как действие хода ---

describe('смена налога', () => {
  it('предлагается раз в taxChangeEveryDays дней, а не каждый день', () => {
    for (let day = 1; day <= 30; day += 1) {
      const { engine, state } = makeSession();
      state.data.day = day;

      const offered = engine.availableActions().some((a) => a.id === 'tax');
      assert.equal(offered, day % BALANCE.taxChangeEveryDays === 0, `день ${day}`);
    }
  });

  it('перебирает ставки по кругу', () => {
    const { engine, state } = makeSession();
    state.data.day = BALANCE.taxChangeEveryDays;
    const start = state.taxRateIndex;

    for (let step = 1; step <= BALANCE.taxes.length; step += 1) {
      assert.equal(engine.applyAction('tax').ok, true);
      assert.equal(state.taxRateIndex, (start + step) % BALANCE.taxes.length);
    }
  });

  it('не меняется в неподходящий день', () => {
    const { engine, state } = makeSession();
    state.data.day = BALANCE.taxChangeEveryDays + 1;
    const before = state.taxRateIndex;

    assert.equal(engine.applyAction('tax').ok, false);
    assert.equal(state.taxRateIndex, before);
  });

  it('после смены налога настроение народа меняется на следующий день', () => {
    const { engine, state } = makeSession();
    state.data.day = BALANCE.taxChangeEveryDays;
    state.data.taxRateIndex = 0;           // 10% -> +2
    state.setHappiness(-2);

    engine.applyAction('tax');              // -> 20%, база +1
    engine.advanceDay();

    assert.equal(state.happinessLevel, 1);
  });
});

// --- Дневной цикл целиком ---

describe('день целиком', () => {
  it('счастье пересчитывается каждый день по ставке налога', () => {
    const { engine, state } = makeSession();
    state.data.taxRateIndex = 4;           // 50% -> -2
    state.setHappiness(2);

    engine.advanceDay();

    assert.equal(state.happinessLevel, -2);
  });

  it('недовольство уводит жителей каждый день', () => {
    const { engine, state } = makeSession();
    state.setResource('population', 30);
    state.setResource('food', 500);
    state.data.taxRateIndex = 4;           // 50% -> -2
    setup(state, { buildings: { farms: 1 } });

    engine.advanceDay();

    // Уходит ровно столько, сколько задано уровнем счастья: приток из
    // домов сюда не подмешивается
    assert.equal(state.population, 30 - BALANCE.happiness.leavePerDayHigh);
    assert.equal(state.stats.citizensLost, BALANCE.happiness.leavePerDayHigh);
  });

  it('довольный народ не теряет никого и получает налоги', () => {
    const { engine, state } = makeSession();
    state.setResource('population', 10);
    state.setResource('food', 500);
    state.setResource('gold', 0);
    state.data.taxRateIndex = 0;           // 10% -> +2, 1 золота с жителя

    engine.advanceDay();

    assert.ok(state.happinessLevel > 0, 'народ доволен');
    assert.ok(state.resource('gold') > 0, 'казна пополнилась налогом');
  });
});