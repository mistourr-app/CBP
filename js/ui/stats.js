// ============================================================================
// stats.js — панель показателей и ресурсов.
//
// Показатели и ресурсы пересоздаются только при смене их набора: чаще всего
// меняются лишь числа, поэтому обновляются текстовые узлы, а не внутренняя
// структура. Это заметно дешевле полной перерисовки на телефоне.
// ============================================================================

import { BALANCE } from '../balance.js';
import { computeDaily } from '../game/economy.js';
import { el, formatDelta, formatNumber, h } from './dom.js';

const RESOURCE_COLORS = {
  gold: 'var(--c-res-gold)',
  food: 'var(--c-res-food)',
  wood: 'var(--c-res-wood)',
  stone: 'var(--c-res-stone)',
  faith: 'var(--c-res-faith)',
  knowledge: 'var(--c-res-knowledge)',
};

// Пороговые значения уровня предупреждения в панели ресурсов
const LOW_THRESHOLDS = {
  food: (state) => state.resource('food') < state.population * BALANCE.population.foodPerCitizenPerDay * 3,
  gold: (state) => state.resource('gold') < 10,
  wood: (state) => state.resource('wood') < 15,
  stone: (state) => state.resource('stone') < 15,
};

const HAPPINESS_WARN = 40;
const HAPPINESS_DANGER = 20;

export class StatsPanel {
  constructor(session) {
    this.session = session;
    this.cityName = el('#city-name');
    this.chipDay = el('#chip-day');
    this.chipSeason = el('#chip-season');
    this.metersRoot = el('#meters');
    this.resourcesRoot = el('#resources');

    this.meterNodes = new Map();
    this.resourceNodes = new Map();

    this.#buildMeters();
    this.#buildResources();
  }

  #buildMeters() {
    for (const [key, def] of Object.entries(BALANCE.meters)) {
      const value = h('span', { class: 'meter__value' });
      const label = h('span', { class: 'meter__label', text: def.name });

      const body = h('div', { class: 'meter__body' });
      body.append(label, value);

      let fill = null;
      if (key === 'happiness') {
        fill = h('span', { class: 'meter__fill' });
        const bar = h('span', { class: 'meter__bar' });
        bar.append(fill);
        body.append(bar);
      }

      const node = h('div', { class: `meter meter--${key}` });
      node.append(h('span', { class: 'meter__icon', text: def.icon }), body);

      this.meterNodes.set(key, { node, value, fill });
      this.metersRoot.append(node);
    }
  }

  #buildResources() {
    for (const key of BALANCE.resourceOrder) {
      const def = BALANCE.resources[key];

      const value = h('span', { class: 'res__value' });
      const delta = h('span', { class: 'res__delta' });
      const body = h('div', { class: 'res__body' });
      body.append(value, h('span', { class: 'res__name', text: def.name }));

      const node = h('div', {
        class: 'res',
        title: def.name,
        style: { '--res-color': RESOURCE_COLORS[key] },
      });
      node.append(h('span', { class: 'res__icon', text: def.icon }), body, delta);

      this.resourceNodes.set(key, { node, value, delta });
      this.resourcesRoot.append(node);
    }
  }

  update() {
    const state = this.session.state;
    const daily = computeDaily(state);

    this.cityName.textContent = state.cityName;
    this.chipDay.textContent = `День ${state.day} · год ${state.year}`;
    this.chipSeason.textContent = `${state.season.icon} ${state.season.name}`;

    this.#updateMeters(state);
    this.#updateResources(state, daily);
  }

  #updateMeters(state) {
    const employed = state.employedWorkers;

    for (const key of Object.keys(BALANCE.meters)) {
      const { node, value, fill } = this.meterNodes.get(key);

      if (key === 'population') {
        value.textContent = `${formatNumber(state.population)} / ${formatNumber(state.maxPopulation)}`;
        node.classList.toggle('meter--warn', state.population >= state.maxPopulation);
        continue;
      }

      if (key === 'workers') {
        value.textContent = `${formatNumber(employed)} / ${formatNumber(state.population)}`;
        node.classList.toggle(
          'meter--warn',
          state.freeWorkers > 0 && Object.values(state.buildings).some((count) => count > 0),
        );
        continue;
      }

      const percent = Math.round(
        (state.happiness / BALANCE.happiness.max) * 100,
      );
      value.textContent = `${formatNumber(state.happiness)}%`;

      node.classList.toggle('meter--ok', state.happiness > HAPPINESS_WARN);
      node.classList.toggle('meter--warn',
        state.happiness <= HAPPINESS_WARN && state.happiness > HAPPINESS_DANGER);
      node.classList.toggle('meter--danger', state.happiness <= HAPPINESS_DANGER);

      if (fill) {
        fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        fill.classList.toggle('meter__fill--warn',
          state.happiness <= HAPPINESS_WARN && state.happiness > HAPPINESS_DANGER);
        fill.classList.toggle('meter__fill--danger', state.happiness <= HAPPINESS_DANGER);
      }
    }
  }

  #updateResources(state, daily) {
    for (const key of BALANCE.resourceOrder) {
      const { node, value, delta } = this.resourceNodes.get(key);
      const amount = state.resource(key);

      value.textContent = formatNumber(amount);

      const perDay = key === 'food'
        ? daily.production.food - daily.foodConsumption
        : daily.production[key];

      delta.textContent = formatDelta(perDay);
      delta.className = 'res__delta ' + (
        perDay > 0 ? 'res__delta--up' : perDay < 0 ? 'res__delta--down' : 'res__delta--flat'
      );

      const isLow = LOW_THRESHOLDS[key]?.(state) ?? false;
      node.classList.toggle('res--empty', isLow && amount <= 0);
    }
  }
}