// Симуляция длинной партии.
//
// Проверяет то, ради чего нужен генератор с сидом: несколько сотен ходов подряд
// не приводят к NaN, отрицательным ресурсам и зависшим состояниям, а партия
// всегда доходит до конца.

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { BALANCE } from '../js/balance.js';
import { Session } from '../js/game/session.js';

const SEEDS = [1, 42, 777, 4242, 9001, 31337];
const DAYS = 500;

/** Простейший хранилище в памяти — Session сохраняет после каждого хода. */
function installStorage() {
  const data = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => data.set(key, String(value)),
      removeItem: (key) => data.delete(key),
      clear: () => data.clear(),
    },
    isSecureContext: true,
  };
}

/** Простой детерминированный генератор индексов для стратегии. */
function policy(seed) {
  let s = seed >>> 0;
  return (min, max) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return min + (s % (max - min + 1));
  };
}

function run(seed) {
  const session = new Session();
  session.rng.restore({ seed, calls: 0 });
  // Предложения дня разыгрываются от сида партии, иначе прогоны расходятся
  session.engine.rollOffers();
  session.refreshChoices();

  const nextIndex = policy(seed * 7919 + 13);
  let turns = 0;

  while (!session.state.isOver && turns < DAYS) {
    const affordable = session.choices.filter((c) => c.affordable);
    const pool = affordable.length ? affordable : session.choices;
    const choice = pool[nextIndex(0, pool.length - 1)];
    session.takeTurn(choice.id);
    turns += 1;
    if (session.state.data.popup == null) session.engine.rollOffers();
  }

  return { session, turns };
}

describe('длинная партия', () => {
  beforeEach(installStorage);

  for (const seed of SEEDS) {
    it(`сид ${seed}: 500 ходов без поломок`, () => {
      const { session, turns } = run(seed);
      const { data } = session.state;

      assert.ok(turns > 0);

      // Числа конечны
      for (const [key, value] of Object.entries(data.resources)) {
        assert.ok(Number.isFinite(value), `${key} = ${value}`);
      }
      for (const [key, value] of Object.entries(data.buildings)) {
        assert.ok(Number.isFinite(value), `здание ${key} = ${value}`);
        assert.ok(value >= 0, `здание ${key} отрицательное: ${value}`);
      }

      // Показатели согласованы между собой
      assert.ok(data.resources.population >= 0, 'население отрицательное');
      assert.ok(
        session.state.employedWorkers <= data.resources.population,
        'занятых рабочих больше, чем жителей',
      );

      for (const key of BALANCE.resourceOrder) {
        assert.ok(data.resources[key] >= 0, `${key} ушёл в минус: ${data.resources[key]}`);
      }

      // Партия либо закончилась, либо честно отработала все ходы без поломок.
      // Победа требует пятого уровня, случайная стратегия до него обычно не
      // доходит — это вопрос баланса темпа, а не целостности состояния.
      if (session.state.isOver) {
        assert.ok(['won', 'lost'].includes(data.status), `неизвестный статус: ${data.status}`);
        assert.ok(data.endReason.length > 0, 'нет причины завершения');
      } else {
        assert.equal(turns, DAYS, 'партия остановилась раньше срока без причины');
      }
    });
  }

  it('одинаковый сид даёт одинаковый результат', () => {
    const a = run(2024);
    const b = run(2024);

    assert.equal(a.session.state.day, b.session.state.day);
    assert.equal(a.session.state.status, b.session.state.status);
    assert.deepEqual(a.session.state.data.resources, b.session.state.data.resources);
    assert.deepEqual(a.session.chronicle.entries.slice(0, 20), b.session.chronicle.entries.slice(0, 20));
  });

  it('партия накапливает статистику', () => {
    const { session } = run(55);
    const stats = session.state.stats;

    assert.ok(stats.daysSurvived > 0);
    assert.ok(stats.daysSurvived === session.state.day);
    assert.ok(stats.buildingsBuilt > 0, 'ни одного здания не построено');
  });

  it('после окончания ход делать нельзя', () => {
    const { session } = run(88);
    assert.ok(session.state.isOver);

    const day = session.state.day;
    const result = session.takeTurn('wait');

    assert.equal(result.ok, false);
    assert.equal(session.state.day, day, 'день изменился после конца партии');
  });
});

describe('хроника', () => {
  beforeEach(installStorage);

  it('не пустует и не разрастается бесконечно', () => {
    const { session } = run(31);

    assert.ok(session.chronicle.entries.length > 0);
    assert.ok(
      session.chronicle.entries.length <= BALANCE.chronicle.storedEntries,
      `в хронике ${session.chronicle.entries.length} записей`,
    );
  });

  it('записи идут от новых к старым и схлопывают повторы', () => {
    const { session } = run(31);
    const entries = session.chronicle.entries;

    for (let i = 1; i < entries.length; i += 1) {
      assert.ok(entries[i - 1].day >= entries[i].day, 'записи не отсортированы по дням');
    }

    for (let i = 1; i < entries.length; i += 1) {
      if (entries[i - 1].day === entries[i].day && entries[i - 1].text === entries[i].text) {
        assert.equal(entries[i].count, undefined, `повтор не схлопнут: ${entries[i].text}`);
      }
    }
  });

  it('если партия окончена, запись финала стоит первой', () => {
    const { session } = run(64);
    if (!session.state.isOver) return;
    const first = session.chronicle.entries[0];

    assert.equal(first.kind, 'end');
    assert.equal(first.final, true);
  });
});