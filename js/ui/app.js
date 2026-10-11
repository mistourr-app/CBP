// ============================================================================
// app.js — точка входа: собирает сессию, интерфейс и рендер, связывает их.
//
// Здесь нет игровой логики: только реакция на события сессии и передача
// команд игрока.
// ============================================================================

import { EVENTS } from '../core/bus.js';
import { Session } from '../game/session.js';
import { registerServiceWorker } from '../core/pwa.js';
import { startRender } from '../render/index.js';
import { ChroniclePanel } from './chronicle-ui.js';
import { ChoicesPanel } from './choices-ui.js';
import { PopupLayer } from './popup.js';
import { Screens } from './screens.js';
import { StatsPanel } from './stats.js';

class App {
  constructor() {
    this.session = new Session();
    this.screens = new Screens();
    this.stats = new StatsPanel(this.session);
    this.chronicle = new ChroniclePanel(this.session);
    this.choices = new ChoicesPanel(
      document.getElementById('choices'),
      (choice) => this.#takeTurn(choice.id),
      this.session,
    );
    this.popup = new PopupLayer(() => this.#closePopup());

    this.renderer = startRender({
      canvas: document.getElementById('bg-canvas'),
      session: this.session,
    });

    this.#subscribe();
    this.#bindKeyboard();
    this.#bindRestart();

    // Сначала пробуем продолжить партию; если сохранения нет — новая
    if (!this.session.restore()) {
      this.session.refreshChoices();
      this.session.save();
    }

    this.stats.update();
    this.chronicle.render();
    this.choices.render(this.session.choices);
    this.#syncPopup();

    if (this.session.state.isOver) this.screens.showOutcome(this.session.state.data);

    registerServiceWorker();
  }

  // --------------------------------------------------------------------------

  #subscribe() {
    const { bus } = this.session;

    bus.on(EVENTS.DAY_ADVANCED, () => {
      this.stats.update();
      this.chronicle.render();
      this.choices.render(this.session.choices);
      this.renderer?.onCityChanged();
      // Попап (например, переход на тир) блокирует выборы до закрытия
      this.#syncPopup();
    });

    bus.on(EVENTS.ACTION_RESOLVED, ({ note, ok }) => {
      if (!note) return;
      this.screens.showToast(note.text, this.#toneFor(note.kind, ok));
    });

    bus.on(EVENTS.GAME_ENDED, () => {
      this.choices.setLocked(true);
      this.screens.showOutcome(this.session.state.data);
    });
  }

  #toneFor(kind) {
    if (kind === 'disaster') return 'danger';
    if (kind === 'trade' || kind === 'build' || kind === 'research') return 'success';
    return '';
  }

  /**
   * Попап открыт — выборы заблокированы. Состояние берём из партии, а не из
   * попапа, поэтому и перезагрузка страницы показывает незакрытый попап.
   */
  #syncPopup() {
    const popup = this.session.state.data.popup;
    this.popup.show(popup);
    this.choices.setLocked(Boolean(popup));
  }

  #closePopup() {
    this.session.engine.dismissPopup();
    this.session.refreshChoices();
    this.#syncPopup();
    this.choices.render(this.session.choices);
  }

  #takeTurn(actionId) {
    if (this.session.state.isOver) return;

    // Блокировка на время хода: без неё быстрый второй клик успевает
    // начать ещё один день поверх только что начавшегося.
    // Снимается в подписке на DAY_ADVANCED или GAME_ENDED.
    this.choices.setLocked(true);

    const { ok } = this.session.takeTurn(actionId);

    // Действие не прошло — день не сдвинулся, событий не было,
    // поэтому разблокируем выборы вручную
    if (!ok) {
      if (!this.session.state.data.popup) this.screens.showToast('Недостаточно ресурсов', 'danger');
      this.#syncPopup();
    }
  }

  #bindKeyboard() {
    document.addEventListener('keydown', (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.activeElement?.tagName === 'INPUT') return;

      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index > 3) return;

      const choice = this.session.choices[index];
      if (!choice || !choice.affordable) return;

      event.preventDefault();
      this.#takeTurn(choice.id);
    });
  }

  #bindRestart() {
    const request = async () => {
      const confirmed = await this.screens.confirmRestart();
      if (!confirmed) return;

      this.session.restart();
      this.screens.hideOutcome();
      this.stats.update();
      this.chronicle.render();
      this.choices.setLocked(false);
      this.choices.render(this.session.choices);
      this.renderer?.onCityChanged();
      this.screens.showToast('Новая партия начата');
    };

    document.getElementById('restart-btn').addEventListener('click', request);
    this.screens.onOutcomeRestart(request);
  }
}

function boot() {
  try {
    window.app = new App();
  } catch (error) {
    console.error('Не удалось запустить игру', error);
    document.body.classList.add('fatal-error');
    showFatalError(error);
  }
}

function showFatalError(error) {
  const message = document.createElement('div');
  message.style.cssText =
    'position:fixed;inset:0;z-index:99;display:grid;place-items:center;padding:24px;' +
    'background:#070b1c;color:#eef2ff;font:16px/1.5 system-ui,sans-serif;text-align:center';
  message.textContent = `Не удалось запустить игру: ${error?.message ?? error}`;
  document.body.append(message);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}