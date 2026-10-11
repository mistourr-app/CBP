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
  /**
   * Счастье — дискретный уровень, а не шкала 0–100.
   *
   * Уровень вычисляется каждый день: база от ставки налога плюс
   * модификаторы (социальные здания, события), с ограничением по краям.
   *
   *   −2  народ бежит, уходят 5 человек в день
   *   −1  недовольство, уходят 2 человека в день
   *    0  нейтрально
   *   +1  прирост производства 10%
   *   +2  прирост производства 25%
   *
   * Приток жителей — только через застройку домов и события.
   * Повышенное счастье даёт прирост производства, пониженное — отток.
   */
  range: [-2, 2],
  start: 0,

  leavePerDayHigh: 5,   // столько уходит в день при −2
  leavePerDayLow: 2,    // столько уходит в день при −1
  starvationOutflow: 3, // дополнительный отток при нехватке еды

  // Множитель производства по уровню счастья
  prodMult: { '-2': 1, '-1': 1, 0: 1, 1: 1.1, 2: 1.25 },

  /**
   * Модификаторы уровня счастья сверх ставки налога.
   *
   * Пока ставят не сами по себе, а вместе со зданием: храм без
   * «Религии» ничего не даёт. В подэтапе 2.2 сюда добавятся социальные
   * здания — церковь, таверна, площадь.
   */
  religionBonus: 1,

  // Подписи уровня для интерфейса
  levels: {
    '-2': { icon: '😡', label: 'Народ бежит', tone: 'danger' },
    '-1': { icon: '😟', label: 'Недовольны', tone: 'warn' },
    0: { icon: '😐', label: 'Ровно', tone: 'calm' },
    1: { icon: '🙂', label: 'Довольны', tone: 'good' },
    2: { icon: '😄', label: 'Счастливы', tone: 'good' },
  },
};

const POPULATION = {
  // Пассивного прироста нет: новые жители приходят только через постройку
  // домов и события с выбором (SYSTEMS_SPEC §2). Раньше здесь был
  // growthPerDay: 1, но из-за него город разрастался сам, а решение о
  // застройке переставало что-то решать.
  //
  // Лимита населения тоже нет: дом вселяет жителя сразу при постройке,
  // поэтому застройка остаётся единственным верным способом расти.
  foodPerCitizenPerDay: 0.5,
  starveDeathsPerShortageUnit: 0.2,
  residentsPerHouse: 1,
};

/**
 * Налоги — постоянная политика игрока, а не действие каждого хода.
 *
 * Ставка задаёт и доход, и базовое настроение народа: это и есть
 * налоговый маятник. Поднял налог — больше золота, но народ недоволен
 * и уходит, а вместе с ним падает и доход.
 */
const TAXES = [
  { rate: 0.10, happinessBase:  2, goldPerCitizen: 1 },
  { rate: 0.20, happinessBase:  1, goldPerCitizen: 2 },
  { rate: 0.30, happinessBase:  0, goldPerCitizen: 3 },
  { rate: 0.40, happinessBase: -1, goldPerCitizen: 4 },
  { rate: 0.50, happinessBase: -2, goldPerCitizen: 5 },
];

export const BALANCE = {
  meta: {
    // Версия 3: счастье стало уровнем и ушло из ресурсов, у состояния
    // появилась ставка налога. Сохранения версии 2 несовместимы и
    // отбрасываются — партия начинается заново.
    schema: 3,
    balanceVersion: 2,
    // Метка сборки интерфейса. Показывается в плашке города, чтобы можно
    // было сразу понять, что на экране свежая версия, а не закешированная
    // старая. Поднимается при правках раскладки и внешнего вида.
    build: '2026-10-11 · e',
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

  /** Вера не копится выше сотни. */
  faithMax: 100,

  // Порядок вывода в панели статистики (население и счастье — не ресурсы)
  resourceOrder: ['gold', 'food', 'wood', 'stone', 'faith', 'knowledge'],

  // --------------------------------------------------------------------------
  // Развитие поселения
  //
  // Уровень требует накопить набор ресурсов и потратить его переходом.
  // Пока реализован первый уровень целиком: его требования нужны
  // интерфейсу, чтобы показать «собрано из целевого», — сам переход
  // появится в подэтапе 2.4 вместе с новыми ресурсами.
  // --------------------------------------------------------------------------
  development: {
    // Объём на позицию по тирам: 3 → 4 → 5 → 5 типов ресурсов и
    // 100 → 200 → 300 → 400 единиц на каждый
    tierAmounts: [100, 200, 300, 400],

    levels: [
      {
        id: 'settlement',
        name: 'Поселение',
        icon: '🛖',
        nextName: 'Деревня',
        nextIcon: '🏠',

        // Требования к переходу: ресурс → сколько нужно иметь
        requirements: {
          wood: 100,
          stone: 100,
          food: 100,
        },
      },
    ],

    /** Уровень, в котором игра находится сейчас. */
    startLevelIndex: 0,
  },

  // --------------------------------------------------------------------------
  // Показатели, не являющиеся ресурсами
  // --------------------------------------------------------------------------
  meters: {
    population: { name: 'Население', icon: '👥' },
    happiness:  { name: 'Счастье',   icon: '😊', range: HAPPINESS.range },
    tax:        { name: 'Налог',     icon: '⚖️' },
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
      onBuild: { residents: POPULATION.residentsPerHouse },
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
      // Рынок больше не производит золото рабочими: золото идёт от налога,
      // а рынок добавляет к сбору с каждого жителя
      workers: 1,
      produces: { wood: 2 },
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
        // События сдвигают уровень на шаг, а не на проценты
        happinessLoss: 1,
      },
      disease: {
        name: 'Эпидемия', icon: '🤒', kind: 'disaster',
        minPopulation: 30,
        lossPercentMin: 0.05,
        lossPercentMax: 0.35,
        happinessLoss: 1,
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
        happinessLoss: 1,
      },
      famine_warning: {
        name: 'Запасы еды на исходе', icon: '⚠️', kind: 'warning',
        foodBelowPopulationMultiplier: 3,
        happinessLoss: 1,
      },
      revolt: {
        name: 'Волнения', icon: '🔥', kind: 'social',
        // Волнения возможны, только когда народ уже недоволен (-1 и ниже)
        happinessBelow: -1,
        suppressionHappinessBase: -1,
        suppressionTower: 3,
        suppressionPerPopulationHalf: 0.5,
        happinessGainOnSuccess: 1,
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
        when: { happinessMax: -2, populationMin: 6 },
        reason: 'Народ восстал и прогнал вас из города.',
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
      // Ставка налога — решение, которое важнее торговли, поэтому налог
      // стоит раньше неё и предлагается раз в taxChangeEveryDays дней
      'tax',
      'trade', 'expedition', 'wait',
    ],
    actions: {
      trade:     { label: 'Торговать', icon: '💵' },
      expedition: { label: 'Отправить экспедицию', icon: '🗺️' },
      tax:       { label: 'Изменить налоги', icon: '⚖️' },
      wait:      { label: 'Подождать', icon: '⏳' },
    },
  },

  // --------------------------------------------------------------------------
  // Хроника
  // --------------------------------------------------------------------------
  chronicle: {
    storedEntries: 300,
    renderedEntries: 60,    // при развёрнутой панели
    collapsedEntries: 2,    // свёрнуто: видны две последние записи
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
  // Налоги и доход (SYSTEMS_SPEC §3)
  // --------------------------------------------------------------------------

  /** Ставка налога по умолчанию: 30% — нейтральное настроение народа. */
  taxDefaultIndex: 2,

  /**
   * Как часто предлагается сменить ставку. Налог — постоянная политика,
   * поэтому он не должен занимать слот каждый ход.
   */
  taxChangeEveryDays: 3,

  taxes: TAXES,

  /**
   * Множитель сбора по тиру населения. После перехода на новый тир
   * жители платят больше. Используется с 1 на этапе 1.
   */
  tierTaxMult: [1, 2, 4, 8],

  /** Подписи ставок для интерфейса. */
  taxLabels: [
    'Ничтожный', 'Низкий', 'Обычный', 'Высокий', 'Ярмарка',
  ],

  /** Доход от налога: золото с одного жителя в день. */
  income: {
    /** Надбавка к сбору за каждый рынок, золото с жителя в день. */
    marketGoldPerCitizen: 1,
  },
};

// Имена ресурсов, по которым ведётся производство и обслуживание
export const WORKFORCE_BUILDINGS = Object.freeze(
  Object.entries(BALANCE.buildings)
    .filter(([, def]) => def.workers > 0)
    .map(([key]) => key),
);

export const BUILDING_KEYS = Object.freeze(Object.keys(BALANCE.buildings));
export const TECHNOLOGY_KEYS = Object.freeze(Object.keys(BALANCE.technologies));