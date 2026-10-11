// ============================================================================
// choices-ui.js — кнопки выбора.
//
// Создаются один раз и переиспользуются: на каждом ходу меняются только
// текст, иконка и состояние disabled. Пересоздавать кнопки было бы заметно
// дороже на слабых телефонах.
// ============================================================================

import { el, h } from './dom.js';

export class ChoicesPanel {
  constructor(root, onSelect) {
    this.root = root;
    this.onSelect = onSelect;
    this.buttons = [];
    this.current = [];
    this.locked = false;

    for (let i = 0; i < 4; i += 1) {
      const icon = h('span', { class: 'choice__icon' });
      const text = h('span', { class: 'choice__text' });
      const cost = h('span', { class: 'choice__cost' });
      const body = h('span', { class: 'choice__body' });
      body.append(text, cost);

      const button = h('button', {
        class: 'choice',
        attrs: { type: 'button' },
      });
      button.append(h('span', { class: 'choice__key', text: String(i + 1) }), icon, body);

      button.addEventListener('click', () => {
        if (this.locked || button.disabled) return;
        this.onSelect(this.current[i]);
      });

      this.buttons.push({ button, icon, text, cost });
      this.root.append(button);
    }
  }

  render(choices) {
    this.current = choices;

    for (let i = 0; i < this.buttons.length; i += 1) {
      const { button, icon, text, cost } = this.buttons[i];
      const choice = choices[i];

      if (!choice) {
        button.hidden = true;
        continue;
      }

      button.hidden = false;
      button.disabled = !choice.affordable || this.locked;
      button.classList.toggle('choice--wait', Boolean(choice.isWait));
      // textContent, а не innerHTML: сюда попадает игровой текст
      icon.textContent = choice.icon;
      text.textContent = choice.label;
      cost.textContent = choice.affordable
        ? choice.costText
        : choice.costText ? `не хватает: ${choice.costText}` : '';
    }
  }

  setLocked(locked) {
    this.locked = locked;
    for (const { button, } of this.buttons) {
      button.disabled = locked || !this.current[0];
    }
    if (!locked) this.render(this.current);
  }
}