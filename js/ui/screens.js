// ============================================================================
// screens.js — подтверждение сброса, всплывающие сообщения, экран итога.
// ============================================================================

import { BALANCE } from '../balance.js';
import { OUTCOME } from '../game/content.js';
import { el, formatNumber, h } from './dom.js';

const TOAST_MS = 2200;

export class Screens {
  constructor() {
    this.toast = el('#toast');
    this.toastTimer = 0;

    this.dialog = el('#confirm-dialog');
    this.confirmOk = el('#confirm-ok');
    this.confirmCancel = el('#confirm-cancel');

    this.outcome = el('#outcome-screen');
    this.outcomeIcon = el('#outcome-icon');
    this.outcomeTitle = el('#outcome-title');
    this.outcomeText = el('#outcome-text');
    this.outcomeSummary = el('#outcome-summary');
    this.outcomeRestart = el('#outcome-restart');

    // Esc закрывает диалог без применения
    this.dialog.addEventListener('cancel', (event) => event.preventDefault());
  }

  showToast(text, tone = '') {
    this.toast.textContent = text;
    this.toast.className = `is-visible ${tone ? `is-${tone}` : ''}`.trim();

    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.className = '';
    }, TOAST_MS);
  }

  /** Диалог подтверждения. Возвращает Promise<boolean>. */
  confirmRestart() {
    return new Promise((resolve) => {
      const finish = (answer) => {
        this.confirmOk.removeEventListener('click', onOk);
        this.confirmCancel.removeEventListener('click', onCancel);
        if (this.dialog.open) this.dialog.close();
        resolve(answer);
      };

      const onOk = () => finish(true);
      const onCancel = () => finish(false);

      this.confirmOk.addEventListener('click', onOk);
      this.confirmCancel.addEventListener('click', onCancel);

      // showModal поддерживается везде актуальном; запасной путь — обычный вызов
      if (typeof this.dialog.showModal === 'function') this.dialog.showModal();
      else resolve(window.confirm('Начать партию заново? Текущая партия будет стёрта.'));
    });
  }

  onOutcomeRestart(handler) {
    this.outcomeRestart.addEventListener('click', handler);
  }

  showOutcome(state) {
    const won = state.status === 'won';
    const def = won ? OUTCOME.won : OUTCOME.lost;

    this.outcome.className = `screen screen--${won ? 'won' : 'lost'}`;
    this.outcomeIcon.textContent = state.endIcon;
    this.outcomeTitle.textContent = def.title;
    this.outcomeText.textContent = state.endReason;
    this.outcomeRestart.textContent = def.action;

    this.outcomeSummary.replaceChildren(...this.#summaryRows(state));
    this.outcome.hidden = false;
    this.outcomeRestart.focus();
  }

  hideOutcome() {
    this.outcome.hidden = true;
  }

  #summaryRows(state) {
    const stats = state.stats;
    const buildings = Object.entries(state.buildings)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `${BALANCE.buildings[key].name} ${count}`)
      .join(', ');

    const rows = [
      ['Дней прожито', formatNumber(stats.daysSurvived)],
      ['Жителей', formatNumber(state.resources.population)],
      ['Построено зданий', formatNumber(stats.buildingsBuilt)],
      ['Вселилось жителей', formatNumber(stats.citizensArrived)],
      ['Событий пережито', formatNumber(stats.randomEvents)],
      ['Сделок заключено', formatNumber(stats.tradesCompleted)],
    ];

    if (buildings) rows.push(['Город', buildings]);

    return rows.map(([label, value]) => {
      const node = h('div', { class: 'summary__item' });
      node.append(
        h('span', { class: 'summary__label', text: label }),
        h('span', { class: 'summary__value', text: value }),
      );
      return node;
    });
  }
}