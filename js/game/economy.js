// ============================================================================
// Economy — расчёты производства, потребления и обслуживания.
//
// Здесь считается ВСЁ, что связано с числами за день. Источник один,
// поэтому предварительный подсчёт в интерфейсе не может разойтись с итогом.
//
// Правила зданий:
//   * производственное здание работает только на своём уровне поселения;
//   * социальные и дорожные здания действуют на всех уровнях;
//   * эффекты одного типа суммируются по всем действующим зданиям.
// ============================================================================

import { BALANCE, WORKFORCE_BUILDINGS } from '../balance.js';

/**
 * Пищевой ресурс текущего уровня: зерно → мука → мясо → деликатесы.
 * Берётся самый высокий из пищевых ресурсов, не выше текущего уровня.
 */
export function currentFoodKey(state) {
  let best = 'food';
  let bestTier = -1;

  for (const [key, def] of Object.entries(BALANCE.resources)) {
    if (!def.isFood) continue;
    if (def.tier > state.tier || def.tier <= bestTier) continue;
    best = key;
    bestTier = def.tier;
  }

  return best;
}

/** Все ресурсы с нулями — основа для расчётов. */
export function emptyOutput() {
  return Object.fromEntries(Object.keys(BALANCE.resources).map((key) => [key, 0]));
}

/**
 * Здание сейчас работает?
 * Производственное — только на своём уровне. Остальные — всегда.
 */
export function isOperating(def, tier) {
  if (def.kind === 'production') return def.level === tier;
  return true;
}

/** Стоимость здания на данном уровне поселения. */
export function costOf(def, tier) {
  return def.costByLevel?.[tier] ?? def.cost ?? {};
}

/** Сумма эффекта по всем действующим зданиям, включая бонусы технологий. */
export function socialEffect(state, effect) {
  let total = 0;

  for (const [key, def] of Object.entries(BALANCE.buildings)) {
    const count = state.buildingCount(key);
    if (count <= 0) continue;
    if (!isOperating(def, state.tier)) continue;
    total += (def.effects?.[effect] ?? 0) * count;
  }

  for (const [techKey, tech] of Object.entries(BALANCE.technologies)) {
    if (!state.hasTechnology(techKey)) continue;
    const bonus = tech.effectBonus;
    if (!bonus || bonus.effect !== effect) continue;
    total += bonus.amount * state.buildingCount(bonus.building);
  }

  return total;
}

/**
 * Уровень счастья на сегодня.
 *
 * База от ставки налога плюс сумма эффектов «счастье» от построенных
 * зданий. Результат ограничен пределами [-2, +2].
 */
export function computeHappiness(state, taxIndex = state.taxRateIndex) {
  const { happiness, taxes, taxDefaultIndex } = BALANCE;
  const [min, max] = happiness.range;

  const tax = taxes[taxIndex] ?? taxes[taxDefaultIndex];
  // База: налог и социальные здания. Плюс модификаторы: ожидание, события.
  const level = tax.happinessBase + socialEffect(state, 'happiness') + state.moodSum();

  return Math.min(max, Math.max(min, level));
}

/**
 * Сбор налогов за день в золоте.
 *
 * Базовая ставка растёт с уровнем поселения; рынки добавляют золото с
 * каждого жителя; банк, пристань и дороги дают золото в день.
 */
export function computeTaxIncome(state, taxIndex = state.taxRateIndex) {
  const tax = BALANCE.taxes[taxIndex] ?? BALANCE.taxes[BALANCE.taxDefaultIndex];
  const tierMult = BALANCE.tierTaxMult[state.tier - 1] ?? 1;
  const perCitizen = tax.goldPerCitizen * tierMult + socialEffect(state, 'goldPerCitizen');

  const fromCitizens = state.population * perCitizen;
  const fixed = socialEffect(state, 'goldPerDay');

  return Math.max(0, Math.floor(fromCitizens + fixed));
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
 *
 * Каждое действующее производственное здание с рабочими даёт:
 *   рабочие × выработка на одного
 *   + дороги × productionPerProducer
 *   + уровень счастья (если положительный)
 *   + бонус технологии, если она открыта
 *   + сезонная поправка (только для ферм)
 */
export function computeProduction(state) {
  const out = emptyOutput();
  const season = BALANCE.seasons[state.seasonIndex];
  const roads = state.buildingCount('roads');
  const roadBonus = roads * (BALANCE.buildings.roads.effects.productionPerProducer ?? 0);
  // Счастье прибавляет (или отнимает) по N ед. к выработке каждого работающего
  // здания: −2 → −2, −1 → −1, 0 → нет, +1 → +1, +2 → +2.
  const moodBonus = state.happinessLevel;

  for (const buildingKey of WORKFORCE_BUILDINGS) {
    const def = BALANCE.buildings[buildingKey];
    if (!isOperating(def, state.tier)) continue;
    if (!def.produces) continue;

    const workers = state.workerCount(buildingKey);
    if (workers <= 0) continue;

    // Бонусы действуют на каждое работающее здание, а не на тип целиком.
    // Работает столько зданий, сколько нужно, чтобы разместить рабочих.
    const working = Math.min(state.buildingCount(buildingKey), Math.ceil(workers / def.workers));

    for (const [resource, perWorker] of Object.entries(def.produces)) {
      let amount = workers * perWorker;

      // Каждое работающее здание получает бонусы дорог и счастья
      amount += working * (roadBonus + moodBonus);

      for (const [techKey, tech] of Object.entries(BALANCE.technologies)) {
        if (!state.hasTechnology(techKey)) continue;
        const bonus = tech.productionBonus;
        if (bonus && bonus.building === buildingKey && bonus.resource === resource) {
          amount += bonus.amount * working;
        }
      }

      if (resource === 'food' && buildingKey === 'farms') {
        amount += season.foodPerFarm * working;
      }

      out[resource] += Math.max(0, Math.floor(amount));
    }
  }

  out[currentFoodKey(state)] += socialEffect(state, 'foodPerDay');

  return out;
}

/** Обслуживание в золоте за день. */
export function computeMaintenance(state) {
  let sum = 0;
  for (const [key, def] of Object.entries(BALANCE.buildings)) {
    if (!isOperating(def, state.tier)) continue;
    sum += state.buildingCount(key) * (def.maintenance ?? 0);
  }
  const growth = 1 + state.day / BALANCE.economy.maintenanceGrowthDivisor;
  return Math.floor(sum * growth);
}

/** Потребление еды за день. */
export function foodPerCitizen(state) {
  const table = BALANCE.population.foodPerCitizenPerDay;
  return table[state.tier - 1] ?? table[table.length - 1];
}

export function computeFoodConsumption(state) {
  return Math.floor(state.population * foodPerCitizen(state));
}

/** Сводка за день без изменения состояния — для интерфейса и симуляций. */
export function computeDaily(state) {
  return {
    production: computeProduction(state),
    foodKey: currentFoodKey(state),
    maintenance: computeMaintenance(state),
    foodConsumption: computeFoodConsumption(state),
    // Чистый приход золота в день: налог минус обслуживание зданий
    goldNet: computeTaxIncome(state) - computeMaintenance(state),
    taxIncome: computeTaxIncome(state),
  };
}

/**
 * Ресурсы, видимые на текущем уровне: всегда видимые плюс свой уровень.
 * Ресурсы прошлых уровней скрыты и не производятся.
 */
export function visibleResources(state) {
  const keep = new Set(state.tierDef?.keepVisible ?? []);

  return BALANCE.resourceOrder.filter((key) => {
    const tier = BALANCE.resources[key].tier;
    return tier === 0 || tier === state.tier || keep.has(key);
  });
}

/**
 * Потребление: еда и обслуживание зданий.
 * Возвращает список записей для хроники, не трогая саму хронику.
 */
export function applyConsumption(state) {
  const notes = [];

  const need = computeFoodConsumption(state);
  const foodKey = currentFoodKey(state);
  const food = state.resource(foodKey);

  if (food >= need) {
    state.addResource(foodKey, -need);
    state.stats.totalFoodConsumed += need;
  } else {
    const shortage = need - food;
    state.setResource(foodKey, 0);

    // Нехватка еды отбирает жителей: часть от голода, дополнительно —
    // по числу недовольных.
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
 * Народ уходит сам: при −2 — пятеро в день, при −1 — двое.
 */
export function applyHappinessOutflow(state) {
  const leaving = Math.min(computeHappinessOutflow(state), state.population);
  if (leaving <= 0) return 0;

  state.addResource('population', -leaving);
  state.stats.citizensLost += leaving;
  return leaving;
}

/** Производство за день: ресурсы и знания от социальных зданий. */
export function applyProduction(state) {
  const production = computeProduction(state);

  for (const [resource, amount] of Object.entries(production)) {
    if (amount !== 0) state.addResource(resource, amount);
  }

}

/**
 * Сбор налогов за день.
 * Доход идёт от жителей, а не от работы.
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
 * Итерация идёт по порядку объявления зданий, поэтому при нехватке людей
 * слоты забирают более ранние типы. Возвращает число назначенных рабочих.
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
