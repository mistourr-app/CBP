// ============================================
// Main Game Engine
// ============================================

class CityBuilderGame {
    constructor() {
        // Initialize game state
        this.gameState = new GameState();
        this.gameSystem = new GameSystem(this.gameState);

        // Three.js setup
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cityGroup = null;
        this.clouds = [];
        this.stars = null;

        // UI elements
        this.uiElements = {};

        // Game state
        this.isLoading = false;
        this.isAnimating = false;

        // Initialize
        this.init();
    }

    init() {
        if (this.gameState.load()) {
            console.log("Loaded saved game");
        }

        this.initThreeJS();
        this.initUI();
        this.updateUI();
        this.generateNarrative();
        this.startGameLoop();
        this.setupEventListeners();
    }

    initThreeJS() {
        const canvas = document.getElementById('bg-canvas');
        if (!canvas) return;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x0a0e27, 50, 200);

        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 30, 50);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.cityGroup = new THREE.Group();
        this.scene.add(this.cityGroup);

        this.setupLights();
        this.createSky();
        this.createEnvironment();
        this.createCity();

        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupLights() {
        this.scene.add(new THREE.AmbientLight(0x404040, 0.5));

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(50, 100, 30);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 200;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        this.scene.add(directionalLight);

        this.scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 0.6));
        this.scene.add(new THREE.PointLight(0xffaa55, 1, 50, 0, 10, 0));
    }

    createSky() {
        const skyGeometry = new THREE.SphereGeometry(200, 30, 20);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0a0e27) },
                bottomColor: { value: new THREE.Color(0x1a1a2e) },
                offset: { value: 20 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });
        this.scene.add(new THREE.Mesh(skyGeometry, skyMaterial));

        this.createStars();
        this.createClouds();
    }

    createStars() {
        const starGeometry = new THREE.BufferGeometry();
        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.08,
            transparent: true,
            opacity: 0.8
        });

        const starVertices = [];
        for (let i = 0; i < 1500; i++) {
            starVertices.push(
                (Math.random() - 0.5) * 400,
                (Math.random() - 0.5) * 400,
                (Math.random() - 0.5) * 400
            );
        }
        starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
        this.stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(this.stars);
    }

    createClouds() {
        this.clouds = [];
        const cloudGeometry = new THREE.BoxGeometry(15, 3, 15);
        const cloudMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.08
        });

        for (let i = 0; i < 8; i++) {
            const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
            cloud.position.set(
                (Math.random() - 0.5) * 150,
                30 + Math.random() * 15,
                (Math.random() - 0.5) * 150
            );
            this.scene.add(cloud);
            this.clouds.push(cloud);
        }
    }

    createEnvironment() {
        const groundGeometry = new THREE.PlaneGeometry(150, 150);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x3a5f0b,
            roughness: 1
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        ground.receiveShadow = true;
        this.scene.add(ground);

        const riverGeometry = new THREE.PlaneGeometry(80, 4);
        const riverMaterial = new THREE.MeshStandardMaterial({
            color: 0x1e88e5,
            transparent: true,
            opacity: 0.7,
            roughness: 0.1,
            metalness: 0.3
        });
        const river = new THREE.Mesh(riverGeometry, riverMaterial);
        river.rotation.x = -Math.PI / 2;
        river.position.set(15, -0.5, 0);
        river.receiveShadow = true;
        this.scene.add(river);

        for (let i = 0; i < 30; i++) {
            this.createTree(
                -40 + Math.random() * 30,
                -20 + Math.random() * 40,
                -30 + Math.random() * 30
            );
        }

        for (let i = 0; i < 15; i++) {
            this.createHill(
                -60 + Math.random() * 120,
                -60 + Math.random() * 120
            );
        }
    }

    createTree(x, y, z) {
        const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 4, 6);
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.set(x, y + 2, z);
        trunk.castShadow = true;
        this.scene.add(trunk);

        const leavesGeometry = new THREE.ConeGeometry(1.5, 3, 12);
        const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 0.8 });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.set(x, y + 4.5, z);
        leaves.castShadow = true;
        this.scene.add(leaves);
    }

    createHill(x, z) {
        const hillGeometry = new THREE.ConeGeometry(
            8 + Math.random() * 10,
            3 + Math.random() * 6,
            16
        );
        const hillMaterial = new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 1 });
        const hill = new THREE.Mesh(hillGeometry, hillMaterial);
        hill.position.set(x, -1, z);
        hill.rotation.x = Math.PI / 2;
        hill.receiveShadow = true;
        this.scene.add(hill);
    }

    createCity() {
        this.createRoads();
        this.updateCityBuildings();
    }

    createRoads() {
        const roadGeometry = new THREE.BoxGeometry(2, 0.1, 40);
        const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.9 });
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.position.set(0, -0.05, 0);
        road.receiveShadow = true;
        this.cityGroup.add(road);

        const road2 = new THREE.Mesh(roadGeometry, roadMaterial);
        road2.rotation.y = Math.PI / 2;
        road2.position.set(0, -0.05, 0);
        road2.receiveShadow = true;
        this.cityGroup.add(road2);
    }

    updateCityBuildings() {
        while (this.cityGroup.children.length > 2) {
            this.cityGroup.remove(this.cityGroup.children[2]);
        }

        const state = this.gameState;
        for (let i = 0; i < state.buildings.houses; i++) {
            this.createHouse(-8 + (i % 4) * 5, -8 + Math.floor(i / 4) * 5);
        }
        for (let i = 0; i < state.buildings.farms; i++) {
            this.createFarm(10 + (i % 3) * 6, -8 + Math.floor(i / 3) * 6);
        }
        for (let i = 0; i < state.buildings.lumberMills; i++) {
            this.createLumberMill(-18 + i * 8, 10);
        }
        for (let i = 0; i < state.buildings.quarries; i++) {
            this.createQuarry(18 + i * 8, 10);
        }
        for (let i = 0; i < state.buildings.markets; i++) {
            this.createMarket(0 + (i % 2) * 10 - 5, -15 + Math.floor(i / 2) * 8);
        }
        for (let i = 0; i < state.buildings.temples; i++) {
            this.createTemple(-22 + i * 15, -18);
        }
        for (let i = 0; i < state.buildings.schools; i++) {
            this.createSchool(22 + i * 12, -18);
        }
        for (let i = 0; i < state.buildings.walls; i++) {
            this.createWallSegment(-30 + i * 4, -22);
        }
        for (let i = 0; i < state.buildings.towers; i++) {
            this.createTower(-30 + i * 12, -25);
        }
    }

    createHouse(x, z) {
        const base = new THREE.Mesh(
            new THREE.BoxGeometry(3, 0.3, 3),
            new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 })
        );
        base.position.set(x, 0.15, z);
        base.castShadow = true;
        this.cityGroup.add(base);

        const walls = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 2.5, 2.6),
            new THREE.MeshStandardMaterial({ color: 0xa0522d, roughness: 0.6 })
        );
        walls.position.set(x, 1.5, z);
        walls.castShadow = true;
        this.cityGroup.add(walls);

        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(1.8, 1, 4),
            new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.8 })
        );
        roof.position.set(x, 2.75, z);
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        this.cityGroup.add(roof);
    }

    createFarm(x, z) {
        const barn = new THREE.Mesh(
            new THREE.BoxGeometry(4, 2, 3),
            new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 })
        );
        barn.position.set(x, 1, z);
        barn.castShadow = true;
        this.cityGroup.add(barn);

        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(4.3, 0.3, 3.3),
            new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.8 })
        );
        roof.position.set(x, 1.8, z);
        roof.castShadow = true;
        this.cityGroup.add(roof);
    }

    createLumberMill(x, z) {
        const building = new THREE.Mesh(
            new THREE.BoxGeometry(4, 2, 3),
            new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 })
        );
        building.position.set(x, 1, z);
        building.castShadow = true;
        this.cityGroup.add(building);

        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(4.3, 0.3, 3.3),
            new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.8 })
        );
        roof.position.set(x, 1.8, z);
        roof.castShadow = true;
        this.cityGroup.add(roof);
    }

    createQuarry(x, z) {
        const building = new THREE.Mesh(
            new THREE.BoxGeometry(3, 1.5, 2.5),
            new THREE.MeshStandardMaterial({ color: 0x696969, roughness: 0.7 })
        );
        building.position.set(x, 0.75, z);
        building.castShadow = true;
        this.cityGroup.add(building);
    }

    createMarket(x, z) {
        const building = new THREE.Mesh(
            new THREE.BoxGeometry(5, 2.5, 4),
            new THREE.MeshStandardMaterial({ color: 0xa0522d, roughness: 0.6 })
        );
        building.position.set(x, 1.25, z);
        building.castShadow = true;
        this.cityGroup.add(building);
    }

    createTemple(x, z) {
        const building = new THREE.Mesh(
            new THREE.BoxGeometry(6, 4, 5),
            new THREE.MeshStandardMaterial({ color: 0xf5deb3, roughness: 0.5 })
        );
        building.position.set(x, 2, z);
        building.castShadow = true;
        this.cityGroup.add(building);

        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(3.5, 2, 8),
            new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.4, metalness: 0.3 })
        );
        roof.position.set(x, 3.5, z);
        roof.castShadow = true;
        this.cityGroup.add(roof);
    }

    createSchool(x, z) {
        const building = new THREE.Mesh(
            new THREE.BoxGeometry(4, 2, 3),
            new THREE.MeshStandardMaterial({ color: 0xcd853f, roughness: 0.6 })
        );
        building.position.set(x, 1, z);
        building.castShadow = true;
        this.cityGroup.add(building);
    }

    createWallSegment(x, z) {
        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(3, 2, 0.3),
            new THREE.MeshStandardMaterial({ color: 0x696969, roughness: 0.8 })
        );
        wall.position.set(x, 1, z);
        wall.castShadow = true;
        this.cityGroup.add(wall);
    }

    createTower(x, z) {
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(1.5, 1.8, 0.8, 12),
            new THREE.MeshStandardMaterial({ color: 0x696969, roughness: 0.8 })
        );
        base.position.set(x, 0.4, z);
        base.castShadow = true;
        this.cityGroup.add(base);

        const tower = new THREE.Mesh(
            new THREE.CylinderGeometry(1.2, 1, 8, 12),
            new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.7 })
        );
        tower.position.set(x, 4.4, z);
        tower.castShadow = true;
        this.cityGroup.add(tower);

        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(1.5, 1.5, 12),
            new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.8 })
        );
        roof.position.set(x, 6.2, z);
        roof.rotation.x = Math.PI;
        roof.castShadow = true;
        this.cityGroup.add(roof);
    }

    initUI() {
        this.uiElements = {
            cityName: document.getElementById('city-name'),
            dayCounter: document.getElementById('day-counter'),
            population: document.getElementById('population'),
            gold: document.getElementById('gold'),
            food: document.getElementById('food'),
            wood: document.getElementById('wood'),
            stone: document.getElementById('stone'),
            historyList: document.getElementById('history-list'),
            choicesPanel: document.getElementById('choices-panel'),
            notification: document.getElementById('notification'),
            gameOverScreen: document.getElementById('game-over-screen'),
            gameOverMessage: document.getElementById('game-over-message'),
            restartBtn: document.getElementById('restart-btn')
        };
    }

    updateUI() {
        const state = this.gameState;

        if (this.uiElements.cityName) {
            this.uiElements.cityName.textContent = state.cityName;
        }
        if (this.uiElements.dayCounter) {
            this.uiElements.dayCounter.textContent = state.day;
        }
        if (this.uiElements.population) {
            this.uiElements.population.textContent = `${state.resources.population}/${state.resources.maxPopulation}`;
        }
        if (this.uiElements.gold) {
            this.uiElements.gold.textContent = state.resources.gold;
        }
        if (this.uiElements.food) {
            this.uiElements.food.textContent = state.resources.food;
        }
        if (this.uiElements.wood) {
            this.uiElements.wood.textContent = state.resources.wood;
        }
        if (this.uiElements.stone) {
            this.uiElements.stone.textContent = state.resources.stone;
        }
        
        // Update history list
        if (this.uiElements.historyList) {
            this.uiElements.historyList.innerHTML = '';
            state.history.slice(0, 20).forEach(event => {
                const li = document.createElement('li');
                li.textContent = event;
                this.uiElements.historyList.appendChild(li);
            });
            // Scroll to top
            this.uiElements.historyList.parentElement.scrollTop = 0;
        }
    }

    generateNarrative() {
        const narrative = this.gameSystem.generateFullNarrative();
        this.updateChoices(narrative.choices);
    }

    updateChoices(choices) {
        if (!this.uiElements.choicesPanel) return;

        this.uiElements.choicesPanel.innerHTML = '';

        const icons = {
            buildHouses: '🏗️', buildFarms: '🌾', buildLumberMill: '🪓', buildQuarry: '⛏️',
            buildMarket: '🏪', buildTemple: '🕍', buildSchool: '🏫', buildWalls: '🧱',
            buildTower: '🗼', developFarming: '🌱', developLumber: '🌳', developMasonry: '🪨',
            developTrade: '💰', developReligion: '⛪', developEducation: '🎓',
            developFortification: '🛡️', tradeWithMerchant: '💵', sendExpedition: '🗺️',
            wait: '⏳'
        };

        const costs = {
            buildHouses: { wood: 20, stone: 10 },
            buildFarms: { gold: 15, wood: 10 },
            buildLumberMill: { gold: 20, wood: 15 },
            buildQuarry: { gold: 25, wood: 10, stone: 5 },
            buildMarket: { gold: 30, wood: 20, stone: 10 },
            buildTemple: { gold: 50, wood: 30, stone: 20 },
            buildSchool: { gold: 40, wood: 25 },
            buildWalls: { gold: 40, stone: 30 },
            buildTower: { gold: 60, wood: 20, stone: 40 },
            developFarming: { knowledge: 20 },
            developLumber: { knowledge: 15 },
            developMasonry: { knowledge: 15 },
            developTrade: { knowledge: 25 },
            developReligion: { faith: 50 },
            developEducation: { knowledge: 30 },
            developFortification: { knowledge: 35 },
            tradeWithMerchant: { food: 15 },
            sendExpedition: { gold: 10 },
            wait: {}
        };

        choices.forEach((choice, index) => {
            const button = document.createElement('button');
            button.className = 'choice-btn';
            button.dataset.choice = index;
            button.dataset.action = choice.action;

            button.innerHTML = `
                <span class="choice-icon">${icons[choice.action] || '❓'}</span>
                <span class="choice-text">${choice.text}</span>
                <span class="choice-cost">${choice.cost}</span>
            `;

            const actionCosts = costs[choice.action];
            if (actionCosts) {
                let affordable = true;
                for (const [resource, amount] of Object.entries(actionCosts)) {
                    if (this.gameState.resources[resource] < amount) {
                        affordable = false;
                        break;
                    }
                }
                if (!affordable) {
                    button.disabled = true;
                }
            }

            button.addEventListener('click', () => this.handleChoice(choice));
            this.uiElements.choicesPanel.appendChild(button);
        });
    }

    handleChoice(choice) {
        if (this.isLoading) return;
        this.isLoading = true;

        const success = this.gameState.executeAction(choice.action);
        
        if (success) {
            this.showNotification(`✅ ${choice.text}`, 'success');
        } else {
            this.showNotification(`❌ Не хватает ресурсов`, 'danger');
        }

        this.gameState.nextDay();
        this.updateCityBuildings();
        this.updateUI();
        this.generateNarrative();

        if (this.gameState.gameOver) {
            this.endGame();
        }

        this.gameState.save();
        this.animateChoice();

        setTimeout(() => {
            this.isLoading = false;
        }, 1000);
    }

    animateChoice() {
        const origPos = this.camera.position.clone();
        const origLook = this.camera.getWorldDirection(new THREE.Vector3()).clone();
        let t = 0;
        const dur = 0.3;

        const anim = () => {
            t += 0.016;
            if (t < dur) {
                const p = t / dur;
                const i = Math.sin(p * Math.PI * 6) * (1 - p);
                this.camera.position.x = origPos.x + (Math.random() - 0.5) * i * 1.5;
                this.camera.position.y = origPos.y + (Math.random() - 0.5) * i * 0.8;
                this.camera.position.z = origPos.z + (Math.random() - 0.5) * i * 1.5;
                this.camera.lookAt(origLook.x + (Math.random() - 0.5) * i * 0.5, origLook.y, origLook.z);
                requestAnimationFrame(anim);
            } else {
                this.camera.position.copy(origPos);
                this.camera.lookAt(origLook.x, origLook.y, origLook.z);
            }
        };
        anim();
    }

    showNotification(message, type = '') {
        if (!this.uiElements.notification) return;
        this.uiElements.notification.textContent = message;
        this.uiElements.notification.className = type;
        this.uiElements.notification.classList.remove('hidden');
        setTimeout(() => {
            this.uiElements.notification.classList.add('hidden');
        }, 1800);
    }

    endGame() {
        if (!this.uiElements.gameOverScreen) return;
        this.uiElements.gameOverMessage.textContent = this.gameState.gameOverReason;
        this.uiElements.gameOverScreen.classList.remove('hidden');
    }

    restartGame() {
        this.gameState.reset();
        this.gameState = new GameState();
        this.updateUI();
        this.generateNarrative();
        if (this.uiElements.gameOverScreen) {
            this.uiElements.gameOverScreen.classList.add('hidden');
        }
        this.updateCityBuildings();
        this.gameState.save();
    }

    startGameLoop() {
        const animate = () => {
            requestAnimationFrame(animate);
            this.render();
        };
        animate();
    }

    render() {
        if (!this.renderer || !this.scene || !this.camera) return;

        if (this.cityGroup) {
            this.cityGroup.rotation.y += 0.0005;
        }

        this.clouds.forEach(cloud => {
            cloud.position.x += 0.008;
            if (cloud.position.x > 100) {
                cloud.position.x = -100;
            }
        });

        if (this.stars) {
            this.stars.rotation.y += 0.0001;
        }

        this.updateLighting();
        this.renderer.render(this.scene, this.camera);
    }

    updateLighting() {
        const dayProgress = (this.gameState.day % 4) / 4;
        const lightIntensity = 0.5 + Math.abs(Math.sin(dayProgress * Math.PI * 2)) * 0.5;
        
        this.scene.children.forEach(child => {
            if (child instanceof THREE.DirectionalLight) {
                child.intensity = lightIntensity;
            }
            if (child instanceof THREE.AmbientLight) {
                child.intensity = 0.3 + lightIntensity * 0.2;
            }
            if (child instanceof THREE.HemisphereLight) {
                child.intensity = 0.4 + lightIntensity * 0.2;
            }
        });
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('.choice-btn')) {
                const button = e.target.closest('.choice-btn');
                const choices = Array.from(this.uiElements.choicesPanel.querySelectorAll('.choice-btn'));
                const index = parseInt(button.dataset.choice);
                if (choices[index]) {
                    const choice = {
                        text: choices[index].querySelector('.choice-text').textContent,
                        action: choices[index].dataset.action,
                        cost: choices[index].querySelector('.choice-cost').textContent
                    };
                    this.handleChoice(choice);
                }
            }
        });

        if (this.uiElements.restartBtn) {
            this.uiElements.restartBtn.addEventListener('click', () => this.restartGame());
        }

        document.addEventListener('keydown', (e) => {
            if (e.key >= '1' && e.key <= '4') {
                const index = parseInt(e.key) - 1;
                const choices = Array.from(this.uiElements.choicesPanel.querySelectorAll('.choice-btn'));
                if (choices[index]) {
                    const choice = {
                        text: choices[index].querySelector('.choice-text').textContent,
                        action: choices[index].dataset.action,
                        cost: choices[index].querySelector('.choice-cost').textContent
                    };
                    this.handleChoice(choice);
                }
            }
        });
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.game = new CityBuilderGame();
    
    // Add restart button event listener
    const restartBtn = document.getElementById('restart-game-btn');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            if (window.game) {
                window.game.restartGame();
            }
        });
    }
});

// Prevent context menu on canvas
document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'CANVAS') {
        e.preventDefault();
    }
});
