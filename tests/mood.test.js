// Модификаторы счастья: живут между днями, истекают, лечатся постройками.
// Ожидание и события с выбором. Бунт — только после нескольких дней подряд.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BALANCE } from '../js/balance.js';
import { generateChoices } from '../js/game/choices.js';
import { computeHappiness } from '../js/game/economy.js';
import { GameState, createInitialState } from '../js/game/state.js';
import { makeSession, setup } from './helpers.js';

const M = BALANCE.happiness.moods;

function quietDay(state, engine) {
  // Без случайных событий и выбора: проверяем только модификаторы
  state.data.pending = null;
  state.data.popup = null;
  engine.advanceDay();
}

describe('модификаторы счастья', () => {
  it('сумма модификаторов прибавляется к базе счастья', () => {
    const { state } = makeSession();
    state.data.taxRateIndex = 2; // база 0
    state.addMood({ tag: 'joy', delta: 1, days: 2 });
    state.addMood({ tag: 'fear', delta: -1, days: 2 });
    assert.equal(state.moodSum(), 0);
    assert.equal(computeHappiness(state), 0, 'разные модификаторы компенсируют друг друга');
  });

  it('истекают через заданное число дней', () => {
    const { state, engine } = makeSession();
    state.addMood({ tag: 'joy', delta: 1, days: 2 });
    state.data.taxRateIndex = 2;

    quietDay(state, engine);
    assert.equal(state.data.moods.length, 1, 'после первого дня ещё действует');
    quietDay(state, engine);
    assert.equal(state.data.moods.length, 0, 'после второго дня истёк');
  });

  it('уровень счастья ограничен −2..+2 даже с модификаторами', () => {
    const { state, engine } = makeSession();
    state.data.taxRateIndex = 0; // база +2
    state.addMood({ tag: 'joy', delta: 2, days: 3 });
    engine.advanceDay();
    assert.equal(state.happinessLevel, 2);
  });
});

describe('«Подождать»', () => {
  it('даёт модификатор −1, который действует несколько дней', () => {
    const { state, engine } = makeSession();
    state.data.taxRateIndex = 2;
    engine.applyAction('wait');

    assert.equal(state.waitTotal(), M.waitDelta);
    assert.equal(state.data.moods[0].daysLeft, M.waitDays);
  });

  it('на кнопке «Подождать» видно, что тратится счастье', () => {
    const { engine, rng, state } = makeSession(3);
    const wait = generateChoices(engine, rng).find((c) => c.isWait);
    const mood = wait.effects.find((e) => e.icon === BALANCE.meters.happiness.icon);
    assert.ok(mood, 'у ожидания должен быть эффект счастья');
    assert.equal(mood.delta, M.waitDelta);
    assert.equal(mood.good, false, 'расход счастья — невыгодно');
    assert.equal(state.tier, 1);
  });

  it('подряд ожидания складываются, но не ниже waitCap', () => {
    const { state, engine } = makeSession();
    for (let i = 0; i < 6; i += 1) engine.applyAction('wait');
    assert.equal(state.waitTotal(), M.waitCap, 'сумма ограничена');
  });

  it('ожидание снижает счастье на следующем дне и отпускает после срока', () => {
    const { state, engine } = makeSession();
    state.data.taxRateIndex = 2; // база 0
    engine.applyAction('wait');
    engine.advanceDay();
    assert.equal(state.happinessLevel, -1, 'на следующий день минус один');

    quietDay(state, engine);
    assert.equal(state.happinessLevel, -1, 'второй день ещё держится');

    quietDay(state, engine);
    assert.equal(state.happinessLevel, 0, 'потом отпускает');
  });
});

describe('лечение постройками', () => {
  it('таверна снимает ожидание при постройке', () => {
    const { state, engine } = makeSession();
    state.data.tier = 2;
    setup(state, { resources: { gold: 500, wood: 500, stone: 500, boards: 500 }, buildings: { houses: 5 } });
    engine.applyAction('wait');
    assert.ok(state.waitTotal() < 0);

    const result = engine.applyAction('build:taverns');
    assert.equal(result.ok, true);
    assert.equal(state.waitTotal(), 0, 'ожидание снято таверной');
    assert.match(result.note.text, /настроение исправлено/);
  });

  it('больница снимает болезнь, но не проклятие знамения', () => {
    const { state, engine } = makeSession();
    state.data.tier = 3;
    setup(state, { resources: { gold: 1000, books: 0 }, buildings: { houses: 5 } });
    state.addMood({ tag: 'epidemic', delta: -1, days: 3 });
    state.addMood({ tag: 'curse', delta: -1, days: 3 });

    engine.applyAction('build:hospital');

    const tags = state.data.moods.map((m) => m.tag);
    assert.ok(!tags.includes('epidemic'), 'болезнь вылечена');
    assert.ok(tags.includes('curse'), 'проклятие не вылечено постройкой');
  });
});

describe('мгновенные события переходят в модификаторы', () => {
  it('штраф от мгновенного события истекает, а не висит навсегда', () => {
    const { state, engine } = makeSession();
    state.data.taxRateIndex = 2;
    state.addMood({ tag: 'epidemic', delta: -1, days: BALANCE.happiness.moods.eventDays });

    for (let i = 0; i < BALANCE.happiness.moods.eventDays; i += 1) quietDay(state, engine);
    assert.equal(state.moodSum(), 0);
  });
});

describe('события с выбором', () => {
  it('выпадают редко: доля дней заметно меньше шанса мгновенных событий', () => {
    let days = 0;
    const SAMPLE = 400;
    for (let seed = 1; seed <= SAMPLE; seed += 1) {
      const { state, engine } = makeSession(seed);
      setup(state, { resources: { wood: 0, stone: 1000, food: 1000, gold: 1000 }, buildings: { houses: 10 } });
      engine.advanceDay();
      if (state.data.pending) days += 1;
    }
    const share = days / SAMPLE;
    assert.ok(days > 0, 'событие с выбором хотя бы иногда выпадает');
    assert.ok(share < 0.15, `событие с выбором в ${(share * 100).toFixed(1)}% дней`);
  });

  it('пока событие ждёт ответа, обычные выборы недоступны', () => {
    const { state, engine, rng } = makeSession(3);
    state.data.pending = { id: 'festival_offer' };
    state.data.popup = null;

    const choices = generateChoices(engine, rng);
    assert.ok(choices.every((c) => c.group === 'event'), 'только варианты события');
    assert.ok(!choices.some((c) => c.isWait), 'ожидания нет');
    assert.equal(engine.applyAction('wait').ok, false, 'действие отклонено');
  });

  it('вариант списывает стоимость и накладывает модификатор', () => {
    const { state, engine } = makeSession(4);
    state.setResource('gold', 100);
    state.data.pending = { id: 'festival_offer' };
    state.data.popup = null;

    const result = engine.applyAction('event:0'); // «Купить бочку» за 40 золота
    assert.equal(result.ok, true);
    assert.equal(state.resource('gold'), 60);
    assert.equal(state.data.pending, null, 'событие закрыто');
    assert.ok(state.data.moods.some((m) => m.tag === 'festival' && m.delta === 1));
  });

  it('у каждого события есть вариант без стоимости: нельзя застрять без ответа', () => {
    for (const [id, def] of Object.entries(BALANCE.events.choice.pool)) {
      const free = def.options.some((option) => !option.cost || Object.keys(option.cost).length === 0);
      assert.ok(free, `${id}: нет варианта без стоимости — игрок может застрять`);
    }
  });

  it('вариант без денег отклоняется и событие остаётся открытым', () => {
    const { state, engine } = makeSession(5);
    state.setResource('gold', 0);
    state.data.pending = { id: 'festival_offer' };
    state.data.popup = null;

    assert.equal(engine.applyAction('event:0').ok, false);
    assert.deepEqual(state.data.pending, { id: 'festival_offer' });
  });

  it('вариант с потерями забирает сколько есть и не блокирует выбор', () => {
    const { state, engine } = makeSession(6);
    state.setResource('wood', 10);
    state.data.pending = { id: 'fire' };
    state.data.popup = null;

    assert.equal(engine.applyAction('event:2').ok, true, '«Ничего не делать» доступно без дерева');
    assert.equal(state.resource('wood'), 0, 'забрано всё, что было');
  });

  it('событие открывает попап, после закрытия выборы — варианты события', () => {
    let opened = null;
    for (let seed = 1; seed <= 400 && !opened; seed += 1) {
      const { state, engine } = makeSession(seed);
      // Дерево не даёт переходу на тир: попап перехода блокировал бы событие
      setup(state, { resources: { wood: 0, stone: 1000, food: 1000, gold: 1000 }, buildings: { houses: 10 } });
      engine.advanceDay();
      if (state.data.pending) opened = { state, engine };
    }
    assert.ok(opened, 'событие должно выпасть хотя бы раз');
    assert.equal(opened.state.data.popup?.kind, 'event');
  });
});

describe('порог бунта', () => {
  it('счастье на −2 одного дня ещё не поражение', () => {
    const { state, engine } = makeSession();
    state.data.taxRateIndex = 4; // база −2
    setup(state, { resources: { population: 20, food: 1000 }, buildings: { farms: 2 } });
    engine.advanceDay();
    assert.equal(state.isOver, false, 'одного дня мало');
    assert.equal(state.data.lowMoodDays, 1);
  });

  it('три дня подряд на −2 — поражение', () => {
    const { state, engine } = makeSession();
    state.data.taxRateIndex = 4;
    // 40 жителей: отток 5 в день, но к третьему дню их ещё больше 6
    setup(state, { resources: { population: 40, food: 100000 }, buildings: { farms: 2 } });
    for (let i = 0; i < 3 && !state.isOver; i += 1) {
      state.data.pending = null;
      state.data.popup = null;
      engine.advanceDay();
    }
    assert.equal(state.status, 'lost');
    assert.match(state.data.endReason, /восстал/);
  });
});

describe('сохранение модификаторов', () => {
  it('модификаторы и ожидающее событие переживают сохранение', () => {
    const { state } = makeSession();
    state.addMood({ tag: 'wait', delta: -1, days: 2 });
    state.data.pending = { id: 'festival_offer' };

    const restored = GameState.restore(JSON.parse(JSON.stringify(state.serialize())));
    assert.equal(restored.waitTotal(), -1);
    assert.deepEqual(restored.data.pending, { id: 'festival_offer' });
  });

  it('испорченные модификаторы отбрасываются, а не ломают партию', () => {
    const raw = JSON.parse(JSON.stringify(createInitialState()));
    raw.moods = [{ tag: 'wait', delta: 'много', daysLeft: 2 }, null, { tag: 'joy', delta: 1, daysLeft: 0 }];
    const restored = GameState.restore(raw);
    assert.deepEqual(restored.data.moods, []);
  });
});
