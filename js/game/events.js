// ============================================================================
// Events — случайные события.
//
// Каждое событие описано данными в BALANCE.events.definitions, а не кодом:
// пороги, вероятности и размеры урона лежат в balance.js.
// ============================================================================

import { BALANCE } from '../balance.js';
import { currentFoodKey, socialEffect } from './economy.js';

const DEFS = BALANCE.events.definitions;

/** Есть ли шанс, что сегодня что-то случится. Возвращает вероятность в [0,1]. */
export function eventChance(state) {
  const { chanceBase, chancePerTwoPopulation, chancePerFiftyDays } = BALANCE.events;
  const percent =
    chanceBase +
    state.population / chancePerTwoPopulation +
    state.day / chancePerFiftyDays;
  return Math.min(BALANCE.events.maxChance, percent) / 100;
}

/** Список событий, доступных при текущем состоянии. */
export function availableEvents(state) {
  const list = [];

  for (const [id, def] of Object.entries(DEFS)) {
    if (def.minPopulation != null && state.population < def.minPopulation) continue;

    if (def.seasons) {
      const seasonId = BALANCE.seasons[state.seasonIndex].id;
      if (!def.seasons.includes(seasonId)) continue;
    }

    // happinessBelow задаёт предел уровня: событие идёт, только если
    // народ доволен не выше этого уровня
    if (def.happinessBelow != null && state.happiness > def.happinessBelow) continue;

    if (def.foodBelowPopulationMultiplier != null) {
      const threshold = state.population * def.foodBelowPopulationMultiplier;
      if (state.resource(currentFoodKey(state)) >= threshold) continue;
    }

    if (def.requiresBuildings?.some((key) => state.buildingCount(key) <= 0)) continue;

    if (def.requiresTechnologies?.some((key) => !state.hasTechnology(key))) continue;

    list.push(id);
  }

  return list;
}

/**
 * Разыгрывает событие дня, если оно выпало.
 * Возвращает запись для хроники либо null.
 */
export function rollDailyEvent(state, rng) {
  if (!rng.chance(eventChance(state))) return null;

  const pool = availableEvents(state);
  if (pool.length === 0) return null;

  const id = rng.pick(pool);
  state.stats.randomEvents += 1;
  return trigger(state, id, rng);
}

/** Мгновенное событие меняет счастье модификатором на eventDays дней, а не сдвигом. */
function addEventMood(state, tag, delta) {
  if (!delta) return;
  state.addMood({ tag, delta, days: BALANCE.happiness.moods.eventDays });
}

function loss(state, amount, floor = true) {
  return floor ? Math.floor(amount) : amount;
}

export function trigger(state, id, rng) {
  const def = DEFS[id];
  const note = { kind: def.kind, icon: def.icon, text: '' };

  switch (id) {
    case 'merchant': {
      const foodCost = rng.int(def.foodCost.min, def.foodCost.max);
      const goldGain = rng.int(def.goldGain.min, def.goldGain.max);

      const foodKey = currentFoodKey(state);
      if (state.resource(foodKey) >= foodCost) {
        state.addResource(foodKey, -foodCost);
        state.addResource('gold', goldGain);
        state.stats.tradesCompleted += 1;
        note.text = `Купеческий караван! +${goldGain} золота, -${foodCost} еды`;
      } else {
        note.text = 'Купеческий караван проехал мимо — не хватило еды';
      }
      break;
    }

    case 'bandits': {
      const strength = def.strengthBase + Math.floor(state.day * def.strengthPerDays);
      const defense =
        socialEffect(state, 'guardDefense') +
        state.population / def.populationDefenseDivisor;

      if (defense > strength * def.defendRatio) {
        const loot = rng.int(def.goldLoot.min, def.goldLoot.max);
        state.addResource('gold', loot);
        note.text = `Нападение бандитов отбито! Взят трофей: +${loot} золота`;
      } else {
        const goldLost = Math.min(def.goldLossMax, state.resource('gold'));
        const peopleLost = Math.min(
          def.populationLossMax,
          loss(state, state.population * def.populationLossPercent),
        );

        state.addResource('gold', -goldLost);
        state.addResource('population', -peopleLost);
        addEventMood(state, def.moodTag ?? 'event', -def.happinessLoss);
        state.stats.citizensLost += peopleLost;

        note.text = `Нападение бандитов! Потери: -${goldLost} золота, -${peopleLost} жителей`;
      }
      break;
    }

    case 'disease': {
      const severity = rng.float();
      let deaths = loss(
        state,
        state.population * (severity * (def.lossPercentMax - def.lossPercentMin) + def.lossPercentMin),
      );

      // Больницы и образование спасают часть жителей — числом, не долей
      deaths = Math.max(0, deaths - socialEffect(state, 'epidemicLossReduction'));
      deaths = Math.min(deaths, state.population);
      state.addResource('population', -deaths);
      addEventMood(state, def.moodTag ?? 'event', -def.happinessLoss);
      state.stats.citizensLost += deaths;

      note.text = `Эпидемия! Погибло ${deaths} жителей`;
      break;
    }

    case 'harvest': {
      const gain = rng.int(def.foodGain.min, def.foodGain.max);
      state.addResource(currentFoodKey(state), gain);
      note.text = `Урожайный год! +${gain} еды`;
      break;
    }

    case 'blizzard': {
      const foodKey = currentFoodKey(state);
      const foodLost = Math.min(def.foodLossMax, state.resource(foodKey));
      const woodLost = Math.min(def.woodLossMax, state.resource('wood'));

      state.addResource(foodKey, -foodLost);
      state.addResource('wood', -woodLost);
      addEventMood(state, def.moodTag ?? 'event', -def.happinessLoss);

      note.text = `Метель! Потери: -${foodLost} еды, -${woodLost} древесины`;
      break;
    }

    case 'famine_warning': {
      addEventMood(state, def.moodTag ?? 'event', -def.happinessLoss);
      note.text = 'Запасы еды на исходе!';
      break;
    }

    case 'revolt': {
      // Насколько глубоко народ провалился ниже приемлемого уровня:
      // при -2 против допустимого -1 сила бунта равна 1.
      const rebellion = def.suppressionHappinessBase - state.happiness;
      const suppression =
        socialEffect(state, 'suppressionGuard') +
        state.population * def.suppressionPerPopulationHalf;

      if (suppression > rebellion) {
        addEventMood(state, 'riot', def.happinessGainOnSuccess);
        note.text = 'Волнения в городе подавлены';
      } else {
        const deaths = Math.min(
          def.populationLossMax,
          loss(state, state.population * def.populationLossPercent),
        );
        state.addResource('population', -deaths);
        state.stats.citizensLost += deaths;
        note.text = `Восстание! Погибло ${deaths} жителей`;
      }
      break;
    }

    case 'siege': {
      const enemy = def.enemyStrengthBase + Math.floor(state.day * def.enemyStrengthPerDays);
      const defense =
        socialEffect(state, 'guardDefense') +
        state.population / def.populationDefenseDivisor;

      if (defense > enemy) {
        note.text = 'Осада отбита!';
      } else {
        const damage = Math.floor((enemy - defense) / 2);
        const deaths = Math.min(def.populationLossMax, damage);
        const housesLost = Math.floor(damage / def.housesLossPerDamage);
        const housesRemoved = Math.min(state.buildingCount('houses'), housesLost);

        state.addResource('population', -deaths);
        state.stats.citizensLost += deaths;
        state.addBuilding('houses', -housesRemoved);

        note.text = `Осада! Потери: ${deaths} жителей, ${housesRemoved} домов`;
      }
      break;
    }

    case 'trade_fair': {
      const gain = rng.int(def.goldGain.min, def.goldGain.max);
      state.addResource('gold', gain);
      state.stats.tradesCompleted += 1;
      note.text = `Торговый фестиваль! +${gain} золота`;
      break;
    }

    default:
      return null;
  }

  state.clampHappiness();
  note.text = note.text || def.name;
  return note;
}