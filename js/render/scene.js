// ============================================================================
// scene.js — рендерер, камера, свет, небо, цикл суток.
//
// Исправления относительно прототипа:
//   * включены тени — в прототипе renderer.shadowMap не включался, поэтому
//     при castShadow = true тени всё равно не рендерились;
//   * задана корректная цветопередача (sRGB + ACES): прототип рисовал
//     в линейном пространстве, цвета уходили в грязь;
//   * сутки идут плавно, а не рывками по day % 4;
//   * свет больше не ищется обходом всей сцены каждый кадр;
//   * анимации привязаны к реальному времени, а не к частоте кадров.
// ============================================================================

import * as THREE from '../../vendor/three.module.min.js';
import { skyPalette } from './palette.js';

const CYCLE_SECONDS = 90; // полные сутки за полторы минуты реального времени
const ELEVATION = THREE.MathUtils.degToRad(31); // фиксированный угол камеры

export class SceneView {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(getPixelRatio());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0e27, 0.0035);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.5, 1200);
    this.cameraDistance = 90;
    this.targetDistance = 90;
    this.orbit = 0;
    this.orbitSpeed = 0.035; // медленный обзор, как было в прототипе

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.phase = 0.30; // утро на старте

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.#createSky();
    this.#createLights();
    this.#createStars();

    this.resize();
  }

  // --------------------------------------------------------------------------

  #createSky() {
    this.skyUniforms = {
      topColor: { value: new THREE.Color(0x0a0e27) },
      bottomColor: { value: new THREE.Color(0x1a1a2e) },
      offset: { value: 18 },
      exponent: { value: 0.7 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
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
          float blend = max(pow(max(h, 0.0), exponent), 0.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, blend), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 20), material);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  #createLights() {
    this.ambient = new THREE.HemisphereLight(0xbcd4ff, 0x2a2418, 0.5);
    this.scene.add(this.ambient);

    // Ссылка хранится напрямую: в прототипе свет искался обходом сцены
    // на каждом кадре
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.position.set(60, 90, 40);
    this.sun.castShadow = true;

    const size = 2048;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 420;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.02;

    this.setShadowExtent(120);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Мягкая подсветка с противоположной стороны, чтобы тени не были чёрными
    this.fill = new THREE.DirectionalLight(0x8fa8d8, 0.25);
    this.fill.position.set(-50, 30, -40);
    this.scene.add(this.fill);
  }

  #createStars() {
    const count = 1200;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      // Равномерно по сфере: сначала высота, затем угол
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const radius = 520;
      positions[i * 3] = Math.cos(theta) * r * radius;
      positions[i * 3 + 1] = Math.abs(u) * radius;
      positions[i * 3 + 2] = Math.sin(theta) * r * radius;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.stars = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2.4,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      }),
    );
    this.scene.add(this.stars);
  }

  // --------------------------------------------------------------------------

  /** Подгоняет область теней под размер города. */
  setShadowExtent(radius) {
    const r = Math.max(60, radius);
    const camera = this.sun.shadow.camera;
    camera.left = -r;
    camera.right = r;
    camera.top = r;
    camera.bottom = -r;
    camera.far = r * 4 + 120;
    camera.updateProjectionMatrix();
  }

  /**
   * Плавная подстройка расстояния камеры под размер города.
   * Угол и направление остаются фиксированными.
   */
  fitTo(radius) {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const vertical = radius / Math.tan(fov / 2);
    const horizontal = radius / Math.tan(Math.atan(Math.tan(fov / 2) * this.camera.aspect));

    this.targetDistance = THREE.MathUtils.clamp(
      Math.max(vertical, horizontal) * 1.15 + 18,
      46,
      520,
    );
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(getPixelRatio());
    // false — размер задаёт CSS: иначе атрибут style заданный setSize()
    // конфликтует с width: 100% и ломает раскладку на телефоне
    this.renderer.setSize(width, height, false);
  }

  // --------------------------------------------------------------------------

  update(dt) {
    this.elapsed += dt;
    this.phase = (this.phase + dt / CYCLE_SECONDS) % 1;
    this.orbit += dt * this.orbitSpeed;

    const palette = skyPalette(this.phase);

    this.skyUniforms.topColor.value.copy(palette.skyTop);
    this.skyUniforms.bottomColor.value.copy(palette.skyBottom);
    this.sky.material.uniforms.topColor.value = palette.skyTop;
    this.sky.material.uniforms.bottomColor.value = palette.skyBottom;

    this.sun.color.copy(palette.sun);
    this.sun.intensity = palette.sunPower;
    this.ambient.intensity = palette.ambient;
    this.stars.material.opacity = palette.star;
    this.scene.fog.color.copy(palette.skyBottom);

    // Солнце ходит по дуге вместе со временем суток
    const sunAngle = (this.phase - 0.25) * Math.PI * 2;
    this.sun.position.set(
      Math.cos(sunAngle) * 110,
      Math.max(15, Math.sin(sunAngle) * 130),
      60,
    );

    // Плавное приближение к нужной дистанции
    this.cameraDistance += (this.targetDistance - this.cameraDistance) * Math.min(1, dt * 2.2);

    const d = this.cameraDistance;
    this.camera.position.set(
      Math.sin(this.orbit) * d * Math.cos(ELEVATION),
      d * Math.sin(ELEVATION),
      Math.cos(this.orbit) * d * Math.cos(ELEVATION),
    );
    this.camera.lookAt(0, 6, 0);

    this.world.rotation.y = 0; // мир статичен, вращается камера
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Фаза суток 0..1 — нужна окружению для цвета травы и окон. */
  get timeOfDay() {
    return this.phase;
  }

  get dayLight() {
    return skyPalette(this.phase).sunPower;
  }

  dispose() {
    this.renderer.dispose();
  }
}

function getPixelRatio() {
  // На телефонах рендер в полном разрешении съедает батарею без видимой пользы
  const isMobile = window.matchMedia('(pointer: coarse)').matches;
  return Math.min(window.devicePixelRatio || 1, isMobile ? 1.75 : 2);
}