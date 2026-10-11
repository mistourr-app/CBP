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

  /**
   * Два показателя: население (с числом занятых) и счастье.
   * Отдельно «население» и «рабочие» заводить не нужно: занятые всегда
   * часть населения, поэтому и показываются вместе одной карточкой.
   */
  #buildMeters() {
    const value = h('span', { class: 'meter__value' });
    const sub = h('span', { class: 'meter__sub' });
    const label = h('span', { class: 'meter__label', text: 'Население' });

    const body = h('div', { class: 'meter__body' });
    body.append(label, value, sub);

    const people = h('div', { class: 'meter meter--population' });
    people.append(h('span', { class: 'meter__icon', text: '👥' }), body);

    this.meterNodes.set('population', { node: people, value, sub });

    const happinessValue = h('span', { class: 'meter__value' });
    const fill = h('span', { class: 'meter__fill' });
    const bar = h('span', { class: 'meter__bar' });
    bar.append(fill);

    const happinessBody = h('div', { class: 'meter__body' });
    happinessBody.append(
      h('span', { class: 'meter__label', text: 'Счастье' }),
      happinessValue,
      bar,
    );

    const happiness = h('div', { class: 'meter meter--happiness' });
    happiness.append(h('span', { class: 'meter__icon', text: '😊' }), happinessBody);

    this.meterNodes.set('happiness', { node: happiness, value: happinessValue, fill });

    this.metersRoot.append(people, happiness);
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
    const free = state.freeWorkers;

    const people = this.meterNodes.get('population');
    people.value.textContent = formatNumber(state.population);
    people.sub.textContent = employed > 0
      ? `${formatNumber(employed)} работают · ${formatNumber(free)} свободны`
      : 'никто не работает';

    // Простой без дела — повод об этом сказать
    people.node.classList.toggle('meter--warn', free > 0 && employed > 0);
    people.node.classList.toggle('meter--ok', employed > 0 || state.population <= 1);

    const happiness = this.meterNodes.get('happiness');
    const percent = Math.round((state.happiness / BALANCE.happiness.max) * 100);

    happiness.value.textContent = `${formatNumber(state.happiness)}%`;
    happiness.node.classList.toggle('meter--ok', state.happiness > HAPPINESS_WARN);
    happiness.node.classList.toggle('meter--warn',
      state.happiness <= HAPPINESS_WARN && state.happiness > HAPPINESS_DANGER);
    happiness.node.classList.toggle('meter--danger', state.happiness <= HAPPINESS_DANGER);

    happiness.fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    happiness.fill.classList.toggle('meter__fill--warn',
      state.happiness <= HAPPINESS_WARN && state.happiness > HAPPINESS_DANGER);
    happiness.fill.classList.toggle('meter__fill--danger', state.happiness <= HAPPINESS_DANGER);
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