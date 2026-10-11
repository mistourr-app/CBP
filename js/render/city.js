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
import { BUILDING_KEYS } from '../balance.js';
import { COLOR } from './palette.js';

const CELL = 9;
const MAX_RING = 22;

/**
 * Спиральная развёртка клеток от центра наружу.
 * Клетки выдаются по одной и никогда не повторяются: занятые клетки просто
 * не выдаются снова.
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

/**
 * Раскладка растёт постепенно и не пересобирается заново.
 *
 * Раньше позиции всех зданий вычислялись заново по количеству зданий каждого
 * типа. Из-за этого постройка одной фермы сдвигала все дома: игрок видел, как
 * жилой квартал переползает. Здесь место каждого здания запоминается навсегда,
 * а новым зданиям выдаются только свободные клетки.
 */
class CityLayout {
  constructor() {
    this.cells = spiral();
    this.slots = new Map(); // тип здания -> [{ x, z, index }]
    this.used = new Set();  // занятые клетки "gx:gz"
  }

  /**
   * Возвращает слоты типа здания в диапазоне [from, to),
   * выдавая новые клетки по мере необходимости.
   */
  range(key, from, to) {
    const slots = this.slots.get(key) ?? [];

    for (let i = from; i < to; i += 1) {
      if (slots[i]) continue;

      // next() отдаёт обёртку { value, done }, а сама клетка лежит в value
      const cell = this.cells.next()?.value;
      if (!cell) break; // город вырос за пределы сетки

      this.used.add(`${cell.x}:${cell.z}`);
      slots[i] = { x: cell.x * CELL, z: cell.z * CELL, index: i };
    }

    this.slots.set(key, slots);
    return slots;
  }

  /** Самая дальняя занятая клетка — по ней отводится камера. */
  radius() {
    let max = CELL * 2;
    for (const slots of this.slots.values()) {
      for (const slot of slots) {
        if (!slot) continue;
        const distance = Math.hypot(slot.x, slot.z);
        if (Number.isFinite(distance)) max = Math.max(max, distance);
      }
    }
    return max;
  }
}

// ---------------------------------------------------------------------------
// Описания зданий: геометрия и материал каждой части
// ---------------------------------------------------------------------------

function defineModels() {
  const box = (w, h, d, color, y = h / 2) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, y, 0);
    return { geometry: g, color };
  };

  return {
    houses: {
      parts: [
        box(4.4, 3.2, 4.4, 0xa8703f),
        { geometry: new THREE.ConeGeometry(3.9, 2.4, 4), color: 0x7a3f2a, offsetY: 4.4 },
        { ...box(1.5, 0.9, 0.12, 0xffdca0, 2.0), window: true },
        { ...box(0.12, 0.9, 1.5, 0xffdca0, 2.0), window: true },
      ],
    },
    farms: {
      parts: [
        box(5.4, 2.6, 4.0, 0x8d5a33),
        { geometry: new THREE.ConeGeometry(3.9, 1.8, 4), color: 0x5d3a22, offsetY: 3.5 },
        box(6.6, 0.14, 5.2, 0x6f8f3a, 0.07), // поле
      ],
    },
    lumberMills: {
      parts: [
        box(5.0, 2.4, 3.8, 0x7d5a38),
        { geometry: new THREE.ConeGeometry(3.6, 1.8, 4), color: 0x4a3524, offsetY: 3.3 },
        { ...box(0.2, 2.4, 0.2, 0x8b5e3c, 1.2), rotation: [0, 0, 0.35] },
        { ...box(0.2, 2.4, 0.2, 0x8b5e3c, 1.2), rotation: [0, 0, -0.35] },
      ],
    },
    quarries: {
      parts: [
        box(4.6, 1.0, 4.0, 0x8d94a5),
        { geometry: new THREE.IcosahedronGeometry(1.7, 0), color: 0x707a8c, offsetY: 1.3 },
        { ...box(0.25, 1.6, 0.25, 0x6b4a2f, 0.8), rotation: [0, 0, 0.3] },
      ],
    },
    markets: {
      parts: [
        box(6.0, 3.0, 4.6, 0xb5794a),
        { geometry: new THREE.BoxGeometry(6.6, 0.22, 5.2), color: 0x8f4d33, offsetY: 3.5 },
        { ...box(1.2, 1.8, 0.12, 0xffdca0, 1.5), window: true },
      ],
    },
    temples: {
      parts: [
        box(5.6, 3.4, 4.6, 0xe6dcc2),
        box(4.2, 1.4, 3.4, 0xd8ccae, 4.1),
        { geometry: new THREE.ConeGeometry(2.8, 2.6, 8), color: 0xd8a93a, offsetY: 6.1 },
      ],
    },
    schools: {
      parts: [
        box(5.6, 2.8, 4.0, 0xc9a066),
        { geometry: new THREE.BoxGeometry(6.0, 0.2, 4.4), color: 0x8a6a3f, offsetY: 3.2 },
        { ...box(1.6, 1.0, 0.12, 0xbfe0ff, 1.8), window: true },
      ],
    },
    walls: {
      parts: [
        { geometry: new THREE.BoxGeometry(CELL + 0.6, 3.0, 1.4), color: 0x8a8f9c },
      ],
    },
    towers: {
      parts: [
        { geometry: new THREE.CylinderGeometry(1.9, 2.3, 0.8, 10), color: 0x7c8290, offsetY: 0.4 },
        { geometry: new THREE.CylinderGeometry(1.3, 1.5, 7.0, 10), color: 0x9aa0ad, offsetY: 4.3 },
        { geometry: new THREE.ConeGeometry(1.9, 2.4, 10), color: 0x5d6470, offsetY: 9.0 },
      ],
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
    this.layout = new CityLayout();
    this.capacity = new Map();
    this.counts = {};
    this.radius = 0;
    this.roadMesh = null;
    this.geometries = [];
    this.materials = [];

    // Один материал на все здания: цвет приходит из вершинных цветов,
    // поэтому крыша и стены одного дома остаются разными
    this.shellMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.02,
    });
    this.windowMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      emissive: 0xffcc66,
      emissiveIntensity: 0,
      roughness: 0.4,
    });
    this.materials.push(this.shellMaterial, this.windowMaterial);
  }

  /**
   * Синхронизирует 3D-город с состоянием игры.
   *
   * Сначала обновляются счётчики, потом пересчитывается раскладка, и только
   * затем расставляются здания. Обратный порядок дал бы пустую раскладку для
   * только что добавленных зданий — они получили бы матрицу, но остались бы
   * в начале координат.
   *
   * Перестраиваются только типы зданий, у которых изменилось количество.
   */
  sync(buildings) {
    const additions = [];

    for (const key of BUILDING_KEYS) {
      const target = buildings[key] ?? 0;
      const current = this.counts[key] ?? 0;
      if (current === target) continue;

      if (target > current) additions.push({ key, from: current, to: target });
      this.counts[key] = target;
    }

    if (additions.length === 0) return this.radius;

    for (const { key, from, to } of additions) {
      const slots = this.layout.range(key, from, to);
      this.#placeRange(key, slots, from, to);
    }

    this.#rebuildRoads();
    return this.radius;
  }

  #placeRange(key, slots, from, to) {
    this.#ensureMeshes(key, to);

    const mesh = this.meshes.get(key);
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const quaternion = new THREE.Quaternion();
    const offset = new THREE.Vector3();
    const euler = new THREE.Euler();
    const windowOffset = new THREE.Vector3(0, 0, 2.05);

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
        // Окна ставим чуть снаружи от стен, иначе они утоплены в геометрии
        euler.set(0, facing + Math.PI / 2, 0);
        quaternion.setFromEuler(euler);
        offset.copy(position).add(windowOffset);
        matrix.compose(offset, quaternion, scale);
        windows.setMatrixAt(i, matrix);
      }
    }

    mesh.count = to;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();

    const windows = this.windowMeshes.get(key);
    if (windows) {
      windows.count = to;
      windows.instanceMatrix.needsUpdate = true;
      windows.computeBoundingSphere();
    }
  }

  #ensureMeshes(key, capacity) {
    const existing = this.meshes.get(key);
    // InstancedMesh создаётся на фиксированное число экземпляров, поэтому
    // при росте города сетку пересоздаём
    if (existing && this.capacity[key] >= capacity) return;

    // Матрицы уже расставленных зданий переживают пересоздание: без копии
    // все ранее построенные здания прыгнули бы в начало координат.
    // getMatrixAt ничего не возвращает, поэтому читаем в цикле.
    const carried = [];
    const carriedWindows = [];

    if (existing) {
      for (let i = 0; i < existing.count; i += 1) {
        const matrix = new THREE.Matrix4();
        existing.getMatrixAt(i, matrix);
        carried.push(matrix);
      }

      const previousWindows = this.windowMeshes.get(key);
      if (previousWindows) {
        for (let i = 0; i < previousWindows.count; i += 1) {
          const matrix = new THREE.Matrix4();
          previousWindows.getMatrixAt(i, matrix);
          carriedWindows.push(matrix);
        }
      }

      this.root.remove(existing);
      if (previousWindows) this.root.remove(previousWindows);
      existing.dispose();
      previousWindows?.dispose();
    }

    const model = this.models[key];
    const solidParts = model.parts.filter((part) => !part.window);
    const windowParts = model.parts.filter((part) => part.window);

    const geometry = mergeGeometries(solidParts);
    this.geometries.push(geometry);

    const capacityNext = Math.max(capacity + 6, 12);
    const mesh = new THREE.InstancedMesh(geometry, this.shellMaterial, capacityNext);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.frustumCulled = false;

    carried.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;

    this.meshes.set(key, mesh);
    this.capacity[key] = capacityNext;
    this.root.add(mesh);

    if (windowParts.length) {
      const windowGeometry = mergeGeometries(windowParts);
      this.geometries.push(windowGeometry);

      const windows = new THREE.InstancedMesh(windowGeometry, this.windowMaterial, capacityNext);
      windows.count = 0;
      windows.frustumCulled = false;

      carriedWindows.forEach((matrix, index) => windows.setMatrixAt(index, matrix));
      windows.instanceMatrix.needsUpdate = true;

      this.windowMeshes.set(key, windows);
      this.root.add(windows);
    }
  }

  /**
   * Дороги: крест в центре города.
   *
   * Дорога пересобирается вместе с застройкой, поэтому её ресурсы
   * освобождаются здесь же — иначе каждый ход оставлял бы в видеокарте
   * новую геометрию и материал.
   */
  #rebuildRoads() {
    this.#disposeRoads();

    this.radius = this.layout.radius();
    if (!Number.isFinite(this.radius)) return;

    const geometry = new THREE.BoxGeometry(this.radius * 2 + CELL * 3, 0.08, CELL * 0.62);
    const material = new THREE.MeshStandardMaterial({
      color: COLOR.road, roughness: 0.95, metalness: 0,
    });

    const cross = new THREE.Group();

    const horizontal = new THREE.Mesh(geometry, material);
    horizontal.position.y = 0.02;
    horizontal.receiveShadow = true;
    cross.add(horizontal);

    const vertical = new THREE.Mesh(geometry, material);
    vertical.rotation.y = Math.PI / 2;
    vertical.position.y = 0.02;
    vertical.receiveShadow = true;
    cross.add(vertical);

    this.roadMesh = cross;
    this.root.add(cross);
  }

  #disposeRoads() {
    if (!this.roadMesh) return;

    this.root.remove(this.roadMesh);

    // Геометрия и материал общие для двух балок, поэтому освобождаем один раз
    this.roadMesh.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) node.material.dispose();
    });

    this.roadMesh = null;
  }

  /** Окна загораются ночью. */
  setNight(amount) {
    for (const mesh of this.windowMeshes.values()) {
      mesh.material.emissiveIntensity = amount * 1.6;
    }
  }

  dispose() {
    this.#disposeRoads();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}

/**
 * Склейка частей здания в одну геометрию с вершинными цветами.
 *
 * Разные части одного здания имеют разные цвета (стены, крыша, окна), но
 * для отрисовки достаточно одного вызова. Поэтому цвет каждой части
 * переносится в атрибут color, а материал работает с vertexColors.
 * Принимает часть как { geometry, color }.
 */
function mergeGeometries(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();
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

    color.set(part.color ?? 0xffffff);

    for (let i = 0; i < pos.count; i += 1) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      colors.push(color.r, color.g, color.b);
    }

    if (index) {
      for (let i = 0; i < index.count; i += 1) indices.push(index.getX(i) + offset);
    } else {
      // IcosahedronGeometry и подобные примитивы идут без индекса
      for (let i = 0; i < pos.count; i += 1) indices.push(i + offset);
    }
    offset += pos.count;
    geometry.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  merged.computeBoundingSphere();
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