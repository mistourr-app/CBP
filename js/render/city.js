// ============================================================================
// city.js — застройка города.
//
// Исправления относительно прототипа:
//   * РАСКЛАДКА. Координаты считались по формуле вида -8 + (i % 4) * 5, из-за
//     чего дома наезжали на фермы, а при двадцати домах застройка уезжала за
//     пределы земли. Теперь есть аллокатор по сетке с проверкой занятости.
//   * ПЕРЕСОЗДАНИЕ. Каждый ход весь город удалялся и строился заново, причём
//     геометрии и материалы не освобождались — утечка памяти видеокарты.
//     Теперь используется instancing, а обновляются только изменившиеся
//     здания.
//   * РАНДОМ. Разброс построек считался от порядкового номера, поэтому при
//     перестроике дома прыгали. Теперь вариации считаются от индекса здания и
//     не меняются.
// ============================================================================

import * as THREE from '../../vendor/three.module.min.js';
import { BALANCE, BUILDING_KEYS } from '../balance.js';
import { COLOR } from './palette.js';

const CELL = 9;
const MAX_RING = 22;

/** Порядок застройки: сначала центральные здания, потом жилые кварталы. */
const FILL_ORDER = [
  'temples', 'markets', 'schools',
  'farms', 'lumberMills', 'quarries',
  'walls', 'towers',
  'houses',
];

/**
 * Спиральная развёртка клеток от центра наружу.
 * Детерминированная: одна и та же застройка всегда даёт одну и ту же карту.
 */
function* spiral() {
  yield { x: 0, z: 0 };

  for (let ring = 1; ring <= MAX_RING; ring += 1) {
    for (let x = -ring; x <= ring; x += 1) yield { x, z: -ring };
    for (let z = -ring + 1; z <= ring; z += 1) yield { x: ring, z };
    for (let x = ring - 1; x >= -ring; x -= 1) yield { x, z: ring };
    for (let z = ring - 1; z >= -ring + 1; z -= 1) yield { x: -ring, z };
  }
}

function buildLayout(counts) {
  const cells = spiral();
  const layout = {};

  for (const key of FILL_ORDER) {
    const count = counts[key] ?? 0;
    if (!count) continue;

    const slots = [];
    for (let i = 0; i < count; i += 1) {
      const cell = cells.next();
      if (!cell) break; // город вырос за пределы сетки
      slots.push({ x: cell.x * CELL, z: cell.z * CELL, index: i });
    }
    if (slots.length) layout[key] = slots;
  }

  return layout;
}

/** Радиус, до которого нужно отвести камеру. */
function layoutRadius(layout) {
  let max = 0;
  for (const slots of Object.values(layout)) {
    for (const slot of slots) {
      max = Math.max(max, Math.hypot(slot.x, slot.z));
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// Описания зданий: геометрия и материал каждой части
// ---------------------------------------------------------------------------

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...options });
}

function defineModels() {
  const roof = (color) => {
    const g = new THREE.ConeGeometry(3.6, 2.2, 4);
    g.rotateY(Math.PI / 4);
    return { geometry: g, material: material(color) };
  };

  const box = (w, h, d, color, y = h / 2) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, y, 0);
    return { geometry: g, material: material(color) };
  };

  return {
    houses: {
      parts: [
        box(4.4, 3.2, 4.4, 0xa8703f),
        { geometry: new THREE.ConeGeometry(3.9, 2.4, 4), material: material(0x7a3f2a), offsetY: 4.4 },
        { ...box(1.5, 0.9, 0.12, 0xffe6a3, 2.0), window: true },
        { ...box(0.12, 0.9, 1.5, 0xffe6a3, 2.0), window: true },
      ],
      scale: 0.95,
    },
    farms: {
      parts: [
        box(5.4, 2.6, 4.0, 0x8d5a33),
        { geometry: new THREE.ConeGeometry(3.9, 1.8, 4), material: material(0x5d3a22), offsetY: 3.5 },
        box(6.6, 0.14, 5.2, 0x6f8f3a, 0.07), // поле
      ],
      scale: 1,
    },
    lumberMills: {
      parts: [
        box(5.0, 2.4, 3.8, 0x7d5a38),
        { geometry: new THREE.ConeGeometry(3.6, 1.8, 4), material: material(0x4a3524), offsetY: 3.3 },
        { ...box(0.2, 2.4, 0.2, 0x8b5e3c, 1.2), rotation: [0, 0, 0.35] },
        { ...box(0.2, 2.4, 0.2, 0x8b5e3c, 1.2), rotation: [0, 0, -0.35] },
      ],
      scale: 1,
    },
    quarries: {
      parts: [
        box(4.6, 1.0, 4.0, COLOR.stone),
        { geometry: new THREE.IcosahedronGeometry(1.7, 0), material: material(0x707a8c, { flatShading: true }), offsetY: 1.3 },
        { ...box(0.25, 1.6, 0.25, 0x6b4a2f, 0.8), rotation: [0, 0, 0.3] },
      ],
      scale: 1,
    },
    markets: {
      parts: [
        box(6.0, 3.0, 4.6, 0xb5794a),
        { geometry: new THREE.BoxGeometry(6.6, 0.22, 5.2), material: material(0x8f4d33), offsetY: 3.5 },
        { ...box(1.2, 1.8, 0.12, 0xffd9a0, 1.5), window: true },
      ],
      scale: 1,
    },
    temples: {
      parts: [
        box(5.6, 3.4, 4.6, 0xe6dcc2),
        box(4.2, 1.4, 3.4, 0xd8ccae, 4.1),
        { geometry: new THREE.ConeGeometry(2.8, 2.6, 8), material: material(0xd8a93a, { metalness: 0.35, roughness: 0.4 }), offsetY: 6.1 },
      ],
      scale: 1,
    },
    schools: {
      parts: [
        box(5.6, 2.8, 4.0, 0xc9a066),
        { geometry: new THREE.BoxGeometry(6.0, 0.2, 4.4), material: material(0x8a6a3f), offsetY: 3.2 },
        { ...box(1.6, 1.0, 0.12, 0xbfe0ff, 1.8), window: true },
      ],
      scale: 1,
    },
    walls: {
      parts: [
        { geometry: new THREE.BoxGeometry(CELL + 0.6, 3.0, 1.4), material: material(0x8a8f9c) },
      ],
      scale: 1,
    },
    towers: {
      parts: [
        { geometry: new THREE.CylinderGeometry(1.9, 2.3, 0.8, 10), material: material(0x7c8290), offsetY: 0.4 },
        { geometry: new THREE.CylinderGeometry(1.3, 1.5, 7.0, 10), material: material(0x9aa0ad), offsetY: 4.3 },
        { geometry: new THREE.ConeGeometry(1.9, 2.4, 10), material: material(0x5d6470), offsetY: 9.0 },
      ],
      scale: 1,
    },
  };
}

// ---------------------------------------------------------------------------

export class CityView {
  constructor(world, seededRandom) {
    this.world = world;
    this.rand = seededRandom;
    this.root = new THREE.Group();
    this.world.add(this.root);

    this.models = defineModels();
    this.meshes = new Map();
    this.windowMeshes = new Map();
    this.counts = {};
    this.radius = 0;
    this.roadMesh = null;
    this.geometries = [];
    this.materials = [];
  }

  /**
   * Синхронизирует 3D-город с состоянием игры.
   * Перестраиваются только те типы зданий, у которых изменилось количество.
   */
  sync(buildings) {
    let changed = false;

    for (const key of BUILDING_KEYS) {
      const target = buildings[key] ?? 0;
      if (this.counts[key] === target) continue;

      if (target > (this.counts[key] ?? 0)) this.#addFrom(key, this.counts[key] ?? 0, target);
      this.counts[key] = target;
      changed = true;
    }

    if (changed) this.#rebuildRoads();
    return this.radius;
  }

  #layout() {
    return buildLayout(this.counts);
  }

  #addFrom(key, from, to) {
    const layout = this.#layout();
    const slots = layout[key] ?? [];

    this.#ensureMeshes(key, to);

    const mesh = this.meshes.get(key);
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const euler = new THREE.Euler();

    for (let i = from; i < to; i += 1) {
      const slot = slots[i];
      if (!slot) break;

      // Ориентация и небольшой разброс считаются от индекса здания, а не от
      // случайного числа: иначе при каждой перестройке дома прыгали бы
      const facing = Math.floor(hash(key, slot.index, 1) * 4) * (Math.PI / 2);
      const jitter = hash(key, slot.index, 2);

      position.set(slot.x + (jitter - 0.5) * 1.2, 0, slot.z + (jitter - 0.5) * 1.2);
      euler.set(0, facing + (hash(key, slot.index, 3) - 0.5) * 0.16, 0);
      quaternion.setFromEuler(euler);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);

      if (this.windowMeshes.has(key)) {
        const windows = this.windowMeshes.get(key);
        // Окна ставим чуть наружу от стен, иначе они утоплены в геометрии
        euler.set(0, facing + Math.PI / 2, 0);
        quaternion.setFromEuler(euler);
        matrix.compose(
          position.clone().add(new THREE.Vector3(0, 0, 2.05)),
          quaternion,
          scale,
        );
        windows.setMatrixAt(i, matrix);
      }
    }

    mesh.count = to;
    mesh.instanceMatrix.needsUpdate = true;
    if (this.windowMeshes.has(key)) {
      this.windowMeshes.get(key).count = to;
      this.windowMeshes.get(key).instanceMatrix.needsUpdate = true;
    }
  }

  #ensureMeshes(key, capacity) {
    if (this.meshes.has(key)) return;

    const model = this.models[key];
    const parts = model.parts;
    const windowParts = parts.filter((part) => part.window);
    const solidParts = parts.filter((part) => !part.window);

    const material = solidParts[0].material;
    const merged = mergeGeometries(solidParts);
    this.geometries.push(merged);
    this.materials.push(material);

    const mesh = new THREE.InstancedMesh(merged, material, Math.max(capacity, 1));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;

    this.meshes.set(key, mesh);
    this.root.add(mesh);

    if (windowParts.length) {
      const windowGeometry = mergeGeometries(windowParts);
      const windowMaterial = new THREE.MeshStandardMaterial({
        color: 0x2b2f3d,
        emissive: 0xffcc66,
        emissiveIntensity: 0,
        roughness: 0.4,
      });
      this.geometries.push(windowGeometry);
      this.materials.push(windowMaterial);

      const windows = new THREE.InstancedMesh(windowGeometry, windowMaterial, Math.max(capacity, 1));
      windows.count = 0;
      windows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      windows.frustumCulled = false;

      this.windowMeshes.set(key, windows);
      this.root.add(windows);
    }
  }

  /** Дороги: крест в центре плюс кольцо по границе застройки. */
  #rebuildRoads() {
    if (this.roadMesh) {
      this.root.remove(this.roadMesh);
      this.roadMesh.geometry.dispose();
      this.roadMesh.material.dispose();
      this.roadMesh = null;
    }

    const radius = layoutRadius(this.#layout());
    this.radius = Math.max(radius, CELL * 2);
    if (!Number.isFinite(this.radius)) return;

    const material = new THREE.MeshStandardMaterial({
      color: COLOR.road, roughness: 0.95, metalness: 0,
    });
    this.materials.push(material);

    const size = this.radius + CELL * 3;
    const geometry = new THREE.BoxGeometry(size, 0.08, CELL * 0.62);
    this.geometries.push(geometry);

    const cross = new THREE.Group();

    const horizontal = new THREE.Mesh(geometry, material);
    horizontal.position.y = 0.02;
    cross.add(horizontal);

    const vertical = new THREE.Mesh(geometry, material);
    vertical.rotation.y = Math.PI / 2;
    vertical.position.y = 0.02;
    cross.add(vertical);

    vertical.receiveShadow = true;
    horizontal.receiveShadow = true;

    this.roadMesh = cross;
    this.root.add(cross);
  }

  /** Окна загораются ночью. */
  setNight(amount) {
    for (const mesh of this.windowMeshes.values()) {
      mesh.material.emissiveIntensity = amount * 1.6;
    }
  }

  dispose() {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}

/**
 * Склейка частей здания в одну геометрию.
 * Требует одинакового набора атрибутов, поэтому все части создаются
 * через одинаковые примитивы.
 */
function mergeGeometries(parts) {
  const positions = [];
  const normals = [];
  const indices = [];
  let offset = 0;

  for (const part of parts) {
    const geometry = part.geometry.clone();
    if (part.offsetY) geometry.translate(0, part.offsetY, 0);
    if (part.rotation) {
      geometry.rotateX(part.rotation[0] ?? 0);
      geometry.rotateY(part.rotation[1] ?? 0);
      geometry.rotateZ(part.rotation[2] ?? 0);
    }
    geometry.computeVertexNormals();

    const pos = geometry.attributes.position;
    const norm = geometry.attributes.normal;
    const index = geometry.index;

    for (let i = 0; i < pos.count; i += 1) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    }
    if (index) {
      for (let i = 0; i < index.count; i += 1) indices.push(index.getX(i) + offset);
    } else {
      for (let i = 0; i < pos.count; i += 1) indices.push(i + offset);
    }
    offset += pos.count;
    geometry.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}

/** Стабильный псевдослучайный хеш строки — для стабильной «случайности». */
function hash(...parts) {
  let h = 2166136261;
  const key = parts.join('|');
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export { CELL };