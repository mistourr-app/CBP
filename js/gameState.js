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
            maxPopulation: 20,
            happiness: 80,
            faith: 50,
            knowledge: 10
        };

        // Buildings
        this.buildings = {
            houses: 5,
            farms: 1,
            lumberMills: 0,
            quarries: 0,
            markets: 0,
            temples: 0,
            schools: 0,
            walls: 0,
            towers: 0
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
        this.randomEvents = [];
        this.encounters = [];

        // Game state
        this.gameOver = false;
        this.gameOverReason = "";
        this.victory = false;
        this.difficulty = "normal";

        // Achievements
        this.achievements = {
            firstHouse: false,
            firstFarm: false,
            firstTrade: false,
            survivedWinter: false,
            population100: false,
            richCity: false
        };

        // Statistics
        this.stats = {
            totalGoldEarned: 0,
            totalFoodConsumed: 0,
            buildingsBuilt: 0,
            tradesCompleted: 0,
            expeditionsSent: 0,
            randomEvents: 0
        };

        // Current narrative
        this.currentNarrative = {
            title: "",
            description: "",
            choices: []
        };

        // Unlocked content
        this.unlocked = {
            buildings: ["houses", "farms", "lumberMills", "quarries"],
            actions: ["build", "farm", "explore", "trade"],
            events: ["merchant", "bandits", "disease", "harvest"]
        };

        // Time tracking
        this.lastUpdate = Date.now();
        this.sessionStart = Date.now();
    }

    // Save state to localStorage
    save() {
        try {
            const state = this.serialize();
            localStorage.setItem('cityBuilderSave', JSON.stringify(state));
            return true;
        } catch (e) {
            console.error("Error saving game:", e);
            return false;
        }
    }

    // Load state from localStorage
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
            console.error("Error loading game:", e);
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
            technologies: { ...this.technologies },
            history: [...this.history],
            currentEvent: this.currentEvent,
            randomEvents: [...this.randomEvents],
            encounters: [...this.encounters],
            gameOver: this.gameOver,
            gameOverReason: this.gameOverReason,
            victory: this.victory,
            difficulty: this.difficulty,
            achievements: { ...this.achievements },
            stats: { ...this.stats },
            currentNarrative: { ...this.currentNarrative },
            unlocked: {
                buildings: [...this.unlocked.buildings],
                actions: [...this.unlocked.actions],
                events: [...this.unlocked.events]
            },
            lastUpdate: this.lastUpdate,
            sessionStart: this.sessionStart
        };
    }

    deserialize(state) {
        this.cityName = state.cityName || "НОВЫЙ РАССВЕТ";
        this.day = state.day || 1;
        this.season = state.season || "Весна";
        this.year = state.year || 1;
        this.resources = { ...state.resources };
        this.buildings = { ...state.buildings };
        this.technologies = { ...state.technologies };
        this.history = [...state.history];
        this.currentEvent = state.currentEvent;
        this.randomEvents = [...state.randomEvents];
        this.encounters = [...state.encounters];
        this.gameOver = state.gameOver || false;
        this.gameOverReason = state.gameOverReason || "";
        this.victory = state.victory || false;
        this.difficulty = state.difficulty || "normal";
        this.achievements = { ...state.achievements };
        this.stats = { ...state.stats };
        this.currentNarrative = { ...state.currentNarrative };
        this.unlocked = {
            buildings: [...state.unlocked.buildings],
            actions: [...state.unlocked.actions],
            events: [...state.unlocked.events]
        };
        this.lastUpdate = state.lastUpdate || Date.now();
        this.sessionStart = state.sessionStart || Date.now();
    }

    // Advance to next day
    nextDay() {
        this.day++;

        // Change season every 30 days
        const seasons = ["Весна", "Лето", "Осень", "Зима"];
        if (this.day % 30 === 1) {
            const currentIndex = seasons.indexOf(this.season);
            this.season = seasons[(currentIndex + 1) % seasons.length];
            
            if (this.season === "Весна") {
                this.year++;
            }
        }

        // Daily consumption
        this.consumeResources();

        // Daily production
        this.produceResources();

        // Random events
        this.checkRandomEvents();

        // Check win/lose conditions
        this.checkGameConditions();

        // Add to history
        this.addToHistory(`Наступил день ${this.day} (${this.season})`);
    }

    consumeResources() {
        // Food consumption (0.5 per person per day)
        const foodConsumption = Math.floor(this.resources.population * 0.5);
        if (this.resources.food >= foodConsumption) {
            this.resources.food -= foodConsumption;
            this.stats.totalFoodConsumed += foodConsumption;
        } else {
            // Starvation!
            const starvation = foodConsumption - this.resources.food;
            this.resources.food = 0;
            const deaths = Math.min(Math.floor(starvation * 0.2), this.resources.population);
            this.resources.population -= deaths;
            this.resources.happiness = Math.max(0, this.resources.happiness - deaths * 5);
            this.addToHistory(`💀 Голод! Погибло ${deaths} жителей`);
        }

        // Gold maintenance (buildings)
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
        // Farms produce food
        let foodProduction = this.buildings.farms * 5;
        if (this.technologies.advancedFarming) foodProduction *= 1.5;
        if (this.season === "Зима") foodProduction *= 0.3;
        if (this.season === "Лето") foodProduction *= 1.2;
        this.resources.food += Math.floor(foodProduction);

        // Lumber mills produce wood
        let woodProduction = this.buildings.lumberMills * 8;
        if (this.technologies.lumberProcessing) woodProduction *= 1.5;
        this.resources.wood += Math.floor(woodProduction);

        // Quarries produce stone
        let stoneProduction = this.buildings.quarries * 6;
        if (this.technologies.stoneMasonry) stoneProduction *= 1.5;
        this.resources.stone += Math.floor(stoneProduction);

        // Markets generate gold
        let goldProduction = this.buildings.markets * 10;
        if (this.technologies.tradeRoutes) goldProduction *= 1.5;
        this.resources.gold += Math.floor(goldProduction);
        this.stats.totalGoldEarned += Math.floor(goldProduction);

        // Temples increase faith and happiness
        if (this.buildings.temples > 0) {
            this.resources.faith = Math.min(100, this.resources.faith + this.buildings.temples * 2);
            if (this.technologies.religion) {
                this.resources.happiness = Math.min(100, this.resources.happiness + this.buildings.temples);
            }
        }

        // Schools increase knowledge
        if (this.buildings.schools > 0) {
            this.resources.knowledge += this.buildings.schools * 0.5;
        }
    }

    checkRandomEvents() {
        const eventRoll = Math.random() * 100;
        
        // More events as city grows
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
        const events = [];
        
        // Always available
        events.push("merchant");
        
        // Population based
        if (this.resources.population >= 20) {
            events.push("bandits");
        }
        
        if (this.resources.population >= 30) {
            events.push("disease");
        }
        
        // Season based
        if (this.season === "Лето") {
            events.push("harvest");
        }
        
        if (this.season === "Зима") {
            events.push("blizzard");
        }
        
        // Resource based
        if (this.resources.food < this.resources.population * 3) {
            events.push("famine_warning");
        }
        
        if (this.resources.happiness < 30) {
            events.push("revolt");
        }
        
        // Building based
        if (this.buildings.walls > 0) {
            events.push("siege");
        }
        
        // Technology based
        if (this.technologies.tradeRoutes) {
            events.push("trade_fair");
        }
        
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
                    // Victory
                    const goldLoot = 15 + Math.floor(Math.random() * 25);
                    this.resources.gold += goldLoot;
                    this.addToHistory(`⚔️ Нападение бандитов! Отбиты! +${goldLoot} золота`);
                } else {
                    // Defeat
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
                const populationLost = Math.floor(
                    this.resources.population * (severity * 0.3 + 0.05)
                );
                
                if (this.technologies.education) {
                    // Doctors help
                    populationLost = Math.floor(populationLost * 0.5);
                }
                
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
        // Lose conditions
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
        
        // Win conditions
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

    // Action handlers
    buildHouses() {
        const costWood = 20;
        const costStone = 10;
        
        if (this.resources.wood >= costWood && this.resources.stone >= costStone) {
            this.resources.wood -= costWood;
            this.resources.stone -= costStone;
            this.buildings.houses++;
            this.resources.maxPopulation += 5;
            this.resources.happiness = Math.min(100, this.resources.happiness + 5);
            this.stats.buildingsBuilt++;
            this.addToHistory(`🏗️ Построен жилой дом (+5 max население)`);
            
            if (!this.achievements.firstHouse) {
                this.achievements.firstHouse = true;
            }
            
            return true;
        }
        return false;
    }

    buildFarms() {
        const costGold = 15;
        const costWood = 10;
        
        if (this.resources.gold >= costGold && this.resources.wood >= costWood) {
            this.resources.gold -= costGold;
            this.resources.wood -= costWood;
            this.buildings.farms++;
            this.addToHistory(`🌾 Построена ферма`);
            this.stats.buildingsBuilt++;
            
            if (!this.achievements.firstFarm) {
                this.achievements.firstFarm = true;
            }
            
            return true;
        }
        return false;
    }

    buildLumberMill() {
        const costGold = 20;
        const costWood = 15;
        
        if (this.resources.gold >= costGold && this.resources.wood >= costWood) {
            this.resources.gold -= costGold;
            this.resources.wood -= costWood;
            this.buildings.lumberMills++;
            this.addToHistory(`🪓 Построена лесопилка`);
            this.stats.buildingsBuilt++;
            return true;
        }
        return false;
    }

    buildQuarry() {
        const costGold = 25;
        const costWood = 10;
        const costStone = 5;
        
        if (this.resources.gold >= costGold && this.resources.wood >= costWood && this.resources.stone >= costStone) {
            this.resources.gold -= costGold;
            this.resources.wood -= costWood;
            this.resources.stone -= costStone;
            this.buildings.quarries++;
            this.addToHistory(`⛏️ Построен карьер`);
            this.stats.buildingsBuilt++;
            return true;
        }
        return false;
    }

    buildMarket() {
        const costGold = 30;
        const costWood = 20;
        const costStone = 10;
        
        if (this.resources.gold >= costGold && this.resources.wood >= costWood && this.resources.stone >= costStone) {
            this.resources.gold -= costGold;
            this.resources.wood -= costWood;
            this.resources.stone -= costStone;
            this.buildings.markets++;
            this.addToHistory(`🏪 Построен рынок`);
            this.stats.buildingsBuilt++;
            return true;
        }
        return false;
    }

    buildTemple() {
        const costGold = 50;
        const costWood = 30;
        const costStone = 20;
        
        if (this.resources.gold >= costGold && this.resources.wood >= costWood && this.resources.stone >= costStone) {
            this.resources.gold -= costGold;
            this.resources.wood -= costWood;
            this.resources.stone -= costStone;
            this.buildings.temples++;
            this.addToHistory(`🕍 Построен храм`);
            this.stats.buildingsBuilt++;
            return true;
        }
        return false;
    }

    buildSchool() {
        const costGold = 40;
        const costWood = 25;
        
        if (this.resources.gold >= costGold && this.resources.wood >= costWood) {
            this.resources.gold -= costGold;
            this.resources.wood -= costWood;
            this.buildings.schools++;
            this.addToHistory(`🏫 Построена школа`);
            this.stats.buildingsBuilt++;
            return true;
        }
        return false;
    }

    buildWalls() {
        const costGold = 40;
        const costStone = 30;
        
        if (this.resources.gold >= costGold && this.resources.stone >= costStone) {
            this.resources.gold -= costGold;
            this.resources.stone -= costStone;
            this.buildings.walls++;
            this.addToHistory(`🧱 Построена стена`);
            this.stats.buildingsBuilt++;
            return true;
        }
        return false;
    }

    buildTower() {
        const costGold = 60;
        const costWood = 20;
        const costStone = 40;
        
        if (this.resources.gold >= costGold && this.resources.wood >= costWood && this.resources.stone >= costStone) {
            this.resources.gold -= costGold;
            this.resources.wood -= costWood;
            this.resources.stone -= costStone;
            this.buildings.towers++;
            this.addToHistory(`🗼 Построена башня`);
            this.stats.buildingsBuilt++;
            return true;
        }
        return false;
    }

    developFarming() {
        if (this.resources.knowledge >= 20 && !this.technologies.advancedFarming) {
            this.resources.knowledge -= 20;
            this.technologies.advancedFarming = true;
            this.addToHistory(`🌱 Развито передовое земледелие`);
            return true;
        }
        return false;
    }

    developLumber() {
        if (this.resources.knowledge >= 15 && !this.technologies.lumberProcessing) {
            this.resources.knowledge -= 15;
            this.technologies.lumberProcessing = true;
            this.addToHistory(`🪵 Развита обработка древесины`);
            return true;
        }
        return false;
    }

    developMasonry() {
        if (this.resources.knowledge >= 15 && !this.technologies.stoneMasonry) {
            this.resources.knowledge -= 15;
            this.technologies.stoneMasonry = true;
            this.addToHistory(`🪨 Развита каменная кладка`);
            return true;
        }
        return false;
    }

    developTrade() {
        if (this.resources.knowledge >= 25 && !this.technologies.tradeRoutes) {
            this.resources.knowledge -= 25;
            this.technologies.tradeRoutes = true;
            this.addToHistory(`💰 Открыты торговые маршруты`);
            return true;
        }
        return false;
    }

    developReligion() {
        if (this.resources.faith >= 50 && !this.technologies.religion) {
            this.resources.faith -= 50;
            this.technologies.religion = true;
            this.addToHistory(`⛪ Развита религия`);
            return true;
        }
        return false;
    }

    developEducation() {
        if (this.resources.knowledge >= 30 && !this.technologies.education) {
            this.resources.knowledge -= 30;
            this.technologies.education = true;
            this.addToHistory(`🎓 Развито образование`);
            return true;
        }
        return false;
    }

    developFortification() {
        if (this.resources.knowledge >= 35 && !this.technologies.fortification) {
            this.resources.knowledge -= 35;
            this.technologies.fortification = true;
            this.addToHistory(`🛡️ Развиты фортификационные технологии`);
            return true;
        }
        return false;
    }

    tradeWithMerchant() {
        const goldGain = 30;
        const foodCost = 15;
        
        if (this.resources.food >= foodCost) {
            this.resources.food -= foodCost;
            this.resources.gold += goldGain;
            this.addToHistory(`💰 Торговля с караваном: +${goldGain} золота, -${foodCost} еды`);
            this.stats.tradesCompleted++;
            
            if (!this.achievements.firstTrade) {
                this.achievements.firstTrade = true;
            }
            
            return true;
        }
        return false;
    }

    sendExpedition() {
        const expeditionCost = 10;
        const successChance = 0.6 + (this.resources.knowledge / 100) * 0.2;
        
        if (this.resources.gold >= expeditionCost) {
            this.resources.gold -= expeditionCost;
            this.stats.expeditionsSent++;
            
            const roll = Math.random();
            
            if (roll < successChance) {
                // Success
                const rewardType = Math.random();
                let reward, message;
                
                if (rewardType < 0.33) {
                    reward = 50 + Math.floor(Math.random() * 50);
                    this.resources.gold += reward;
                    message = `✅ Экспедиция успешна! Найдено ${reward} золота`;
                } else if (rewardType < 0.66) {
                    reward = 30 + Math.floor(Math.random() * 40);
                    this.resources.wood += reward;
                    message = `✅ Экспедиция успешна! Заготовлено ${reward} древесины`;
                } else {
                    reward = 20 + Math.floor(Math.random() * 30);
                    this.resources.stone += reward;
                    message = `✅ Экспедиция успешна! Добыто ${reward} камня`;
                }
                
                this.addToHistory(message);
                return true;
            } else {
                // Failure
                const loss = 5 + Math.floor(Math.random() * 10);
                this.resources.gold = Math.max(0, this.resources.gold - loss);
                this.addToHistory(`❌ Экспедиция не удалась! Потери: ${loss} золота`);
                return false;
            }
        }
        return false;
    }

    // Get current narrative based on game state
    getCurrentNarrative() {
        const narratives = [];
        
        // Starting narrative
        if (this.day === 1) {
            narratives.push({
                title: "Новое начало",
                description: `Вы стоите на холме, глядя на небольшое поселение у подножия. 
                    Дымок поднимается из нескольких хижин. Жители с надеждой смотрят на вас.
                    Река рядом дает воду и рыбу, лес обещает древесину и дичь, а холмы вдалеке 
                    скрывают залежи камня. Что вы сделаете первым делом?`,
                icon: "🏰",
                choices: [
                    { text: "Построить жилые дома", action: "buildHouses", cost: "-20 древесины, -10 камня" },
                    { text: "Развить сельское хозяйство", action: "buildFarms", cost: "-15 золота, -10 древесины" },
                    { text: "Отправить экспедицию в горы", action: "sendExpedition", cost: "-10 золота (рискованно)" },
                    { text: "Торговать с купеческим караваном", action: "tradeWithMerchant", cost: "-15 еды, +30 золота" }
                ]
            });
        }
        
        // Early game
        if (this.day <= 10 && this.resources.population < 30) {
            narratives.push({
                title: "Раннее развитие",
                description: `Поселение растет. Жители нуждаются в жилье и еде. 
                    Вам нужно сбалансировать развитие, чтобы все были довольны.
                    ${this.season === "Зима" ? "Зима сурова - запасы еды тают на глазах." : 
                      this.season === "Лето" ? "Лето щедрое - урожай обещает быть хорошим." : ""}`,
                icon: "🌱",
                choices: [
                    { text: "Построить больше домов", action: "buildHouses", cost: "-20 древесины, -10 камня" },
                    { text: "Увеличить производство еды", action: "buildFarms", cost: "-15 золота, -10 древесины" },
                    { text: "Развить лесопилку", action: "buildLumberMill", cost: "-20 золота, -15 древесины" },
                    { text: "Отправить экспедицию", action: "sendExpedition", cost: "-10 золота" }
                ]
            });
        }
        
        // Mid game
        if (this.day > 10 && this.day <= 50 && this.resources.population >= 30) {
            narratives.push({
                title: "Расцвет",
                description: `Ваше поселение превращается в город. Торговцы из соседних земель 
                    начинают заглядывать к вам. Но вместе с ростом приходят и новые угрозы.
                    ${this.resources.happiness < 50 ? "Население недовольно - нужно что-то сделать." : ""}
                    ${this.resources.food < this.resources.population * 2 ? "Запасы еды на исходе!" : ""}`,
                icon: "🏙️",
                choices: [
                    { text: "Построить рынок", action: "buildMarket", cost: "-30 золота, -20 древесины, -10 камня" },
                    { text: "Построить храм", action: "buildTemple", cost: "-50 золота, -30 древесины, -20 камня" },
                    { text: "Развить торговые маршруты", action: "developTrade", cost: "-25 знаний" },
                    { text: "Отправить экспедицию", action: "sendExpedition", cost: "-10 золота" }
                ]
            });
        }
        
        // Late game
        if (this.day > 50 || this.resources.population >= 70) {
            narratives.push({
                title: "Величие",
                description: `Ваш город процветает. Но чтобы стать по-настоящему великим, 
                    нужно думать о будущем. Развивайте образование, укрепляйте оборону,
                    поддерживайте веру жителей.
                    ${this.resources.knowledge >= 50 ? "Ваши знания могут изменить судьбу города!" : ""}
                    ${this.buildings.walls === 0 ? "Город уязвим для атак." : ""}`,
                icon: "🏛️",
                choices: [
                    { text: "Построить школу", action: "buildSchool", cost: "-40 золота, -25 древесины" },
                    { text: "Построить стену", action: "buildWalls", cost: "-40 золота, -30 камня" },
                    { text: "Развить образование", action: "developEducation", cost: "-30 знаний" },
                    { text: "Развить фортификацию", action: "developFortification", cost: "-35 знаний" }
                ]
            });
        }
        
        // Random encounters
        if (Math.random() < 0.3) {
            const encounters = [
                {
                    title: "Таинственный странник",
                    description: `К вашему городу подходит таинственный странник. 
                        Он обещает знания в обмен на золото. Принимаете ли вы его предложение?`,
                    icon: "🎭",
                    choices: [
                        { text: "Купить знания", action: "buyKnowledge", cost: "-40 золота, +15 знаний" },
                        { text: "Отказать", action: "refuseStranger", cost: "" },
                        { text: "Предложить еду", action: "offerFood", cost: "-20 еды, +10 знаний" },
                        { text: "Выгнать", action: "banishStranger", cost: "-5 счастья" }
                    ]
                },
                {
                    title: "Праздник",
                    description: `Жители хотят устроить праздник в честь последнего урожая. 
                        Это поднимет мораль, но потребует ресурсов.`,
                    icon: "🎉",
                    choices: [
                        { text: "Устроить большой праздник", action: "bigFestival", cost: "-30 еды, -20 золота, +20 счастья" },
                        { text: "Устроить скромный праздник", action: "smallFestival", cost: "-15 еды, -10 золота, +10 счастья" },
                        { text: "Отложить праздник", action: "postponeFestival", cost: "-5 счастья" },
                        { text: "Отменить праздник", action: "cancelFestival", cost: "-10 счастья" }
                    ]
                },
                {
                    title: "Природное бедствие",
                    description: `На город надвигается сильная буря. Нужно подготовиться!`,
                    icon: "⛈️",
                    choices: [
                        { text: "Укрепить здания", action: "reinforceBuildings", cost: "-10 древесины, -10 камня" },
                        { text: "Эвакуировать жителей", action: "evacuate", cost: "-5 счастья" },
                        { text: "Молиться богам", action: "pray", cost: "-20 веры, +10 счастья" },
                        { text: "Ничего не делать", action: "doNothing", cost: "" }
                    ]
                }
            ];
            
            narratives.push(encounters[Math.floor(Math.random() * encounters.length)]);
        }
        
        // Default narrative
        if (narratives.length === 0) {
            narratives.push({
                title: "Обычный день",
                description: `Жизнь в городе идет своим чередом. 
                    ${this.season === "Весна" ? "Весна принесла свежие силы и надежды." : 
                      this.season === "Лето" ? "Летний зной заставляет работать усерднее." : 
                      this.season === "Осень" ? "Осень - время сбора урожая." : "Зима сурова, но город продолжает жить."}
                    Что вы сделаете сегодня?`,
                icon: "🌅",
                choices: [
                    { text: "Развить экономику", action: "randomBuild", cost: "" },
                    { text: "Отправить экспедицию", action: "sendExpedition", cost: "-10 золота" },
                    { text: "Торговать", action: "tradeWithMerchant", cost: "-15 еды, +30 золота" },
                    { text: "Подождать", action: "wait", cost: "" }
                ]
            });
        }
        
        // Select random narrative from available
        return narratives[Math.floor(Math.random() * narratives.length)];
    }

    // Custom action handlers
    buyKnowledge() {
        if (this.resources.gold >= 40) {
            this.resources.gold -= 40;
            this.resources.knowledge += 15;
            this.addToHistory("🎭 Таинственный странник поделился знаниями (+15)");
            return true;
        }
        return false;
    }

    refuseStranger() {
        this.addToHistory("🎭 Странник ушел, недовольный");
        return true;
    }

    offerFood() {
        if (this.resources.food >= 20) {
            this.resources.food -= 20;
            this.resources.knowledge += 10;
            this.addToHistory("🎭 Странник благодарен за еду (+10 знаний)");
            return true;
        }
        return false;
    }

    banishStranger() {
        this.resources.happiness = Math.max(0, this.resources.happiness - 5);
        this.addToHistory("🎭 Странник проклял вас при уходе (-5 счастья)");
        return true;
    }

    bigFestival() {
        if (this.resources.food >= 30 && this.resources.gold >= 20) {
            this.resources.food -= 30;
            this.resources.gold -= 20;
            this.resources.happiness = Math.min(100, this.resources.happiness + 20);
            this.addToHistory("🎉 Большой праздник поднял мораль (+20 счастья)");
            return true;
        }
        return false;
    }

    smallFestival() {
        if (this.resources.food >= 15 && this.resources.gold >= 10) {
            this.resources.food -= 15;
            this.resources.gold -= 10;
            this.resources.happiness = Math.min(100, this.resources.happiness + 10);
            this.addToHistory("🎉 Скромный праздник поднял мораль (+10 счастья)");
            return true;
        }
        return false;
    }

    postponeFestival() {
        this.resources.happiness = Math.max(0, this.resources.happiness - 5);
        this.addToHistory("🎉 Праздник отложен (-5 счастья)");
        return true;
    }

    cancelFestival() {
        this.resources.happiness = Math.max(0, this.resources.happiness - 10);
        this.addToHistory("🎉 Праздник отменен (-10 счастья)");
        return true;
    }

    reinforceBuildings() {
        if (this.resources.wood >= 10 && this.resources.stone >= 10) {
            this.resources.wood -= 10;
            this.resources.stone -= 10;
            this.addToHistory("⛈️ Здания укреплены перед бурей");
            return true;
        }
        return false;
    }

    evacuate() {
        this.resources.happiness = Math.max(0, this.resources.happiness - 5);
        this.addToHistory("⛈️ Жители эвакуированы (-5 счастья)");
        return true;
    }

    pray() {
        if (this.resources.faith >= 20) {
            this.resources.faith -= 20;
            this.resources.happiness = Math.min(100, this.resources.happiness + 10);
            this.addToHistory("⛈️ Молитвы услышаны (+10 счастья)");
            return true;
        }
        return false;
    }

    doNothing() {
        this.addToHistory("⛈️ Буря прошла мимо");
        return true;
    }

    randomBuild() {
        const buildings = ["buildHouses", "buildFarms", "buildLumberMill", "buildQuarry"];
        const action = buildings[Math.floor(Math.random() * buildings.length)];
        return this[action]();
    }

    wait() {
        this.addToHistory("⏳ День прошел в ожидании");
        return true;
    }

    // Get action by name
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
            developFarming: () => this.developFarming(),
            developLumber: () => this.developLumber(),
            developMasonry: () => this.developMasonry(),
            developTrade: () => this.developTrade(),
            developReligion: () => this.developReligion(),
            developEducation: () => this.developEducation(),
            developFortification: () => this.developFortification(),
            tradeWithMerchant: () => this.tradeWithMerchant(),
            sendExpedition: () => this.sendExpedition(),
            buyKnowledge: () => this.buyKnowledge(),
            refuseStranger: () => this.refuseStranger(),
            offerFood: () => this.offerFood(),
            banishStranger: () => this.banishStranger(),
            bigFestival: () => this.bigFestival(),
            smallFestival: () => this.smallFestival(),
            postponeFestival: () => this.postponeFestival(),
            cancelFestival: () => this.cancelFestival(),
            reinforceBuildings: () => this.reinforceBuildings(),
            evacuate: () => this.evacuate(),
            pray: () => this.pray(),
            doNothing: () => this.doNothing(),
            randomBuild: () => this.randomBuild(),
            wait: () => this.wait()
        };

        if (actionMap[actionName]) {
            return actionMap[actionName]();
        }
        
        return false;
    }
}

// Export for use in other modules
window.GameState = GameState;
