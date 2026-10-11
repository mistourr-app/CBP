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
 * Производство за день.
 * Учитывает технологии и сезонные множители.
 * faith ограничен сверху BALANCE.happiness.max — как было в прототипе.
 */
export function computeProduction(state) {
  const seasonFoodMult = BALANCE.seasons[state.seasonIndex].foodMult;
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

  // Счастье от религии: прибавка за каждого рабочего в храме
  const religion = BALANCE.technologies.religion;
  if (state.hasTechnology('religion')) {
    out.happiness = state.workerCount('temples') * religion.happinessPerWorker;
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
 * Потребление: еда, обслуживание, суточный спад счастья.
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

    const deaths = Math.min(
      Math.floor(shortage * BALANCE.population.starveDeathsPerShortageUnit),
      state.population,
    );

    if (deaths > 0) {
      state.addResource('population', -deaths);
      state.addResource('happiness', -deaths * BALANCE.happiness.starvationPerDeath);
      state.stats.citizensLost += deaths;
      notes.push({
        kind: 'disaster',
        icon: '💀',
        text: `Голод! Погибло ${deaths} жителей`,
      });
    }
  }

  const maintenance = computeMaintenance(state);
  if (state.resource('gold') >= maintenance) {
    state.addResource('gold', -maintenance);
  } else {
    state.setResource('gold', 0);
    state.addResource('happiness', -BALANCE.happiness.unpaidMaintenancePenalty);
    notes.push({
      kind: 'warning',
      icon: '💸',
      text: 'Казны не хватило на обслуживание зданий — счастье падает',
    });
  }

  state.addResource('happiness', -BALANCE.happiness.dailyDecay);
  state.clampHappiness();

  return notes;
}

/** Производство за день. */
export function applyProduction(state) {
  const production = computeProduction(state);

  for (const [resource, amount] of Object.entries(production)) {
    if (resource === 'happiness') {
      state.addResource('happiness', amount);
      continue;
    }
    if (amount === 0) continue;

    if (resource === 'faith') {
      // В прототипе вера ограничена сверху сотней
      state.setResource('faith', Math.min(BALANCE.happiness.max, state.resource('faith') + amount));
    } else {
      state.addResource(resource, amount);
    }
  }

  state.stats.totalGoldEarned += production.gold;
  state.clampHappiness();
}

/**
 * Прирост населения.
 *
 * В прототипе прироста не было вовсе — жители только убывали, поэтому
 * условие победы «население >= 100» было недостижимо и игра была
 * непроходима. Теперь новые жители вселяются в построенные дома
 * (maxPopulation растёт только при постройке домов) и только пока хватает еды.
 */
export function applyPopulationGrowth(state) {
  const { growthPerDay, foodPerCitizenPerDay } = BALANCE.population;
  if (growthPerDay <= 0) return null;

  let arrived = 0;
  for (let i = 0; i < growthPerDay; i += 1) {
    if (state.population >= state.maxPopulation) break;
    const needForNext = foodPerCitizenPerDay * (state.population + 1);
    if (state.resource('food') < needForNext) break;

    state.addResource('population', 1);
    arrived += 1;
  }

  if (arrived === 0) return null;
  state.stats.citizensArrived += arrived;
  return arrived;
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