// Список выборов после перезагрузки совпадает с тем, что был показан до неё.
// Иначе налог пропадает и появляется, а кнопка может показывать не ту ставку.

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { BALANCE } from '../js/balance.js';
import { Session } from '../js/game/session.js';

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

const percentOf = (label) => Number(label.match(/(\d+)%$/)[1]);

describe('восстановление выборов', () => {
  beforeEach(installStorage);

  it('после перезагрузки те же варианты в том же порядке', () => {
    const session = new Session();
    session.rng.restore({ seed: 77, calls: 0 });
    session.engine.rollOffers();
    session.refreshChoices();
    session.save();

    const before = session.choices.map((c) => c.id);
    const reloaded = new Session();
    reloaded.restore();

    assert.deepEqual(reloaded.choices.map((c) => c.id), before);
  });

  it('устаревшая кнопка налога не применяет другую ставку', () => {
    const session = new Session();
    session.rng.restore({ seed: 9, calls: 0 });
    session.engine.rollOffers();
    session.refreshChoices();

    // Кнопка показывает ставку 40% (индекс 3), а предложение уже другое
    const stale = 'tax:3';
    session.state.data.offers.taxIndex = 0;
    const before = session.state.taxRateIndex;

    const result = session.takeTurn(stale);

    assert.equal(result.ok, false, 'устаревшая кнопка должна быть отклонена');
    assert.equal(session.state.taxRateIndex, before, 'ставка не должна измениться');
  });

  it('ставка налога на кнопке совпадает с применённой', () => {
    const session = new Session();
    session.rng.restore({ seed: 5, calls: 0 });
    session.engine.rollOffers();
    session.refreshChoices();
    session.save();

    const reloaded = new Session();
    reloaded.restore();
    const tax = reloaded.choices.find((c) => c.group === 'tax');
    if (!tax) return; // налога в этот день нет — проверять нечего

    const shown = percentOf(tax.label);
    reloaded.takeTurn(tax.id);
    const applied = Math.round(BALANCE.taxes[reloaded.state.taxRateIndex].rate * 100);
    assert.equal(applied, shown);
  });
});
