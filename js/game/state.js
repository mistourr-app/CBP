// ============================================================================
// GameState — чистая модель партии.
//
// Не содержит логики и не знает про DOM: только данные и сериализация.
// Все расчёты живут в economy.js, порядок действий — в engine.js.
// ============================================================================

import { BALANCE, BUILDING_KEYS, WORKFORCE_BUILDINGS } from '../balance.js';
import { isOperating } from './economy.js';

const SCHEMA = BALANCE.meta.schema;
const TIER_MIN = 1;
const TIER_MAX = BALANCE.development.levels.length;

function emptyBuildings() {
  return Object.fromEntries(BUILDING_KEYS.map((key) => [key, 0]));
}

function emptyWorkers() {
  return Object.fromEntries(WORKFORCE_BUILDINGS.map((key) => [key, 0]));
}

function emptyTechnologies() {
  return Object.fromEntries(Object.keys(BALANCE.technologies).map((key) => [key, false]));
}

function startResources() {
  return Object.fromEntries(Object.keys(BALANCE.resources).map((key) => [key, 0]));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Уровень счастья всегда в пределах [-2, +2]. */
function clampHappiness(level) {
  const [min, max] = BALANCE.happiness.range;
  return clamp(Math.round(level ?? 0), min, max);
}

/**
 * Приводит состояние к согласованному виду.
 *
 * Работает с данными, а не с классом: восстановление из сохранения
 * применяет её ещё до создания экземпляра.
 *
 * События вроде осады вычитали жителей без нижней границы, из-за чего
 * население уходило в минус.
 */
/** Оставляет только корректные модификаторы: тег, число и срок в днях. */
function sanitizeMoods(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => m && typeof m.tag === 'string' && Number.isFinite(m.delta) && Number.isFinite(m.daysLeft))
    .map((m) => ({ tag: m.tag, delta: Math.round(m.delta), daysLeft: Math.floor(m.daysLeft) }))
    .filter((m) => m.daysLeft > 0 && m.delta !== 0);
}

function normalizeState(data) {
  const r = data.resources;

  r.population = Math.max(0, Math.floor(r.population));
  data.happiness = clampHappiness(data.happiness);
  data.taxRateIndex = clamp(data.taxRateIndex, 0, BALANCE.taxes.length - 1);

  for (const [key, value] of Object.entries(r)) {
    if (typeof value !== 'number' || Number.isNaN(value)) r[key] = 0;
  }

  data.tier = clamp(Math.floor(data.tier ?? TIER_MIN), TIER_MIN, TIER_MAX);
  data.moods = sanitizeMoods(data.moods);
  data.lowMoodDays = Math.max(0, Math.floor(data.lowMoodDays ?? 0));
  data.pending = data.pending && typeof data.pending.id === 'string' ? data.pending : null;

  // Рабочие стоят только на действующих зданиях: прошлые уровни освобождаются
  for (const key of WORKFORCE_BUILDINGS) {
    const active = isOperating(BALANCE.buildings[key], data.tier);
    data.workers[key] = active ? Math.max(0, data.workers[key] ?? 0) : 0;
  }

  // Занятость не может превышать население
  let excess = 0;
  for (const key of WORKFORCE_BUILDINGS) excess += data.workers[key];
  excess -= r.population;

  if (excess > 0) {
    for (const key of [...WORKFORCE_BUILDINGS].reverse()) {
      const take = Math.min(excess, data.workers[key]);
      data.workers[key] -= take;
      excess -= take;
    }
  }

  return data;
}

export function createInitialState() {
  const resources = { ...startResources(), ...BALANCE.start.resources };

  return {
    schema: SCHEMA,
    cityName: BALANCE.city.defaultName,

    day: BALANCE.start.day,
    year: BALANCE.start.year,
    seasonIndex: BALANCE.start.seasonIndex,

    /** Уровень поселения: 1 — Поселение … 5 — Большой город. */
    tier: BALANCE.start.tier,

    resources,
    buildings: { ...emptyBuildings(), ...BALANCE.start.buildings },
    workers: emptyWorkers(),
    technologies: emptyTechnologies(),

    /** Индекс ставки налога в BALANCE.taxes. Политика, а не действие дня. */
    taxRateIndex: BALANCE.taxDefaultIndex,

    /** Уровень счастья: от -2 до +2. Пересчитывается каждый день. */
    happiness: BALANCE.happiness.start,

    /**
     * Предложения на сегодня: случайная ставка налога (на день налогов)
     * и случайный шанс экспедиции. Выбираются в конце дня, чтобы выбор
     * на экране совпадал с расчётом эффекта.
     */
    offers: { taxIndex: null, expeditionChance: null },

    /** Попап, который ждёт закрытия (переход на тир и т.п.). Выборы заблокированы. */
    popup: null,

    /** Активные модификаторы счастья: [{tag, delta, daysLeft}]. Живут между днями. */
    moods: [],

    /** Сколько дней подряд счастье на −2 (для проверки бунта). */
    lowMoodDays: 0,

    /** Событие с выбором, которое ждёт ответа: {id} либо null. */
    pending: null,

    status: 'running', // running | won | lost
    endReason: '',
    endIcon: '',

    stats: {
      totalGoldEarned: 0,
      totalFoodConsumed: 0,
      buildingsBuilt: 0,
      technologiesResearched: 0,
      tradesCompleted: 0,
      expeditionsSent: 0,
      randomEvents: 0,
      citizensArrived: 0,
      citizensLost: 0,
      daysSurvived: 0,
    },
  };
}

export class GameState {
  constructor(state = createInitialState()) {
    this.data = state;
  }

  // -- доступ ----------------------------------------------------------------

  get day() { return this.data.day; }
  get year() { return this.data.year; }
  get seasonIndex() { return this.data.seasonIndex; }
  get season() { return BALANCE.seasons[this.data.seasonIndex]; }
  get cityName() { return this.data.cityName; }
  get status() { return this.data.status; }
  get isOver() { return this.data.status !== 'running'; }
  get buildings() { return this.data.buildings; }
  get workers() { return this.data.workers; }
  get technologies() { return this.data.technologies; }
  get stats() { return this.data.stats; }
  get tier() { return this.data.tier; }

  /** Описание текущего уровня поселения из balance. */
  get tierDef() { return BALANCE.development.levels[this.data.tier - 1]; }

  resource(key) { return this.data.resources[key] ?? 0; }
  get population() { return this.data.resources.population; }
  get happiness() { return this.data.happiness; }

  /** Индекс действующей ставки налога. */
  get taxRateIndex() {
    return this.data.taxRateIndex;
  }

  /** Действующая ставка налога: объект из BALANCE.taxes. */
  get taxRate() {
    return BALANCE.taxes[this.data.taxRateIndex] ?? BALANCE.taxes[BALANCE.taxDefaultIndex];
  }

  /** Уровень счастья: от -2 до +2. */
  get happinessLevel() {
    return clampHappiness(this.data.happiness);
  }

  buildingCount(key) { return this.data.buildings[key] ?? 0; }
  workerCount(key) { return this.data.workers[key] ?? 0; }
  hasTechnology(key) { return Boolean(this.data.technologies[key]); }

  // -- рабочая сила ----------------------------------------------------------

  get employedWorkers() {
    return WORKFORCE_BUILDINGS.reduce((sum, key) => sum + this.workerCount(key), 0);
  }

  get freeWorkers() {
    return Math.max(0, this.population - this.employedWorkers);
  }

  /** Ёмкость рабочих: только у зданий, которые работают на текущем уровне. */
  workerCapacity(key) {
    const def = BALANCE.buildings[key];
    if (!def?.workers) return 0;
    if (!isOperating(def, this.tier)) return 0;
    return this.buildingCount(key) * def.workers;
  }

  // -- изменения -------------------------------------------------------------

  addResource(key, amount) {
    this.data.resources[key] = (this.data.resources[key] ?? 0) + amount;
  }

  addBuilding(key, amount = 1) {
    this.data.buildings[key] = (this.data.buildings[key] ?? 0) + amount;
  }

  setResource(key, value) {
    this.data.resources[key] = value;
  }

  clampHappiness() {
    this.data.happiness = clampHappiness(this.data.happiness);
  }

  /** Выставляет уровень счастья с ограничением по краям. */
  setHappiness(level) {
    this.data.happiness = clampHappiness(level);
  }

  // -- сериализация ----------------------------------------------------------

  serialize() {
    return JSON.parse(JSON.stringify(this.data));
  }

  /**
   * Восстанавливает состояние из сохранения.
   * Возвращает false, если формат не подходит — вызывающий код начинает новую партию.
   */
  static restore(raw) {
    if (!raw || typeof raw !== 'object') return false;
    if (raw.schema !== SCHEMA) return false;
    if (typeof raw.day !== 'number' || !raw.resources) return false;

    const state = createInitialState();

    state.cityName = typeof raw.cityName === 'string' ? raw.cityName : state.cityName;
    state.day = raw.day;
    state.year = Number.isFinite(raw.year) ? raw.year : state.year;
    state.seasonIndex = Number.isFinite(raw.seasonIndex)
      ? ((raw.seasonIndex % BALANCE.seasons.length) + BALANCE.seasons.length) % BALANCE.seasons.length
      : state.seasonIndex;

    state.resources = { ...state.resources, ...raw.resources };
    state.buildings = { ...state.buildings, ...raw.buildings };
    state.workers = { ...state.workers, ...raw.workers };
    state.technologies = { ...state.technologies, ...raw.technologies };
    state.stats = { ...state.stats, ...raw.stats };

    state.status = ['running', 'won', 'lost'].includes(raw.status) ? raw.status : 'running';
    state.endReason = typeof raw.endReason === 'string' ? raw.endReason : '';
    state.endIcon = typeof raw.endIcon === 'string' ? raw.endIcon : '';

    state.tier = Number.isInteger(raw.tier) ? raw.tier : state.tier;
    state.offers = { ...state.offers, ...(raw.offers ?? {}) };
    state.popup = raw.popup && typeof raw.popup === 'object' ? raw.popup : null;
    state.moods = raw.moods;
    state.lowMoodDays = raw.lowMoodDays;
    state.pending = raw.pending;
    state.happiness = Number.isFinite(raw.happiness) ? raw.happiness : state.happiness;
    state.taxRateIndex = Number.isFinite(raw.taxRateIndex)
      ? raw.taxRateIndex
      : state.taxRateIndex;

    // Нормализация живёт на экземпляре, поэтому применяем её уже после
    // создания: на этапе восстановления ещё нет метода normalize
    return new GameState(normalizeState(state));
  }

  // -- модификаторы счастья --------------------------------------------------

  /** Сумма модификаторов, которая прибавляется к базе счастья. */
  moodSum() {
    return this.data.moods.reduce((sum, m) => sum + m.delta, 0);
  }

  /** Добавляет модификатор на days дней. */
  addMood({ tag, delta, days }) {
    if (!delta || days <= 0) return;
    this.data.moods.push({ tag, delta, daysLeft: days });
  }

  /** Сумма только ожиданий: нужна, чтобы не превысить waitCap. */
  waitTotal() {
    return this.data.moods
      .filter((m) => m.tag === BALANCE.happiness.moods.waitTag)
      .reduce((sum, m) => sum + m.delta, 0);
  }

  /** Конец дня для модификаторов: срок уменьшается, истёкшие удаляются. */
  tickMoods() {
    this.data.moods = this.data.moods
      .map((m) => ({ ...m, daysLeft: m.daysLeft - 1 }))
      .filter((m) => m.daysLeft > 0);
  }

  /** Постройка снимает модификаторы перечисленных тегов. Возвращает число снятых. */
  cureMoods(tags = []) {
    const before = this.data.moods.length;
    this.data.moods = this.data.moods.filter((m) => !tags.includes(m.tag));
    return before - this.data.moods.length;
  }

  reset() {
    this.data = createInitialState();
    return this;
  }

  /** Приводит показатели к согласованному виду. Возвращает себя. */
  normalize() {
    normalizeState(this.data);
    return this;
  }
}