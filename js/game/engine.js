// ============================================================================
// Engine — дневной цикл и действия игрока.
//
// Здесь задаётся ПОРЯДОК событий внутри дня. Он важен: от него зависят
// и баланс, и воспроизводимость симуляций.
//
// Порядок дня:
//   1. счётчик дней, смена сезона
//   2. назначение свободных жителей на работу
//   3. потребление: еда, обслуживание, спад счастья
//   4. производство
//   5. прирост населения (новые жители вселяются в построенные дома)
//   6. повторное назначение — чтобы вчерашние новосёлы уже работали завтра
//   7. случайное событие дня
//   8. проверка условий окончания партии
// ============================================================================

import { BALANCE } from '../balance.js';
import { EVENTS } from '../core/bus.js';
import {
  applyConsumption,
  applyHappinessOutflow,
  applyPopulationGrowth,
  applyProduction,
  applyTaxIncome,
  autoAssignWorkers,
  canAfford,
  computeHappiness,
  spend,
} from './economy.js';
import { rollDailyEvent } from './events.js';
import { Chronicle } from './chronicle.js';
import { formatResource } from './content.js';

export class Engine {
  constructor(state, rng, bus) {
    this.state = state;
    this.rng = rng;
    this.bus = bus;
    this.chronicle = new Chronicle();
  }

  /** Полное описание состояния, включая хронику. */
  snapshot() {
    return { state: this.state.data, chronicle: this.chronicle.entries };
  }

  emit(event, payload) {
    this.bus?.emit(event, payload);
  }

  // --------------------------------------------------------------------------
  // Действия игрока
  // --------------------------------------------------------------------------

  /** Список действий, доступных сейчас: [{id, label, icon, cost, affordable}] */
  availableActions() {
    const state = this.state;
    const out = [];

    for (const [key, def] of Object.entries(BALANCE.buildings)) {
      if (!this.isBuildingUnlocked(key)) continue;
      out.push({
        id: `build:${key}`,
        group: 'build',
        label: def.actionLabel ?? `Построить: ${def.name.toLowerCase()}`,
        icon: def.icon,
        cost: def.cost,
        affordable: canAfford(state, def.cost),
      });
    }

    for (const [key, def] of Object.entries(BALANCE.technologies)) {
      if (state.hasTechnology(key)) continue;
      if (state.buildingCount(def.requiresBuilding) < 1) continue;
      if (!canAfford(state, def.cost)) continue;

      out.push({
        id: `develop:${key}`,
        group: 'develop',
        label: def.actionLabel ?? `Развить: ${def.name.toLowerCase()}`,
        icon: def.icon,
        cost: def.cost,
        affordable: true,
      });
    }

    const { trade, expedition } = BALANCE.economy;
    const tradeCost = { food: trade.foodCost };
    out.push({
      id: 'trade',
      group: 'trade',
      label: BALANCE.choices.actions.trade.label,
      icon: BALANCE.choices.actions.trade.icon,
      cost: tradeCost,
      gain: { gold: trade.goldGain },
      affordable: canAfford(state, tradeCost),
    });

    const expeditionCost = { gold: expedition.cost };
    out.push({
      id: 'expedition',
      group: 'trade',
      label: BALANCE.choices.actions.expedition.label,
      icon: BALANCE.choices.actions.expedition.icon,
      cost: expeditionCost,
      affordable: canAfford(state, expeditionCost),
    });

    // Ставка налога — постоянная политика, поэтому предлагается не
    // каждый день, а раз в taxChangeEveryDays: иначе она занимала бы
    // слот постоянно и игрок не смог бы ею пользоваться.
    if (this.#isTaxChangeDue(state)) {
      const rate = state.taxRate;
      out.push({
        id: 'tax',
        group: 'tax',
        label: BALANCE.choices.actions.tax.label,
        icon: BALANCE.choices.actions.tax.icon,
        cost: {},
        affordable: true,
        detail: `сейчас ${BALANCE.taxLabels[state.data.taxRateIndex]} · ${Math.round(rate.rate * 100)}%`,
      });
    }

    return out;
  }

  /** Пора ли предлагать смену налога. */
  #isTaxChangeDue(state) {
    return state.day % BALANCE.taxChangeEveryDays === 0;
  }

  isBuildingUnlocked(key) {
    const unlock = BALANCE.buildings[key].unlock || {};
    const state = this.state;

    for (const [buildingKey, count] of Object.entries(unlock.buildings ?? {})) {
      if (state.buildingCount(buildingKey) < count) return false;
    }

    if (unlock.freeWorkers != null && state.freeWorkers < unlock.freeWorkers) return false;

    return true;
  }

  /**
   * Применяет действие игрока.
   * Возвращает { ok, note } — note уходит в хронику.
   *
   * Идентификаторы бывают двух видов: с пространством имён для зданий и
   * технологий («build:houses») и простые для остальных действий.
   */
  applyAction(actionId) {
    switch (actionId) {
      case 'wait':
        return { ok: true, note: null };
      case 'trade':
        return this.#trade();
      case 'expedition':
        return this.#expedition();
      case 'tax':
        return this.#changeTax();
      default:
        break;
    }

    const [kind, key] = actionId.split(':');
    if (kind === 'build') return this.#build(key);
    if (kind === 'develop') return this.#develop(key);

    return { ok: false, note: null };
  }

  /**
   * Смена ставки налога: перебор к следующей ставке по кругу.
   *
   * Игрок не задаёт точку одним выбором — за ход ставка сдвигается на
   * ступень. Так решение остаётся в руках игрока, но не требует
   * отдельного окна настройки в каждом ходе.
   */
  #changeTax() {
    if (!this.#isTaxChangeDue(this.state)) return { ok: false, note: null };

    const next = (this.state.data.taxRateIndex + 1) % BALANCE.taxes.length;
    this.state.data.taxRateIndex = next;

    const rate = this.state.taxRate;
    const mood = BALANCE.happiness.levels[String(rate.happinessBase)];
    const gold = Math.floor(
      this.state.population * rate.goldPerCitizen * (BALANCE.tierTaxMult[0] ?? 1),
    );

    return {
      ok: true,
      note: {
        kind: 'trade',
        icon: '⚖️',
        text: `Налог ${Math.round(rate.rate * 100)}% (${BALANCE.taxLabels[next]}): `
          + `${gold} золота в день, ${mood.icon} ${mood.label.toLowerCase()}`,
      },
    };
  }

  #build(key) {
    const def = BALANCE.buildings[key];
    if (!def) return { ok: false, note: null };
    if (!this.isBuildingUnlocked(key)) return { ok: false, note: null };
    if (!spend(this.state, def.cost)) return { ok: false, note: null };

    this.state.addBuilding(key, 1);
    this.state.stats.buildingsBuilt += 1;

    if (def.onBuild?.happiness) {
      this.state.addResource('happiness', def.onBuild.happiness);
    }

    // Дом вселяет жителя сразу: застройка и есть способ увеличить население
    let residents = 0;
    if (def.onBuild?.residents) {
      residents = def.onBuild.residents;
      this.state.addResource('population', residents);
      this.state.stats.citizensArrived += residents;
    }

    this.state.clampHappiness();

    const extra = residents ? ` (+${residents} житель)` : '';

    return {
      ok: true,
      note: { kind: 'build', icon: def.icon, text: `Построено: ${def.name}${extra}` },
    };
  }

  #develop(key) {
    const def = BALANCE.technologies[key];
    if (!def) return { ok: false, note: null };
    if (this.state.hasTechnology(key)) return { ok: false, note: null };
    if (this.state.buildingCount(def.requiresBuilding) < 1) return { ok: false, note: null };
    if (!spend(this.state, def.cost)) return { ok: false, note: null };

    this.state.technologies[key] = true;
    this.state.stats.technologiesResearched += 1;

    return {
      ok: true,
      note: { kind: 'research', icon: def.icon, text: `Развито: ${def.name}` },
    };
  }

  #trade() {
    const { foodCost, goldGain } = BALANCE.economy.trade;
    if (!spend(this.state, { food: foodCost })) return { ok: false, note: null };

    this.state.addResource('gold', goldGain);
    this.state.stats.tradesCompleted += 1;

    return {
      ok: true,
      note: { kind: 'trade', icon: '💵', text: `Торговля: +${goldGain} золота, -${foodCost} еды` },
    };
  }

  #expedition() {
    const { cost, baseSuccessChance, knowledgeBonusPerHundred, rewards, failureLoss } =
      BALANCE.economy.expedition;

    if (!spend(this.state, { gold: cost })) return { ok: false, note: null };

    this.state.stats.expeditionsSent += 1;

    const chance = Math.min(
      1,
      baseSuccessChance + (this.state.resource('knowledge') / 100) * knowledgeBonusPerHundred,
    );

    if (this.rng.chance(chance)) {
      const reward = this.rng.pickWeighted(rewards);
      const amount = this.rng.int(reward.min, reward.max);
      this.state.addResource(reward.resource, amount);

      return {
        ok: true,
        note: {
          kind: 'trade',
          icon: '🗺️',
          text: `Экспедиция удалась: +${formatResource(amount, BALANCE.resources[reward.resource].unit)}`,
        },
      };
    }

    // Как и в прототипе, убыток списывается поверх уже уплаченных 10 золота
    const loss = this.rng.int(failureLoss.min, failureLoss.max);
    this.state.setResource('gold', Math.max(0, this.state.resource('gold') - loss));

    return {
      ok: true, // экспедиция состоялась как действие, просто неудачно
      note: { kind: 'trade', icon: '🗺️', text: `Экспедиция провалилась: -${loss} золота` },
    };
  }

  // --------------------------------------------------------------------------
  // Дневной цикл
  // --------------------------------------------------------------------------

  advanceDay() {
    const state = this.state;

    // 1. День и сезон
    state.data.day += 1;
    const yearLength = BALANCE.seasons.reduce((sum, s) => sum + s.days, 0);
    const dayInYear = ((state.day - 1) % yearLength) + 1;
    state.data.year = Math.floor((state.day - 1) / yearLength) + 1;

    let acc = 0;
    for (let i = 0; i < BALANCE.seasons.length; i += 1) {
      acc += BALANCE.seasons[i].days;
      if (dayInYear <= acc) { state.data.seasonIndex = i; break; }
    }

    // 2. Рабочие
    autoAssignWorkers(state);

    // 3. Настроение народа: считается заново из ставки налога
    const moodBefore = state.happinessLevel;
    state.setHappiness(computeHappiness(state));

    if (state.happinessLevel !== moodBefore) {
      const def = BALANCE.happiness.levels[String(state.happinessLevel)];
      this.chronicle.add(state, {
        kind: state.happinessLevel < 0 ? 'warning' : 'social',
        icon: def.icon,
        text: `Народ ${def.label.toLowerCase()}`,
      });
    }

    // 4. Потребление: еда и обслуживание
    for (const note of applyConsumption(state)) this.chronicle.add(state, note);

    // 5. Производство и сбор налогов
    applyProduction(state);
    applyTaxIncome(state);

    // 6. Отток из-за недовольства
    const leaving = applyHappinessOutflow(state);
    if (leaving > 0) {
      this.chronicle.add(state, {
        kind: 'warning',
        icon: '🚪',
        text: `Недовольные покидают поселение: -${leaving}`,
      });
    }

    // 7. Прирост населения
    const arrived = applyPopulationGrowth(state);
    if (arrived) {
      this.chronicle.add(state, {
        kind: 'social',
        icon: '👪',
        text: `В поселение вселились новые жители: +${arrived}`,
      });
    }

    // 8. Новосёлы сразу становятся рабочей силой
    autoAssignWorkers(state);

    // 9. Событие дня
    const eventNote = rollDailyEvent(state, this.rng);
    if (eventNote) this.chronicle.add(state, eventNote);

    // События меняют показатели напрямую, поэтому приводим их к
    // согласованному виду перед проверкой окончания партии
    state.normalize();

    // 10. Условия окончания
    state.stats.daysSurvived = state.day;
    this.#checkEndConditions();

    this.emit(EVENTS.DAY_ADVANCED, { day: state.day });
    this.emit(EVENTS.STATE_CHANGED, state.data);
  }

  #checkEndConditions() {
    const state = this.state;
    if (state.isOver) return;

    let outcome = null;

    // Поражение: условия проверяются сверху вниз, подошедшее перекрывает
    // предыдущее — поведение исходной проверки.
    for (const condition of BALANCE.endConditions.defeat) {
      if (this.#matchesEndWhen(condition.when)) {
        outcome = { status: 'lost', reason: condition.reason, icon: condition.icon };
      }
    }

    // Победа проверяется последней и потому имеет приоритет
    const victory = BALANCE.endConditions.victory;
    const buildingsMet = Object.entries(victory.buildings).every(
      ([key, count]) => state.buildingCount(key) >= count,
    );
    if (state.population >= victory.populationMin && buildingsMet) {
      outcome = { status: 'won', reason: victory.reason, icon: victory.icon };
    }

    if (!outcome) return;

    state.data.status = outcome.status;
    state.data.endReason = outcome.reason;
    state.data.endIcon = outcome.icon;

    this.chronicle.add(state, {
      kind: 'end',
      icon: outcome.icon,
      text: outcome.status === 'won' ? `ПОБЕДА: ${outcome.reason}` : `ИГРА ОКОНЧЕНА: ${outcome.reason}`,
      final: true,
    });

    this.emit(EVENTS.GAME_ENDED, { status: outcome.status, reason: outcome.reason });
  }

  #matchesEndWhen(when = {}) {
    const state = this.state;
    const map = {
      populationMax: () => state.population <= when.populationMax,
      populationMin: () => state.population >= when.populationMin,
      happinessMax:  () => state.happiness <= when.happinessMax,
      happinessMin:  () => state.happiness >= when.happinessMin,
      foodMax:       () => state.resource('food') <= when.foodMax,
      foodMin:       () => state.resource('food') >= when.foodMin,
      goldMax:       () => state.resource('gold') <= when.goldMax,
    };

    return Object.entries(when).every(([key, value]) => {
      const check = map[key];
      if (!check) throw new Error(`Неизвестное условие окончания партии: ${key}=${value}`);
      return check();
    });
  }
}