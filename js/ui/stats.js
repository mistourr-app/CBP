// ============================================================================
// stats.js — панель показателей и ресурсов.
//
// Показатели и ресурсы пересоздаются только при смене их набора: чаще всего
// меняются лишь числа, поэтому обновляются текстовые узлы, а не внутренняя
// структура. Это заметно дешевле полной перерисовки на телефоне.
// ============================================================================

import { BALANCE } from '../balance.js';
import { computeDaily, currentFoodKey, foodPerCitizen, visibleResources } from '../game/economy.js';
import { el, formatDelta, formatNumber, h } from './dom.js';

const RESOURCE_COLORS = {
  gold: 'var(--c-res-gold)',
  food: 'var(--c-res-food)',
  wood: 'var(--c-res-wood)',
  stone: 'var(--c-res-stone)',
  
};

// Пороговые значения уровня предупреждения в панели ресурсов
const LOW_THRESHOLDS = {
  // Еда проверяется отдельно по пищевому ресурсу текущего уровня (см. #updateResources)
  food: (state) => state.resource(currentFoodKey(state)) < state.population * foodPerCitizen(state) * 3,
  gold: (state) => state.resource('gold') < 10,
  wood: (state) => state.resource('wood') < 15,
  stone: (state) => state.resource('stone') < 15,
};

// Уровень счастья — дискретный, от -2 до +2, поэтому и предупреждение
// задаётся уровнем, а не процентом.
const MOOD_WARN = -1;
const MOOD_DANGER = -2;

// Шкала счастья идёт от -2 к +2: делим диапазон на пять шагов.
const MOOD_STEPS = 5;

export class StatsPanel {
  constructor(session) {
    this.session = session;
    this.cityName = el('#city-name');
    this.chipDay = el('#chip-day');
    this.chipSeason = el('#chip-season');
    this.chipBuild = el('#chip-build');
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

    const happinessIcon = h('span', { class: 'meter__icon', text: '😊' });
    const happiness = h('div', { class: 'meter meter--happiness' });
    happiness.append(happinessIcon, happinessBody);

    this.meterNodes.set('happiness', { node: happiness, icon: happinessIcon, value: happinessValue, fill });

    // Налог — постоянная политика, а не запас: игрок должен видеть её
    // всегда, а не только в день, когда её можно менять.
    const taxValue = h('span', { class: 'meter__value' });
    const taxSub = h('span', { class: 'meter__sub' });
    const taxBody = h('div', { class: 'meter__body' });
    taxBody.append(
      h('span', { class: 'meter__label', text: 'Налоги' }),
      taxValue,
      taxSub,
    );

    const tax = h('div', { class: 'meter meter--tax' });
    tax.append(h('span', { class: 'meter__icon', text: '⚖️' }), taxBody);
    this.meterNodes.set('tax', { node: tax, value: taxValue, sub: taxSub });

    this.metersRoot.append(people, happiness, tax);
  }

  #buildResources() {
    for (const key of BALANCE.resourceOrder) {
      const def = BALANCE.resources[key];

      const value = h('span', { class: 'res__value' });

      // Подпись «34/100» и полоса — прогресс к следующему уровню.
      // Показываются только у ресурсов, которые входят в требования
      // перехода: золото, вера и знания копились «просто так».
      const goal = h('span', { class: 'res__goal' });
      const fill = h('span', { class: 'res__bar-fill' });
      const bar = h('span', { class: 'res__bar' });
      bar.append(fill);

      const body = h('div', { class: 'res__body' });
      body.append(value, h('span', { class: 'res__name', text: def.name }), goal);

      const delta = h('span', { class: 'res__delta' });

      const node = h('div', {
        class: 'res',
        title: def.name,
        style: { '--res-color': RESOURCE_COLORS[key] },
      });
      node.append(h('span', { class: 'res__icon', text: def.icon }), body, bar, delta);

      this.resourceNodes.set(key, { node, value, goal, bar, fill, delta });
      this.resourcesRoot.append(node);
    }
  }

  update() {
    const state = this.session.state;
    const daily = computeDaily(state);

    this.cityName.textContent = state.cityName;
    this.chipDay.textContent = `День ${state.day} · год ${state.year}`;
    this.chipSeason.textContent = `${state.season.icon} ${state.season.name}`;
    this.chipBuild.textContent = BALANCE.meta.build;

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

    const level = state.happinessLevel;
    const mood = BALANCE.happiness.levels[String(level)];
    const [min, max] = BALANCE.happiness.range;

    const happiness = this.meterNodes.get('happiness');
    happiness.icon.textContent = mood.icon;
    happiness.value.textContent = mood.label;

    happiness.node.classList.toggle('meter--ok', level > MOOD_WARN);
    happiness.node.classList.toggle('meter--warn', level === MOOD_WARN);
    happiness.node.classList.toggle('meter--danger', level <= MOOD_DANGER);

    // От -2 шкала пустая, у +2 полная: так видно и уход, и подъём
    const share = (level - min) / (max - min);
    happiness.fill.style.width = `${Math.round(share * 100)}%`;
    happiness.fill.classList.toggle('meter__fill--warn', level === MOOD_WARN);
    happiness.fill.classList.toggle('meter__fill--danger', level <= MOOD_DANGER);

    const tax = this.meterNodes.get('tax');
    const rate = state.taxRate;
    const perCitizen = rate.goldPerCitizen * (BALANCE.tierTaxMult[0] ?? 1);
    const moodBase = BALANCE.happiness.levels[String(rate.happinessBase)];

    // Карточка узкая, поэтому здесь только ставка и доход с жителя.
    // Настроение от налога показывает «Счастье», а значок рядом со
    // ставкой подсказывает, что будет с народом.
    tax.value.textContent = `${Math.round(rate.rate * 100)}% ${moodBase.icon}`;
    tax.sub.textContent = `${formatNumber(perCitizen)} зол./жителя`;
    tax.node.classList.toggle('meter--warn', rate.happinessBase <= MOOD_WARN);
  }

  #updateResources(state, daily) {
    // На каждом уровне видны свои ресурсы; прошлые скрыты и не производятся
    const visible = new Set(visibleResources(state));
    this.resourcesRoot.style.gridTemplateColumns = `repeat(${Math.max(1, visible.size)}, minmax(0, 1fr))`;

    const level = state.tierDef;

    for (const key of BALANCE.resourceOrder) {
      const { node, value, goal, bar, fill, delta } = this.resourceNodes.get(key);
      node.hidden = !visible.has(key);
      if (!visible.has(key)) continue;

      const amount = state.resource(key);

      value.textContent = formatNumber(amount);

      // Золото: налог минус обслуживание. Еда: выработка минус потребление
      // жителей. Остальное: выработка зданий.
      const isFood = key === daily.foodKey;
      let perDay = key === 'gold' ? daily.goldNet : daily.production[key];
      if (isFood) perDay -= daily.foodConsumption;

      delta.textContent = formatDelta(perDay);
      delta.className = 'res__delta ' + (
        perDay > 0 ? 'res__delta--up' : perDay < 0 ? 'res__delta--down' : 'res__delta--flat'
      );

      this.#updateGoal(node, goal, bar, fill, level, key, amount);

      const isLow = (isFood ? LOW_THRESHOLDS.food(state) : LOW_THRESHOLDS[key]?.(state)) ?? false;
      node.classList.toggle('res--empty', isLow && amount <= 0);
    }
  }

  /** Показывает «собрано из целевого» для ресурсов, нужных для перехода. */
  #updateGoal(node, goal, bar, fill, level, key, amount) {
    const target = level?.requirements?.[key];
    // На последнем уровне требований нет — цели не показываем

    if (!target) {
      goal.textContent = '';
      bar.hidden = true;
      node.classList.remove('res--ready');
      return;
    }

    const done = Math.min(amount, target);
    bar.hidden = false;

    goal.textContent = `${formatNumber(done)}/${formatNumber(target)}`;
    fill.style.width = `${Math.round((done / target) * 100)}%`;

    // Цель достигнута — ресурс выглядит собранным, а не пустым
    node.classList.toggle('res--ready', amount >= target);
    node.title = `${node.title}: ${formatNumber(amount)} из ${formatNumber(target)} `
      + `для «${level.nextName}»`;
  }
}