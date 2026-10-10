// ============================================
// Game State Management
// ============================================

class GameState {
    constructor() {
        this.reset();
    }

    reset() {
        // Basic info
        this.cityName = "НОВЫЙ РАССВЕТ";
        this.day = 1;
        this.season = "Весна";
        this.year = 1;

        // Resources
        this.resources = {
            gold: 100,
            food: 50,
            wood: 30,
            stone: 20,
            population: 10,
            maxPopulation: 10,
            happiness: 80,
            faith: 50,
            knowledge: 10
        };

        // Buildings
        this.buildings = {
            houses: 1,
            farms: 0,
            lumberMills: 0,
            quarries: 0,
            markets: 0,
            temples: 0,
            schools: 0,
            walls: 0,
            towers: 0
        };

        // Workers assigned to buildings
        this.workers = {
            farms: 0,
            lumberMills: 0,
            quarries: 0,
            markets: 0,
            temples: 0,
            schools: 0
        };

        // Building requirements (workers per building)
        this.buildingRequirements = {
            farms: 2,
            lumberMills: 2,
            quarries: 2,
            markets: 3,
            temples: 1,
            schools: 1
        };

        // Production rates per worker
        this.productionRates = {
            farms: { food: 5 },
            lumberMills: { wood: 8 },
            quarries: { stone: 6 },
            markets: { gold: 10 },
            temples: { faith: 2 },
            schools: { knowledge: 0.5 }
        };

        // Technologies
        this.technologies = {
            basicFarming: true,
            advancedFarming: false,
            lumberProcessing: false,
            stoneMasonry: false,
            tradeRoutes: false,
            religion: false,
            education: false,
            fortification: false
        };

        // Events and history
        this.history = ["Основано поселение \"Новый Рассвет\""];
        this.currentEvent = null;
        this.gameOver = false;
        this.gameOverReason = "";
        this.victory = false;

        // Statistics
        this.stats = {
            totalGoldEarned: 0,
            totalFoodConsumed: 0,
            buildingsBuilt: 0,
            tradesCompleted: 0,
            expeditionsSent: 0,
            randomEvents: 0
        };
    }

    save() {
        try {
            const state = this.serialize();
            localStorage.setItem('cityBuilderSave', JSON.stringify(state));
            return true;
        } catch (e) {
            return false;
        }
    }

    load() {
        try {
            const saved = localStorage.getItem('cityBuilderSave');
            if (saved) {
                const state = JSON.parse(saved);
                this.deserialize(state);
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    serialize() {
        return {
            cityName: this.cityName,
            day: this.day,
            season: this.season,
            year: this.year,
            resources: { ...this.resources },
            buildings: { ...this.buildings },
            workers: { ...this.workers },
            technologies: { ...this.technologies },
            history: [...this.history],
            currentEvent: this.currentEvent,
            gameOver: this.gameOver,
            gameOverReason: this.gameOverReason,
            victory: this.victory,
            stats: { ...this.stats }
        };
    }

    deserialize(state) {
        this.cityName = state.cityName || "НОВЫЙ РАССВЕТ";
        this.day = state.day || 1;
        this.season = state.season || "Весна";
        this.year = state.year || 1;
        this.resources = { ...state.resources };
        this.buildings = { ...state.buildings };
        this.workers = state.workers || { farms: 0, lumberMills: 0, quarries: 0, markets: 0, temples: 0, schools: 0 };
        this.technologies = { ...state.technologies };
        this.history = [...state.history];
        this.currentEvent = state.currentEvent;
        this.gameOver = state.gameOver || false;
        this.gameOverReason = state.gameOverReason || "";
        this.victory = state.victory || false;
        this.stats = { ...state.stats };
    }

    // Auto-assign workers to buildings
    autoAssignWorkers() {
        let changed = false;
        
        // For each building type, assign workers up to capacity
        for (const buildingType of Object.keys(this.buildingRequirements)) {
            const maxWorkers = this.getMaxWorkers(buildingType);
            const currentWorkers = this.workers[buildingType] || 0;
            const available = this.availableWorkers;
            
            if (available > 0 && currentWorkers < maxWorkers) {
                const toHire = Math.min(available, maxWorkers - currentWorkers);
                this.workers[buildingType] = (this.workers[buildingType] || 0) + toHire;
                changed = true;
            }
        }
        
        return changed;
    }

    // Get available workers
    get availableWorkers() {
        return Math.max(0, this.resources.population - this.getEmployedWorkers());
    }

    // Get total employed workers
    getEmployedWorkers() {
        let total = 0;
        for (const [building, count] of Object.entries(this.workers)) {
            total += count;
        }
        return total;
    }

    // Get total worker capacity for a building type
    getMaxWorkers(buildingType) {
        return this.buildings[buildingType] * this.buildingRequirements[buildingType];
    }

    // Get total worker capacity across all buildings of a type
    getTotalCapacity(buildingType) {
        return this.buildings[buildingType] * this.buildingRequirements[buildingType];
    }

    // Get current workers for a building type
    getCurrentWorkers(buildingType) {
        return this.workers[buildingType] || 0;
    }

    // Get production per turn for a resource
    getProduction(resource) {
        let production = 0;
        
        for (const [buildingType, rate] of Object.entries(this.productionRates)) {
            if (rate[resource]) {
                const workers = this.workers[buildingType] || 0;
                let baseProduction = workers * rate[resource];
                
                // Apply technology bonuses
                if (resource === 'food' && this.technologies.advancedFarming) {
                    baseProduction *= 1.5;
                }
                if (resource === 'wood' && this.technologies.lumberProcessing) {
                    baseProduction *= 1.5;
                }
                if (resource === 'stone' && this.technologies.stoneMasonry) {
                    baseProduction *= 1.5;
                }
                if (resource === 'gold' && this.technologies.tradeRoutes) {
                    baseProduction *= 1.5;
                }
                
                // Apply season bonuses
                if (resource === 'food') {
                    if (this.season === "Зима") baseProduction *= 0.3;
                    if (this.season === "Лето") baseProduction *= 1.2;
                }
                
                production += baseProduction;
            }
        }
        
        return Math.floor(production);
    }

    nextDay() {
        this.day++;

        const seasons = ["Весна", "Лето", "Осень", "Зима"];
        if (this.day % 30 === 1) {
            const currentIndex = seasons.indexOf(this.season);
            this.season = seasons[(currentIndex + 1) % seasons.length];
            if (this.season === "Весна") this.year++;
        }

        // Auto-assign new workers
        this.autoAssignWorkers();

        this.consumeResources();
        this.produceResources();
        this.checkRandomEvents();
        this.checkGameConditions();
        this.addToHistory(`День ${this.day} (${this.season})`);
    }

    consumeResources() {
        // Food consumption by all population
        const foodConsumption = Math.floor(this.resources.population * 0.5);
        if (this.resources.food >= foodConsumption) {
            this.resources.food -= foodConsumption;
            this.stats.totalFoodConsumed += foodConsumption;
        } else {
            const starvation = foodConsumption - this.resources.food;
            this.resources.food = 0;
            const deaths = Math.min(Math.floor(starvation * 0.2), this.resources.population);
            this.resources.population -= deaths;
            this.resources.happiness = Math.max(0, this.resources.happiness - deaths * 5);
            this.addToHistory(`💀 Голод! Погибло ${deaths} жителей`);
        }

        // Gold maintenance for buildings
        const maintenance = Math.floor(
            (this.buildings.houses * 0.1 + 
             this.buildings.farms * 0.2 + 
             this.buildings.lumberMills * 0.3 + 
             this.buildings.quarries * 0.3 + 
             this.buildings.markets * 0.5 + 
             this.buildings.temples * 0.4 + 
             this.buildings.schools * 0.3 + 
             this.buildings.walls * 0.2 + 
             this.buildings.towers * 0.5) * (1 + this.day / 1000)
        );
        
        if (this.resources.gold >= maintenance) {
            this.resources.gold -= maintenance;
        } else {
            this.resources.gold = 0;
            this.resources.happiness = Math.max(0, this.resources.happiness - 5);
        }

        // Happiness decay
        this.resources.happiness = Math.max(0, this.resources.happiness - 1);
    }

    produceResources() {
        // Farms produce food based on workers
        let foodProduction = this.workers.farms * 5;
        if (this.technologies.advancedFarming) foodProduction *= 1.5;
        if (this.season === "Зима") foodProduction *= 0.3;
        if (this.season === "Лето") foodProduction *= 1.2;
        this.resources.food += Math.floor(foodProduction);

        // Lumber mills produce wood based on workers
        let woodProduction = this.workers.lumberMills * 8;
        if (this.technologies.lumberProcessing) woodProduction *= 1.5;
        this.resources.wood += Math.floor(woodProduction);

        // Quarries produce stone based on workers
        let stoneProduction = this.workers.quarries * 6;
        if (this.technologies.stoneMasonry) stoneProduction *= 1.5;
        this.resources.stone += Math.floor(stoneProduction);

        // Markets generate gold based on workers
        let goldProduction = this.workers.markets * 10;
        if (this.technologies.tradeRoutes) goldProduction *= 1.5;
        this.resources.gold += Math.floor(goldProduction);
        this.stats.totalGoldEarned += Math.floor(goldProduction);

        // Temples increase faith and happiness based on workers
        if (this.workers.temples > 0) {
            this.resources.faith = Math.min(100, this.resources.faith + this.workers.temples * 2);
            if (this.technologies.religion) {
                this.resources.happiness = Math.min(100, this.resources.happiness + this.workers.temples);
            }
        }

        // Schools increase knowledge based on workers
        if (this.workers.schools > 0) {
            this.resources.knowledge += this.workers.schools * 0.5;
        }
    }

    checkRandomEvents() {
        const eventRoll = Math.random() * 100;
        const eventChance = 10 + this.resources.population / 2 + this.day / 50;
        
        if (eventRoll < eventChance) {
            const events = this.getAvailableEvents();
            if (events.length > 0) {
                const randomEvent = events[Math.floor(Math.random() * events.length)];
                this.triggerEvent(randomEvent);
                this.stats.randomEvents++;
            }
        }
    }

    getAvailableEvents() {
        const events = ["merchant"];
        if (this.resources.population >= 20) events.push("bandits");
        if (this.resources.population >= 30) events.push("disease");
        if (this.season === "Лето") events.push("harvest");
        if (this.season === "Зима") events.push("blizzard");
        if (this.resources.food < this.resources.population * 3) events.push("famine_warning");
        if (this.resources.happiness < 30) events.push("revolt");
        if (this.buildings.walls > 0) events.push("siege");
        if (this.technologies.tradeRoutes) events.push("trade_fair");
        return events;
    }

    triggerEvent(eventType) {
        const eventHandlers = {
            merchant: () => {
                const goldGain = 20 + Math.floor(Math.random() * 30);
                const foodCost = 10 + Math.floor(Math.random() * 20);
                if (this.resources.food >= foodCost) {
                    this.resources.food -= foodCost;
                    this.resources.gold += goldGain;
                    this.addToHistory(`💰 Купеческий караван! +${goldGain} золота, -${foodCost} еды`);
                    this.stats.tradesCompleted++;
                } else {
                    this.addToHistory(`💰 Купеческий караван проехал мимо - не хватило еды`);
                }
            },
            bandits: () => {
                const banditStrength = 10 + Math.floor(this.day / 20);
                const guardStrength = this.buildings.towers * 5 + this.resources.population / 2;
                if (guardStrength > banditStrength * 0.8) {
                    const goldLoot = 15 + Math.floor(Math.random() * 25);
                    this.resources.gold += goldLoot;
                    this.addToHistory(`⚔️ Нападение бандитов! Отбиты! +${goldLoot} золота`);
                } else {
                    const goldLost = Math.min(30, this.resources.gold);
                    const populationLost = Math.min(5, Math.floor(this.resources.population * 0.2));
                    this.resources.gold -= goldLost;
                    this.resources.population -= populationLost;
                    this.resources.happiness = Math.max(0, this.resources.happiness - 20);
                    this.addToHistory(`⚔️ Нападение бандитов! Потери: -${goldLost} золота, -${populationLost} жителей`);
                }
            },
            disease: () => {
                const severity = Math.random();
                let populationLost = Math.floor(this.resources.population * (severity * 0.3 + 0.05));
                if (this.technologies.education) populationLost = Math.floor(populationLost * 0.5);
                this.resources.population -= populationLost;
                this.resources.happiness = Math.max(0, this.resources.happiness - 15);
                this.addToHistory(`🤒 Эпидемия! Погибло ${populationLost} жителей`);
            },
            harvest: () => {
                const bonus = 20 + Math.floor(Math.random() * 30);
                this.resources.food += bonus;
                this.addToHistory(`🌾 Урожайный год! +${bonus} еды`);
            },
            blizzard: () => {
                const foodLost = Math.min(20, this.resources.food);
                const woodLost = Math.min(15, this.resources.wood);
                this.resources.food -= foodLost;
                this.resources.wood -= woodLost;
                this.resources.happiness = Math.max(0, this.resources.happiness - 10);
                this.addToHistory(`❄️ Метель! Потери: -${foodLost} еды, -${woodLost} древесины`);
            },
            famine_warning: () => {
                this.addToHistory(`⚠️ Предупреждение: запасы еды на исходе!`);
                this.resources.happiness = Math.max(0, this.resources.happiness - 5);
            },
            revolt: () => {
                const rebellionStrength = 50 - this.resources.happiness;
                const suppression = this.buildings.towers * 3 + this.resources.population * 0.5;
                if (suppression > rebellionStrength) {
                    this.resources.happiness = Math.min(100, this.resources.happiness + 10);
                    this.addToHistory(`🔥 Волнения в городе подавлены`);
                } else {
                    const populationLost = Math.min(10, Math.floor(this.resources.population * 0.3));
                    this.resources.population -= populationLost;
                    this.addToHistory(`🔥 Восстание! Погибло ${populationLost} жителей`);
                }
            },
            siege: () => {
                const enemyStrength = 40 + Math.floor(this.day / 10);
                const defense = this.buildings.walls * 10 + this.buildings.towers * 15 + this.resources.population * 0.5;
                if (defense > enemyStrength) {
                    this.addToHistory(`🏰 Осада отбита!`);
                } else {
                    const damage = Math.floor((enemyStrength - defense) / 2);
                    this.resources.population -= Math.min(15, damage);
                    this.buildings.houses = Math.max(0, this.buildings.houses - Math.floor(damage / 5));
                    this.addToHistory(`🏰 Осада! Потери: ${Math.min(15, damage)} жителей, ${Math.floor(damage / 5)} дома`);
                }
            },
            trade_fair: () => {
                const goldGain = 40 + Math.floor(Math.random() * 60);
                this.resources.gold += goldGain;
                this.addToHistory(`🎪 Торговый фестиваль! +${goldGain} золота`);
                this.stats.tradesCompleted++;
            }
        };
        if (eventHandlers[eventType]) {
            eventHandlers[eventType]();
            this.currentEvent = eventType;
        }
    }

    checkGameConditions() {
        if (this.resources.population <= 0) {
            this.gameOver = true;
            this.gameOverReason = "Все жители погибли. Поселение брошено.";
            this.addToHistory("💀 ИГРА ОКОНЧЕНА: Все жители погибли");
        }
        if (this.resources.happiness <= 0 && this.resources.population > 5) {
            this.gameOver = true;
            this.gameOverReason = "Жители восстали и изгнали вас из города.";
            this.addToHistory("🔥 ИГРА ОКОНЧЕНА: Восстание");
        }
        if (this.resources.food <= 0 && this.resources.population > 0) {
            this.gameOver = true;
            this.gameOverReason = "Голод уничтожил ваше поселение.";
            this.addToHistory("💀 ИГРА ОКОНЧЕНА: Голод");
        }
        if (this.resources.population >= 100 && this.buildings.temples >= 3 && this.buildings.markets >= 3) {
            this.victory = true;
            this.gameOver = true;
            this.gameOverReason = "Ваш город процветает! Вы выиграли!";
            this.addToHistory("🎉 ПОБЕДА: Город процветает!");
        }
    }

    addToHistory(message) {
        this.history.unshift(message);
        if (this.history.length > 20) {
            this.history.pop();
        }
    }

    // Building methods
    buildHouses() {
        if (this.resources.wood >= 20 && this.resources.stone >= 10) {
            this.resources.wood -= 20;
            this.resources.stone -= 10;
            this.buildings.houses++;
            this.resources.maxPopulation += 5;
            this.resources.happiness = Math.min(100, this.resources.happiness + 5);
            this.stats.buildingsBuilt++;
            this.addToHistory(`🏗️ Построен дом (+5 max население)`);
            return true;
        }
        return false;
    }

    buildFarms() {
        if (this.resources.gold >= 15 && this.resources.wood >= 10) {
            this.resources.gold -= 15;
            this.resources.wood -= 10;
            this.buildings.farms++;
            this.stats.buildingsBuilt++;
            this.addToHistory(`🌾 Построена ферма`);
            return true;
        }
        return false;
    }

    buildLumberMill() {
        if (this.resources.gold >= 20 && this.resources.wood >= 15) {
            this.resources.gold -= 20;
            this.resources.wood -= 15;
            this.buildings.lumberMills++;
            this.stats.buildingsBuilt++;
            this.addToHistory(`🪓 Построена лесопилка`);
            return true;
        }
        return false;
    }

    buildQuarry() {
        if (this.resources.gold >= 25 && this.resources.wood >= 10 && this.resources.stone >= 5) {
            this.resources.gold -= 25;
            this.resources.wood -= 10;
            this.resources.stone -= 5;
            this.buildings.quarries++;
            this.stats.buildingsBuilt++;
            this.addToHistory(`⛏️ Построен карьер`);
            return true;
        }
        return false;
    }

    buildMarket() {
        if (this.resources.gold >= 30 && this.resources.wood >= 20 && this.resources.stone >= 10) {
            this.resources.gold -= 30;
            this.resources.wood -= 20;
            this.resources.stone -= 10;
            this.buildings.markets++;
            this.stats.buildingsBuilt++;
            this.addToHistory(`🏪 Построен рынок`);
            return true;
        }
        return false;
    }

    buildTemple() {
        if (this.resources.gold >= 50 && this.resources.wood >= 30 && this.resources.stone >= 20) {
            this.resources.gold -= 50;
            this.resources.wood -= 30;
            this.resources.stone -= 20;
            this.buildings.temples++;
            this.stats.buildingsBuilt++;
            this.addToHistory(`🕍 Построен храм`);
            return true;
        }
        return false;
    }

    buildSchool() {
        if (this.resources.gold >= 40 && this.resources.wood >= 25) {
            this.resources.gold -= 40;
            this.resources.wood -= 25;
            this.buildings.schools++;
            this.stats.buildingsBuilt++;
            this.addToHistory(`🏫 Построена школа`);
            return true;
        }
        return false;
    }

    buildWalls() {
        if (this.resources.gold >= 40 && this.resources.stone >= 30) {
            this.resources.gold -= 40;
            this.resources.stone -= 30;
            this.buildings.walls++;
            this.stats.buildingsBuilt++;
            this.addToHistory(`🧱 Построена стена`);
            return true;
        }
        return false;
    }

    buildTower() {
        if (this.resources.gold >= 60 && this.resources.wood >= 20 && this.resources.stone >= 40) {
            this.resources.gold -= 60;
            this.resources.wood -= 20;
            this.resources.stone -= 40;
            this.buildings.towers++;
            this.stats.buildingsBuilt++;
            this.addToHistory(`🗼 Построена башня`);
            return true;
        }
        return false;
    }

    // Worker management methods
    hireWorker(buildingType) {
        if (this.availableWorkers > 0 && this.workers[buildingType] < this.getMaxWorkers(buildingType)) {
            this.workers[buildingType] = (this.workers[buildingType] || 0) + 1;
            this.addToHistory(`👨‍🌾 Нанят рабочий на ${this.getBuildingName(buildingType)}`);
            return true;
        }
        return false;
    }

    fireWorker(buildingType) {
        if (this.workers[buildingType] > 0) {
            this.workers[buildingType]--;
            this.addToHistory(`👋 Уволен рабочий с ${this.getBuildingName(buildingType)}`);
            return true;
        }
        return false;
    }

    getBuildingName(buildingType) {
        const names = {
            farms: "ферму",
            lumberMills: "лесопилку",
            quarries: "карьер",
            markets: "рынок",
            temples: "храм",
            schools: "школу"
        };
        return names[buildingType] || buildingType;
    }

    // Technology methods
    developFarming() {
        if (this.resources.knowledge >= 20 && !this.technologies.advancedFarming && this.buildings.farms > 0) {
            this.resources.knowledge -= 20;
            this.technologies.advancedFarming = true;
            this.addToHistory(`🌱 Развито передовое земледелие`);
            return true;
        }
        return false;
    }

    developLumber() {
        if (this.resources.knowledge >= 15 && !this.technologies.lumberProcessing && this.buildings.lumberMills > 0) {
            this.resources.knowledge -= 15;
            this.technologies.lumberProcessing = true;
            this.addToHistory(`🪵 Развита обработка древесины`);
            return true;
        }
        return false;
    }

    developMasonry() {
        if (this.resources.knowledge >= 15 && !this.technologies.stoneMasonry && this.buildings.quarries > 0) {
            this.resources.knowledge -= 15;
            this.technologies.stoneMasonry = true;
            this.addToHistory(`🪨 Развита каменная кладка`);
            return true;
        }
        return false;
    }

    developTrade() {
        if (this.resources.knowledge >= 25 && !this.technologies.tradeRoutes && this.buildings.markets > 0) {
            this.resources.knowledge -= 25;
            this.technologies.tradeRoutes = true;
            this.addToHistory(`💰 Открыты торговые маршруты`);
            return true;
        }
        return false;
    }

    developReligion() {
        if (this.resources.faith >= 50 && !this.technologies.religion && this.buildings.temples > 0) {
            this.resources.faith -= 50;
            this.technologies.religion = true;
            this.addToHistory(`⛪ Развита религия`);
            return true;
        }
        return false;
    }

    developEducation() {
        if (this.resources.knowledge >= 30 && !this.technologies.education && this.buildings.schools > 0) {
            this.resources.knowledge -= 30;
            this.technologies.education = true;
            this.addToHistory(`🎓 Развито образование`);
            return true;
        }
        return false;
    }

    developFortification() {
        if (this.resources.knowledge >= 35 && !this.technologies.fortification && this.buildings.walls > 0) {
            this.resources.knowledge -= 35;
            this.technologies.fortification = true;
            this.addToHistory(`🛡️ Развиты фортификационные технологии`);
            return true;
        }
        return false;
    }

    // Action methods
    tradeWithMerchant() {
        if (this.resources.food >= 15) {
            this.resources.food -= 15;
            this.resources.gold += 30;
            this.addToHistory(`💰 Торговля: +30 золота, -15 еды`);
            this.stats.tradesCompleted++;
            return true;
        }
        return false;
    }

    sendExpedition() {
        if (this.resources.gold >= 10) {
            this.resources.gold -= 10;
            this.stats.expeditionsSent++;
            const successChance = 0.6 + (this.resources.knowledge / 100) * 0.2;
            const roll = Math.random();
            
            if (roll < successChance) {
                const rewardType = Math.random();
                let reward, message;
                if (rewardType < 0.33) {
                    reward = 50 + Math.floor(Math.random() * 50);
                    this.resources.gold += reward;
                    message = `✅ Экспедиция! +${reward} золота`;
                } else if (rewardType < 0.66) {
                    reward = 30 + Math.floor(Math.random() * 40);
                    this.resources.wood += reward;
                    message = `✅ Экспедиция! +${reward} древесины`;
                } else {
                    reward = 20 + Math.floor(Math.random() * 30);
                    this.resources.stone += reward;
                    message = `✅ Экспедиция! +${reward} камня`;
                }
                this.addToHistory(message);
                return true;
            } else {
                const loss = 5 + Math.floor(Math.random() * 10);
                this.resources.gold = Math.max(0, this.resources.gold - loss);
                this.addToHistory(`❌ Экспедиция не удалась! -${loss} золота`);
                return false;
            }
        }
        return false;
    }

    wait() {
        this.addToHistory(`⏳ День прошел в ожидании`);
        return true;
    }

    // Execute action by name
    executeAction(actionName) {
        const actionMap = {
            buildHouses: () => this.buildHouses(),
            buildFarms: () => this.buildFarms(),
            buildLumberMill: () => this.buildLumberMill(),
            buildQuarry: () => this.buildQuarry(),
            buildMarket: () => this.buildMarket(),
            buildTemple: () => this.buildTemple(),
            buildSchool: () => this.buildSchool(),
            buildWalls: () => this.buildWalls(),
            buildTower: () => this.buildTower(),
            hireFarmWorker: () => this.hireWorker('farms'),
            hireLumberMillWorker: () => this.hireWorker('lumberMills'),
            hireQuarryWorker: () => this.hireWorker('quarries'),
            hireMarketWorker: () => this.hireWorker('markets'),
            hireTempleWorker: () => this.hireWorker('temples'),
            hireSchoolWorker: () => this.hireWorker('schools'),
            fireFarmWorker: () => this.fireWorker('farms'),
            fireLumberMillWorker: () => this.fireWorker('lumberMills'),
            fireQuarryWorker: () => this.fireWorker('quarries'),
            fireMarketWorker: () => this.fireWorker('markets'),
            fireTempleWorker: () => this.fireWorker('temples'),
            fireSchoolWorker: () => this.fireWorker('schools'),
            developFarming: () => this.developFarming(),
            developLumber: () => this.developLumber(),
            developMasonry: () => this.developMasonry(),
            developTrade: () => this.developTrade(),
            developReligion: () => this.developReligion(),
            developEducation: () => this.developEducation(),
            developFortification: () => this.developFortification(),
            tradeWithMerchant: () => this.tradeWithMerchant(),
            sendExpedition: () => this.sendExpedition(),
            wait: () => this.wait()
        };
        return actionMap[actionName] ? actionMap[actionName]() : false;
    }
}

// Export for use in other modules
window.GameState = GameState;
