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
      // Две отдельные строки: эффекты (зачем) и требования (чего стоит)
      const effects = h('span', { class: 'choice__effects' });
      const reqs = h('span', { class: 'choice__meta choice__reqs' });
      const body = h('span', { class: 'choice__body' });
      body.append(text, effects, reqs);

      const button = h('button', {
        class: 'choice',
        attrs: { type: 'button' },
      });
      button.append(icon, body);

      button.addEventListener('click', () => {
        if (this.locked || button.disabled) return;
        this.onSelect(this.current[i]);
      });

      this.buttons.push({ button, icon, text, effects, reqs });
      this.root.append(button);
    }
  }

  render(choices) {
    this.current = choices;

    for (let i = 0; i < this.buttons.length; i += 1) {
      const { button, icon, text, effects, reqs } = this.buttons[i];
      const choice = choices[i];

      if (!choice) {
        button.hidden = true;
        continue;
      }

      button.hidden = false;
      button.disabled = this.locked || !choice.affordable;
      // Не хватает ресурсов: фон всей кнопки краснеет (цифры читаются поверх).
      // «Подождать» оформляется как все выборы, поэтому не исключается.
      button.classList.toggle('choice--short', !choice.affordable);

      // textContent, а не innerHTML: подписи приходят из данных игры
      icon.textContent = choice.icon;
      text.textContent = choice.label;
      effects.replaceChildren(...(choice.effects ?? []).map((effect) => deltaChip(effect)));
      reqs.replaceChildren(...this.#requirementNodes(choice));
    }
  }

  /**
   * Строка требований: ресурсы, рабочие, шанс. Эффекты выводятся отдельно.
   * Цвет по смыслу: расход — красным, приход — зелёным, остальное нейтрально.
   */
  #requirementNodes(choice) {
    const nodes = [];

    for (const { resource, amount } of choice.requirements ?? []) {
      const def = BALANCE.resources[resource];
      const missing = this.session.state.resource(resource) < amount;
      nodes.push(figure(def.icon, String(amount), 'cost', missing));
    }

    for (const [resource, amount] of Object.entries(choice.gain ?? {})) {
      if (!amount) continue;
      nodes.push(figure(BALANCE.resources[resource].icon, `+${amount}`, 'gain'));
    }

    if (choice.workers > 0) {
      // Рабочие берутся из общего населения, поэтому расход — красным
      nodes.push(figure(BALANCE.workers.icon, String(choice.workers), 'cost'));
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
