// ============================================================================
// environment.js — земля, река, холмы, деревья, облака, снег.
//
// Исправления относительно прототипа:
//   * ХОЛМЫ. В прототипе создавался ConeGeometry и разворачивался на 90°,
//     из-за чего холм торчал боком огромным шипом — это и были «странные
//     конусы». Теперь это приплюснутые сферы.
//   * ДЕРЕВЬЯ. Раньше 30 деревьев генерировались в одном случайном кластере и
//     наезжали на город. Теперь размещение детерминированное, деревья стоят
//     кольцом вокруг застройки и рисуются через instancing.
//   * ОБЛАКА. Вместо белых полупрозрачных коробок 15×3×15 — приплюснутые
//     сгустки.
//   * Город и окружение вращаются вместе: в прототипе город крутился внутри
//     группы, а деревья лежали в сцене, и город проезжал сквозь них.
// ============================================================================

import * as THREE from '../../vendor/three.module.min.js';
import { SEASON_COLORS, COLOR } from './palette.js';

const GROUND_SIZE = 900;
const TREE_COUNT = 260;
const CLOUD_COUNT = 14;

export class Environment {
  constructor(world, rng) {
    this.world = world;
    this.rng = rng;
    this.materials = [];
    this.time = 0;
    this.season = 'spring';

    this.#createGround();
    this.#createRiver();
    this.#createHills();
    this.#createTrees();
    this.#createClouds();
    this.#createSnow();
  }

  #track(material) {
    this.materials.push(material);
    return material;
  }

  // --------------------------------------------------------------------------

  #createGround() {
    const geometry = new THREE.CircleGeometry(GROUND_SIZE / 2, 64);
    geometry.rotateX(-Math.PI / 2);

    this.groundMaterial = this.#track(new THREE.MeshStandardMaterial({
      color: SEASON_COLORS.spring.ground,
      roughness: 1,
      metalness: 0,
    }));

    this.ground = new THREE.Mesh(geometry, this.groundMaterial);
    this.ground.position.y = -0.02;
    this.ground.receiveShadow = true;
    this.world.add(this.ground);
  }

  #createRiver() {
    const geometry = new THREE.PlaneGeometry(460, 26, 120, 6);
    geometry.rotateX(-Math.PI / 2);

    // Лёгкая изгибка русла: без неё река читается как прямая полоса
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      position.setZ(i, Math.sin(x * 0.012) * 16 + Math.sin(x * 0.031) * 5);
    }
    geometry.computeVertexNormals();

    this.waterUniforms = {
      time: { value: 0 },
      shallow: { value: new THREE.Color(COLOR.water) },
      deep: { value: new THREE.Color(COLOR.waterDeep) },
    };

    const material = this.#track(new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        varying float vWave;
        uniform float time;

        void main() {
          vUv = uv;
          vec3 p = position;
          float wave = sin(p.x * 0.35 + time * 1.6) * 0.12
                     + sin(p.x * 0.11 - time * 0.9) * 0.07;
          p.y += wave;
          vWave = wave;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 shallow;
        uniform vec3 deep;
        uniform float time;
        varying vec2 vUv;
        varying float vWave;

        void main() {
          float stripe = sin((vUv.x * 260.0) + time * 2.2) * 0.5 + 0.5;
          float edge = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
          vec3 color = mix(deep, shallow, edge * 0.6 + stripe * 0.25);
          color += vWave * 0.6;
          gl_FragColor = vec4(color, 0.82);
        }
      `,
    }));

    this.river = new THREE.Mesh(geometry, material);
    this.river.position.set(0, -0.12, 150);
    this.river.renderOrder = 1;
    this.world.add(this.river);
  }

  #createHills() {
    // Приплюснутые сферы вместо развёрнутых конусов
    const geometry = new THREE.SphereGeometry(1, 14, 9);

    const variants = [0x5d7a3c, 0x516d34, 0x68853f].map((color) =>
      this.#track(new THREE.MeshStandardMaterial({ color, roughness: 1 })),
    );

    const count = 26;
    const placed = [];

    for (let i = 0; i < count; i += 1) {
      // Кольцо вокруг возможной застройки, подальше от центра
      let x = 0;
      let z = 0;
      let attempts = 0;
      do {
        const angle = this.rng.float() * Math.PI * 2;
        const radius = 190 + this.rng.float() * 190;
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        attempts += 1;
      } while (
        attempts < 12 &&
        placed.some((p) => Math.hypot(p.x - x, p.z - z) < 52)
      );
      placed.push({ x, z });

      const mesh = new THREE.Mesh(geometry, variants[i % variants.length]);
      const width = 22 + this.rng.float() * 30;
      mesh.position.set(x, -2, z);
      mesh.scale.set(width, 6 + this.rng.float() * 9, width * (0.75 + this.rng.float() * 0.4));
      mesh.rotation.y = this.rng.float() * Math.PI;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this.world.add(mesh);
    }
  }

  #createTrees() {
    const trunkGeometry = new THREE.CylinderGeometry(0.32, 0.5, 3.4, 6);
    trunkGeometry.translate(0, 1.7, 0);

    const canopyGeometry = new THREE.IcosahedronGeometry(2.1, 0);
    canopyGeometry.translate(0, 5.2, 0);

    this.trunkMaterial = this.#track(new THREE.MeshStandardMaterial({
      color: 0x6b4a2f, roughness: 0.9,
    }));
    this.canopyMaterial = this.#track(new THREE.MeshStandardMaterial({
      color: SEASON_COLORS.spring.tree, roughness: 0.95, flatShading: true,
    }));

    this.trunks = new THREE.InstancedMesh(trunkGeometry, this.trunkMaterial, TREE_COUNT);
    this.canopies = new THREE.InstancedMesh(canopyGeometry, this.canopyMaterial, TREE_COUNT);

    this.trunks.castShadow = true;
    this.canopies.castShadow = true;
    this.trunks.receiveShadow = true;
    this.canopies.receiveShadow = true;
    this.trunks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this.canopies.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    let placed = 0;
    let attempts = 0;

    while (placed < TREE_COUNT && attempts < TREE_COUNT * 25) {
      attempts += 1;

      const angle = this.rng.float() * Math.PI * 2;
      // Внутренний радионс застройки свободен: деревья не растут в городе
      const radius = 120 + this.rng.float() * 230;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Не растим на русле реки и не в воде
      if (Math.abs(z - 150) < 22 && Math.abs(x) < 230) continue;

      const s = 0.75 + this.rng.float() * 0.75;
      position.set(x, 0, z);
      scale.set(s, s * (0.85 + this.rng.float() * 0.4), s);
      quaternion.setFromAxisAngle(up, this.rng.float() * Math.PI * 2);
      matrix.compose(position, quaternion, scale);

      this.trunks.setMatrixAt(placed, matrix);
      this.canopies.setMatrixAt(placed, matrix);
      placed += 1;
    }

    this.trunks.count = placed;
    this.canopies.count = placed;
    this.trunks.instanceMatrix.needsUpdate = true;
    this.canopies.instanceMatrix.needsUpdate = true;

    this.world.add(this.trunks, this.canopies);
  }

  #createClouds() {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = this.#track(new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      fog: false,
    }));

    this.clouds = [];
    for (let i = 0; i < CLOUD_COUNT; i += 1) {
      const cluster = new THREE.Group();

      // Сгусток из нескольких лепестков вместо ровной коробки
      const puffs = 3 + Math.floor(this.rng.float() * 3);
      for (let p = 0; p < puffs; p += 1) {
        const puff = new THREE.Mesh(geometry, material);
        puff.position.set(
          (this.rng.float() - 0.5) * 26,
          (this.rng.float() - 0.5) * 4,
          (this.rng.float() - 0.5) * 16,
        );
        puff.scale.set(10 + this.rng.float() * 9, 3.2 + this.rng.float() * 2.2, 7 + this.rng.float() * 6);
        cluster.add(puff);
      }

      cluster.position.set(
        (this.rng.float() - 0.5) * 320,
        70 + this.rng.float() * 50,
        (this.rng.float() - 0.5) * 320,
      );

      this.world.add(cluster);
      this.clouds.push(cluster);
    }
  }

  #createSnow() {
    const count = 900;
    const positions = new Float32Array(count * 3);
    this.snowData = [];

    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (this.rng.float() - 0.5) * 420;
      positions[i * 3 + 1] = this.rng.float() * 140;
      positions[i * 3 + 2] = (this.rng.float() - 0.5) * 420;
      this.snowData.push(0.35 + this.rng.float() * 0.5);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.snow = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.9,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    }));
    this.world.add(this.snow);
  }

  // --------------------------------------------------------------------------

  setSeason(seasonId) {
    if (this.season === seasonId) return;
    this.season = seasonId;

    const colors = SEASON_COLORS[seasonId];
    this.groundMaterial.color.setHex(colors.ground);
    this.canopyMaterial.color.setHex(colors.tree);
  }

  /** Снег идёт только зимой и только в светлое время. */
  setWinter(isWinter, dayLight) {
    this.snow.material.opacity = isWinter ? 0.75 * Math.min(1, dayLight * 1.6) : 0;
  }

  update(dt, dayLight) {
    this.time += dt;
    this.waterUniforms.time.value = this.time;

    for (const cloud of this.clouds) {
      cloud.position.x += dt * 1.4;
      if (cloud.position.x > 260) cloud.position.x = -260;
    }

    // Тускнеют на ночи и в пасмурные фазы
    const visibility = Math.max(0, Math.min(1, dayLight * 1.4 - 0.15));
    for (const cloud of this.clouds) {
      cloud.children.forEach((puff) => { puff.material.opacity = 0.16 * visibility; });
    }

    if (this.snow.material.opacity > 0) {
      const positions = this.snow.geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 1) {
        let y = positions.getY(i) - dt * this.snowData[i] * 9;
        if (y < 0) y = 140;
        positions.setY(i, y);
      }
      positions.needsUpdate = true;
    }
  }

  dispose() {
    this.ground.geometry.dispose();
    this.river.geometry.dispose();
    this.trunks.geometry.dispose();
    this.canopies.geometry.dispose();
    this.snow.geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}