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
        this.stars = [];
        this.ambientLight = null;
        this.directionalLight = null;
        this.hemisphereLight = null;

        // UI elements
        this.uiElements = {};

        // Game state
        this.isLoading = false;
        this.isAnimating = false;
        this.lastNarrative = null;

        // Time tracking
        this.lastUpdateTime = Date.now();
        this.animationFrameId = null;

        // Initialize
        this.init();
    }

    init() {
        console.log("Initializing City Builder Game...");

        // Load saved game if exists
        if (this.gameState.load()) {
            console.log("Loaded saved game");
        } else {
            console.log("Starting new game");
        }

        // Initialize Three.js
        this.initThreeJS();

        // Initialize UI
        this.initUI();

        // Update UI
        this.updateUI();

        // Generate first narrative
        this.generateNarrative();

        // Start game loop
        this.startGameLoop();

        // Setup event listeners
        this.setupEventListeners();

        // Check for PWA install prompt
        this.checkPWAInstall();
    }

    initThreeJS() {
        // Get canvas
        const canvas = document.getElementById('bg-canvas');
        if (!canvas) {
            console.error("Canvas not found!");
            return;
        }

        // Create scene
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x0a0e27, 50, 200);

        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 30, 50);
        this.camera.lookAt(0, 0, 0);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Create city group
        this.cityGroup = new THREE.Group();
        this.scene.add(this.cityGroup);

        // Create lights
        this.setupLights();

        // Create sky
        this.createSky();

        // Create city
        this.createCity();

        // Create environment
        this.createEnvironment();

        // Handle resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupLights() {
        // Ambient light
        this.ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(this.ambientLight);

        // Directional light (sun)
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        this.directionalLight.position.set(50, 100, 30);
        this.directionalLight.castShadow = true;
        this.directionalLight.shadow.mapSize.width = 2048;
        this.directionalLight.shadow.mapSize.height = 2048;
        this.directionalLight.shadow.camera.near = 0.5;
        this.directionalLight.shadow.camera.far = 200;
        this.directionalLight.shadow.camera.left = -100;
        this.directionalLight.shadow.camera.right = 100;
        this.directionalLight.shadow.camera.top = 100;
        this.directionalLight.shadow.camera.bottom = -100;
        this.scene.add(this.directionalLight);

        // Hemisphere light for natural outdoor lighting
        this.hemisphereLight = new THREE.HemisphereLight(
            0xffffbb,
            0x080820,
            0.6
        );
        this.scene.add(this.hemisphereLight);

        // Point light for city center
        const cityLight = new THREE.PointLight(0xffaa55, 1, 50);
        cityLight.position.set(0, 10, 0);
        this.scene.add(cityLight);
    }

    createSky() {
        // Create gradient sky background
        const skyGeometry = new THREE.SphereGeometry(200, 60, 40);
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
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);

        // Create stars
        this.createStars();

        // Create clouds
        this.createClouds();
    }

    createStars() {
        const starGeometry = new THREE.BufferGeometry();
        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.1,
            transparent: true,
            opacity: 0.8
        });

        const starVertices = [];
        for (let i = 0; i < 2000; i++) {
            const x = (Math.random() - 0.5) * 400;
            const y = (Math.random() - 0.5) * 400;
            const z = (Math.random() - 0.5) * 400;
            starVertices.push(x, y, z);
        }

        starGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(starVertices, 3)
        );

        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);
        this.stars = stars;
    }

    createClouds() {
        const cloudGeometry = new THREE.BoxGeometry(20, 5, 20);
        const cloudMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.1
        });

        for (let i = 0; i < 10; i++) {
            const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
            cloud.position.set(
                (Math.random() - 0.5) * 200,
                40 + Math.random() * 20,
                (Math.random() - 0.5) * 200
            );
            cloud.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            this.scene.add(cloud);
            this.clouds.push(cloud);
        }
    }

    createEnvironment() {
        // Create ground
        const groundGeometry = new THREE.PlaneGeometry(200, 200);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x3a5f0b,
            roughness: 1,
            metalness: 0
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Create river
        const riverGeometry = new THREE.PlaneGeometry(100, 5);
        const riverMaterial = new THREE.MeshStandardMaterial({
            color: 0x1e88e5,
            transparent: true,
            opacity: 0.7,
            roughness: 0.1,
            metalness: 0.3
        });
        const river = new THREE.Mesh(riverGeometry, riverMaterial);
        river.rotation.x = -Math.PI / 2;
        river.position.set(20, -0.5, 0);
        river.receiveShadow = true;
        this.scene.add(river);

        // Create forest
        for (let i = 0; i < 50; i++) {
            this.createTree(
                -50 + Math.random() * 40,
                -30 + Math.random() * 60,
                -50 + Math.random() * 40
            );
        }

        // Create hills
        for (let i = 0; i < 20; i++) {
            this.createHill(
                -80 + Math.random() * 160,
                -80 + Math.random() * 160
            );
        }
    }

    createTree(x, y, z) {
        // Trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.8, 5, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.7
        });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.set(x, y + 2.5, z);
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        this.scene.add(trunk);

        // Leaves
        const leavesGeometry = new THREE.ConeGeometry(2, 4, 16);
        const leavesMaterial = new THREE.MeshStandardMaterial({
            color: 0x228b22,
            roughness: 0.8
        });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.set(x, y + 6, z);
        leaves.castShadow = true;
        this.scene.add(leaves);
    }

    createHill(x, z) {
        const hillGeometry = new THREE.ConeGeometry(
            10 + Math.random() * 15,
            5 + Math.random() * 10,
            32
        );
        const hillMaterial = new THREE.MeshStandardMaterial({
            color: 0x556b2f,
            roughness: 1
        });
        const hill = new THREE.Mesh(hillGeometry, hillMaterial);
        hill.position.set(x, -1, z);
        hill.rotation.x = Math.PI / 2;
        hill.receiveShadow = true;
        this.scene.add(hill);
    }

    createCity() {
        // Create roads
        this.createRoads();

        // Create buildings based on game state
        this.updateCityBuildings();
    }

    createRoads() {
        // Main road (vertical)
        const roadGeometry = new THREE.BoxGeometry(3, 0.2, 60);
        const roadMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 0.9
        });
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.position.set(0, -0.1, 0);
        road.receiveShadow = true;
        this.cityGroup.add(road);

        // Horizontal road
        const road2 = new THREE.Mesh(roadGeometry, roadMaterial);
        road2.rotation.y = Math.PI / 2;
        road2.position.set(0, -0.1, 0);
        road2.receiveShadow = true;
        this.cityGroup.add(road2);
    }

    updateCityBuildings() {
        // Clear existing buildings
        while (this.cityGroup.children.length > 2) {
            this.cityGroup.remove(this.cityGroup.children[2]);
        }

        const state = this.gameState;

        // Create houses
        for (let i = 0; i < state.buildings.houses; i++) {
            this.createHouse(
                -10 + (i % 5) * 6,
                -10 + Math.floor(i / 5) * 6
            );
        }

        // Create farms
        for (let i = 0; i < state.buildings.farms; i++) {
            this.createFarm(
                15 + (i % 4) * 8,
                -10 + Math.floor(i / 4) * 8
            );
        }

        // Create lumber mills
        for (let i = 0; i < state.buildings.lumberMills; i++) {
            this.createLumberMill(
                -25 + i * 10,
                15
            );
        }

        // Create quarries
        for (let i = 0; i < state.buildings.quarries; i++) {
            this.createQuarry(
                25 + i * 10,
                15
            );
        }

        // Create markets
        for (let i = 0; i < state.buildings.markets; i++) {
            this.createMarket(
                0 + (i % 2) * 15 - 7.5,
                -20 + Math.floor(i / 2) * 10
            );
        }

        // Create temples
        for (let i = 0; i < state.buildings.temples; i++) {
            this.createTemple(
                -30 + i * 20,
                -25
            );
        }

        // Create schools
        for (let i = 0; i < state.buildings.schools; i++) {
            this.createSchool(
                30 + i * 15,
                -25
            );
        }

        // Create walls
        for (let i = 0; i < state.buildings.walls; i++) {
            this.createWallSegment(
                -40 + i * 5,
                -30
            );
        }

        // Create towers
        for (let i = 0; i < state.buildings.towers; i++) {
            this.createTower(
                -40 + i * 15,
                -35
            );
        }
    }

    createHouse(x, z) {
        // Base
        const baseGeometry = new THREE.BoxGeometry(4, 0.5, 4);
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.7
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.set(x, 0.25, z);
        base.castShadow = true;
        base.receiveShadow = true;
        this.cityGroup.add(base);

        // Walls
        const wallGeometry = new THREE.BoxGeometry(3.5, 3, 3.5);
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0xa0522d,
            roughness: 0.6
        });
        const walls = new THREE.Mesh(wallGeometry, wallMaterial);
        walls.position.set(x, 2.25, z);
        walls.castShadow = true;
        this.cityGroup.add(walls);

        // Roof
        const roofGeometry = new THREE.ConeGeometry(2.5, 1.5, 4);
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0x654321,
            roughness: 0.8
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(x, 3.75, z);
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        this.cityGroup.add(roof);

        // Chimney
        const chimneyGeometry = new THREE.BoxGeometry(0.3, 1, 0.3);
        const chimneyMaterial = new THREE.MeshStandardMaterial({
            color: 0x654321,
            roughness: 0.7
        });
        const chimney = new THREE.Mesh(chimneyGeometry, chimneyMaterial);
        chimney.position.set(x + 1, 2.75, z + 1);
        chimney.castShadow = true;
        this.cityGroup.add(chimney);
    }

    createFarm(x, z) {
        // Barn
        const barnGeometry = new THREE.BoxGeometry(6, 3, 4);
        const barnMaterial = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.7
        });
        const barn = new THREE.Mesh(barnGeometry, barnMaterial);
        barn.position.set(x, 1.5, z);
        barn.castShadow = true;
        this.cityGroup.add(barn);

        // Roof
        const roofGeometry = new THREE.BoxGeometry(6.5, 0.5, 4.5);
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0x654321,
            roughness: 0.8
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(x, 3.25, z);
        roof.castShadow = true;
        this.cityGroup.add(roof);

        // Fields
        for (let i = 0; i < 3; i++) {
            const fieldGeometry = new THREE.PlaneGeometry(5, 5);
            const fieldMaterial = new THREE.MeshStandardMaterial({
                color: 0x228b22,
                roughness: 1,
                side: THREE.DoubleSide
            });
            const field = new THREE.Mesh(fieldGeometry, fieldMaterial);
            field.rotation.x = -Math.PI / 2;
            field.position.set(x - 4 + i * 3, -0.1, z + 6);
            field.receiveShadow = true;
            this.cityGroup.add(field);
        }
    }

    createLumberMill(x, z) {
        // Main building
        const buildingGeometry = new THREE.BoxGeometry(5, 2.5, 4);
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.7
        });
        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        building.position.set(x, 1.25, z);
        building.castShadow = true;
        this.cityGroup.add(building);

        // Roof
        const roofGeometry = new THREE.BoxGeometry(5.5, 0.5, 4.5);
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0x654321,
            roughness: 0.8
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(x, 2.5, z);
        roof.castShadow = true;
        this.cityGroup.add(roof);

        // Logs pile
        for (let i = 0; i < 5; i++) {
            const logGeometry = new THREE.CylinderGeometry(0.3, 0.3, 2, 8);
            const logMaterial = new THREE.MeshStandardMaterial({
                color: 0x8b4513,
                roughness: 0.7
            });
            const log = new THREE.Mesh(logGeometry, logMaterial);
            log.rotation.x = Math.PI / 2;
            log.position.set(x - 3 + i * 0.8, 0.5, z + 3);
            log.castShadow = true;
            this.cityGroup.add(log);
        }
    }

    createQuarry(x, z) {
        // Main building
        const buildingGeometry = new THREE.BoxGeometry(4, 2, 3);
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: 0x696969,
            roughness: 0.7
        });
        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        building.position.set(x, 1, z);
        building.castShadow = true;
        this.cityGroup.add(building);

        // Roof
        const roofGeometry = new THREE.BoxGeometry(4.5, 0.3, 3.5);
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 0.8
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(x, 1.8, z);
        roof.castShadow = true;
        this.cityGroup.add(roof);

        // Stone pile
        for (let i = 0; i < 5; i++) {
            const stoneGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
            const stoneMaterial = new THREE.MeshStandardMaterial({
                color: 0x808080,
                roughness: 0.8
            });
            const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
            stone.position.set(x + 2 - i * 0.6, 0.5, z + 2);
            stone.castShadow = true;
            this.cityGroup.add(stone);
        }
    }

    createMarket(x, z) {
        // Main building
        const buildingGeometry = new THREE.BoxGeometry(7, 3, 5);
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: 0xa0522d,
            roughness: 0.6
        });
        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        building.position.set(x, 1.5, z);
        building.castShadow = true;
        this.cityGroup.add(building);

        // Roof
        const roofGeometry = new THREE.BoxGeometry(7.5, 0.5, 5.5);
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0x654321,
            roughness: 0.8
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(x, 3.25, z);
        roof.castShadow = true;
        this.cityGroup.add(roof);

        // Market stalls
        for (let i = 0; i < 3; i++) {
            const stallGeometry = new THREE.BoxGeometry(1.5, 1.5, 1);
            const stallMaterial = new THREE.MeshStandardMaterial({
                color: 0x8b4513,
                roughness: 0.7
            });
            const stall = new THREE.Mesh(stallGeometry, stallMaterial);
            stall.position.set(x - 2 + i * 2, 0.75, z + 4);
            stall.castShadow = true;
            this.cityGroup.add(stall);
        }
    }

    createTemple(x, z) {
        // Main building
        const buildingGeometry = new THREE.BoxGeometry(8, 5, 6);
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: 0xf5deb3,
            roughness: 0.5
        });
        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        building.position.set(x, 2.5, z);
        building.castShadow = true;
        this.cityGroup.add(building);

        // Roof
        const roofGeometry = new THREE.ConeGeometry(5, 3, 8);
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0xffd700,
            roughness: 0.4,
            metalness: 0.3
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(x, 4.5, z);
        roof.castShadow = true;
        this.cityGroup.add(roof);

        // Columns
        for (let i = 0; i < 4; i++) {
            const columnGeometry = new THREE.CylinderGeometry(0.3, 0.3, 4, 16);
            const columnMaterial = new THREE.MeshStandardMaterial({
                color: 0xf5deb3,
                roughness: 0.5
            });
            const column = new THREE.Mesh(columnGeometry, columnMaterial);
            column.position.set(
                x - 2 + (i % 2) * 4,
                2,
                z - 2 + Math.floor(i / 2) * 4
            );
            column.castShadow = true;
            this.cityGroup.add(column);
        }
    }

    createSchool(x, z) {
        // Main building
        const buildingGeometry = new THREE.BoxGeometry(6, 2.5, 4);
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: 0xcd853f,
            roughness: 0.6
        });
        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        building.position.set(x, 1.25, z);
        building.castShadow = true;
        this.cityGroup.add(building);

        // Roof
        const roofGeometry = new THREE.BoxGeometry(6.5, 0.5, 4.5);
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0x654321,
            roughness: 0.8
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(x, 2.5, z);
        roof.castShadow = true;
        this.cityGroup.add(roof);

        // Windows
        for (let i = 0; i < 4; i++) {
            const windowGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.1);
            const windowMaterial = new THREE.MeshStandardMaterial({
                color: 0xadd8e6,
                transparent: true,
                opacity: 0.7
            });
            const window = new THREE.Mesh(windowGeometry, windowMaterial);
            window.position.set(
                x - 2 + (i % 2) * 3,
                1.25 + Math.floor(i / 2) * 1,
                z + 2.1
            );
            this.cityGroup.add(window);
        }
    }

    createWallSegment(x, z) {
        const wallGeometry = new THREE.BoxGeometry(4, 3, 0.5);
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x696969,
            roughness: 0.8
        });
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.set(x, 1.5, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        this.cityGroup.add(wall);
    }

    createTower(x, z) {
        // Base
        const baseGeometry = new THREE.CylinderGeometry(2, 2.5, 1, 16);
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0x696969,
            roughness: 0.8
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.set(x, 0.5, z);
        base.castShadow = true;
        this.cityGroup.add(base);

        // Tower
        const towerGeometry = new THREE.CylinderGeometry(1.8, 1.5, 10, 16);
        const towerMaterial = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.7
        });
        const tower = new THREE.Mesh(towerGeometry, towerMaterial);
        tower.position.set(x, 5.5, z);
        tower.castShadow = true;
        this.cityGroup.add(tower);

        // Roof
        const roofGeometry = new THREE.ConeGeometry(2, 2, 16);
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 0.8
        });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(x, 7.5, z);
        roof.rotation.x = Math.PI;
        roof.castShadow = true;
        this.cityGroup.add(roof);
    }

    initUI() {
        // Cache UI elements
        this.uiElements = {
            cityName: document.getElementById('city-name'),
            dayCounter: document.getElementById('day-counter'),
            population: document.getElementById('population'),
            gold: document.getElementById('gold'),
            food: document.getElementById('food'),
            wood: document.getElementById('wood'),
            stone: document.getElementById('stone'),
            narrativeText: document.getElementById('narrative-text'),
            eventIcon: document.getElementById('event-icon'),
            choicesPanel: document.getElementById('choices-panel'),
            historyList: document.getElementById('history-list'),
            notification: document.getElementById('notification'),
            gameOverScreen: document.getElementById('game-over-screen'),
            gameOverMessage: document.getElementById('game-over-message'),
            restartBtn: document.getElementById('restart-btn')
        };
    }

    updateUI() {
        const state = this.gameState;

        // Update stats
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

        // Update history
        if (this.uiElements.historyList) {
            this.uiElements.historyList.innerHTML = '';
            state.history.slice(0, 10).forEach(event => {
                const li = document.createElement('li');
                li.textContent = event;
                this.uiElements.historyList.appendChild(li);
            });
        }
    }

    generateNarrative() {
        const narrative = this.gameSystem.generateFullNarrative();
        this.lastNarrative = narrative;

        // Update narrative display
        if (this.uiElements.narrativeText) {
            this.uiElements.narrativeText.innerHTML = `<p>${narrative.title}</p>${narrative.description.split('\n').map(p => `<p>${p}</p>`).join('')}`;
        }

        // Update event icon
        if (this.uiElements.eventIcon) {
            this.uiElements.eventIcon.innerHTML = `<div class="icon">${narrative.icon || '🏰'}</div>`;
        }

        // Update choices
        this.updateChoices(narrative.choices);
    }

    updateChoices(choices) {
        if (!this.uiElements.choicesPanel) return;

        this.uiElements.choicesPanel.innerHTML = '';

        choices.forEach((choice, index) => {
            const button = document.createElement('button');
            button.className = 'choice-btn';
            button.dataset.choice = index;
            button.dataset.action = choice.action;

            button.innerHTML = `
                <span class="choice-icon">${this.getChoiceIcon(choice.action)}</span>
                <span class="choice-text">${choice.text}</span>
                <span class="choice-cost">${choice.cost}</span>
            `;

            // Add tooltip
            if (choice.description) {
                button.setAttribute('data-tooltip', choice.description);
            }

            // Check if affordable
            if (!this.isChoiceAffordable(choice)) {
                button.disabled = true;
            }

            button.addEventListener('click', () => this.handleChoice(choice));
            this.uiElements.choicesPanel.appendChild(button);
        });
    }

    getChoiceIcon(action) {
        const icons = {
            buildHouses: '🏗️',
            buildFarms: '🌾',
            buildLumberMill: '🪓',
            buildQuarry: '⛏️',
            buildMarket: '🏪',
            buildTemple: '🕍',
            buildSchool: '🏫',
            buildWalls: '🧱',
            buildTower: '🗼',
            developFarming: '🌱',
            developLumber: '🌳',
            developMasonry: '🪨',
            developTrade: '💰',
            developReligion: '⛪',
            developEducation: '🎓',
            developFortification: '🛡️',
            tradeWithMerchant: '💵',
            sendExpedition: '🗺️',
            buyKnowledge: '📚',
            refuseStranger: '🚫',
            offerFood: '🍞',
            banishStranger: '👋',
            bigFestival: '🎉',
            smallFestival: '🎊',
            postponeFestival: '📅',
            cancelFestival: '❌',
            reinforceBuildings: '🔧',
            evacuate: '🏃',
            pray: '🙏',
            doNothing: '⏳',
            randomBuild: '🎲',
            wait: '⏳'
        };

        return icons[action] || '❓';
    }

    isChoiceAffordable(choice) {
        const state = this.gameState;
        const actionCosts = {
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
            buyKnowledge: { gold: 40 },
            offerFood: { food: 20 },
            bigFestival: { food: 30, gold: 20 },
            smallFestival: { food: 15, gold: 10 },
            reinforceBuildings: { wood: 10, stone: 10 },
            evacuate: {},
            pray: { faith: 20 },
            doNothing: {},
            randomBuild: {},
            wait: {},
            refuseStranger: {},
            postponeFestival: {},
            cancelFestival: {},
            banishStranger: {}
        };

        const costs = actionCosts[choice.action];
        if (!costs) return true;

        for (const [resource, amount] of Object.entries(costs)) {
            if (state.resources[resource] < amount) {
                return false;
            }
        }

        return true;
    }

    handleChoice(choice) {
        if (this.isLoading) return;

        this.isLoading = true;

        // Execute action
        const success = this.gameState.executeAction(choice.action);

        if (success) {
            this.showNotification(`✅ Выбрано: ${choice.text}`, 'success');
        } else {
            this.showNotification(`❌ Не хватает ресурсов для: ${choice.text}`, 'danger');
        }

        // Next day
        this.gameState.nextDay();

        // Update city buildings
        this.updateCityBuildings();

        // Update UI
        this.updateUI();

        // Generate new narrative
        this.generateNarrative();

        // Check game over
        if (this.gameState.gameOver) {
            this.endGame();
        }

        // Save game
        this.gameState.save();

        // Animate
        this.animateChoice();

        // Reset loading state
        setTimeout(() => {
            this.isLoading = false;
        }, 1000);
    }

    animateChoice() {
        // Add camera shake effect
        this.isAnimating = true;
        
        const originalPosition = this.camera.position.clone();
        const originalLookAt = this.camera.getWorldDirection(new THREE.Vector3()).clone();

        let time = 0;
        const duration = 0.5;

        const animate = () => {
            time += 0.016;
            
            if (time < duration) {
                const progress = time / duration;
                const intensity = Math.sin(progress * Math.PI * 4) * (1 - progress);
                
                this.camera.position.x = originalPosition.x + (Math.random() - 0.5) * intensity * 2;
                this.camera.position.y = originalPosition.y + (Math.random() - 0.5) * intensity * 1;
                this.camera.position.z = originalPosition.z + (Math.random() - 0.5) * intensity * 2;
                
                this.camera.lookAt(
                    originalLookAt.x + (Math.random() - 0.5) * intensity,
                    originalLookAt.y + (Math.random() - 0.5) * intensity,
                    originalLookAt.z + (Math.random() - 0.5) * intensity
                );
                
                this.animationFrameId = requestAnimationFrame(animate);
            } else {
                this.camera.position.copy(originalPosition);
                this.camera.lookAt(
                    originalLookAt.x,
                    originalLookAt.y,
                    originalLookAt.z
                );
                this.isAnimating = false;
            }
        };

        animate();
    }

    showNotification(message, type = '') {
        if (!this.uiElements.notification) return;

        this.uiElements.notification.textContent = message;
        this.uiElements.notification.className = type;
        this.uiElements.notification.classList.remove('hidden');

        setTimeout(() => {
            this.uiElements.notification.classList.add('hidden');
        }, 2000);
    }

    endGame() {
        if (!this.uiElements.gameOverScreen) return;

        this.uiElements.gameOverMessage.textContent = this.gameState.gameOverReason;
        this.uiElements.gameOverScreen.classList.remove('hidden');

        // Stop game loop
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    restartGame() {
        this.gameState.reset();
        this.gameState = new GameState();
        this.gameSystem = new GameSystem(this.gameState);

        // Reset UI
        this.updateUI();
        this.generateNarrative();

        // Hide game over screen
        if (this.uiElements.gameOverScreen) {
            this.uiElements.gameOverScreen.classList.add('hidden');
        }

        // Reset city
        this.updateCityBuildings();

        // Restart game loop
        this.startGameLoop();

        // Save new game
        this.gameState.save();
    }

    startGameLoop() {
        const animate = () => {
            this.animationFrameId = requestAnimationFrame(animate);
            this.render();
        };
        animate();
    }

    render() {
        if (!this.renderer || !this.scene || !this.camera) return;

        // Rotate city slightly
        if (this.cityGroup) {
            this.cityGroup.rotation.y += 0.0005;
        }

        // Animate clouds
        this.clouds.forEach(cloud => {
            cloud.position.x += 0.01;
            if (cloud.position.x > 150) {
                cloud.position.x = -150;
            }
        });

        // Animate stars
        if (this.stars) {
            this.stars.rotation.y += 0.0001;
        }

        // Update light based on day/night cycle
        this.updateLighting();

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    updateLighting() {
        // Simulate day/night cycle based on game day
        const dayProgress = (this.gameState.day % 4) / 4; // 4 days = full cycle
        
        // Sun position
        const sunX = Math.cos(dayProgress * Math.PI * 2) * 50;
        const sunY = Math.sin(dayProgress * Math.PI * 2) * 30 + 50;
        const sunZ = Math.sin(dayProgress * Math.PI) * 30 + 30;
        
        if (this.directionalLight) {
            this.directionalLight.position.set(sunX, sunY, sunZ);
        }

        // Light intensity
        const lightIntensity = 0.5 + Math.abs(Math.sin(dayProgress * Math.PI * 2)) * 0.5;
        if (this.directionalLight) {
            this.directionalLight.intensity = lightIntensity;
        }

        // Ambient light
        if (this.ambientLight) {
            this.ambientLight.intensity = 0.3 + lightIntensity * 0.2;
        }

        // Hemisphere light
        if (this.hemisphereLight) {
            this.hemisphereLight.intensity = 0.4 + lightIntensity * 0.2;
        }
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    setupEventListeners() {
        // Choice buttons (delegated)
        document.addEventListener('click', (e) => {
            if (e.target.closest('.choice-btn')) {
                const button = e.target.closest('.choice-btn');
                const action = button.dataset.action;
                const choiceIndex = parseInt(button.dataset.choice);
                
                if (this.lastNarrative && this.lastNarrative.choices[choiceIndex]) {
                    this.handleChoice(this.lastNarrative.choices[choiceIndex]);
                }
            }
        });

        // Restart button
        if (this.uiElements.restartBtn) {
            this.uiElements.restartBtn.addEventListener('click', () => {
                this.restartGame();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key >= '1' && e.key <= '4') {
                const index = parseInt(e.key) - 1;
                if (this.lastNarrative && this.lastNarrative.choices[index]) {
                    this.handleChoice(this.lastNarrative.choices[index]);
                }
            }
        });

        // Touch support for mobile
        document.addEventListener('touchstart', (e) => {
            // Prevent default for better UX
            e.preventDefault();
        });
    }

    checkPWAInstall() {
        // Check if app is installed
        if (window.matchMedia('(display-mode: standalone)').matches) {
            console.log("App is running in standalone mode");
        }

        // Listen for beforeinstallprompt event
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            
            // Show install button
            this.showInstallButton(deferredPrompt);
        });

        // Listen for appinstalled event
        window.addEventListener('appinstalled', () => {
            console.log("App installed successfully");
            // Hide install button
            this.hideInstallButton();
        });
    }

    showInstallButton(prompt) {
        // Create install button if it doesn't exist
        if (!document.getElementById('install-btn')) {
            const installBtn = document.createElement('button');
            installBtn.id = 'install-btn';
            installBtn.textContent = 'Установить как PWA';
            installBtn.style.position = 'fixed';
            installBtn.style.bottom = '20px';
            installBtn.style.right = '20px';
            installBtn.style.padding = '10px 20px';
            installBtn.style.background = 'var(--primary)';
            installBtn.style.color = 'white';
            installBtn.style.border = 'none';
            installBtn.style.borderRadius = '8px';
            installBtn.style.cursor = 'pointer';
            installBtn.style.zIndex = '1000';
            installBtn.style.fontWeight = 'bold';

            installBtn.addEventListener('click', () => {
                prompt.prompt();
                prompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log("User accepted installation");
                    } else {
                        console.log("User dismissed installation");
                    }
                    this.hideInstallButton();
                });
            });

            document.body.appendChild(installBtn);
        }
    }

    hideInstallButton() {
        const installBtn = document.getElementById('install-btn');
        if (installBtn) {
            installBtn.remove();
        }
    }

    // Service worker registration
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then(registration => {
                        console.log('ServiceWorker registration successful');
                    })
                    .catch(err => {
                        console.log('ServiceWorker registration failed: ', err);
                    });
            });
        }
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.game = new CityBuilderGame();
});

// Handle page visibility changes
if (document.visibilityState) {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // Game is visible again
            if (window.game && window.game.gameState) {
                window.game.updateUI();
            }
        }
    });
}

// Prevent context menu on canvas for better mobile UX
document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'CANVAS') {
        e.preventDefault();
    }
});
