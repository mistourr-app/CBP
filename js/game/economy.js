// ============================================================================
// Economy — расчёты производства, потребления и обслуживания.
//
// Здесь считается ВСЁ, что связано с числами за день. В прототипе расчёт
// производства существовал в двух местах (getProduction и produceResources),
// и правка одного не трогала второй — предварительный подсчёт в интерфейсе
// мог расходиться с реальным итогом. Теперь источник один.
// ============================================================================

import { BALANCE, WORKFORCE_BUILDINGS } from '../balance.js';

/**
 * Уровень счастья на сегодня.
 *
 * Считается заново каждый день: база от ставки налога плюс модификаторы.
 * Поэтому он не «копит» ошибки и не требует отдельного сброса.
 *
 *   ставка налога            даёт базовый уровень
 *   технология «Религия»    +1, если есть хотя бы один храм
 *   события                  свои модификаторы (подэтап 2.3)
 *
 * Результат ограничен пределами [-2, +2].
 */
export function computeHappiness(state) {
  const { happiness, taxes } = BALANCE;
  const [min, max] = happiness.range;

  const tax = state.taxRate ?? taxes[BALANCE.taxDefaultIndex];
  let level = tax.happinessBase;

  if (state.hasTechnology('religion') && state.buildingCount('temples') > 0) {
    level += happiness.religionBonus;
  }

  return Math.min(max, Math.max(min, level));
}

/** Сколько золота приносит налог за день. */
export function computeTaxIncome(state) {
  const tax = state.taxRate;
  const tierMult = BALANCE.tierTaxMult[0] ?? 1;
  const perCitizen = tax.goldPerCitizen * tierMult;

  const fromCitizens = state.population * perCitizen;

  // Рынки не производят золото рабочими, а добавляют к сбору налога
  const fromMarkets = state.buildingCount('markets') * BALANCE.income.marketGoldPerCitizen;

  return Math.floor(fromCitizens + fromMarkets * state.population);
}

/** Сколько жителей уйдёт из-за недовольства. */
export function computeHappinessOutflow(state) {
  const level = state.happinessLevel;
  if (level <= -2) return BALANCE.happiness.leavePerDayHigh;
  if (level === -1) return BALANCE.happiness.leavePerDayLow;
  return 0;
}

/**
 * Производство за день.
 * Учитывает технологии, сезонные множители и настроение народа.
 * faith ограничен сверху 100 — как было в прототипе.
 */
export function computeProduction(state) {
  const seasonFoodMult = BALANCE.seasons[state.seasonIndex].foodMult;
  const moodMult = state.productionMultiplier;
  const out = { gold: 0, food: 0, wood: 0, stone: 0, faith: 0, knowledge: 0 };

  for (const buildingKey of WORKFORCE_BUILDINGS) {
    const def = BALANCE.buildings[buildingKey];
    if (!def.produces) continue;

    const workers = state.workerCount(buildingKey);
    if (workers <= 0) continue;

    for (const [resource, perWorker] of Object.entries(def.produces)) {
      let amount = workers * perWorker;

      // Множитель от технологии, производящей этот ресурс
      for (const [techKey, tech] of Object.entries(BALANCE.technologies)) {
        if (!state.hasTechnology(techKey)) continue;
        const mult = tech.productionMult?.[resource];
        if (mult) amount *= mult;
      }

      if (resource === 'food') amount *= seasonFoodMult;

      out[resource] += Math.floor(amount);
    }
  }

  // Настроение народа прибавляет к производству всех ресурсов, кроме
  // золота: золото идёт от налога, а не от работы.
  if (moodMult !== 1) {
    for (const key of Object.keys(out)) {
      if (key === 'gold') continue;
      out[key] = Math.floor(out[key] * moodMult);
    }
  }

  return out;
}

/** Обслуживание в золоте за день. */
export function computeMaintenance(state) {
  let sum = 0;
  for (const [key, def] of Object.entries(BALANCE.buildings)) {
    sum += state.buildingCount(key) * def.maintenance;
  }
  const growth = 1 + state.day / BALANCE.economy.maintenanceGrowthDivisor;
  return Math.floor(sum * growth);
}

/** Потребление еды за день. */
export function computeFoodConsumption(state) {
  return Math.floor(state.population * BALANCE.population.foodPerCitizenPerDay);
}

/** Сводка за день без изменения состояния — для интерфейса и симуляций. */
export function computeDaily(state) {
  return {
    production: computeProduction(state),
    maintenance: computeMaintenance(state),
    foodConsumption: computeFoodConsumption(state),
  };
}

/**
 * Потребление: еда и обслуживание зданий.
 *
 * Уровень счастья здесь не трогается: он вычисляется заново каждый день
 * из ставки налога и модификаторов, а не накапливается.
 *
 * Возвращает список записей для хроники, не трогая саму хронику.
 */
export function applyConsumption(state) {
  const notes = [];

  const need = computeFoodConsumption(state);
  const food = state.resource('food');

  if (food >= need) {
    state.addResource('food', -need);
    state.stats.totalFoodConsumed += need;
  } else {
    const shortage = need - food;
    state.setResource('food', 0);

    // Нехватка еды отбирает жителей: часть от голода, дополнительно —
    // по числу недовольных. Голод — причина ухода, а не отдельная смерть.
    const starved = Math.floor(shortage * BALANCE.population.starveDeathsPerShortageUnit);
    const lost = Math.min(
      starved + computeHappinessOutflow(state),
      state.population,
    );

    if (lost > 0) {
      state.addResource('population', -lost);
      state.stats.citizensLost += lost;
      notes.push({
        kind: 'disaster',
        icon: '💀',
        text: `Голод! Город покинули ${lost} жителей`,
      });
    }
  }

  const maintenance = computeMaintenance(state);
  if (state.resource('gold') >= maintenance) {
    state.addResource('gold', -maintenance);
  } else {
    state.setResource('gold', 0);
    notes.push({
      kind: 'warning',
      icon: '💸',
      text: 'Казны не хватило на обслуживание зданий',
    });
  }

  return notes;
}

/**
 * Отток из-за недовольства.
 *
 * Народ уходит сам: −2 означает пятерых в день, −1 — двоих. Счастье при
 * этом не ухудшается — оно и так минимально.
 */
export function applyHappinessOutflow(state) {
  const leaving = Math.min(computeHappinessOutflow(state), state.population);
  if (leaving <= 0) return 0;

  state.addResource('population', -leaving);
  state.stats.citizensLost += leaving;
  return leaving;
}

/** Производство за день. */
export function applyProduction(state) {
  const production = computeProduction(state);

  for (const [resource, amount] of Object.entries(production)) {
    if (amount === 0) continue;

    if (resource === 'faith') {
      // В прототипе вера ограничена сверху сотней
      state.setResource('faith', Math.min(BALANCE.faithMax, state.resource('faith') + amount));
    } else {
      state.addResource(resource, amount);
    }
  }

  state.stats.totalGoldEarned += production.gold;
}

/**
 * Сбор налогов за день.
 *
 * Доход идёт от жителей, а не от производства. Рынки не приносят золота
 * рабочими — они добавляют к сбору с каждого жителя.
 */
export function applyTaxIncome(state) {
  const income = computeTaxIncome(state);
  if (income <= 0) return 0;

  state.addResource('gold', income);
  state.stats.totalGoldEarned += income;
  return income;
}

/**
 * Автоназначение рабочих.
 *
 * Итерация идёт по порядку объявления зданий в BALANCE.buildings, поэтому при
 * нехватке людей слоты забирают более ранние типы — поведение прототипа
 * сохранено. Возвращает число назначенных рабочих.
 */
export function autoAssignWorkers(state) {
  let assigned = 0;

  for (const buildingKey of WORKFORCE_BUILDINGS) {
    const capacity = state.workerCapacity(buildingKey);
    const current = state.workerCount(buildingKey);
    const free = state.freeWorkers;

    if (free <= 0 || current >= capacity) continue;

    const take = Math.min(free, capacity - current);
    state.workers[buildingKey] = current + take;
    assigned += take;
  }

  return assigned;
}

/** Проверка, хватает ли ресурсов на списание. */
export function canAfford(state, cost = {}) {
  return Object.entries(cost).every(([resource, amount]) => state.resource(resource) >= amount);
}

/** Списание ресурсов. Возвращает false, если не хватило. */
export function spend(state, cost = {}) {
  if (!canAfford(state, cost)) return false;
  for (const [resource, amount] of Object.entries(cost)) {
    state.addResource(resource, -amount);
  }
  return true;
}