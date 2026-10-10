// ============================================
// Game System & Narrative Generator
// ============================================

class GameSystem {
    constructor(gameState) {
        this.gameState = gameState;
    }

    // Generate choices based on current state
    generateChoices() {
        const state = this.gameState;
        const choices = [];

        // Always available
        choices.push({ text: "Подождать", action: "wait", cost: "" });

        // Building choices - always show if affordable
        if (state.resources.wood >= 20 && state.resources.stone >= 10) {
            choices.push({ text: "Построить дом", action: "buildHouses", cost: "-20 древесины, -10 камня" });
        }

        if (state.resources.gold >= 15 && state.resources.wood >= 10) {
            choices.push({ text: "Построить ферму", action: "buildFarms", cost: "-15 золота, -10 древесины" });
        }

        if (state.resources.gold >= 20 && state.resources.wood >= 15) {
            choices.push({ text: "Построить лесопилку", action: "buildLumberMill", cost: "-20 золота, -15 древесины" });
        }

        if (state.resources.gold >= 25 && state.resources.wood >= 10 && state.resources.stone >= 5) {
            choices.push({ text: "Построить карьер", action: "buildQuarry", cost: "-25 золота, -10 древесины, -5 камня" });
        }

        // Advanced buildings - appear after certain conditions
        if (state.buildings.houses >= 3 && state.resources.gold >= 30 && state.resources.wood >= 20 && state.resources.stone >= 10) {
            choices.push({ text: "Построить рынок", action: "buildMarket", cost: "-30 золота, -20 древесины, -10 камня" });
        }

        if (state.buildings.farms >= 2 && state.resources.gold >= 50 && state.resources.wood >= 30 && state.resources.stone >= 20) {
            choices.push({ text: "Построить храм", action: "buildTemple", cost: "-50 золота, -30 древесины, -20 камня" });
        }

        if (state.buildings.houses >= 4 && state.resources.gold >= 40 && state.resources.wood >= 25) {
            choices.push({ text: "Построить школу", action: "buildSchool", cost: "-40 золота, -25 древесины" });
        }

        if (state.buildings.houses >= 5 && state.resources.gold >= 40 && state.resources.stone >= 30) {
            choices.push({ text: "Построить стену", action: "buildWalls", cost: "-40 золота, -30 камня" });
        }

        if (state.buildings.walls >= 1 && state.resources.gold >= 60 && state.resources.wood >= 20 && state.resources.stone >= 40) {
            choices.push({ text: "Построить башню", action: "buildTower", cost: "-60 золота, -20 древесины, -40 камня" });
        }

        // Technology choices
        if (state.buildings.farms >= 1 && state.resources.knowledge >= 20 && !state.technologies.advancedFarming) {
            choices.push({ text: "Развить земледелие", action: "developFarming", cost: "-20 знаний" });
        }

        if (state.buildings.lumberMills >= 1 && state.resources.knowledge >= 15 && !state.technologies.lumberProcessing) {
            choices.push({ text: "Развить лесопилку", action: "developLumber", cost: "-15 знаний" });
        }

        if (state.buildings.quarries >= 1 && state.resources.knowledge >= 15 && !state.technologies.stoneMasonry) {
            choices.push({ text: "Развить каменную кладку", action: "developMasonry", cost: "-15 знаний" });
        }

        if (state.buildings.markets >= 1 && state.resources.knowledge >= 25 && !state.technologies.tradeRoutes) {
            choices.push({ text: "Открыть торговые маршруты", action: "developTrade", cost: "-25 знаний" });
        }

        if (state.buildings.temples >= 1 && state.resources.faith >= 50 && !state.technologies.religion) {
            choices.push({ text: "Развить религию", action: "developReligion", cost: "-50 веры" });
        }

        if (state.buildings.schools >= 1 && state.resources.knowledge >= 30 && !state.technologies.education) {
            choices.push({ text: "Развить образование", action: "developEducation", cost: "-30 знаний" });
        }

        if (state.buildings.walls >= 1 && state.resources.knowledge >= 35 && !state.technologies.fortification) {
            choices.push({ text: "Развить фортификацию", action: "developFortification", cost: "-35 знаний" });
        }

        // Resource actions
        if (state.resources.food >= 15) {
            choices.push({ text: "Торговать", action: "tradeWithMerchant", cost: "-15 еды, +30 золота" });
        }

        if (state.resources.gold >= 10) {
            choices.push({ text: "Экспедиция", action: "sendExpedition", cost: "-10 золота" });
        }

        // Filter out duplicates and limit to 4
        const uniqueChoices = [];
        const seenActions = new Set();
        for (const choice of choices) {
            if (!seenActions.has(choice.action)) {
                seenActions.add(choice.action);
                uniqueChoices.push(choice);
            }
        }

        // If we have less than 4 choices, add more options
        while (uniqueChoices.length < 4) {
            const allPossible = [
                { text: "Подождать", action: "wait", cost: "" },
                { text: "Торговать", action: "tradeWithMerchant", cost: "-15 еды, +30 золота" },
                { text: "Экспедиция", action: "sendExpedition", cost: "-10 золота" }
            ];
            
            for (const option of allPossible) {
                if (!seenActions.has(option.action)) {
                    if ((option.action === "tradeWithMerchant" && state.resources.food >= 15) ||
                        (option.action === "sendExpedition" && state.resources.gold >= 10) ||
                        option.action === "wait") {
                        seenActions.add(option.action);
                        uniqueChoices.push(option);
                        break;
                    }
                }
            }
            
            // If still not enough, break to avoid infinite loop
            if (uniqueChoices.length >= 4 || seenActions.size >= 3) break;
        }

        return uniqueChoices.slice(0, 4);
    }

    // Generate narrative based on current state
    generateNarrative() {
        const state = this.gameState;
        const narratives = [];

        // Check for critical situations
        if (state.resources.food < state.resources.population * 2) {
            narratives.push({
                title: "Голод угрожает",
                description: `Запасы еды на исходе! Жители начинают беспокоиться. ${this.getRandomFoodWarning()}`,
                icon: "🍞"
            });
        }

        if (state.resources.happiness < 30) {
            narratives.push({
                title: "Народ недоволен",
                description: `Население недовольно. ${this.getRandomHappinessWarning()} Если не принять меры, может начаться восстание.`,
                icon: "😠"
            });
        }

        if (state.resources.gold < 20) {
            narratives.push({
                title: "Финансовый кризис",
                description: `Казна пуста. ${this.getRandomGoldWarning()} Без золота сложно развивать город.`,
                icon: "💰"
            });
        }

        // Season-based narratives
        if (state.season === "Весна") {
            narratives.push({
                title: "Весеннее пробуждение",
                description: `Весна пришла в ваш город. ${this.getRandomSpring()} Природа просыпается, и с ней просыпаются надежды.`,
                icon: "🌸"
            });
        } else if (state.season === "Лето") {
            narratives.push({
                title: "Летний зной",
                description: `Лето в разгаре. ${this.getRandomSummer()} Жара заставляет работать усерднее.`,
                icon: "☀️"
            });
        } else if (state.season === "Осень") {
            narratives.push({
                title: "Осенний урожай",
                description: `Осень окрасила листья в золотые тона. ${this.getRandomAutumn()} Время сбора урожая.`,
                icon: "🍂"
            });
        } else if (state.season === "Зима") {
            narratives.push({
                title: "Зимние испытания",
                description: `Зима сурова. ${this.getRandomWinter()} Холод и снег делают жизнь сложнее.`,
                icon: "❄️"
            });
        }

        // Prosperity narrative
        if (state.resources.happiness > 80 && 
            state.resources.food > state.resources.population * 3 &&
            state.resources.gold > 50) {
            narratives.push({
                title: "Процветание",
                description: `Город процветает! ${this.getRandomProsperity()} Жители счастливы.`,
                icon: "🌟"
            });
        }

        // Default narrative
        if (narratives.length === 0) {
            narratives.push({
                title: `День ${state.day} в ${state.cityName}`,
                description: `Жизнь в ${state.cityName} идет своим чередом. ${this.getRandomDailyLife()}`,
                icon: "🏙️"
            });
        }

        // Select random narrative
        return narratives[Math.floor(Math.random() * narratives.length)];
    }

    getRandomFoodWarning() {
        const warnings = [
            "Хлебные запасы на исходе.",
            "Фермеры сообщают о плохом урожае.",
            "На рынке осталось совсем немного еды.",
            "Люди начинают голодать."
        ];
        return warnings[Math.floor(Math.random() * warnings.length)];
    }

    getRandomGoldWarning() {
        const warnings = [
            "Казна почти пуста.",
            "Купцы отказываются иметь дело с вами.",
            "Нет денег на зарплату рабочим.",
            "Строительство замерло из-за нехватки средств."
        ];
        return warnings[Math.floor(Math.random() * warnings.length)];
    }

    getRandomHappinessWarning() {
        const warnings = [
            "Люди недовольны вашим правлением.",
            "На улицах слышны разговоры о восстании.",
            "Жители избегают вас.",
            "Воздух наполнен недовольством."
        ];
        return warnings[Math.floor(Math.random() * warnings.length)];
    }

    getRandomProsperity() {
        const prosperities = [
            "Город растет и процветает.",
            "Жители счастливы и полны надежд.",
            "Экономика развивается быстрыми темпами.",
            "Новые дома строятся каждый день."
        ];
        return prosperities[Math.floor(Math.random() * prosperities.length)];
    }

    getRandomSpring() {
        const springs = [
            "Цветущие деревья украшают улицы города.",
            "Природа просыпается ото сна.",
            "Река выходит из берегов, принося плодородный ил.",
            "Птицы возвращаются с юга."
        ];
        return springs[Math.floor(Math.random() * springs.length)];
    }

    getRandomSummer() {
        const summers = [
            "Солнце палит немилосердно.",
            "Поля зеленеют под жарким солнцем.",
            "Жители работают с рассвета до заката.",
            "Ночи теплые и ясные."
        ];
        return summers[Math.floor(Math.random() * summers.length)];
    }

    getRandomAutumn() {
        const autumns = [
            "Листья падают с деревьев, устилая улицы золотым ковром.",
            "Фермеры работают не покладая рук.",
            "Воздух наполнен запахом спелых яблок.",
            "Птицы начинают готовиться к зиме."
        ];
        return autumns[Math.floor(Math.random() * autumns.length)];
    }

    getRandomWinter() {
        const winters = [
            "Снег покрывает крыши домов толстым слоем.",
            "Дым из труб поднимается высоко в морозный воздух.",
            "Дети играют в снежки на улицах.",
            "Ночи длинные и холодные."
        ];
        return winters[Math.floor(Math.random() * winters.length)];
    }

    getRandomDailyLife() {
        const dailyLife = [
            "Фермеры работают в поле.",
            "Купцы торгуют на рынке.",
            "Строители возводят новые здания.",
            "Дети играют на улицах.",
            "Ремесленники создают новые товары."
        ];
        return dailyLife[Math.floor(Math.random() * dailyLife.length)];
    }

    // Generate a complete narrative with choices
    generateFullNarrative() {
        const narrative = this.generateNarrative();
        const choices = this.generateChoices();

        return {
            ...narrative,
            choices: choices
        };
    }
}

// Export for use in other modules
window.GameSystem = GameSystem;
