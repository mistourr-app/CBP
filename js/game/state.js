// ============================================================================
// GameState — чистая модель партии.
//
// Не содержит логики и не знает про DOM: только данные и сериализация.
// Все расчёты живут в economy.js, порядок действий — в engine.js.
// ============================================================================

import { BALANCE, BUILDING_KEYS, WORKFORCE_BUILDINGS } from '../balance.js';

const SCHEMA = BALANCE.meta.schema;

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
  return { gold: 0, food: 0, wood: 0, stone: 0, faith: 0, knowledge: 0 };
}

export function createInitialState() {
  const resources = { ...startResources(), ...BALANCE.start.resources };

  return {
    schema: SCHEMA,
    cityName: BALANCE.city.defaultName,

    day: BALANCE.start.day,
    year: BALANCE.start.year,
    seasonIndex: BALANCE.start.seasonIndex,

    resources,
    buildings: { ...emptyBuildings(), ...BALANCE.start.buildings },
    workers: emptyWorkers(),
    technologies: emptyTechnologies(),

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

  resource(key) { return this.data.resources[key] ?? 0; }
  get population() { return this.data.resources.population; }
  get maxPopulation() { return this.data.resources.maxPopulation; }
  get happiness() { return this.data.resources.happiness; }

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

  workerCapacity(key) {
    const def = BALANCE.buildings[key];
    if (!def?.workers) return 0;
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
    const { min, max } = BALANCE.happiness;
    this.data.resources.happiness = Math.min(max, Math.max(min, this.data.resources.happiness));
  }

  /**
   * Приводит показатели к согласованному виду.
   *
   * События вроде осады вычитали жителей без нижней границы, из-за чего
   * население уходило в минус, а лимит населения мог остаться выше
   * фактического после разрушения домов. Вызывается в конце дня.
   */
  normalize() {
    const r = this.data.resources;

    r.population = Math.max(0, Math.floor(r.population));
    r.maxPopulation = Math.max(r.population, Math.floor(r.maxPopulation));
    r.happiness = Math.min(
      BALANCE.happiness.max,
      Math.max(BALANCE.happiness.min, r.happiness),
    );

    for (const [key, value] of Object.entries(r)) {
      if (typeof value !== 'number' || Number.isNaN(value)) r[key] = 0;
    }

    // Занятость не может превышать население, а население — лимит домов
    let excess = this.employedWorkers - r.population;
    if (excess > 0) {
      for (const key of [...WORKFORCE_BUILDINGS].reverse()) {
        const take = Math.min(excess, this.workers[key]);
        this.workers[key] -= take;
        excess -= take;
      }
    }
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

    // Согласованность: занятость не может превышать население
    for (const key of WORKFORCE_BUILDINGS) {
      state.workers[key] = Math.max(0, state.workers[key] ?? 0);
    }
    const employed = WORKFORCE_BUILDINGS.reduce((sum, key) => sum + state.workers[key], 0);
    if (employed > state.resources.population) {
      let excess = employed - state.resources.population;
      for (const key of WORKFORCE_BUILDINGS) {
        const take = Math.min(excess, state.workers[key]);
        state.workers[key] -= take;
        excess -= take;
      }
    }

    state.resources.happiness = Math.min(
      BALANCE.happiness.max,
      Math.max(BALANCE.happiness.min, state.resources.happiness),
    );

    return new GameState(state);
  }

  reset() {
    this.data = createInitialState();
    return this;
  }
}