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
  applyProduction,
  applyTaxIncome,
  computeTaxIncome,
  autoAssignWorkers,
  canAfford,
  computeHappiness,
  costOf,
  currentFoodKey,
  spend,
  visibleResources,
} from './economy.js';
import { rollDailyEvent } from './events.js';
import { Chronicle } from './chronicle.js';
import { formatResource } from './content.js';

/** Иконка действия: у производственного здания — иконка того, что оно даёт. */
function buildingIcon(def) {
  if (def.kind === 'production' && def.produces) {
    const [resource] = Object.keys(def.produces);
    return BALANCE.resources[resource]?.icon ?? def.icon;
  }
  return def.icon;
}

/**
 * Как показывать эффекты зданий и технологий в выборе.
 *   key      — ключ эффекта в balance (effects.*)
 *   icon     — иконка показателя (для пищи подставляется текущая)
 *   unit     — подпись единицы
 *   negate   — эффект уменьшает потери (больше жертв меньше), поэтому стрелка вниз
 *   good     — всегда выгодно для игрока (его цвет зелёный)
 */
const EFFECT_VIEW = {
  happiness:              { icon: '😊', unit: '' },
  goldPerCitizen:         { icon: '💰', unit: 'за жителя' },
  goldPerDay:             { icon: '💰', unit: 'в день' },
  foodPerDay:             { food: true, unit: 'в день' },
  guardDefense:           { icon: '🛡️', unit: 'защита' },
  suppressionGuard:       { icon: '👮', unit: 'против бунта' },
  fireDays:               { icon: '🔥', unit: 'дн. пожара', good: true },
  epidemicLossReduction:  { icon: '🤒', unit: 'меньше жертв', negate: true, good: true },
  negativeDaysReduction:  { icon: '⏱️', unit: 'дн. бедствий', negate: true, good: true },
  productionPerProducer:  { icon: '⚙️', unit: 'к выработке' },
};

/** Эффекты здания (социального или дорожного) в виде строк для выбора. */
function buildingEffects(def, state) {
  return Object.entries(def.effects ?? {})
    .filter(([, amount]) => amount)
    .map(([key, amount]) => effectChip(key, amount, state));
}

/** Эффект технологии: бонус к выработке или к эффекту здания. */
function techEffects(def, state) {
  const out = [];
  if (def.productionBonus) {
    const { resource, amount } = def.productionBonus;
    out.push({ icon: BALANCE.resources[resource].icon, delta: amount, unit: 'за здание', good: true });
  }
  if (def.effectBonus) {
    const { effect, amount } = def.effectBonus;
    out.push(effectChip(effect, amount, state, 'за здание'));
  }
  return out;
}

function effectChip(key, amount, state, unitOverride) {
  const view = EFFECT_VIEW[key] ?? { icon: '•', unit: '' };
  const icon = view.food ? BALANCE.resources[currentFoodKey(state)].icon : view.icon;
  const delta = view.negate ? -amount : amount;
  return {
    icon,
    delta,
    unit: unitOverride ?? view.unit,
    good: view.good,
  };
}

/** Стоимость как список требований для интерфейса. */
function toRequirements(cost = {}) {
  return Object.entries(cost)
    .filter(([, amount]) => amount > 0)
    .map(([resource, amount]) => ({ resource, amount }));
}

/** Ставка налога в процентах для подписей: индекс → 10, 20, … 50. */
function percentOf(index) {
  return Math.round(BALANCE.taxes[index].rate * 100);
}

/** Ключи вида '$food' заменяются пищевым ресурсом текущего тира. */
function resolveKeys(map = {}, state) {
  const out = {};
  for (const [key, amount] of Object.entries(map)) {
    const real = key === '$food' ? currentFoodKey(state) : key;
    out[real] = (out[real] ?? 0) + amount;
  }
  return out;
}

/** Событие подходит к текущему состоянию партии. */
function eventAvailable(def, state) {
  if (def.minTier && state.tier < def.minTier) return false;
  if (def.minPopulation && state.population < def.minPopulation) return false;
  if (def.requiresBuildings?.some((key) => state.buildingCount(key) <= 0)) return false;
  return true;
}

export class Engine {
  constructor(state, rng, bus) {
    this.state = state;
    this.rng = rng;
    this.bus = bus;
    this.chronicle = new Chronicle();

    // Новая партия: предложений дня ещё нет, разыгрываем их сразу
    if (state.data.offers.expeditionChance == null) this.rollOffers();
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

  /**
   * Список действий на сейчас. Каждое действие описывает себя полностью,
   * чтобы интерфейс не знал правил:
   *   requirements — [{resource, amount}]: показываются иконками;
   *   workers      — сколько рабочих нужно (0 — не нужны);
   *   chance       — шанс успеха в долях (только экспедиция);
   *   effects      — [{kind, icon, delta, unit}]: эффекты со стрелками (налог).
   */
  availableActions() {
    const state = this.state;
    const out = [];

    for (const [key, def] of Object.entries(BALANCE.buildings)) {
      if (!this.isBuildingUnlocked(key)) continue;
      const cost = costOf(def, state.tier);
      out.push({
        id: `build:${key}`,
        group: 'build',
        label: def.name,
        icon: buildingIcon(def),
        cost,
        requirements: toRequirements(cost),
        effects: buildingEffects(def, state),
        workers: def.workers ?? 0,
        affordable: canAfford(state, cost),
      });
    }

    // Технологии: только свои тира и только за ресурсы текущего тира и золото
    for (const [key, def] of Object.entries(BALANCE.technologies)) {
      if (state.hasTechnology(key)) continue;
      if (def.tier !== state.tier) continue;
      if (state.buildingCount(def.requiresBuilding) < 1) continue;
      if (!canAfford(state, def.cost)) continue;

      out.push({
        id: `develop:${key}`,
        group: 'develop',
        label: def.name,
        icon: def.icon,
        cost: def.cost,
        requirements: toRequirements(def.cost),
        effects: techEffects(def, state),
        workers: 0,
        affordable: true,
      });
    }

    const { trade, expedition } = BALANCE.economy;
    const tradeCost = { [currentFoodKey(state)]: trade.foodCost };
    out.push({
      id: 'trade',
      group: 'trade',
      label: BALANCE.choices.actions.trade.label,
      icon: BALANCE.choices.actions.trade.icon,
      cost: tradeCost,
      requirements: toRequirements(tradeCost),
      gain: { gold: trade.goldGain },
      workers: 0,
      affordable: canAfford(state, tradeCost),
    });

    // Экспедиция: шанс успеха выбран на сегодня случайно и виден в требованиях
    const expeditionCost = { gold: expedition.cost };
    const chance = state.data.offers.expeditionChance ?? expedition.chances[0];
    out.push({
      id: 'expedition',
      group: 'trade',
      label: BALANCE.choices.actions.expedition.label,
      icon: BALANCE.choices.actions.expedition.icon,
      cost: expeditionCost,
      requirements: toRequirements(expeditionCost),
      chance,
      workers: 0,
      affordable: canAfford(state, expeditionCost),
    });

    // Налог: предложение на сегодня, ставка выбрана случайно, ресурсов не требует
    const taxIndex = state.data.offers.taxIndex;
    if (taxIndex != null) {
      out.push({
        // Ставка входит в id: нажатие применяет ровно ту, что написана на кнопке
        id: `tax:${taxIndex}`,
        group: 'tax',
        label: `${BALANCE.choices.actions.tax.label} ${percentOf(taxIndex)}%`,
        icon: BALANCE.choices.actions.tax.icon,
        cost: {},
        requirements: [],
        effects: this.#taxEffects(taxIndex),
        workers: 0,
        affordable: true,
      });
    }

    return out;
  }

  /**
   * Эффекты смены налога относительно текущей ставки: разница счастья
   * (уровень) и денег (золото в день). Расчёт тот же, что в игре.
   */
  #taxEffects(index) {
    const state = this.state;
    return [
      {
        kind: 'happiness',
        icon: BALANCE.meters.happiness.icon,
        delta: computeHappiness(state, index) - computeHappiness(state),
      },
      {
        kind: 'gold',
        icon: BALANCE.resources.gold.icon,
        delta: computeTaxIncome(state, index) - computeTaxIncome(state),
        unit: 'в день',
      },
    ];
  }

  /**
   * Здание можно выбрать сейчас: оно строится на текущем уровне поселения
   * и, если нужны рабочие, есть свободные жители.
   * Требований «другое здание» у зданий нет.
   */
  isBuildingUnlocked(key) {
    const def = BALANCE.buildings[key];
    const state = this.state;

    if (!def.levels?.includes(state.tier)) return false;

    const unlock = def.unlock || {};
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
    // Пока открыт попап (например, переход на тир), выборы заблокированы
    if (this.state.data.popup) return { ok: false, note: null };

    // Пока ждём ответа на событие, обычные действия недоступны
    if (this.state.data.pending && !actionId.startsWith('event:')) return { ok: false, note: null };

    switch (actionId) {
      case 'wait':
        return this.#wait();
      case 'trade':
        return this.#trade();
      case 'expedition':
        return this.#expedition();
      default:
        break;
    }

    const [kind, key] = actionId.split(':');
    if (kind === 'tax') return this.#changeTax(Number(key));
    if (kind === 'event') return this.#resolveEvent(Number(key));
    if (kind === 'build') return this.#build(key);
    if (kind === 'develop') return this.#develop(key);

    return { ok: false, note: null };
  }

  /**
   * Смена налога: применяется ставка, записанная в самом действии (`tax:N`).
   * Она должна совпадать с предложением дня. Ресурсов не требует. Предложение
   * съедается: до следующего дня второй смены нет.
   */
  #changeTax(chosen) {
    const offer = this.state.data.offers.taxIndex;
    if (offer == null || !Number.isInteger(chosen)) return { ok: false, note: null };
    if (chosen !== offer) return { ok: false, note: null };
    if (!BALANCE.taxes[chosen] || chosen === this.state.data.taxRateIndex) {
      return { ok: false, note: null };
    }

    this.state.data.taxRateIndex = chosen;
    this.state.data.offers.taxIndex = null;

    const level = computeHappiness(this.state);
    const mood = BALANCE.happiness.levels[String(level)];
    const gold = computeTaxIncome(this.state);

    return {
      ok: true,
      note: {
        kind: 'trade',
        icon: BALANCE.meters.tax.icon,
        text: `Налоги ${percentOf(offer)}%: ${mood.icon} ${mood.label.toLowerCase()}, ${gold} золота в день`,
      },
    };
  }

  #build(key) {
    const def = BALANCE.buildings[key];
    if (!def) return { ok: false, note: null };
    if (!this.isBuildingUnlocked(key)) return { ok: false, note: null };
    if (!spend(this.state, costOf(def, this.state.tier))) return { ok: false, note: null };

    this.state.addBuilding(key, 1);
    this.state.stats.buildingsBuilt += 1;

    // Постройка снимает модификаторы своих тегов (например, таверна — ожидание)
    const cured = this.state.cureMoods(def.cures ?? []);

    // Дом вселяет жителя сразу: застройка и есть способ увеличить население
    let residents = 0;
    if (def.onBuild?.residents) {
      residents = def.onBuild.residents;
      this.state.addResource('population', residents);
      this.state.stats.citizensArrived += residents;
    }

    this.state.clampHappiness();

    const extra = residents ? ` (+${residents} житель)` : '';
    const healed = cured > 0 ? ' · настроение исправлено' : '';

    return {
      ok: true,
      note: { kind: 'build', icon: def.icon, text: `Построено: ${def.name}${extra}${healed}` },
    };
  }

  /**
   * Переход на следующий тир. Выполняется автоматически в конце дня, когда
   * накоплены все требования текущего тира. Ресурсы не списываются: прошлый
   * тир просто перестаёт участвовать в игре. Переход показываем попапом.
   */
  #checkTierUp() {
    const state = this.state;
    const current = state.tierDef;
    if (!current?.requirements) return;
    if (!canAfford(state, current.requirements)) return;

    const previous = state.tierDef;
    state.data.tier += 1;

    // Стартовый запас пищевого ресурса нового тира: без него житель съел бы
    // пустоту уже на следующий день, а мельница даёт продукцию только после
    // потребления. Запас задан в балансе (development.levels[].starterFood).
    const starter = previous.starterFood ?? 0;
    if (starter > 0) state.addResource(currentFoodKey(state), starter);

    state.normalize();

    const next = state.tierDef;
    state.data.popup = {
      kind: 'tier',
      icon: next.icon,
      // Поздравление и новое сословие, которое теперь живёт в городе
      text: `${current.upgradeText} В городе появилось новое сословие: ${next.populationName}.`,
      button: BALANCE.popups.tierUpButton,
    };

    this.chronicle.add(state, {
      kind: 'research',
      icon: next.icon,
      text: `Поселение перешло на новый уровень: ${next.name}`,
    });
  }

  /**
   * «Подождать»: ход без расходов. Даёт модификатор счастья на несколько дней.
   * Сумма ожиданий ограничена waitCap, чтобы не было мгновенного бунта.
   */
  #wait() {
    const { waitTag, waitDelta, waitDays, waitCap } = BALANCE.happiness.moods;
    if (this.state.waitTotal() + waitDelta < waitCap) {
      return { ok: true, note: null };
    }
    this.state.addMood({ tag: waitTag, delta: waitDelta, days: waitDays });
    return {
      ok: true,
      note: { kind: 'social', icon: '⏳', text: 'Город ждёт: настроение падает' },
    };
  }

  /** Событие с выбором выпало: показываем попап, варианты придут после его закрытия. */
  #rollChoiceEvent() {
    const state = this.state;
    const config = BALANCE.events.choice;
    if (!this.rng.chance(config.chance)) return;

    const pool = Object.keys(config.pool).filter((id) => eventAvailable(config.pool[id], state));
    if (pool.length === 0) return;

    const id = this.rng.pick(pool);
    const def = config.pool[id];
    state.data.pending = { id };
    state.data.popup = {
      kind: 'event',
      icon: def.icon,
      text: `${def.name}. ${def.text}`,
      button: 'Понятно',
    };
    this.chronicle.add(state, { kind: 'event', icon: def.icon, text: `Событие: ${def.name}` });
  }

  /** Варианты текущего события в виде выборов для интерфейса. */
  pendingChoices() {
    const pending = this.state.data.pending;
    if (!pending) return [];
    const def = BALANCE.events.choice.pool[pending.id];
    if (!def) return [];

    return def.options.map((option, index) => {
      const cost = resolveKeys(option.cost, this.state);
      const gains = resolveKeys(option.gain, this.state);
      const takes = resolveKeys(option.take, this.state);

      const effects = [
        ...Object.entries(gains).map(([key, amount]) => ({
          icon: BALANCE.resources[key].icon, delta: amount, good: true,
        })),
        ...Object.entries(takes).map(([key, amount]) => ({
          icon: BALANCE.resources[key].icon, delta: -amount, good: false,
        })),
        ...(option.people
          ? [{ icon: '👥', delta: option.people, unit: 'жителей', good: true }]
          : []),
        ...(option.moods ?? []).map((mood) => ({
          icon: BALANCE.meters.happiness.icon,
          delta: mood.delta,
          unit: `${mood.days} дн.`,
          good: mood.delta > 0,
        })),
      ];

      return {
        id: `event:${index}`,
        group: 'event',
        label: option.label,
        icon: option.icon,
        cost,
        requirements: toRequirements(cost),
        effects,
        workers: 0,
        affordable: canAfford(this.state, cost),
      };
    });
  }

  /** Выбор варианта события: списывается стоимость, применяются эффекты. */
  #resolveEvent(index) {
    const pending = this.state.data.pending;
    const def = pending && BALANCE.events.choice.pool[pending.id];
    const option = def?.options[index];
    if (!option) return { ok: false, note: null };

    const cost = resolveKeys(option.cost, this.state);
    if (!spend(this.state, cost)) return { ok: false, note: null };

    // Потери забирают сколько есть и не блокируют выбор
    for (const [key, amount] of Object.entries(resolveKeys(option.take, this.state))) {
      this.state.addResource(key, -Math.min(amount, this.state.resource(key)));
    }
    for (const [key, amount] of Object.entries(resolveKeys(option.gain, this.state))) {
      this.state.addResource(key, amount);
    }
    if (option.people) {
      this.state.addResource('population', option.people);
      this.state.stats.citizensArrived += option.people;
    }
    for (const mood of option.moods ?? []) this.state.addMood(mood);

    this.state.data.pending = null;
    this.state.normalize();

    return {
      ok: true,
      note: { kind: 'event', icon: def.icon, text: `${def.name}: ${option.label}` },
    };
  }

  /** Игрок закрыл попап: выборы снова доступны. */
  dismissPopup() {
    this.state.data.popup = null;
    this.emit(EVENTS.STATE_CHANGED, this.state.data);
  }

  /**
   * Случайные предложения на день: шанс экспедиции (каждый день) и ставка
   * налога (каждый день, не текущая). Выпадают здесь, чтобы выбор на
   * экране совпадал с расчётом.
   */
  rollOffers() {
    const { data } = this.state;
    data.offers.expeditionChance = this.rng.pick(BALANCE.economy.expedition.chances);

    // Налог можно менять каждый ход: новая ставка выпадает каждый день
    const others = BALANCE.taxes
      .map((_, index) => index)
      .filter((index) => index !== data.taxRateIndex);
    data.offers.taxIndex = this.rng.pick(others);
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
    const foodKey = currentFoodKey(this.state);
    if (!spend(this.state, { [foodKey]: foodCost })) return { ok: false, note: null };

    this.state.addResource('gold', goldGain);
    this.state.stats.tradesCompleted += 1;

    return {
      ok: true,
      note: { kind: 'trade', icon: '💵', text: `Торговля: +${goldGain} золота, -${foodCost} еды` },
    };
  }

  #expedition() {
    const { cost, goldReward, materialReward, failureLoss, chances } = BALANCE.economy.expedition;

    if (!spend(this.state, { gold: cost })) return { ok: false, note: null };

    this.state.stats.expeditionsSent += 1;

    // Шанс выбран на сегодня случайно (см. rollOffers)
    const chance = this.state.data.offers.expeditionChance ?? chances[0];

    if (this.rng.chance(chance)) {
      // Награда: золото либо материал текущего уровня (прошлые не нужны)
      const materials = visibleResources(this.state)
        .filter((key) => BALANCE.resources[key].tier === this.state.tier);
      const pickGold = materials.length === 0 || this.rng.chance(
        goldReward.weight / (goldReward.weight + materialReward.weight),
      );

      const resource = pickGold ? 'gold' : this.rng.pick(materials);
      const range = pickGold ? goldReward : materialReward;
      const amount = this.rng.int(range.min, range.max);
      this.state.addResource(resource, amount);

      return {
        ok: true,
        note: {
          kind: 'trade',
          icon: '🗺️',
          text: `Экспедиция удалась: +${formatResource(amount, BALANCE.resources[resource].unit)}`,
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

    // Модификаторы уже учтены в уровне: теперь их срок уменьшается
    state.tickMoods();

    // Сколько дней подряд народ на −2: по этому счётчику решается бунт
    const lowNow = state.happinessLevel <= -2 && state.population >= 6;
    state.data.lowMoodDays = lowNow ? state.data.lowMoodDays + 1 : 0;

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

    // 7. Свободные руки сразу берутся за работу
    //
    // Прироста населения здесь нет намеренно: новые жители приходят
    // только через постройку домов и события с выбором (SYSTEMS_SPEC §2).
    // Считать, что народ прибывает сам, значило бы отнять у игрока
    // решение о застройке.
    autoAssignWorkers(state);

    // 8. Событие дня
    const eventNote = rollDailyEvent(state, this.rng);
    if (eventNote) this.chronicle.add(state, eventNote);

    // События меняют показатели напрямую, поэтому приводим их к
    // согласованному виду перед проверкой окончания партии
    state.normalize();

    // 9. Условия окончания. Проверяются ДО перехода на тир: переход не может
    // сам по себе привести к поражению (пищевой ресурс нового тира ещё пуст).
    state.stats.daysSurvived = state.day;
    this.#checkEndConditions();

    // Переход на тир — в конце дня, если накоплены все требования
    if (!state.isOver) this.#checkTierUp();

    // Событие с выбором: только если не открыт попап (переход важнее)
    if (!state.isOver && !state.data.popup) this.#rollChoiceEvent();

    this.rollOffers();

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
    if (state.buildingCount(victory.building) > 0) {
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
      lowDaysMin:    () => state.data.lowMoodDays >= when.lowDaysMin,
      happinessMin:  () => state.happiness >= when.happinessMin,
      foodMax:       () => state.resource(currentFoodKey(state)) <= when.foodMax,
      foodMin:       () => state.resource(currentFoodKey(state)) >= when.foodMin,
      goldMax:       () => state.resource('gold') <= when.goldMax,
    };

    return Object.entries(when).every(([key, value]) => {
      const check = map[key];
      if (!check) throw new Error(`Неизвестное условие окончания партии: ${key}=${value}`);
      return check();
    });
  }
}
