// ============================================
// Game System & Narrative Generator
// ============================================

class GameSystem {
    constructor(gameState) {
        this.gameState = gameState;
        this.narrativeTemplates = this.loadNarrativeTemplates();
    }

    loadNarrativeTemplates() {
        return {
            // Starting narratives
            start: {
                base: `Вы стоите на холме, глядя на небольшое поселение у подножия. 
                    Дымок поднимается из нескольких хижин. ${this.getRandomGreeting()}
                    Река рядом дает воду и рыбу, лес обещает древесину и дичь, а холмы вдалеке 
                    скрывают залежи камня.`,
                variations: [
                    "Ветер приносит запах свежей древесины и хлеба.",
                    "Птицы поют в лесу, предвещая хороший день.",
                    "Солнце поднимается над горизонтом, освещая ваш новый дом.",
                    "Жители машут вам руками, приветствуя нового лидера."
                ]
            },

            // Resource narratives
            lowFood: {
                base: `Запасы еды на исходе! ${this.getRandomFoodWarning()}
                    Жители начинают беспокоиться о завтрашнем дне.`,
                variations: [
                    "На рынке пусто - продавцы жалуются на неурожай.",
                    "Дети с надеждой смотрят на кухню, ожидая обеда.",
                    "Некоторые жители уже начинают говорить о том, чтобы уйти.",
                    "Воздух наполнен тревогой - все чувствуют приближение голода."
                ]
            },

            lowGold: {
                base: `Казна пуста. ${this.getRandomGoldWarning()}
                    Без золота сложно развивать город и платить рабочим.`,
                variations: [
                    "Купцы отказываются иметь дело с вашим городом.",
                    "Ремесленники просят оплату вперед.",
                    "Строительство замерло - нет средств на материалы.",
                    "Жители шепчутся о том, что лидер не справился."
                ]
            },

            lowHappiness: {
                base: `Население недовольно. ${this.getRandomHappinessWarning()}
                    Если не принять меры, может начаться восстание.`,
                variations: [
                    "На улицах слышны разговоры о смене власти.",
                    "Люди избегают вас на улицах.",
                    "В храме молятся о лучших временах.",
                    "Дети больше не играют на площадях."
                ]
            },

            highResources: {
                base: `Город процветает! ${this.getRandomProsperity()}
                    Жители счастливы и полны надежд на будущее.`,
                variations: [
                    "На улицах звучит смех и музыка.",
                    "Новые дома строятся каждый день.",
                    "Купцы со всего региона стремятся в ваш город.",
                    "Даже птицы поют веселее в вашем городе."
                ]
            },

            // Season narratives
            spring: {
                base: `Весна пришла в ваш город. ${this.getRandomSpring()}
                    Природа просыпается, и с ней просыпаются надежды на новый урожай.`,
                variations: [
                    "Цветущие деревья украшают улицы города.",
                    "Фермеры выходят в поля, чтобы засеять новые культуры.",
                    "Река выходит из берегов, принося плодородный ил.",
                    "Птицы возвращаются с юга, наполняя воздух пением."
                ]
            },

            summer: {
                base: `Лето в разгаре. ${this.getRandomSummer()}
                    Жара заставляет работать усерднее, но и урожай обещает быть богатым.`,
                variations: [
                    "Солнце палит немилосердно, но поля зеленеют.",
                    "Жители работают с рассвета до заката.",
                    "Ночи теплые и ясные - идеальное время для праздников.",
                    "Фрукты созревают на деревьях, обещая щедрый урожай."
                ]
            },

            autumn: {
                base: `Осень окрасила листья в золотые тона. ${this.getRandomAutumn()}
                    Время сбора урожая - самый важный сезон для фермеров.`,
                variations: [
                    "Листья падают с деревьев, устилая улицы золотым ковром.",
                    "Фермеры работают не покладая рук, собирая урожай.",
                    "Воздух наполнен запахом спелых яблок и тыквы.",
                    "Птицы начинают готовиться к долгой зиме."
                ]
            },

            winter: {
                base: `Зима сурова. ${this.getRandomWinter()}
                    Холод и снег делают жизнь сложнее, но и проверяют силу духа жителей.`,
                variations: [
                    "Снег покрывает крыши домов толстым слоем.",
                    "Дым из труб поднимается высоко в морозный воздух.",
                    "Дети играют в снежки на улицах.",
                    "Ночи длинные и холодные - все сидят у каминов."
                ]
            },

            // Event narratives
            merchantArrival: {
                base: `К городу подходит купеческий караван! ${this.getRandomMerchant()}
                    Торговцы предлагают rare товары в обмен на ваши ресурсы.`,
                variations: [
                    "Караван привез экзотические специи и ткани.",
                    "Купцы рассказывают новости из дальних земель.",
                    "Воздух наполнен запахами Востока.",
                    "Торговцы суетятся, распаковывая свои товары."
                ]
            },

            banditAttack: {
                base: `На горизонте показались бандиты! ${this.getRandomBandit()}
                    Они хотят ограбить ваш город. Нужно подготовиться к обороне.`,
                variations: [
                    "Бандиты вооружены до зубов и выглядят решительно.",
                    "Разведчики сообщают, что бандитов около двух десятков.",
                    "Бандиты требуют дань за мирное прохождение.",
                    "Нападающие кричат угрозы, подходя к стенам."
                ]
            },

            disease: {
                base: `В городе началась эпидемия! ${this.getRandomDisease()}
                    Люди болеют и умирают. Нужно срочно что-то делать.`,
                variations: [
                    "Улицы опустели - все сидят по домам.",
                    "Лекари работают без отдыха, пытаясь спасти больных.",
                    "Воздух наполнен запахом лекарственных трав.",
                    "Люди молятся о выздоровлении."
                ]
            },

            harvest: {
                base: `Этот год обещает быть урожайным! ${this.getRandomHarvest()}
                    Поля ломятся от зерна, и фермеры радуются богатому урожаю.`,
                variations: [
                    "Золотые поля колышутся на ветру, готовые к уборке.",
                    "Фермеры поют песни, работая в поле.",
                    "Урожай превышает все ожидания!",
                    "Даже птицы не успевают склевывать упавшее зерно."
                ]
            },

            // Building narratives
            buildHouse: {
                base: `Новый жилой дом возвышается на городской площади. ${this.getRandomBuilding()}
                    Семьи уже начинают переезжать в новые квартиры.`,
                variations: [
                    "Дом построен из прочной древесины и камня.",
                    "Новые жители радуются новому жилью.",
                    "Дом стал украшением городской площади.",
                    "Строители гордятся своей работой."
                ]
            },

            buildFarm: {
                base: `Новая ферма начала работу. ${this.getRandomFarm()}
                    Скоро она будет кормить многих жителей города.`,
                variations: [
                    "Фермеры уже пашут землю для новых посевов.",
                    "Новые поля расширяют сельскохозяйственные угодья.",
                    "Ферма обещает богатый урожай.",
                    "Жители радуются новым источникам еды."
                ]
            },

            buildMarket: {
                base: `Новый рынок открылся в центре города! ${this.getRandomMarket()}
                    Торговцы со всего региона съезжаются сюда.`,
                variations: [
                    "Рынок стал центром городской жизни.",
                    "Торговые ряды ломятся от товаров.",
                    "Купцы соревнуются за лучшие места.",
                    "Город наполняется шумом торговли."
                ]
            },

            buildTemple: {
                base: `Новый храм возвышается над городом. ${this.getRandomTemple()}
                    Жители находят утешение в молитвах.`,
                variations: [
                    "Храм стал символом веры и надежды.",
                    "Жрецы проводят службы для верующих.",
                    "Храм украшен красивыми фресками.",
                    "Люди находят утешение в молитвах."
                ]
            }
        };
    }

    getRandomGreeting() {
        const greetings = [
            "Ветер приносит запах свежей древесины и хлеба.",
            "Птицы поют в лесу, предвещая хороший день.",
            "Солнце поднимается над горизонтом, освещая ваш новый дом.",
            "Жители машут вам руками, приветствуя нового лидера.",
            "Воздух наполнен надеждой на светлое будущее.",
            "Река блестит на солнце, обещая изобилие."
        ];
        return greetings[Math.floor(Math.random() * greetings.length)];
    }

    getRandomFoodWarning() {
        const warnings = [
            "Хлебные запасы на исходе.",
            "Фермеры сообщают о плохом урожае.",
            "На рынке осталось совсем немного еды.",
            "Люди начинают голодать.",
            "Запасы тают на глазах."
        ];
        return warnings[Math.floor(Math.random() * warnings.length)];
    }

    getRandomGoldWarning() {
        const warnings = [
            "Казна почти пуста.",
            "Купцы отказываются иметь дело с вами.",
            "Нет денег на зарплату рабочим.",
            "Строительство замерло из-за нехватки средств.",
            "Люди шепчутся о банкротстве."
        ];
        return warnings[Math.floor(Math.random() * warnings.length)];
    }

    getRandomHappinessWarning() {
        const warnings = [
            "Люди недовольны вашим правлением.",
            "На улицах слышны разговоры о восстании.",
            "Жители избегают вас.",
            "Воздух наполнен недовольством.",
            "Люди требуют изменений."
        ];
        return warnings[Math.floor(Math.random() * warnings.length)];
    }

    getRandomProsperity() {
        const prosperities = [
            "Город растет и процветает.",
            "Жители счастливы и полны надежд.",
            "Экономика развивается быстрыми темпами.",
            "Новые дома строятся каждый день.",
            "Купцы со всего региона стремятся в ваш город."
        ];
        return prosperities[Math.floor(Math.random() * prosperities.length)];
    }

    getRandomSpring() {
        const springs = [
            "Цветущие деревья украшают улицы города.",
            "Природа просыпается ото сна.",
            "Река выходит из берегов, принося плодородный ил.",
            "Птицы возвращаются с юга.",
            "Воздух наполнен запахом цветов."
        ];
        return springs[Math.floor(Math.random() * springs.length)];
    }

    getRandomSummer() {
        const summers = [
            "Солнце палит немилосердно.",
            "Поля зеленеют под жарким солнцем.",
            "Жители работают с рассвета до заката.",
            "Ночи теплые и ясные.",
            "Фрукты созревают на деревьях."
        ];
        return summers[Math.floor(Math.random() * summers.length)];
    }

    getRandomAutumn() {
        const autumns = [
            "Листья падают с деревьев, устилая улицы золотым ковром.",
            "Фермеры работают не покладая рук.",
            "Воздух наполнен запахом спелых яблок.",
            "Птицы начинают готовиться к зиме.",
            "Урожай превышает все ожидания."
        ];
        return autumns[Math.floor(Math.random() * autumns.length)];
    }

    getRandomWinter() {
        const winters = [
            "Снег покрывает крыши домов толстым слоем.",
            "Дым из труб поднимается высоко в морозный воздух.",
            "Дети играют в снежки на улицах.",
            "Ночи длинные и холодные.",
            "Зима проверяет силу духа жителей."
        ];
        return winters[Math.floor(Math.random() * winters.length)];
    }

    getRandomMerchant() {
        const merchants = [
            "Караван привез экзотические товары.",
            "Купцы предлагают rare специи.",
            "Торговцы суетятся, распаковывая свои товары.",
            "Воздух наполнен запахами Востока.",
            "Купцы рассказывают новости из дальних земель."
        ];
        return merchants[Math.floor(Math.random() * merchants.length)];
    }

    getRandomBandit() {
        const bandits = [
            "Бандиты вооружены до зубов.",
            "Разведчики сообщают о большой группе бандитов.",
            "Бандиты требуют дань за мирное прохождение.",
            "Нападающие кричат угрозы.",
            "Бандиты выглядят решительно."
        ];
        return bandits[Math.floor(Math.random() * bandits.length)];
    }

    getRandomDisease() {
        const diseases = [
            "Болезнь распространяется быстро.",
            "Лекари работают без отдыха.",
            "Улицы опустели - все сидят по домам.",
            "Люди молятся о выздоровлении.",
            "Воздух наполнен запахом лекарственных трав."
        ];
        return diseases[Math.floor(Math.random() * diseases.length)];
    }

    getRandomHarvest() {
        const harvests = [
            "Золотые поля колышутся на ветру.",
            "Фермеры поют песни, работая в поле.",
            "Урожай превышает все ожидания.",
            "Даже птицы не успевают склевывать упавшее зерно.",
            "Поля ломятся от зерна."
        ];
        return harvests[Math.floor(Math.random() * harvests.length)];
    }

    getRandomBuilding() {
        const buildings = [
            "Дом построен из прочных материалов.",
            "Новые жители радуются новому жилью.",
            "Дом стал украшением городской площади.",
            "Строители гордятся своей работой.",
            "Новый дом вписался в городской пейзаж."
        ];
        return buildings[Math.floor(Math.random() * buildings.length)];
    }

    getRandomFarm() {
        const farms = [
            "Фермеры уже пашут землю.",
            "Новые поля расширяют сельскохозяйственные угодья.",
            "Ферма обещает богатый урожай.",
            "Жители радуются новым источникам еды.",
            "Ферма стала гордостью города."
        ];
        return farms[Math.floor(Math.random() * farms.length)];
    }

    getRandomMarket() {
        const markets = [
            "Рынок стал центром городской жизни.",
            "Торговые ряды ломятся от товаров.",
            "Купцы соревнуются за лучшие места.",
            "Город наполняется шумом торговли.",
            "Рынок приносит процветание."
        ];
        return markets[Math.floor(Math.random() * markets.length)];
    }

    getRandomTemple() {
        const temples = [
            "Храм стал символом веры и надежды.",
            "Жрецы проводят службы для верующих.",
            "Храм украшен красивыми фресками.",
            "Люди находят утешение в молитвах.",
            "Храм возвышается над городом."
        ];
        return temples[Math.floor(Math.random() * temples.length)];
    }

    // Generate a rich narrative based on current game state
    generateNarrative() {
        const state = this.gameState;
        const narratives = [];

        // Check for critical situations
        if (state.resources.food < state.resources.population * 2) {
            narratives.push({
                title: "Голод угрожает",
                description: ` ${this.narrativeTemplates.lowFood.base} 
                    ${this.narrativeTemplates.lowFood.variations[Math.floor(Math.random() * this.narrativeTemplates.lowFood.variations.length)]}`,
                icon: "🍞",
                urgency: "high"
            });
        }

        if (state.resources.happiness < 30) {
            narratives.push({
                title: "Народ недоволен",
                description: ` ${this.narrativeTemplates.lowHappiness.base} 
                    ${this.narrativeTemplates.lowHappiness.variations[Math.floor(Math.random() * this.narrativeTemplates.lowHappiness.variations.length)]}`,
                icon: "😠",
                urgency: "high"
            });
        }

        if (state.resources.gold < 20) {
            narratives.push({
                title: "Финансовый кризис",
                description: ` ${this.narrativeTemplates.lowGold.base} 
                    ${this.narrativeTemplates.lowGold.variations[Math.floor(Math.random() * this.narrativeTemplates.lowGold.variations.length)]}`,
                icon: "💰",
                urgency: "high"
            });
        }

        // Season-based narratives
        if (state.season === "Весна") {
            narratives.push({
                title: "Весеннее пробуждение",
                description: ` ${this.narrativeTemplates.spring.base} 
                    ${this.narrativeTemplates.spring.variations[Math.floor(Math.random() * this.narrativeTemplates.spring.variations.length)]}`,
                icon: "🌸",
                urgency: "low"
            });
        } else if (state.season === "Лето") {
            narratives.push({
                title: "Летний зной",
                description: ` ${this.narrativeTemplates.summer.base} 
                    ${this.narrativeTemplates.summer.variations[Math.floor(Math.random() * this.narrativeTemplates.summer.variations.length)]}`,
                icon: "☀️",
                urgency: "low"
            });
        } else if (state.season === "Осень") {
            narratives.push({
                title: "Осенний урожай",
                description: ` ${this.narrativeTemplates.autumn.base} 
                    ${this.narrativeTemplates.autumn.variations[Math.floor(Math.random() * this.narrativeTemplates.autumn.variations.length)]}`,
                icon: "🍂",
                urgency: "low"
            });
        } else if (state.season === "Зима") {
            narratives.push({
                title: "Зимние испытания",
                description: ` ${this.narrativeTemplates.winter.base} 
                    ${this.narrativeTemplates.winter.variations[Math.floor(Math.random() * this.narrativeTemplates.winter.variations.length)]}`,
                icon: "❄️",
                urgency: "medium"
            });
        }

        // Prosperity narrative
        if (state.resources.happiness > 80 && 
            state.resources.food > state.resources.population * 3 &&
            state.resources.gold > 50) {
            narratives.push({
                title: "Процветание",
                description: ` ${this.narrativeTemplates.highResources.base} 
                    ${this.narrativeTemplates.highResources.variations[Math.floor(Math.random() * this.narrativeTemplates.highResources.variations.length)]}`,
                icon: "🌟",
                urgency: "low"
            });
        }

        // If no special narratives, use default
        if (narratives.length === 0) {
            narratives.push({
                title: `День ${state.day} в ${state.cityName}`,
                description: `Жизнь в ${state.cityName} идет своим чередом. 
                    ${this.getRandomDailyLife()}
                    ${this.getRandomCityDescription()}`,
                icon: "🏙️",
                urgency: "low"
            });
        }

        // Select the most urgent narrative
        narratives.sort((a, b) => {
            const urgencyOrder = { high: 3, medium: 2, low: 1 };
            return urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
        });

        return narratives[0];
    }

    getRandomDailyLife() {
        const dailyLife = [
            "Фермеры работают в поле.",
            "Купцы торгуют на рынке.",
            "Строители возводят новые здания.",
            "Дети играют на улицах.",
            "Ремесленники создают новые товары.",
            "Жрецы проводят службы в храме.",
            "Стражники патрулируют улицы.",
            "Учителя обучают детей."
        ];
        return dailyLife[Math.floor(Math.random() * dailyLife.length)];
    }

    getRandomCityDescription() {
        const descriptions = [
            `Воздух наполнен запахами города.`,
            `Солнце освещает крыши домов.`,
            `Вдалеке виднеются леса и холмы.`,
            `Река течет рядом с городом.`,
            `Птицы поют на деревьях.`,
            `Ветер приносит свежий воздух.`,
            `Улицы оживлены жизнью.`,
            `Город растет с каждым днем.`
        ];
        return descriptions[Math.floor(Math.random() * descriptions.length)];
    }

    // Generate choices based on current state
    generateChoices(narrative) {
        const state = this.gameState;
        const choices = [];

        // Always available choices
        choices.push({
            text: "Подождать",
            action: "wait",
            cost: "",
            description: "Просто подождать и посмотреть, что будет дальше"
        });

        // Building choices
        if (state.resources.wood >= 20 && state.resources.stone >= 10) {
            choices.push({
                text: "Построить жилой дом",
                action: "buildHouses",
                cost: "-20 древесины, -10 камня",
                description: `Увеличит максимальное население на 5. Сейчас: ${state.buildings.houses} дома`
            });
        }

        if (state.resources.gold >= 15 && state.resources.wood >= 10) {
            choices.push({
                text: "Построить ферму",
                action: "buildFarms",
                cost: "-15 золота, -10 древесины",
                description: `Увеличит производство еды. Сейчас: ${state.buildings.farms} ферм`
            });
        }

        if (state.resources.gold >= 20 && state.resources.wood >= 15) {
            choices.push({
                text: "Построить лесопилку",
                action: "buildLumberMill",
                cost: "-20 золота, -15 древесины",
                description: `Увеличит производство древесины. Сейчас: ${state.buildings.lumberMills} лесопилок`
            });
        }

        if (state.resources.gold >= 25 && state.resources.wood >= 10 && state.resources.stone >= 5) {
            choices.push({
                text: "Построить карьер",
                action: "buildQuarry",
                cost: "-25 золота, -10 древесины, -5 камня",
                description: `Увеличит производство камня. Сейчас: ${state.buildings.quarries} карьеров`
            });
        }

        // Resource choices
        if (state.resources.food >= 15) {
            choices.push({
                text: "Торговать с караваном",
                action: "tradeWithMerchant",
                cost: "-15 еды, +30 золота",
                description: "Обменять еду на золото"
            });
        }

        if (state.resources.gold >= 10) {
            choices.push({
                text: "Отправить экспедицию",
                action: "sendExpedition",
                cost: "-10 золота",
                description: "Рискованное предприятие, но может принести большие награды"
            });
        }

        // Technology choices
        if (state.resources.knowledge >= 20 && !state.technologies.advancedFarming) {
            choices.push({
                text: "Развить земледелие",
                action: "developFarming",
                cost: "-20 знаний",
                description: "Увеличит производство еды на фермах на 50%"
            });
        }

        if (state.resources.knowledge >= 25 && !state.technologies.tradeRoutes) {
            choices.push({
                text: "Открыть торговые маршруты",
                action: "developTrade",
                cost: "-25 знаний",
                description: "Увеличит доход от рынков на 50%"
            });
        }

        // Special choices based on narrative
        if (narrative && narrative.title.includes("Голод")) {
            choices.unshift({
                text: "Срочно построить фермы",
                action: "buildFarms",
                cost: "-15 золота, -10 древесины",
                description: "Немедленно увеличить производство еды"
            });
        }

        if (narrative && narrative.title.includes("Народ недоволен")) {
            choices.unshift({
                text: "Устроить праздник",
                action: "bigFestival",
                cost: "-30 еды, -20 золота",
                description: "Поднять мораль народа на +20"
            });
        }

        // Limit to 4 choices
        return choices.slice(0, 4);
    }

    // Generate a complete narrative with choices
    generateFullNarrative() {
        const narrative = this.generateNarrative();
        const choices = this.generateChoices(narrative);

        return {
            ...narrative,
            choices: choices
        };
    }

    // Get random event description
    getEventDescription(eventType) {
        const eventDescriptions = {
            merchant: `К городу подходит купеческий караван! 
                ${this.narrativeTemplates.merchantArrival.base} 
                ${this.narrativeTemplates.merchantArrival.variations[Math.floor(Math.random() * this.narrativeTemplates.merchantArrival.variations.length)]}`,
            bandits: `Опасность! ${this.narrativeTemplates.banditAttack.base} 
                ${this.narrativeTemplates.banditAttack.variations[Math.floor(Math.random() * this.narrativeTemplates.banditAttack.variations.length)]}`,
            disease: `Бедствие! ${this.narrativeTemplates.disease.base} 
                ${this.narrativeTemplates.disease.variations[Math.floor(Math.random() * this.narrativeTemplates.disease.variations.length)]}`,
            harvest: `Радость! ${this.narrativeTemplates.harvest.base} 
                ${this.narrativeTemplates.harvest.variations[Math.floor(Math.random() * this.narrativeTemplates.harvest.variations.length)]}`
        };

        return eventDescriptions[eventType] || "Произошло неожиданное событие!";
    }

    // Get achievement description
    getAchievementDescription(achievement) {
        const achievements = {
            firstHouse: "Построить первый жилой дом",
            firstFarm: "Построить первую ферму",
            firstTrade: "Совершить первую торговую сделку",
            survivedWinter: "Пережить первую зиму",
            population100: "Довести население до 100",
            richCity: "Накопить 1000 золота"
        };

        return achievements[achievement] || "Добиться успеха";
    }

    // Get technology description
    getTechnologyDescription(tech) {
        const technologies = {
            basicFarming: "Базовое земледелие - позволяет строить фермы",
            advancedFarming: "Передовое земледелие - увеличивает производство еды на 50%",
            lumberProcessing: "Обработка древесины - увеличивает производство древесины на 50%",
            stoneMasonry: "Каменная кладка - увеличивает производство камня на 50%",
            tradeRoutes: "Торговые маршруты - увеличивает доход от рынков на 50%",
            religion: "Религия - храмы увеличивают счастье",
            education: "Образование - школы дают больше знаний",
            fortification: "Фортификация - стены и башни становятся прочнее"
        };

        return technologies[tech] || "Новая технология";
    }
}

// Export for use in other modules
window.GameSystem = GameSystem;
