// ============================================================================
// BALANCE — единственный источник всех числовых значений в игре.
//
// Правило проекта: ни одной «магической» цифры в файлах js/game/**, js/render/**
// и js/ui/**. Всё берётся отсюда. Это позволяет балансировать игру правкой
// одного файла и прогонять симуляции (см. SYSTEMS_SPEC.md §7).
//
// Структура разделов соответствует разделам SYSTEMS_SPEC.md, чтобы этап 2
// мог наполнять существующие места, не переписывая код.
// ============================================================================

// Вспомогательные разделы вынесены отдельно, чтобы значения не дублировались:
// например, прибавка счастья за дом используется и здесь, и в постройке.
const HAPPINESS = {
  start: 80,
  min: 0,
  max: 100,
  dailyDecay: 1,
  starvationPerDeath: 5,
  unpaidMaintenancePenalty: 5,
  perHouse: 5,
  // Этап 2 (SYSTEMS_SPEC §2): счастье станет дискретным уровнем -2..+2.
  // Значения подготовлены заранее.
  phase2Levels: {
    leavePerDayHigh: 5,
    leavePerDayLow: 2,
    starvationOutflow: 3,
    prodMult: { '-2': 1, '-1': 1, 0: 1, 1: 1.1, 2: 1.25 },
  },
};

const POPULATION = {
  // Прирост населения. В прототипе его не было вовсе: жители только
  // убывали (голод, бандиты, эпидемия, волнения, осада), из-за чего победа
  // с требованием «население >= 100» была принципиально недостижима.
  //
  // Рост идёт по мере застройки домов, которые поднимают maxPopulation,
  // и только пока хватает еды. Это согласуется с SYSTEMS_SPEC §1.5:
  // «приток жителей — исключительно через застройку домов и события».
  growthPerDay: 1,
  foodPerCitizenPerDay: 0.5,
  starveDeathsPerShortageUnit: 0.2,
  perHouseCapacity: 5,
};

export const BALANCE = {
  meta: {
    schema: 2,
    balanceVersion: 1,
  },

  // --------------------------------------------------------------------------
  // Город и стартовое состояние
  // --------------------------------------------------------------------------
  city: {
    defaultName: 'НОВЫЙ РАССВЕТ',
  },

  start: {
    day: 1,
    year: 1,
    seasonIndex: 0,
    resources: {
      gold: 100,
      food: 50,
      wood: 30,
      stone: 20,
      faith: 50,
      knowledge: 10,
      population: 10,
      maxPopulation: 10,
      happiness: HAPPINESS.start,
    },
    buildings: { houses: 1 },
  },

  // --------------------------------------------------------------------------
  // Ресурсы (запасы) — отображаются в панели, тратятся, производятся
  //
  // unit — формы родительного падежа для подписей вида «20 древесины».
  // Без них интерфейс писал бы «20 древесина», что по-русски неверно.
  // --------------------------------------------------------------------------
  resources: {
    gold:      { name: 'Золото',    icon: '💰', unit: { one: 'золото', few: 'золота', many: 'золота' } },
    food:      { name: 'Еда',       icon: '🍞', isFood: true, unit: { one: 'еды', few: 'еды', many: 'еды' } },
    wood:      { name: 'Древесина', icon: '🪵', unit: { one: 'древесины', few: 'древесины', many: 'древесины' } },
    stone:     { name: 'Камень',    icon: '🪨', unit: { one: 'камень', few: 'камня', many: 'камней' } },
    faith:     { name: 'Вера',      icon: '✝️', unit: { one: 'веры', few: 'веры', many: 'веры' } },
    knowledge: { name: 'Знания',    icon: '🧠', unit: { one: 'знание', few: 'знания', many: 'знаний' } },
  },

  // Порядок вывода в панели статистики (население и счастье — не ресурсы)
  resourceOrder: ['gold', 'food', 'wood', 'stone', 'faith', 'knowledge'],

  // --------------------------------------------------------------------------
  // Показатели, не являющиеся ресурсами
  // --------------------------------------------------------------------------
  meters: {
    population: { name: 'Население', icon: '👥' },
    happiness:  { name: 'Счастье',   icon: '😊', min: HAPPINESS.min, max: HAPPINESS.max },
    workers:    { name: 'Рабочие',   icon: '👷' },
  },

  happiness: HAPPINESS,
  population: POPULATION,

  // --------------------------------------------------------------------------
  // Сезоны
  // --------------------------------------------------------------------------
  seasons: [
    { id: 'spring', name: 'Весна', icon: '🌸', days: 30, foodMult: 1.0 },
    { id: 'summer', name: 'Лето',  icon: '☀️', days: 30, foodMult: 1.2 },
    { id: 'autumn', name: 'Осень', icon: '🍂', days: 30, foodMult: 1.0 },
    { id: 'winter', name: 'Зима',  icon: '❄️', days: 30, foodMult: 0.3 },
  ],

  // --------------------------------------------------------------------------
  // Здания
  //
  // cost        — списание при постройке
  // workers     — ёмкость рабочих на одно здание (0 = рабочие не нужны)
  // produces    — производство на одного рабочего в день
  // maintenance — базовый коэффициент обслуживания в золоте за день
  // unlock      — условия доступности в выборах
  // onBuild     — эффекты, применяемые при постройке
  // --------------------------------------------------------------------------
  buildings: {
    houses: {
      name: 'Дом', actionLabel: 'Построить дом', icon: '🏠',
      cost: { wood: 20, stone: 10 },
      workers: 0,
      produces: null,
      maintenance: 0.1,
      unlock: {},
      onBuild: { maxPopulation: POPULATION.perHouseCapacity, happiness: HAPPINESS.perHouse },
    },
    farms: {
      name: 'Ферма', actionLabel: 'Построить ферму', icon: '🌾',
      cost: { gold: 15, wood: 10 },
      workers: 2,
      produces: { food: 5 },
      maintenance: 0.2,
      unlock: { freeWorkers: 1 },
    },
    lumberMills: {
      name: 'Лесопилка', actionLabel: 'Построить лесопилку', icon: '🪓',
      cost: { gold: 20, wood: 15 },
      workers: 2,
      produces: { wood: 8 },
      maintenance: 0.3,
      unlock: { freeWorkers: 1 },
    },
    quarries: {
      name: 'Карьер', actionLabel: 'Построить карьер', icon: '⛏️',
      cost: { gold: 25, wood: 10, stone: 5 },
      workers: 2,
      produces: { stone: 6 },
      maintenance: 0.3,
      unlock: { freeWorkers: 1 },
    },
    markets: {
      name: 'Рынок', actionLabel: 'Построить рынок', icon: '🏪',
      cost: { gold: 30, wood: 20, stone: 10 },
      workers: 3,
      produces: { gold: 10 },
      maintenance: 0.5,
      unlock: { buildings: { farms: 1 }, freeWorkers: 3 },
    },
    temples: {
      name: 'Храм', actionLabel: 'Построить храм', icon: '⛪',
      cost: { gold: 50, wood: 30, stone: 20 },
      workers: 1,
      produces: { faith: 2 },
      maintenance: 0.4,
      unlock: { buildings: { houses: 3 }, freeWorkers: 1 },
    },
    schools: {
      name: 'Школа', actionLabel: 'Построить школу', icon: '🏫',
      cost: { gold: 40, wood: 25 },
      workers: 1,
      produces: { knowledge: 0.5 },
      maintenance: 0.3,
      unlock: { buildings: { farms: 2 }, freeWorkers: 1 },
    },
    walls: {
      name: 'Стена', actionLabel: 'Построить стену', icon: '🧱',
      cost: { gold: 40, stone: 30 },
      workers: 0,
      produces: null,
      maintenance: 0.2,
      unlock: { buildings: { houses: 5 } },
    },
    towers: {
      name: 'Башня', actionLabel: 'Построить башню', icon: '🗼',
      cost: { gold: 60, wood: 20, stone: 40 },
      workers: 0,
      produces: null,
      maintenance: 0.5,
      unlock: { buildings: { walls: 1 } },
    },
  },

  // --------------------------------------------------------------------------
  // Технологии
  //
  // productionMult        — множитель производства указанного ресурса
  // happinessPerWorker    — прибавка счастья за рабочего в requiresBuilding
  // lossMult              — множитель потерь (например, от эпидемии)
  // --------------------------------------------------------------------------
  technologies: {
    advancedFarming: {
      name: 'Передовое земледелие', actionLabel: 'Развить передовое земледелие', icon: '🌱',
      cost: { knowledge: 20 },
      requiresBuilding: 'farms',
      productionMult: { food: 1.5 },
    },
    lumberProcessing: {
      name: 'Обработка древесины', actionLabel: 'Развить обработку древесины', icon: '🌳',
      cost: { knowledge: 15 },
      requiresBuilding: 'lumberMills',
      productionMult: { wood: 1.5 },
    },
    stoneMasonry: {
      name: 'Каменная кладка', actionLabel: 'Развить каменную кладку', icon: '🪨',
      cost: { knowledge: 15 },
      requiresBuilding: 'quarries',
      productionMult: { stone: 1.5 },
    },
    tradeRoutes: {
      name: 'Торговые маршруты', actionLabel: 'Развить торговые маршруты', icon: '💰',
      cost: { knowledge: 25 },
      requiresBuilding: 'markets',
      productionMult: { gold: 1.5 },
    },
    religion: {
      name: 'Религия', actionLabel: 'Развить религию', icon: '⛪',
      cost: { faith: 50 },
      requiresBuilding: 'temples',
      happinessPerWorker: 1,
    },
    education: {
      name: 'Образование', actionLabel: 'Развить образование', icon: '🎓',
      cost: { knowledge: 30 },
      requiresBuilding: 'schools',
      lossMult: { plague: 0.5 },
    },
    fortification: {
      name: 'Фортификация', actionLabel: 'Развить фортификацию', icon: '🛡️',
      cost: { knowledge: 35 },
      requiresBuilding: 'walls',
      // ВНИМАНИЕ: в прототипе технология тратила знания, но не давала
      // никакого эффекта — мёртвый сток. Поведение сохранено как есть, чтобы
      // не менять баланс незаметно. Эффект зададим на этапе 2 вместе с
      // налётами и осадой. См. docs/ROADMAP.md, раздел «Известные проблемы».
      noEffectYet: true,
    },
  },

  // --------------------------------------------------------------------------
  // Экономика
  // --------------------------------------------------------------------------
  economy: {
    // Обслуживание: floor(sum(кол-во × maintenance) × (1 + day / growthDivisor))
    maintenanceGrowthDivisor: 1000,
    trade: { foodCost: 15, goldGain: 30 },
    expedition: {
      cost: 10,
      baseSuccessChance: 0.6,
      knowledgeBonusPerHundred: 0.2,
      rewards: [
        { resource: 'gold',  min: 50, max: 99, weight: 0.33 },
        { resource: 'wood',  min: 30, max: 69, weight: 0.33 },
        { resource: 'stone', min: 20, max: 49, weight: 0.34 },
      ],
      failureLoss: { min: 5, max: 14 },
    },
  },

  // --------------------------------------------------------------------------
  // Случайные события
  //
  // Шанс в процентах: chanceBase + population / chancePerTwoPopulation
  //                  + day / chancePerFiftyDays
  // --------------------------------------------------------------------------
  events: {
    chanceBase: 10,
    chancePerTwoPopulation: 2,
    chancePerFiftyDays: 50,

    definitions: {
      merchant: {
        name: 'Купеческий караван', icon: '💰', kind: 'trade',
        foodCost: { min: 10, max: 29 },
        goldGain: { min: 20, max: 49 },
      },
      bandits: {
        name: 'Нападение бандитов', icon: '⚔️', kind: 'disaster',
        minPopulation: 20,
        strengthBase: 10,
        strengthPerDays: 0.05,
        towerDefense: 5,
        populationDefenseDivisor: 2,
        defendRatio: 0.8,
        goldLoot: { min: 15, max: 39 },
        goldLossMax: 30,
        populationLossPercent: 0.2,
        populationLossMax: 5,
        happinessLoss: 20,
      },
      disease: {
        name: 'Эпидемия', icon: '🤒', kind: 'disaster',
        minPopulation: 30,
        lossPercentMin: 0.05,
        lossPercentMax: 0.35,
        happinessLoss: 15,
      },
      harvest: {
        name: 'Урожайный год', icon: '🌾', kind: 'social',
        seasons: ['summer'],
        foodGain: { min: 20, max: 49 },
      },
      blizzard: {
        name: 'Метель', icon: '❄️', kind: 'disaster',
        seasons: ['winter'],
        foodLossMax: 20,
        woodLossMax: 15,
        happinessLoss: 10,
      },
      famine_warning: {
        name: 'Запасы еды на исходе', icon: '⚠️', kind: 'warning',
        foodBelowPopulationMultiplier: 3,
        happinessLoss: 5,
      },
      revolt: {
        name: 'Волнения', icon: '🔥', kind: 'social',
        happinessBelow: 30,
        suppressionHappinessBase: 50,
        suppressionTower: 3,
        suppressionPerPopulationHalf: 0.5,
        happinessGainOnSuccess: 10,
        populationLossPercent: 0.3,
        populationLossMax: 10,
      },
      siege: {
        name: 'Осада', icon: '🏰', kind: 'disaster',
        requiresBuildings: ['walls'],
        enemyStrengthBase: 40,
        enemyStrengthPerDays: 0.1,
        wallDefense: 10,
        towerDefense: 15,
        populationDefenseDivisor: 2,
        populationLossMax: 15,
        housesLossPerDamage: 5,
      },
      trade_fair: {
        name: 'Торговый фестиваль', icon: '🎪', kind: 'trade',
        requiresTechnologies: ['tradeRoutes'],
        goldGain: { min: 40, max: 99 },
      },
    },
  },

  // --------------------------------------------------------------------------
  // Условия окончания партии
  //
  // Поражение проверяется сверху вниз, победа — последней и потому имеет
  // приоритет: так вела себя исходная проверка, и это разумно.
  // --------------------------------------------------------------------------
  endConditions: {
    defeat: [
      {
        id: 'depopulation',
        when: { populationMax: 0 },
        reason: 'Все жители погибли. Поселение брошено.',
        icon: '💀',
      },
      {
        id: 'revolt',
        when: { happinessMax: 0, populationMin: 6 },
        reason: 'Жители восстали и изгнали вас из города.',
        icon: '🔥',
      },
      {
        id: 'famine',
        when: { foodMax: 0, populationMin: 1 },
        reason: 'Голод уничтожил ваше поселение.',
        icon: '💀',
      },
    ],
    victory: {
      populationMin: 100,
      buildings: { temples: 3, markets: 3 },
      reason: 'Ваш город процветает! Вы выиграли!',
      icon: '🎉',
    },
  },

  // --------------------------------------------------------------------------
  // Выборы действий
  //
  // Приоритет: чем выше в списке, тем раньше попадает в слоты. Выборы одной
  // группы перемешиваются, чтобы последовательность не повторялась день
  // за днём.
  // --------------------------------------------------------------------------
  choices: {
    slots: 4,
    // Полные идентификаторы действий, ровно в том виде, в каком их
    // возвращает engine.availableActions(). Порядок значим: чем выше,
    // тем раньше действие попадёт в слоты.
    priority: [
      'build:houses', 'build:farms', 'build:lumberMills', 'build:quarries', 'build:markets',
      'build:temples', 'build:schools', 'build:walls', 'build:towers',
      'develop:advancedFarming', 'develop:lumberProcessing', 'develop:stoneMasonry',
      'develop:tradeRoutes', 'develop:religion', 'develop:education', 'develop:fortification',
      'trade', 'expedition', 'wait',
    ],
    actions: {
      trade:     { label: 'Торговать', icon: '💵' },
      expedition: { label: 'Отправить экспедицию', icon: '🗺️' },
      wait:      { label: 'Подождать', icon: '⏳' },
    },
  },

  // --------------------------------------------------------------------------
  // Хроника
  // --------------------------------------------------------------------------
  chronicle: {
    storedEntries: 300,
    renderedEntries: 60,
    kinds: {
      start:    { className: 'kind-start',    label: 'Начало' },
      build:    { className: 'kind-build',    label: 'Строительство' },
      research: { className: 'kind-research', label: 'Развитие' },
      trade:    { className: 'kind-trade',    label: 'Торговля' },
      disaster: { className: 'kind-disaster', label: 'Бедствие' },
      social:   { className: 'kind-social',   label: 'Город' },
      warning:  { className: 'kind-warning',  label: 'Тревога' },
      end:      { className: 'kind-end',      label: 'Итог' },
    },
  },

  // --------------------------------------------------------------------------
  // Этап 2: заготовки по SYSTEMS_SPEC.md. Пока кодом не используются,
  // но место подготовлено, чтобы этап 2 не ломал структуру баланса.
  // --------------------------------------------------------------------------
  taxes: [
    { rate: 0.10, happinessBase:  2, goldPerCitizen: 1 },
    { rate: 0.20, happinessBase:  1, goldPerCitizen: 2 },
    { rate: 0.30, happinessBase:  0, goldPerCitizen: 3 },
    { rate: 0.40, happinessBase: -1, goldPerCitizen: 4 },
    { rate: 0.50, happinessBase: -2, goldPerCitizen: 5 },
  ],
  tierTaxMult: [1, 2, 4, 8],
  development: [],

  maintenance: { base: 1, perDay: 0.001 }, // наследие исходной системы
};

// Имена ресурсов, по которым ведётся производство и обслуживание
export const WORKFORCE_BUILDINGS = Object.freeze(
  Object.entries(BALANCE.buildings)
    .filter(([, def]) => def.workers > 0)
    .map(([key]) => key),
);

export const BUILDING_KEYS = Object.freeze(Object.keys(BALANCE.buildings));
export const TECHNOLOGY_KEYS = Object.freeze(Object.keys(BALANCE.technologies));