// ============================================================================
// BALANCE — единственный источник всех числовых значений в игре.
//
// Правило проекта: ни одной «магической» цифры в файлах js/game/**, js/render/**
// и js/ui/**. Всё берётся отсюда. Это позволяет балансировать игру правкой
// одного файла и прогонять симуляции (см. SYSTEMS_SPEC.md §7).
//
// Единицы: все эффекты заданы штуками, днями и уровнями. Проценты не
// используются нигде, кроме отображения ставки налога.
//
// Правила зданий (SYSTEMS_SPEC.md §4, §6):
//   * здание не требует другого здания;
//   * производственное здание даёт один ресурс и работает только на своём
//     уровне поселения; на других уровнях оно не учитывается;
//   * социальное здание даёт эффект, который действует на всех уровнях,
//     если здание построено; строится только на своём уровне;
//   * эффекты одного типа суммируются.
// ============================================================================

// ---------------------------------------------------------------------------
// Счастье
// ---------------------------------------------------------------------------
const HAPPINESS = {
  /**
   * Уровень счастья от −2 до +2. Пересчитывается каждый день с нуля:
   * база от ставки налога плюс сумма эффектов «счастье» от построенных зданий.
   *
   *   −2  народ бежит, уходят 5 человек в день
   *   −1  недовольство, уходят 2 человека в день
   *    0  нейтрально
   *   +1  каждое производственное здание даёт +1 ед. выработки
   *   +2  каждое производственное здание даёт +2 ед. выработки
   */
  range: [-2, 2],
  start: 0,

  leavePerDayHigh: 5,   // столько уходит в день при −2
  leavePerDayLow: 2,    // столько уходит в день при −1

  /**
   * Модификаторы счастья. Живут между днями: уровень = база (налог + здания)
   * плюс сумма активных модификаторов, в пределах −2..+2.
   *
   * Модификатор: { tag, delta, daysLeft }. Тег говорит, что снимает постройка
   * (см. cures у зданий). Каждый день daysLeft уменьшается, истёкшие удаляются.
   */
  moods: {
    waitTag: 'wait',
    waitDelta: -1,   // один ход «Подождать»
    waitDays: 2,     // сколько дней действует
    waitCap: -2,     // сумма ожиданий не ниже этого, иначе мгновенный бунт
    eventDays: 3,    // длительность штрафа от мгновенных событий
    // Подписи тегов для интерфейса
    names: {
      wait: 'ожидание', festival: 'праздник', joy: 'радость', faith: 'вера',
      fear: 'страх', grief: 'уныние', epidemic: 'болезнь', riot: 'волнения',
      strain: 'теснота', curse: 'дурное знамение', event: 'событие',
    },
  },

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
  // домов и события с выбором (SYSTEMS_SPEC §2).
  // Еды на одного жителя в день, по уровню поселения (индекс = tier − 1).
  // Чем выше уровень, тем больше потребляет каждый житель.
  foodPerCitizenPerDay: [1, 1.5, 2, 2.5, 3],
  starveDeathsPerShortageUnit: 0.2,
  residentsPerHouse: 1,
};

/**
 * Налоги — постоянная политика игрока. Ставка в процентах только для
 * отображения; сбор фиксированный: золото с жителя в день.
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
    // Версия 4: тиры поселения, ресурсы по уровням, новые здания, религия
    // и вера удалены. Сохранения версии 3 несовместимы.
    schema: 6,
    balanceVersion: 5,
    // Метка сборки интерфейса: показывается в плашке города
    build: '2026-10-11 · j',
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
    /** Уровень поселения: 1 — Поселение. */
    tier: 1,
    resources: {
      gold: 100,
      food: 50,
      wood: 30,
      stone: 20,
      population: 10,
    },
    buildings: { houses: 1 },
  },

  // --------------------------------------------------------------------------
  // Ресурсы
  //
  // tier — уровень поселения, на котором ресурс виден и производится:
  //   0 — виден всегда (золото, еда, знания);
  //   1..4 — только на своём уровне. Ресурсы прошлых уровней скрываются
  //   и больше не производятся, но накопленный запас остаётся в партии.
  //
  // Ресурсы уровня N нужны для перехода с уровня N на N+1 (development).
  // --------------------------------------------------------------------------
  resources: {
    gold:       { name: 'Золото',    icon: '💰', tier: 0, unit: { one: 'золото', few: 'золота', many: 'золота' } },

    // Пищевой ресурс меняется по уровням: зерно → мука → мясо → деликатесы
    food:       { name: 'Зерно',     icon: '🍞', tier: 1, isFood: true, unit: { one: 'зерна', few: 'зерна', many: 'зерна' } },
    wood:       { name: 'Древесина', icon: '🪵', tier: 1, unit: { one: 'древесины', few: 'древесины', many: 'древесины' } },
    stone:      { name: 'Камень',    icon: '🪨', tier: 1, unit: { one: 'камень', few: 'камня', many: 'камней' } },

    boards:     { name: 'Доски',     icon: '🪚', tier: 2, unit: { one: 'доска', few: 'доски', many: 'досок' } },
    brick:      { name: 'Кирпич',    icon: '🧱', tier: 2, unit: { one: 'кирпич', few: 'кирпича', many: 'кирпичей' } },
    flour:      { name: 'Мука',      icon: '🥣', tier: 2, isFood: true, unit: { one: 'муки', few: 'муки', many: 'муки' } },
    clothes:    { name: 'Одежда',    icon: '👕', tier: 2, unit: { one: 'одежды', few: 'одежды', many: 'одежды' } },

    coal:       { name: 'Уголь',     icon: '⚫', tier: 3, unit: { one: 'угля', few: 'угля', many: 'угля' } },
    metal:      { name: 'Металл',    icon: '⚙️', tier: 3, unit: { one: 'металла', few: 'металла', many: 'металла' } },
    tools:      { name: 'Инструменты', icon: '🔨', tier: 3, unit: { one: 'инструмент', few: 'инструмента', many: 'инструментов' } },
    books:      { name: 'Книги',     icon: '📚', tier: 3, unit: { one: 'книга', few: 'книги', many: 'книг' } },
    meat:       { name: 'Мясо',      icon: '🥩', tier: 3, isFood: true, unit: { one: 'мяса', few: 'мяса', many: 'мяса' } },

    machines:   { name: 'Станки',    icon: '🔩', tier: 4, unit: { one: 'станок', few: 'станка', many: 'станков' } },
    jewelry:    { name: 'Изделия',   icon: '💎', tier: 4, unit: { one: 'изделие', few: 'изделия', many: 'изделий' } },
    wine:       { name: 'Вино',      icon: '🍷', tier: 4, unit: { one: 'вино', few: 'вина', many: 'вин' } },
    delicacies: { name: 'Деликатесы', icon: '🥂', tier: 4, isFood: true, unit: { one: 'деликатес', few: 'деликатеса', many: 'деликатесов' } },
    press:      { name: 'Печатная продукция', icon: '🗞️', tier: 4, unit: { one: 'печатная единица', few: 'печатные единицы', many: 'печатных единиц' } },
  },

  // Порядок вывода в панели (видимые ресурсы выбираются по уровню)
  resourceOrder: [
    'gold', 'food', 'wood', 'stone',
    'boards', 'brick', 'flour', 'clothes',
    'coal', 'metal', 'tools', 'books', 'meat',
    'machines', 'jewelry', 'wine', 'delicacies', 'press',
  ],

  // --------------------------------------------------------------------------
  // Попапы по центру экрана. Переход на тир — первый, дальше используют
  // случайные события (отдельный этап).
  // --------------------------------------------------------------------------
  popups: {
    tierUpButton: 'Ура!',
  },

  /** Иконка рабочих в требованиях выборов. */
  workers: { icon: '👷' },

  // --------------------------------------------------------------------------
  // Уровни развития (SYSTEMS_SPEC §6)
  //
  // requirements — что списывается при переходе на следующий уровень.
  // Переход — действие выбора, ресурсы тратятся.
  // --------------------------------------------------------------------------
  development: {
    levels: [
      {
        id: 'settlement', name: 'Поселение', icon: '🛖',
        // Сословие, живущее на этом тире. Новое появляется в попапе перехода.
        populationName: 'Поселенцы',
        nextName: 'Деревня', nextIcon: '🏠',
        upgradeText: 'Поздравляем, поселение стало деревней!',
        // Стартовый запас пищевого ресурса следующего тира (ПРЕДВАРИТЕЛЬНО, подбирается по симуляции)
        starterFood: 60,
        requirements: { wood: 100, stone: 100, food: 100 },
      },
      {
        id: 'village', name: 'Деревня', icon: '🏠',
        populationName: 'Фермеры',
        nextName: 'Городок', nextIcon: '🏘️',
        upgradeText: 'Поздравляем, деревня стала городком!',
        starterFood: 60,
        requirements: { boards: 200, brick: 200, flour: 200, clothes: 200 },
      },
      {
        id: 'town', name: 'Городок', icon: '🏘️',
        populationName: 'Горожане',
        nextName: 'Город', nextIcon: '🏙️',
        upgradeText: 'Поздравляем, городок стал городом!',
        starterFood: 60,
        requirements: { metal: 300, coal: 300, tools: 300, books: 300, meat: 300 },
      },
      {
        id: 'city', name: 'Город', icon: '🏙️',
        populationName: 'Купцы',
        nextName: 'Большой город', nextIcon: '🏛️',
        upgradeText: 'Поздравляем, город стал большим городом!',
        starterFood: 60,
        requirements: { machines: 400, jewelry: 400, wine: 400, delicacies: 400, press: 400 },
      },
      {
        id: 'metropolis', name: 'Большой город', icon: '🏛️',
        populationName: 'Знать',
        nextName: null, nextIcon: null,
        upgradeText: null,
        requirements: null,
        // Временно: ресурсы последнего набора остаются видимыми, чтобы
        // на высшем тире можно было построить «Чудо света»
        keepVisible: ['machines', 'jewelry', 'wine', 'delicacies', 'press'],
      },
    ],
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
  // Сезоны. foodPerFarm — изменение выработки одной фермы в день.
  // --------------------------------------------------------------------------
  seasons: [
    { id: 'spring', name: 'Весна', icon: '🌸', days: 30, foodPerFarm: 0 },
    { id: 'summer', name: 'Лето',  icon: '☀️', days: 30, foodPerFarm: 2 },
    { id: 'autumn', name: 'Осень', icon: '🍂', days: 30, foodPerFarm: 0 },
    { id: 'winter', name: 'Зима',  icon: '❄️', days: 30, foodPerFarm: -3 },
  ],

  // --------------------------------------------------------------------------
  // Здания
  //
  // kind        — production | social | house | road
  // levels      — на каких уровнях поселения здание можно строить
  // level       — для production: уровень, на котором оно работает
  // cost        — стоимость (если costByLevel нет)
  // costByLevel — стоимость по уровням (дороги, дома)
  // workers     — рабочих на одно здание (0 — не нужны)
  // produces    — выработка одного рабочего в день
  // maintenance — золото в день за здание (общий множитель — economy)
  // unlock      — условия выбора: freeWorkers — свободные жители
  // effects     — эффекты одного здания (суммируются по всем зданиям)
  //
  // Эффекты:
  //   happiness           — прибавка к уровню счастья
  //   goldPerCitizen      — золото с каждого жителя в день
  //   goldPerDay          — золото в день
  //   knowledgePerDay     — знания в день
  //   foodPerDay          — еда в день
  //   epidemicLossReduction — жертв эпидемии меньше на N
  //   guardDefense        — защита от налётов и осады
  //   suppressionGuard    — сила подавления волнений
  //   fireDays            — длительность пожара (сокращение, дней)
  //   negativeDaysReduction — сокращение негативных событий (дней)
  //   productionPerProducer — выработка производственных зданий +N за дорогу
  // --------------------------------------------------------------------------
  buildings: {
    // ---- Дороги: строятся на любом уровне, накапливаются ----------------
    roads: {
      name: 'Дорога', icon: '🛣️',
      kind: 'road', visual: false, levels: [1, 2, 3, 4],
      workers: 0, produces: null, maintenance: 0,
      costByLevel: {
        1: { gold: 100, wood: 80, stone: 60 },
        2: { gold: 200 },
        3: { gold: 400 },
        4: { gold: 800 },
      },
      effects: {
        productionPerProducer: 2,
        fireDays: -1,
        goldPerDay: 5,
      },
    },

    // ---- Дома ------------------------------------------------------------
    houses: {
      name: 'Дом', icon: '🏠',
      kind: 'house', levels: [1, 2, 3, 4],
      cost: { wood: 20, stone: 10 },
      costByLevel: {
        1: { wood: 20, stone: 10 },
        2: { gold: 40 },
        3: { gold: 60 },
        4: { gold: 90 },
      },
      workers: 0, produces: null, maintenance: 0.1,
      effects: {},
      onBuild: { residents: POPULATION.residentsPerHouse },
    },

    // ==== УРОВЕНЬ 1. ПОСЕЛЕНИЕ =============================================
    farms: {
      name: 'Ферма', icon: '🌾',
      kind: 'production', level: 1, levels: [1],
      cost: { gold: 15, wood: 10 }, workers: 2, produces: { food: 5 },
      maintenance: 0.2, unlock: { freeWorkers: 1 },
    },
    lumberMills: {
      name: 'Лесопилка', icon: '🪓',
      kind: 'production', level: 1, levels: [1],
      cost: { gold: 20, wood: 15 }, workers: 2, produces: { wood: 8 },
      maintenance: 0.3, unlock: { freeWorkers: 1 },
    },
    quarries: {
      name: 'Карьер', icon: '⛏️',
      kind: 'production', level: 1, levels: [1],
      cost: { gold: 25, wood: 10, stone: 5 }, workers: 2, produces: { stone: 6 },
      maintenance: 0.3, unlock: { freeWorkers: 1 },
    },
    well: {
      name: 'Колодец', icon: '🕯️',
      kind: 'social', levels: [1],
      cost: { stone: 15, wood: 10 }, workers: 0, produces: null, maintenance: 0.1,
      effects: { fireDays: -1 },
    },

    // ==== УРОВЕНЬ 2. ДЕРЕВНЯ ===============================================
    sawmills: {
      name: 'Пилорама', icon: '🪚',
      kind: 'production', level: 2, levels: [2],
      cost: { gold: 40 }, workers: 2, produces: { boards: 12 },
      maintenance: 0.3, unlock: { freeWorkers: 1 },
    },
    brickworks: {
      name: 'Кирпичный завод', icon: '🧱',
      kind: 'production', level: 2, levels: [2],
      cost: { gold: 40 }, workers: 2, produces: { brick: 8 },
      maintenance: 0.3, unlock: { freeWorkers: 1 },
    },
    mills: {
      name: 'Мельница', icon: '🌬️',
      kind: 'production', level: 2, levels: [2],
      cost: { gold: 35 }, workers: 2, produces: { flour: 8 },
      maintenance: 0.3, unlock: { freeWorkers: 1 },
    },
    weavings: {
      name: 'Ткацкая', icon: '🧵',
      kind: 'production', level: 2, levels: [2],
      cost: { gold: 35 }, workers: 2, produces: { clothes: 6 },
      maintenance: 0.3, unlock: { freeWorkers: 1 },
    },
    markets: {
      name: 'Рынок', icon: '🛒',
      kind: 'social', levels: [2],
      cost: { gold: 30 }, workers: 0, produces: null, maintenance: 0.5,
      effects: { goldPerCitizen: 1 },
    },
    taverns: {
      name: 'Таверна', icon: '🍺',
      cures: ['wait'],
      kind: 'social', levels: [2],
      cost: { gold: 50 }, workers: 0, produces: null, maintenance: 0.4,
      effects: { happiness: 1 },
    },
    fireBrigades: {
      name: 'Пожарная дружина', icon: '🚒',
      kind: 'social', levels: [2],
      cost: { gold: 40 }, workers: 0, produces: null, maintenance: 0.3,
      effects: { fireDays: -2 },
    },

    // ==== УРОВЕНЬ 3. ГОРОДОК ===============================================
    mines: {
      name: 'Шахта', icon: '⛏️',
      kind: 'production', level: 3, levels: [3],
      cost: { gold: 80 }, workers: 3, produces: { coal: 6 },
      maintenance: 0.4, unlock: { freeWorkers: 1 },
    },
    smelters: {
      name: 'Плавильня', icon: '🔥',
      kind: 'production', level: 3, levels: [3],
      cost: { gold: 90 }, workers: 3, produces: { metal: 5 },
      maintenance: 0.4, unlock: { freeWorkers: 1 },
    },
    forges: {
      name: 'Кузница', icon: '⚒️',
      kind: 'production', level: 3, levels: [3],
      cost: { gold: 90 }, workers: 2, produces: { tools: 3 },
      maintenance: 0.4, unlock: { freeWorkers: 1 },
    },
    scriptoriums: {
      name: 'Скрипторий', icon: '📜',
      kind: 'production', level: 3, levels: [3],
      cost: { gold: 70 }, workers: 2, produces: { books: 3 },
      maintenance: 0.3, unlock: { freeWorkers: 1 },
    },
    cattleYards: {
      name: 'Скотный двор', icon: '🐄',
      kind: 'production', level: 3, levels: [3],
      cost: { gold: 60 }, workers: 2, produces: { meat: 4 },
      maintenance: 0.3, unlock: { freeWorkers: 1 },
    },
    school: {
      name: 'Школа', icon: '🏫',
      kind: 'social', levels: [3],
      cost: { gold: 80 }, workers: 0, produces: null, maintenance: 0.3,
      effects: { happiness: 1 },
    },
    hospital: {
      name: 'Больница', icon: '🏥',
      cures: ['epidemic'],
      kind: 'social', levels: [3],
      cost: { gold: 100 }, workers: 0, produces: null, maintenance: 0.5,
      effects: { epidemicLossReduction: 2 },
    },
    guard: {
      name: 'Стража', icon: '👮',
      cures: ['riot', 'fear'],
      kind: 'social', levels: [3],
      cost: { gold: 80 }, workers: 0, produces: null, maintenance: 0.4,
      effects: { guardDefense: 5, suppressionGuard: 3 },
    },
    bank: {
      name: 'Банк', icon: '🏦',
      kind: 'social', levels: [3],
      cost: { gold: 120 }, workers: 0, produces: null, maintenance: 0.6,
      effects: { goldPerDay: 3 },
    },
    fireHouses: {
      name: 'Пожарная часть', icon: '🚒',
      kind: 'social', levels: [3],
      cost: { gold: 70 }, workers: 0, produces: null, maintenance: 0.4,
      effects: { fireDays: -3 },
    },

    // ==== УРОВЕНЬ 4. ГОРОД =================================================
    machineShops: {
      name: 'Механическая мастерская', icon: '⚙️',
      kind: 'production', level: 4, levels: [4],
      cost: { gold: 150 }, workers: 3, produces: { machines: 2 },
      maintenance: 0.6, unlock: { freeWorkers: 1 },
    },
    jewelers: {
      name: 'Ювелирная мастерская', icon: '💎',
      kind: 'production', level: 4, levels: [4],
      cost: { gold: 150 }, workers: 2, produces: { jewelry: 2 },
      maintenance: 0.6, unlock: { freeWorkers: 1 },
    },
    wineries: {
      name: 'Винодельня', icon: '🍷',
      kind: 'production', level: 4, levels: [4],
      cost: { gold: 140 }, workers: 2, produces: { wine: 2 },
      maintenance: 0.6, unlock: { freeWorkers: 1 },
    },
    gastronomies: {
      name: 'Гастрономия', icon: '🥂',
      kind: 'production', level: 4, levels: [4],
      cost: { gold: 160 }, workers: 2, produces: { delicacies: 2 },
      maintenance: 0.6, unlock: { freeWorkers: 1 },
    },
    printingHouses: {
      name: 'Типография', icon: '🗞️',
      kind: 'production', level: 4, levels: [4],
      cost: { gold: 150 }, workers: 2, produces: { press: 2 },
      maintenance: 0.6, unlock: { freeWorkers: 1 },
    },
    townHall: {
      name: 'Ратуша', icon: '🏛️',
      kind: 'social', levels: [4],
      cost: { gold: 250 }, workers: 0, produces: null, maintenance: 0.8,
      effects: { negativeDaysReduction: 1 },
    },
    theater: {
      name: 'Театр', icon: '🎭',
      cures: ['wait', 'grief'],
      kind: 'social', levels: [4],
      cost: { gold: 200 }, workers: 0, produces: null, maintenance: 0.6,
      effects: { happiness: 1 },
    },
    monument: {
      name: 'Памятник', icon: '🗿',
      kind: 'social', levels: [4],
      cost: { gold: 300 }, workers: 0, produces: null, maintenance: 0.5,
      effects: { happiness: 1 },
    },
    aqueduct: {
      name: 'Акведук', icon: '🌐',
      kind: 'social', levels: [4],
      cost: { gold: 220 }, workers: 0, produces: null, maintenance: 0.6,
      effects: { foodPerDay: 4 },
    },
    harbour: {
      name: 'Пристань', icon: '⚓',
      kind: 'social', levels: [4],
      cost: { gold: 200 }, workers: 0, produces: null, maintenance: 0.6,
      effects: { goldPerDay: 5 },
    },
    wonder: {
      name: 'Чудо света', icon: '🌟',
      kind: 'wonder', levels: [5],
      cost: { machines: 400, jewelry: 400, wine: 400, delicacies: 400, press: 400 },
      workers: 0, produces: null, maintenance: 1,
      effects: {},
    },
    fireStation: {
      name: 'Городская пожарная станция', icon: '🚨',
      kind: 'social', levels: [4],
      cost: { gold: 400 }, workers: 0, produces: null, maintenance: 0.8,
      effects: { fireDays: -5 },
    },
  },

  // --------------------------------------------------------------------------
  // Технологии
  //
  // productionBonus — +amount выработки ресурса за каждое здание building
  // effectBonus     — +amount к эффекту effect за каждое здание building
  // --------------------------------------------------------------------------
  technologies: {
    advancedFarming: {
      name: 'Передовое земледелие', icon: '🌱', tier: 1,
      cost: { gold: 80, stone: 20 }, requiresBuilding: 'farms',
      productionBonus: { building: 'farms', resource: 'food', amount: 2 },
    },
    lumberProcessing: {
      name: 'Обработка древесины', icon: '🌳', tier: 1,
      cost: { gold: 60, stone: 20 }, requiresBuilding: 'lumberMills',
      productionBonus: { building: 'lumberMills', resource: 'wood', amount: 2 },
    },
    stoneMasonry: {
      name: 'Каменная кладка', icon: '🪨', tier: 1,
      cost: { gold: 60, wood: 30 }, requiresBuilding: 'quarries',
      productionBonus: { building: 'quarries', resource: 'stone', amount: 2 },
    },
    tradeRoutes: {
      name: 'Торговые маршруты', icon: '💰', tier: 2,
      cost: { gold: 150, boards: 50 }, requiresBuilding: 'markets',
      effectBonus: { building: 'markets', effect: 'goldPerDay', amount: 3 },
    },
    education: {
      name: 'Образование', icon: '🎓', tier: 3,
      cost: { gold: 200, books: 50 }, requiresBuilding: 'school',
      effectBonus: { building: 'school', effect: 'epidemicLossReduction', amount: 2 },
    },
  },

  // --------------------------------------------------------------------------
  // Экономика
  // --------------------------------------------------------------------------
  economy: {
    // Обслуживание: сумма maintenance × (1 + day / growthDivisor)
    maintenanceGrowthDivisor: 1000,
    trade: { foodCost: 15, goldGain: 30 },
    expedition: {
      cost: 10,
      // Шанс успеха выбирается случайно каждый день из этого набора
      chances: [0.3, 0.4, 0.5, 0.6, 0.7],
      chanceIcon: '🎲',
      // Награда: золото или материал текущего уровня
      goldReward: { min: 50, max: 99, weight: 0.33 },
      materialReward: { min: 20, max: 60, weight: 0.67 },
      failureLoss: { min: 5, max: 14 },
    },
  },

  // --------------------------------------------------------------------------
  // Случайные события
  //
  // Шанс мгновенного события в процентах: chanceBase + population /
  // chancePerTwoPopulation + day / chancePerFiftyDays, но не выше maxChance.
  // Мгновенные события короткие: они не занимают выборы.
  // --------------------------------------------------------------------------
  events: {
    chanceBase: 3,
    chancePerTwoPopulation: 4, // population / 4 процента
    chancePerFiftyDays: 50,
    maxChance: 12,

    /**
     * События с выбором. Занимают день: вместо обычных выборов показываются
     * их варианты. Шанс в день маленький, пул большой.
     *
     * Вариант: { label, icon, cost?, take?, gain?, people?, moods? }
     *   cost   — списывается, требуется наличие;
     *   take   — забирается сколько есть, без требования (потери);
     *   gain   — выдаётся;
     *   people — прибавка жителей;
     *   moods  — [{ tag, delta, days }] модификаторы счастья.
     * Ресурс '$food' — пищевой ресурс текущего тира.
     */
    choice: {
      chance: 0.06,
      pool: {
        festival_offer: {
          name: 'Винный торговец', icon: '🍷',
          text: 'Бродячий торговец предлагает бочку вина для праздника.',
          options: [
            { label: 'Купить бочку', icon: '🍷', cost: { gold: 40 }, moods: [{ tag: 'festival', delta: 1, days: 3 }] },
            { label: 'Отказаться', icon: '🚫' },
          ],
        },
        circus: {
          name: 'Гастролёры', icon: '🎪',
          text: 'Труппа просится в город.',
          requiresBuildings: ['theater'],
          options: [
            { label: 'Заплатить 80 золота', icon: '🎭', cost: { gold: 80 }, moods: [{ tag: 'festival', delta: 1, days: 4 }] },
            { label: 'Отказать', icon: '🚫' },
          ],
        },
        wedding: {
          name: 'Свадьба', icon: '💒',
          text: 'В городе справляют свадьбу. Благословить?',
          options: [
            { label: 'Благословить', icon: '💍', moods: [{ tag: 'joy', delta: 1, days: 3 }] },
            { label: 'Отказаться', icon: '🚫' },
          ],
        },
        fair: {
          name: 'Ярмарка', icon: '🎪',
          text: 'Съезжаются торговцы со всей округи.',
          minTier: 2,
          options: [
            { label: 'Продать доски', icon: '🪚', cost: { boards: 30 }, gain: { gold: 60 } },
            { label: 'Пропустить', icon: '⏭️' },
          ],
        },
        wanderer: {
          name: 'Странствующий торговец', icon: '🧳',
          text: 'Торговец предлагает свой товар.',
          options: [
            { label: 'Купить зерно', icon: '🍞', cost: { gold: 50 }, gain: { $food: 40 } },
            { label: 'Продать зерно', icon: '💰', cost: { $food: 30 }, gain: { gold: 60 } },
            { label: 'Отказаться', icon: '🚫' },
          ],
        },
        smugglers: {
          name: 'Контрабандисты', icon: '🕶️',
          text: 'Двое предлагают камень по низкой цене.',
          options: [
            { label: 'Купить камень', icon: '🪨', cost: { gold: 30 }, gain: { stone: 40 }, moods: [{ tag: 'fear', delta: -1, days: 2 }] },
            { label: 'Отказаться', icon: '🚫' },
          ],
        },
        patron: {
          name: 'Меценат', icon: '🎩',
          text: 'Богатый горожанин хочет помочь городу деньгами.',
          minTier: 3,
          options: [
            { label: 'Принять дар', icon: '💰', gain: { gold: 150 }, moods: [{ tag: 'joy', delta: 1, days: 2 }] },
            { label: 'Отказаться', icon: '🚫' },
          ],
        },
        fire: {
          name: 'Пожар', icon: '🔥',
          text: 'В квартале загорелся дом.',
          options: [
            { label: 'Тушить за золото', icon: '🧯', cost: { gold: 60 } },
            { label: 'Организовать людей', icon: '🪣', moods: [{ tag: 'fear', delta: -1, days: 2 }] },
            { label: 'Ничего не делать', icon: '🤷', take: { wood: 40 }, moods: [{ tag: 'grief', delta: -1, days: 2 }] },
          ],
        },
        plague: {
          name: 'Болезнь', icon: '🤒',
          text: 'Болезнь ходит по улицам.',
          minPopulation: 20,
          options: [
            { label: 'Заплатить лекарям', icon: '💊', cost: { gold: 50 } },
            { label: 'Карантин', icon: '🚧', moods: [{ tag: 'epidemic', delta: -1, days: 2 }] },
            { label: 'Ничего', icon: '🤞', moods: [{ tag: 'epidemic', delta: -2, days: 3 }] },
          ],
        },
        drought: {
          name: 'Засуха', icon: '🏜️',
          text: 'Поля пересохли.',
          options: [
            { label: 'Купить еду', icon: '🍞', cost: { gold: 60 }, gain: { $food: 60 } },
            { label: 'Ввести норму', icon: '📏', moods: [{ tag: 'grief', delta: -1, days: 3 }] },
            { label: 'Терпеть', icon: '😓', take: { $food: 40 } },
          ],
        },
        storm: {
          name: 'Буря', icon: '⛈️',
          text: 'Ветер сорвал крыши.',
          options: [
            { label: 'Ремонт за золото', icon: '🔨', cost: { gold: 40 } },
            { label: 'Терпеть', icon: '😤', take: { wood: 30 }, moods: [{ tag: 'fear', delta: -1, days: 2 }] },
          ],
        },
        rats: {
          name: 'Крысы в амбаре', icon: '🐀',
          text: 'Крысы пробрались в амбар.',
          options: [
            { label: 'Завести котов', icon: '🐈', cost: { gold: 30 } },
            { label: 'Терпеть', icon: '😖', take: { $food: 30 } },
          ],
        },
        refugees: {
          name: 'Беженцы', icon: '🧳',
          text: 'К воротам пришли люди из разорённой деревни.',
          options: [
            { label: 'Принять', icon: '🤝', cost: { $food: 20 }, people: 3, moods: [{ tag: 'strain', delta: -1, days: 3 }] },
            { label: 'Отказать', icon: '🚪', moods: [{ tag: 'grief', delta: -1, days: 2 }] },
          ],
        },
        strike: {
          name: 'Забастовка', icon: '✊',
          text: 'Ремесленники бросили работу.',
          options: [
            { label: 'Поднять жалованье', icon: '💰', cost: { gold: 60 } },
            { label: 'Подавить', icon: '👊', moods: [{ tag: 'riot', delta: -2, days: 3 }] },
            { label: 'Уступить', icon: '🙇', moods: [{ tag: 'grief', delta: -1, days: 2 }] },
          ],
        },
        riot: {
          name: 'Волнения', icon: '🔥',
          text: 'Горожане вышли на площадь.',
          minPopulation: 10,
          options: [
            { label: 'Откупиться', icon: '💸', cost: { gold: 80 }, moods: [{ tag: 'riot', delta: 1, days: 2 }] },
            { label: 'Усмирить', icon: '🛡️', moods: [{ tag: 'riot', delta: -1, days: 2 }] },
            { label: 'Ничего не делать', icon: '🤷', moods: [{ tag: 'riot', delta: -2, days: 3 }] },
          ],
        },
        harvest: {
          name: 'Урожайный год', icon: '🌾',
          text: 'Поля дали богатый урожай.',
          options: [
            { label: 'Устроить праздник', icon: '🎉', cost: { $food: 40 }, moods: [{ tag: 'festival', delta: 2, days: 2 }] },
            { label: 'Продать излишки', icon: '💰', cost: { $food: 40 }, gain: { gold: 50 } },
            { label: 'Пропустить', icon: '⏭️' },
          ],
        },
        pilgrims: {
          name: 'Паломники', icon: '🚶',
          text: 'Странники идут к святым местам и просят приюта.',
          options: [
            { label: 'Принять', icon: '🙏', cost: { $food: 20 }, moods: [{ tag: 'faith', delta: 1, days: 3 }] },
            { label: 'Отказать', icon: '🚫' },
          ],
        },
        inventor: {
          name: 'Изобретатель', icon: '💡',
          text: 'Изобретатель предлагает свой проект.',
          requiresBuildings: ['school'],
          options: [
            { label: 'Спонсировать 150', icon: '⚙️', cost: { gold: 150 }, moods: [{ tag: 'joy', delta: 1, days: 4 }] },
            { label: 'Отказать', icon: '🚫' },
          ],
        },
        treasure: {
          name: 'Клад', icon: '🏺',
          text: 'Крестьянин нашёл старую карту с кладом.',
          options: [
            { label: 'Копать самому', icon: '⛏️', gain: { gold: 80 }, moods: [{ tag: 'fear', delta: -1, days: 1 }] },
            { label: 'Продать карту', icon: '🗺️', gain: { gold: 40 } },
          ],
        },
        omens: {
          name: 'Знамение', icon: '☄️',
          text: 'На небе появилась комета. Люди шепчутся.',
          options: [
            { label: 'Устроить ритуал', icon: '🕯️', cost: { gold: 50 } },
            { label: 'Ждать', icon: '⏳', moods: [{ tag: 'curse', delta: -1, days: 4 }] },
          ],
        },
      },
    },

    definitions: {
      merchant: {
        name: 'Купеческий караван', icon: '💰', kind: 'trade',
        foodCost: { min: 10, max: 29 },
        goldGain: { min: 20, max: 49 },
      },
      bandits: {
        name: 'Нападение бандитов', icon: '⚔️', kind: 'disaster',
        moodTag: 'fear',
        minPopulation: 20,
        strengthBase: 10,
        strengthPerDays: 0.05,
        populationDefenseDivisor: 2,
        defendRatio: 0.8,
        goldLoot: { min: 15, max: 39 },
        goldLossMax: 30,
        populationLossPercent: 0.2,
        populationLossMax: 5,
        happinessLoss: 1,
      },
      disease: {
        name: 'Эпидемия', icon: '🤒', kind: 'disaster',
        moodTag: 'epidemic',
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
        moodTag: 'fear',
        seasons: ['winter'],
        foodLossMax: 20,
        woodLossMax: 15,
        happinessLoss: 1,
      },
      famine_warning: {
        name: 'Запасы еды на исходе', icon: '⚠️', kind: 'warning',
        moodTag: 'fear',
        foodBelowPopulationMultiplier: 3,
        happinessLoss: 1,
      },
      revolt: {
        name: 'Волнения', icon: '🔥', kind: 'social',
        // Волнения возможны, только когда народ уже недоволен (-1 и ниже)
        happinessBelow: -1,
        suppressionHappinessBase: -1,
        suppressionPerPopulationHalf: 0.5,
        happinessGainOnSuccess: 1,
        populationLossPercent: 0.3,
        populationLossMax: 10,
      },
      siege: {
        name: 'Осада', icon: '🏰', kind: 'disaster',
        requiresBuildings: ['guard'],
        enemyStrengthBase: 40,
        enemyStrengthPerDays: 0.1,
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
  // Поражение проверяется сверху вниз. Победа — постройка «Чудо света»
  // на высшем тире (SYSTEMS_SPEC §6).
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
        // Бунт — не мгновенно: счастье на −2 должно держаться несколько дней подряд
        when: { happinessMax: -2, populationMin: 6, lowDaysMin: 3 },
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
      // Победа сразу после постройки этого здания на высшем тире
      building: 'wonder',
      reason: 'Чудо света построено. Ваш город вошёл в историю. Вы выиграли!',
      icon: '🎉',
    },
  },

  // --------------------------------------------------------------------------
  // Выборы действий
  //
  // Выдача случайная, с весами по категориям. Производственные здания
  // выпадают чаще всего; социальные здания, технологии и дороги — редкие
  // бонусы; налог стоит между ними (см. taxChance). Подробности — в choices.js.
  // --------------------------------------------------------------------------
  choices: {
    slots: 4,
    // Шанс, что налог предложат в конкретный день. Налог — случайный вариант,
    // не требует ресурсов; новая ставка при этом выпадает каждый день.
    taxChance: 0.5,
    // Веса категорий при выдаче. Чем больше вес, тем чаще категория попадает
    // в слоты. Категория — по виду действия (см. categoryOf в choices.js).
    weights: {
      production: 10, // производственные здания: основа выборов
      house: 3,       // дома: нужны для населения
      trade: 2,       // торговля и экспедиция
      rare: 1,        // социальные здания, технологии, дороги, чудо света — редкие бонусы
    },
    actions: {
      trade:      { label: 'Торговать', icon: '💵' },
      expedition: { label: 'Отправить экспедицию', icon: '🗺️' },
      tax:        { label: 'Изменить налоги', icon: '⚖️' },
      wait:       { label: 'Подождать', icon: '⏳' },
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
      event:    { className: 'kind-social',   label: 'Событие' },
      end:      { className: 'kind-end',      label: 'Итог' },
    },
  },

  // --------------------------------------------------------------------------
  // Налоги
  // --------------------------------------------------------------------------

  /** Ставка налога по умолчанию: 30% — нейтральное настроение народа. */
  taxDefaultIndex: 2,

  /** Ставку налога можно менять каждый ход; новая выпадает случайно. */
  taxes: TAXES,

  /**
   * Множитель золота с жителя по уровню поселения: на уровне N жители
   * платят tierTaxMult[N − 1] от базовой ставки.
   */
  tierTaxMult: [1, 2, 4, 8, 16],

  /** Подписи ставок для интерфейса. */
  taxLabels: [
    'Ничтожный', 'Низкий', 'Обычный', 'Высокий', 'Ярмарка',
  ],
};

/** Ключи зданий, которые производят ресурсы (работают с рабочими). */
export const WORKFORCE_BUILDINGS = Object.freeze(
  Object.entries(BALANCE.buildings)
    .filter(([, def]) => def.kind === 'production')
    .map(([key]) => key),
);

export const BUILDING_KEYS = Object.freeze(Object.keys(BALANCE.buildings));
export const TECHNOLOGY_KEYS = Object.freeze(Object.keys(BALANCE.technologies));
