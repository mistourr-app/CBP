// Сохранение партии: версия схемы, отбраковка старых и повреждённых данных.

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { BALANCE } from '../js/balance.js';
import { Rng } from '../js/core/rng.js';
import { createInitialState, GameState } from '../js/game/state.js';
import { makeSession, setup } from './helpers.js';

// Минимальный localStorage: модуль сохранения работает через window,
// которого в Node нет
function installStorage() {
  const data = new Map();
  const storage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
    get length() { return data.size; },
  };

  globalThis.window = { localStorage: storage, isSecureContext: true };
  return storage;
}

const KEY = 'cbp.save.v6';
const LEGACY_KEYS = ['cbp.save.v5', 'cbp.save.v4', 'cbp.save.v3', 'cbp.save.v2', 'cityBuilderSave'];

describe('формат сохранения', () => {
  let Save;

  beforeEach(async () => {
    const storage = installStorage();
    globalThis.__testStorage = storage;
    // модуль читает localStorage при вызове, поэтому импортируем один раз
    Save ??= (await import('../js/core/save.js')).Save;
    storage.clear();
  });

  it('сохраняет и читает состояние', () => {
    const { state } = makeSession();
    setup(state, { resources: { gold: 777 } });

    assert.equal(Save.write({ state: state.serialize() }), true);
    const restored = Save.read();

    assert.equal(restored.state.resources.gold, 777);
  });

  it('старое сохранение не подхватывается и вычищается', () => {
    const storage = globalThis.__testStorage;
    const oldKey = LEGACY_KEYS[0];
    storage.setItem(oldKey, JSON.stringify({ schema: BALANCE.meta.schema - 1, state: {} }));

    // Ключ сменился вместе с форматом, поэтому новое сохранение не видно,
    // а старое не мешает — его убирает clear при старте партии
    assert.equal(Save.read(), null);

    Save.clear();
    assert.equal(storage.getItem(oldKey), null, 'старое сохранение не удалено');
  });

  it('отбрасывает сохранение другой версии схемы', () => {
    const storage = globalThis.__testStorage;
    storage.setItem(KEY, JSON.stringify({ schema: BALANCE.meta.schema - 1, state: {} }));

    assert.equal(Save.read(), null);
    assert.equal(storage.getItem(KEY), null, 'старое сохранение не удалено');
  });

  it('отбрасывает повреждённые данные', () => {
    const storage = globalThis.__testStorage;
    storage.setItem(KEY, '{ это не json');

    assert.equal(Save.read(), null);
    assert.equal(storage.getItem(KEY), null);
  });

  it('clear удаляет и текущий, и старые ключи', () => {
    const storage = globalThis.__testStorage;
    storage.setItem(KEY, '{}');
    for (const key of LEGACY_KEYS) storage.setItem(key, '{}');

    Save.clear();

    assert.equal(storage.getItem(KEY), null);
    for (const key of LEGACY_KEYS) {
      assert.equal(storage.getItem(key), null, `ключ ${key} не удалён`);
    }
  });

  it('возвращает null, если сохранения нет', () => {
    assert.equal(Save.read(), null);
  });
});

describe('восстановление состояния', () => {
  it('отвергает состояние без версии схемы', () => {
    assert.equal(GameState.restore({ day: 5, resources: {} }), false);
  });

  it('отвергает состояние с чужой версией схемы', () => {
    const state = createInitialState();
    state.schema = BALANCE.meta.schema + 1;
    assert.equal(GameState.restore(state), false);
  });

  it('отвергает мусор', () => {
    assert.equal(GameState.restore(null), false);
    assert.equal(GameState.restore('строка'), false);
    assert.equal(GameState.restore({}), false);
  });

  it('восстанавливает корректное состояние', () => {
    const original = makeSession().state;
    setup(original, { resources: { gold: 500, food: 12 } });
    original.data.day = 40;
    original.data.cityName = 'Заря';

    const restored = GameState.restore(original.serialize());

    assert.ok(restored);
    assert.equal(restored.day, 40);
    assert.equal(restored.cityName, 'Заря');
    assert.equal(restored.resource('gold'), 500);
  });

  it('обрезает занятость, превышающую население', () => {
    const raw = createInitialState();
    raw.resources.population = 3;
    raw.workers = { farms: 5, lumberMills: 4, quarries: 2, markets: 0, temples: 0, schools: 0 };

    const restored = GameState.restore(raw);

    assert.ok(restored.employedWorkers <= 3, `занято ${restored.employedWorkers}`);
  });

  it('держит счастье в допустимых пределах', () => {
    const raw = createInitialState();
    raw.happiness = 99;

    assert.equal(GameState.restore(raw).happiness, BALANCE.happiness.range[1]);

    raw.happiness = -99;
    assert.equal(GameState.restore(raw).happiness, BALANCE.happiness.range[0]);
  });

  it('восстанавливает ставку налога и приводит её к допустимой', () => {
    const raw = createInitialState();
    raw.taxRateIndex = 3;
    assert.equal(GameState.restore(raw).taxRateIndex, 3);

    raw.taxRateIndex = 99;
    assert.equal(GameState.restore(raw).taxRateIndex, BALANCE.taxes.length - 1);

    raw.taxRateIndex = -5;
    assert.equal(GameState.restore(raw).taxRateIndex, 0);
  });

  it('оставляет ставку по умолчанию, если поле потерялось', () => {
    const raw = createInitialState();
    delete raw.taxRateIndex;

    assert.equal(GameState.restore(raw).taxRateIndex, BALANCE.taxDefaultIndex);
  });

  it('переживает отсутствие поля статистики', () => {
    const raw = createInitialState();
    delete raw.stats;

    const restored = GameState.restore(raw);

    assert.ok(restored);
    assert.equal(restored.stats.buildingsBuilt, 0);
  });
});

describe('генератор с сидом', () => {
  it('одинаковый сид даёт одинаковую последовательность', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);

    const first = Array.from({ length: 20 }, () => a.float());
    const second = Array.from({ length: 20 }, () => b.float());

    assert.deepEqual(first, second);
  });

  it('разные сиды дают разные последовательности', () => {
    const a = Array.from({ length: 20 }, (() => { const r = new Rng(1); return () => r.float(); })());
    const b = (() => { const r = new Rng(2); return Array.from({ length: 20 }, () => r.float()); })();

    assert.notDeepEqual(a, b);
  });

  it('восстанавливает позицию после числа вызовов', () => {
    const rng = new Rng(999);
    for (let i = 0; i < 37; i += 1) rng.float();
    const expected = [rng.float(), rng.float(), rng.float()];

    const copy = new Rng(999);
    for (let i = 0; i < 37; i += 1) copy.float();

    assert.deepEqual([copy.float(), copy.float(), copy.float()], expected);
  });

  it('int попадает в заданный диапазон', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.int(3, 7);
      assert.ok(value >= 3 && value <= 7 && Number.isInteger(value), String(value));
    }
  });

  it('pickWeighted уважает веса', () => {
    const rng = new Rng(11);
    const items = [{ w: 0 }, { w: 1 }];
    const counts = { a: 0, b: 0 };

    for (let i = 0; i < 400; i += 1) {
      if (rng.pickWeighted(items).w === 0) counts.a += 1; else counts.b += 1;
    }

    assert.equal(counts.a, 0, 'элемент с нулевым весом выпал');
    assert.ok(counts.b > 350);
  });
});