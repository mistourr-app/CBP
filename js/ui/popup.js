// ============================================================================
// popup.js - попап по центру экрана.
//
// Один слой на всё: переход на тир сейчас, случайные события позже. Попап
// закрывается только кнопкой. Пока он открыт, выборы заблокированы: этим
// управляет app.js по состоянию партии (state.popup), а не сам попап.
// ============================================================================

import { h } from './dom.js';

export class PopupLayer {
  /** @param {(popup: object) => void} onClose  вызывается при нажатии кнопки */
  constructor(onClose) {
    this.onClose = onClose;
    this.current = null;

    this.root = h('div', { class: 'popup', attrs: { hidden: '' } });
    this.card = h('div', { class: 'popup__card', attrs: { role: 'dialog', 'aria-modal': 'true' } });
    this.icon = h('div', { class: 'popup__icon' });
    this.text = h('p', { class: 'popup__text' });
    this.button = h('button', { class: 'popup__button', attrs: { type: 'button' } });

    this.button.addEventListener('click', () => {
      const popup = this.current;
      this.hide();
      this.onClose(popup);
    });

    this.card.append(this.icon, this.text, this.button);
    this.root.append(this.card);
    document.body.append(this.root);
  }

  /** Показать попап. Повторный вызов с тем же попапом ничего не меняет. */
  show(popup) {
    if (!popup) return this.hide();
    if (this.current === popup) return;

    this.current = popup;
    this.icon.textContent = popup.icon ?? '';
    this.text.textContent = popup.text ?? '';
    this.button.textContent = popup.button ?? 'Понятно';
    this.root.hidden = false;
    this.button.focus();
  }

  hide() {
    this.current = null;
    this.root.hidden = true;
  }

  get isOpen() {
    return !this.root.hidden;
  }
}
