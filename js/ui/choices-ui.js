// ============================================================================
// choices-ui.js - панель выборов.
//
// Четыре кнопки в матрице 2×2 (на телефоне тоже). Каждая кнопка: название,
// строка требований иконками (ресурсы, рабочие, шанс), эффекты стрелками.
// Слов «Построить» и текстов стоимости здесь нет: только иконки и числа.
// ============================================================================

import { BALANCE } from '../balance.js';
import { h } from './dom.js';
import { deltaChip } from './delta.js';

const SLOT_COUNT = 4;

export class ChoicesPanel {
  /**
   * @param {HTMLElement} root
   * @param {(choice: object) => void} onSelect
   * @param {{state: {resource(key: string): number}}} session  текущая партия: запасы для подсветки
   */
  constructor(root, onSelect, session) {
    this.root = root;
    this.onSelect = onSelect;
    // Берём партию из сессии при каждой отрисовке: restore() заменяет объект
    this.session = session;
    this.buttons = [];
    this.current = [];
    this.locked = false;

    for (let i = 0; i < SLOT_COUNT; i += 1) {
      const icon = h('span', { class: 'choice__icon' });
      const text = h('span', { class: 'choice__text' });
      const meta = h('span', { class: 'choice__meta' });
      const body = h('span', { class: 'choice__body' });
      body.append(text, meta);

      const button = h('button', {
        class: 'choice',
        attrs: { type: 'button' },
      });
      button.append(icon, body);

      button.addEventListener('click', () => {
        if (this.locked || button.disabled) return;
        this.onSelect(this.current[i]);
      });

      this.buttons.push({ button, icon, text, meta });
      this.root.append(button);
    }
  }

  render(choices) {
    this.current = choices;

    for (let i = 0; i < this.buttons.length; i += 1) {
      const { button, icon, text, meta } = this.buttons[i];
      const choice = choices[i];

      if (!choice) {
        button.hidden = true;
        continue;
      }

      button.hidden = false;
      button.disabled = this.locked || !choice.affordable;
      button.classList.toggle('choice--wait', Boolean(choice.isWait));

      // textContent, а не innerHTML: подписи приходят из данных игры
      icon.textContent = choice.icon;
      text.textContent = choice.label;
      meta.replaceChildren(...this.#metaNodes(choice));
    }
  }

  /**
   * Строка под названием: эффекты (если есть) либо требования иконками.
   * Эффекты и требования не смешиваются в одной кнопке.
   */
  #metaNodes(choice) {
    if (choice.effects?.length) {
      return choice.effects.map((effect) => deltaChip(effect));
    }

    // Цвет по смыслу: расход — красным, приход — зелёным, остальное нейтрально
    const nodes = [];

    for (const { resource, amount } of choice.requirements ?? []) {
      const def = BALANCE.resources[resource];
      const missing = this.session.state.resource(resource) < amount;
      nodes.push(figure(def.icon, `−${amount}`, 'cost', missing));
    }

    for (const [resource, amount] of Object.entries(choice.gain ?? {})) {
      if (!amount) continue;
      nodes.push(figure(BALANCE.resources[resource].icon, `+${amount}`, 'gain'));
    }

    if (choice.workers > 0) {
      nodes.push(figure(BALANCE.workers.icon, String(choice.workers), 'neutral'));
    }

    if (choice.chance != null) {
      nodes.push(figure(BALANCE.economy.expedition.chanceIcon,
        `${Math.round(choice.chance * 100)}%`, 'neutral'));
    }

    return nodes;
  }

  /**
   * Блокировка на время хода или попапа. Пересчитывает кнопки, чтобы
   * состояние disabled сразу совпало с блокировкой.
   */
  setLocked(locked) {
    this.locked = locked;
    this.render(this.current);
  }
}

/** Одна цифра с иконкой. tone: cost | gain | neutral (см. CSS .fig--*). */
function figure(icon, value, tone, missing = false) {
  return h('span', {
    class: `fig fig--${tone}${missing ? ' fig--missing' : ''}`,
    text: `${icon} ${value}`,
  });
}
