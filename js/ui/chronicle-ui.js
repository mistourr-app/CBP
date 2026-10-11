// ============================================================================
// chronicle-ui.js — лента хроники.
//
// В прототипе список полностью перерисовывался через innerHTML = '' на каждом
// ходу. Здесь добавляются только новые узлы, а лишние удаляются.
// ============================================================================

import { BALANCE } from '../balance.js';
import { el, h } from './dom.js';

const MAX_NODES = BALANCE.chronicle.renderedEntries;

export class ChroniclePanel {
  constructor(session) {
    this.session = session;
    this.list = el('#chronicle');
    this.renderedCount = 0;
  }

  render() {
    const entries = this.session.chronicle.forDisplay(MAX_NODES);
    const list = this.list;

    // Убрать лишние узлы с конца
    while (list.children.length > entries.length) {
      list.lastElementChild.remove();
    }

    // Новые записи всегда появляются в начале — проще всего обновить голову
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const existing = list.children[i];

      if (!existing) {
        list.prepend(this.#createNode(entry, entries.length - i));
        continue;
      }

      if (existing.dataset.key !== keyOf(entry)) {
        existing.replaceWith(this.#createNode(entry, entries.length - i));
      } else {
        this.#updateCount(existing, entry, entries.length - i);
      }
    }

    this.renderedCount = entries.length;
    list.scrollTop = 0;
  }

  #createNode(entry, index) {
    const node = h('li', {
      class: `chronicle__item kind-${entry.kind}`,
      attrs: { 'data-key': keyOf(entry) },
    });

    const day = h('span', { class: 'chronicle__day', text: `д${entry.day}` });
    const text = h('span', { class: 'chronicle__text', text: `${entry.icon} ${entry.text}` });
    node.append(day, text);

    if (entry.count > 1) {
      text.append(this.#createCount(entry.count));
    }

    // Записи появляются по очереди, чтобы взгляд успевал за лентой
    node.style.animationDelay = index < 6 ? `${index * 30}ms` : '0ms';
    return node;
  }

  #updateCount(node, entry) {
    if (entry.count <= 1) return;
    const text = node.querySelector('.chronicle__text');
    const badge = text.querySelector('.chronicle__count');
    if (badge) badge.textContent = `×${entry.count}`;
    else text.append(this.#createCount(entry.count));
  }

  #createCount(count) {
    return h('span', { class: 'chronicle__count', text: `×${count}` });
  }
}

function keyOf(entry) {
  return `${entry.day}:${entry.kind}:${entry.text}`;
}