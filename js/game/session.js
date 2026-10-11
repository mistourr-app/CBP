// ============================================================================
// Session — связывает состояние, генератор, движок и хронику в одну партию.
//
// Это единственный объект, которым пользуется интерфейс. Здесь же
// сохранение и загрузка, чтобы остальные слои не знали про localStorage.
// ============================================================================

import { BALANCE } from '../balance.js';
import { EventBus, EVENTS } from '../core/bus.js';
import { Rng } from '../core/rng.js';
import { Save } from '../core/save.js';
import { generateChoices } from './choices.js';
import { Engine } from './engine.js';
import { createInitialState, GameState } from './state.js';

export class Session {
  constructor() {
    this.bus = new EventBus();
    this.rng = new Rng(pickSeed());
    this.state = new GameState(createInitialState());
    this.engine = new Engine(this.state, this.rng, this.bus);
    this.choices = [];

    this.chronicle.add(this.state, {
      kind: 'start',
      icon: '🏙️',
      text: `Основано поселение «${BALANCE.city.defaultName}»`,
    });
  }

  get chronicle() {
    return this.engine.chronicle;
  }

  /** Текущие четыре варианта действий. */
  refreshChoices() {
    this.choices = generateChoices(this.engine, this.rng);
    this.bus.emit(EVENTS.CHOICES_CHANGED, this.choices);
    return this.choices;
  }

  /**
   * Игрок выбрал действие: применяем его, двигаем день, обновляем выборы.
   * @returns {{ok: boolean, note: object|null}}
   */
  takeTurn(actionId) {
    if (this.state.isOver) return { ok: false, note: null };

    const { ok, note } = this.engine.applyAction(actionId);

    if (ok) {
      if (note) this.chronicle.add(this.state, note);
      this.bus.emit(EVENTS.ACTION_RESOLVED, { actionId, note, ok });
      this.engine.advanceDay();
    }

    this.refreshChoices();
    this.save();
    this.bus.emit(EVENTS.STATE_CHANGED, this.state.data);

    return { ok, note };
  }

  save() {
    return Save.write({
      state: this.state.serialize(),
      chronicle: this.chronicle.serialize(),
      rng: this.rng.serialize(),
      // Список выборов сохраняем как он показан: пересборка после загрузки
      // тянула бы rng с другого места и меняла бы набор (налог то пропадал, то появлялся)
      choices: this.choices,
    });
  }

  /**
   * Загружает партию. Возвращает true, если сохранение найдено и применено.
   * Короткое сохранение после шага вперёд: покажем его игроку.
   */
  restore() {
    const saved = Save.read();
    if (!saved?.state) return false;

    const restored = GameState.restore(saved.state);
    if (!restored) return false;

    this.state = restored;
    this.rng = new Rng();
    if (saved.rng?.seed != null) this.rng.restore(saved.rng);

    this.engine = new Engine(this.state, this.rng, this.bus);
    this.chronicle.restore(saved.chronicle);

    // Показываем тот же список, что был до перезагрузки. Если его нет
    // (старое сохранение), собираем заново.
    if (Array.isArray(saved.choices) && saved.choices.length > 0) {
      this.choices = saved.choices;
      this.bus.emit(EVENTS.CHOICES_CHANGED, this.choices);
    } else {
      this.refreshChoices();
    }
    this.bus.emit(EVENTS.GAME_STARTED, { restored: true, state: this.state.data });
    this.bus.emit(EVENTS.STATE_CHANGED, this.state.data);
    return true;
  }

  /** Новая партия с нуля. */
  restart() {
    Save.clear();

    this.rng = new Rng(pickSeed());
    this.state.reset();
    this.engine = new Engine(this.state, this.rng, this.bus);
    this.chronicle.restore([]);

    this.chronicle.add(this.state, {
      kind: 'start',
      icon: '🏙️',
      text: `Основано поселение «${BALANCE.city.defaultName}»`,
    });

    this.refreshChoices();
    this.save();
    this.bus.emit(EVENTS.GAME_RESET, { state: this.state.data });
    this.bus.emit(EVENTS.STATE_CHANGED, this.state.data);
    return this;
  }
}

function pickSeed() {
  // Сид сохраняется вместе с партией, поэтому одинаковые сиды дают
  // одинаковые партии — это нужно симуляциям и тестам
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}