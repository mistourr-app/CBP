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

// Дороги рисуются улицами (roadsFor), отдельной модели не имеют
const VISUAL_KEYS = BUILDING_KEYS.filter((key) => BALANCE.buildings[key].visual !== false);
import { COLOR } from './palette.js';

// ---------------------------------------------------------------------------
// Город из кварталов
//
// Город состоит из кварталов — плотных прямоугольников, где здания стоят
// вплотную друг к другу, как в старом городе. Между кварталами идут
// улицы. Так выглядит настоящий город; сетка дорог по одной на каждое
// здание выглядела бы полосатым ковром.
//
//     квартал из 4×4 зданий      улица      квартал
//   ┌────┬────┬────┬────┐      ║      ┌────┬────┬────┬────┐
//   │    │    │    │    │      ║      │    │    │    │    │
//   └────┴────┴────┴────┘      ║      └────┴────┴────┴────┘
//                        ← ROAD_WIDTH →
//
// Размеры выводятся из настоящей геометрии, а не задаются числом: если
// кто-то сделает здание шире промежутка, это обнаружит тест, а не игрок.
//
// Замена тайловой сетки на кварталы: дороги шли между каждым зданием, и
// город читался как ряд полосок, а не как застройка.
// ---------------------------------------------------------------------------

/** Шаг между соседними зданиями внутри квартала. */
const PLOT = 6.8;

/** Зданий вдоль стороны квартала. */
const BLOCK = 4;

/** Ширина улицы. */
const ROAD_WIDTH = 4.6;

/** Шаг кварталов: квартал плюс улица. */
const BLOCK_PITCH = BLOCK * PLOT + ROAD_WIDTH;

/** Ширина тротуара по краю улицы. */
const SIDEWALK = 1.1;

/** Сколько зданий с каждой стороны центра занимает площадь. */
const PLAZA_SPAN = 2;
const PLAZA_MIN = 1;

const MAX_BLOCK_RING = 12;

/**
 * Описания зданий. Объявляются до расчёта габаритов: размеры выводятся
 * из настоящей геометрии, а не задаются числом.
 */
const MODELS = defineModels();

/** Наибольший габарит здания по ширине и глубине, считается из геометрии. */
export const MAX_FOOTPRINT = measureMaxFootprint();

/** Пространство, остающееся между соседними зданиями внутри квартала. */
export const PLOT_GAP = PLOT - MAX_FOOTPRINT;

export const CELL = BLOCK_PITCH;
export const ROAD_OFFSET = ROAD_WIDTH / 2;

export { BLOCK, BLOCK_PITCH, ROAD_WIDTH, SIDEWALK, PLOT };

/** Есть ли у заявки свободные участки. */
function hasFree(request) {
  return request.slots.some((slot) => !slot);
}

/**
 * Список улиц для города из `rings` колец кварталов.
 *
 * Улица идёт по границе между соседними кварталами, поэтому её осевая
 * смещена от границы на половину ширины.
 *
 * axis — вдоль какой оси тянется полоса:
 *   'z' — улица идёт вдоль оси z,
 *   'x' — вдоль оси x.
 */
/**
 * Улицы, покрывающие застроенную часть города.
 *
 * reach — полуразмеры застройки по осям. Улица идёт вдоль одной оси и
 * достаёт только до краёв города по другой: иначе поперёчные улицы
 * уходят в пустую траву длинными хвостами.
 *
 * axis — вдоль какой оси тянется полоса:
 *   'z' — улица идёт вдоль оси z,
 *   'x' — вдоль оси x.
 */
export function roadsFor(reach) {
  const roads = [];
  const limit = Math.ceil(Math.max(reach.x, reach.z) / BLOCK_PITCH) + 1;

  for (let k = -limit; k <= limit; k += 1) {
    // Улица проходит по границе между кварталами k и k+1. Граница
    // центрированного квартала смещена, поэтому и осевая улицы тоже.
    const offset = (k + 0.5) * BLOCK_PITCH - ROAD_WIDTH / 2;

    // Улица вдоль z нужна только если справа и слева от неё есть застройка
    if (Math.abs(offset) <= reach.x + ROAD_WIDTH) {
      roads.push({
        axis: 'z', x: offset, z: 0,
        width: ROAD_WIDTH,
        length: (reach.z + ROAD_WIDTH) * 2,
      });
    }

    if (Math.abs(offset) <= reach.z + ROAD_WIDTH) {
      roads.push({
        axis: 'x', x: 0, z: offset,
        width: ROAD_WIDTH,
        length: (reach.x + ROAD_WIDTH) * 2,
      });
    }
  }

  return roads;
}

/**
 * Спиральная развёртка кварталов от центра наружу.
 * Кварталы выдаются по одному и никогда не повторяются.
 */
function* spiralBlocks() {
  yield { bx: 0, bz: 0 };

  for (let ring = 1; ring <= MAX_BLOCK_RING; ring += 1) {
    for (let x = -ring; x <= ring; x += 1) yield { bx: x, bz: -ring };
    for (let z = -ring + 1; z <= ring; z += 1) yield { bx: ring, bz: z };
    for (let x = ring - 1; x >= -ring; x -= 1) yield { bx: x, bz: ring };
    for (let z = ring - 1; z >= -ring + 1; z -= 1) yield { bx: -ring, bz: z };
  }
}

/** Смещение начала квартала: центр города делит центральный квартал пополам. */
const BLOCK_ORIGIN = -(BLOCK * PLOT) / 2;

/**
 * Все места под здания: кварталы по спирали, внутри квартала — рядами.
 * Центральные места центрального квартала оставлены под площадь.
 */
function* spiralPlots() {
  for (const { bx, bz } of spiralBlocks()) {
    const originX = bx * BLOCK_PITCH + BLOCK_ORIGIN;
    const originZ = bz * BLOCK_PITCH + BLOCK_ORIGIN;

    for (let sz = 0; sz < BLOCK; sz += 1) {
      for (let sx = 0; sx < BLOCK; sx += 1) {
        const inPlaza = bx === 0 && bz === 0
          && sx >= PLAZA_MIN && sx < PLAZA_MIN + PLAZA_SPAN
          && sz >= PLAZA_MIN && sz < PLAZA_MIN + PLAZA_SPAN;
        if (inPlaza) continue;

        yield {
          x: originX + sx * PLOT + PLOT / 2,
          z: originZ + sz * PLOT + PLOT / 2,
        };
      }
    }
  }
}

/**
 * Раскладка растёт постепенно и не пересобирается заново.
 *
 * Раньше позиции всех зданий вычислялись заново по количеству зданий каждого
 * типа. Из-за этого постройка одной фермы сдвигала все дома: игрок видел, как
 * жилой квартал переползает. Здесь место каждого здания запоминается навсегда,
 * а новым зданиям выдаются только свободные участки.
 */
class CityLayout {
  constructor() {
    this.plots = spiralPlots();
    this.slots = new Map(); // тип здания -> [{ x, z, index }]
    this.pending = [];       // заявки на участки, ждущие очереди
  }

  /**
   * Заявляет, что типу здания нужны участки в диапазоне [from, to).
   * Участки выдаются не сразу, а в общей очереди — иначе здания
   * выстраивались бы сплошными районами по типу: квартал домов, рядом
   * квартал ферм. Настоящий город смешанный.
   *
   * Возвращает массив, который будет заполнен после flush().
   */
  request(key, from, to) {
    const slots = this.slots.get(key) ?? [];

    for (let i = from; i < to; i += 1) slots[i] ??= null;

    this.pending.push({ key, from, to, slots });
    this.slots.set(key, slots);
    return slots;
  }

  /**
   * Раздаёт заявленные участки по кругу: каждый тип в раунде получает
   * ровно один, поэтому типы перемежаются. Заявка, которой хватило,
   * выпадает из круга.
   */
  flush() {
    let active = this.pending.filter((req) => hasFree(req));

    while (active.length > 0) {
      let filled = 0;

      for (const req of active) {
        const index = req.slots.findIndex((slot) => !slot);
        if (index === -1) continue;

        // next() отдаёт обёртку { value, done }, а сам участок лежит в value
        const plot = this.plots.next()?.value;
        if (!plot) break; // город вырос за пределы сетки

        req.slots[index] = { x: plot.x, z: plot.z, index };
        filled += 1;
      }

      // Признак остановки — ноль участков за раунд. Проверять, что круг
      // не уменьшился, нельзя: при единственной заявке он остаётся
      // прежним, пока есть свободные участки.
      if (filled === 0) break;
      active = active.filter(hasFree);
    }

    this.pending = [];
    return this;
  }

  /** Самая дальняя занятая позиция — по ней отводится камера. */
  radius() {
    let max = BLOCK_PITCH / 2;
    for (const slots of this.slots.values()) {
      for (const slot of slots) {
        if (!slot) continue;
        const distance = Math.hypot(slot.x, slot.z);
        if (Number.isFinite(distance)) max = Math.max(max, distance);
      }
    }
    return max;
  }

  /**
   * Полуразмеры застроенной области по каждой оси отдельно.
   *
   * Радиус считается по диагонали и заканчивается у первого здания в
   * дальнем углу — улицы по нему выходят далеко за застройку. Для улиц
   * нужен прямоугольный размер.
   */
  extent() {
    let x = 0;
    let z = 0;

    for (const slots of this.slots.values()) {
      for (const slot of slots) {
        if (!slot) continue;
        if (Number.isFinite(slot.x)) x = Math.max(x, Math.abs(slot.x));
        if (Number.isFinite(slot.z)) z = Math.max(z, Math.abs(slot.z));
      }
    }

    return { x: Math.max(x, BLOCK_PITCH / 2), z: Math.max(z, BLOCK_PITCH / 2) };
  }
}

// ---------------------------------------------------------------------------
// Описания зданий: геометрия и материал каждой части
// ---------------------------------------------------------------------------

function fallbackModel() {
  const geometry = new THREE.BoxGeometry(4.2, 2.6, 4.2);
  geometry.translate(0, 1.3, 0);
  return { parts: [{ geometry, color: 0x9a8f7a }] };
}

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
        { geometry: new THREE.ConeGeometry(3.2, 2.4, 4), color: 0x7a3f2a, offsetY: 4.4 },
        { ...box(1.5, 0.9, 0.12, 0xffdca0, 2.0), window: true },
        { ...box(0.12, 0.9, 1.5, 0xffdca0, 2.0), window: true },
      ],
    },
    farms: {
      parts: [
        box(5.4, 2.6, 4.0, 0x8d5a33),
        { geometry: new THREE.ConeGeometry(3.2, 1.8, 4), color: 0x5d3a22, offsetY: 3.5 },
        box(6.2, 0.14, 5.0, 0x6f8f3a, 0.07), // поле
      ],
    },
    lumberMills: {
      parts: [
        box(5.0, 2.4, 3.8, 0x7d5a38),
        { geometry: new THREE.ConeGeometry(2.9, 1.8, 4), color: 0x4a3524, offsetY: 3.3 },
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
        { geometry: new THREE.BoxGeometry(6.2, 0.22, 5.0), color: 0x8f4d33, offsetY: 3.5 },
        { ...box(1.2, 1.8, 0.12, 0xffdca0, 1.5), window: true },
      ],
    },
  };
}

// ---------------------------------------------------------------------------

export class CityView {
  constructor(world, rng) {
    this.world = world;
    this.rng = rng;
    this.root = new THREE.Group();
    this.world.add(this.root);

    this.models = MODELS;
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

    for (const key of VISUAL_KEYS) {
      const target = buildings[key] ?? 0;
      const current = this.counts[key] ?? 0;
      if (current === target) continue;

      if (target > current) additions.push({ key, from: current, to: target });
      this.counts[key] = target;
    }

    if (additions.length === 0) return this.radius;

    // Сначала все типы заявляют нужное число участков, потом участки
    // раздаются по кругу: иначе здания шли бы сплошными районами.
    const requests = additions.map((add) => ({
      ...add,
      slots: this.layout.request(add.key, add.from, add.to),
    }));
    this.layout.flush();

    for (const { key, from, to, slots } of requests) {
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
    const windowOffset = new THREE.Vector3(0, 0, MAX_FOOTPRINT / 2 + 0.1);

    // Внутри квартала дома стоят вплотную, поэтому разброс ограничен
    // зазором между участками: иначе соседи наезжали бы друг на друга.
    const spread = Math.max(0, Math.min(0.5, PLOT_GAP / 2 - 0.2));

    for (let i = from; i < to; i += 1) {
      const slot = slots[i];
      if (!slot) break;

      // Ориентация и небольшой разброс считаются от индекса здания, а не от
      // случайного числа: иначе при каждой перестройке дома прыгали бы
      const facing = Math.floor(hash(key, slot.index, 1) * 4) * (Math.PI / 2);
      const jitter = hash(key, slot.index, 2);

      position.set(
        slot.x + (jitter - 0.5) * spread,
        0,
        slot.z + (jitter - 0.5) * spread,
      );
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

    // У зданий без своей модели — простой куб, чтобы новые типы не ломали сцену
    const model = this.models[key] ?? fallbackModel();
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
   * Улицы между кварталами, тротуары по их краям и площадь в центре.
   *
   * Тротуар — та же полоса, но шире и светлее; проезжая часть ложится
   * поверх него. Одна полоса вместо голой дороги читается как улица,
   * а не как вырезанная в земле канава.
   *
   * Все полосы склеиваются в две геометрии — тротуары и проезжую часть.
   *
   * Улицы пересобираются вместе с застройкой, поэтому их ресурсы
   * освобождаются здесь же — иначе каждый ход оставлял бы в видеокарте
   * новую геометрию.
   */
  #rebuildRoads() {
    this.#disposeRoads();

    this.radius = this.layout.radius();
    if (!Number.isFinite(this.radius)) return;

    const extent = this.layout.extent();
    const roads = roadsFor(extent);

    const sidewalkWidth = roads.map((road) => ({
      ...road,
      width: road.width + SIDEWALK * 2,
    }));

    this.sidewalkMesh = new THREE.Mesh(
      buildRoadGeometry(sidewalkWidth),
      new THREE.MeshStandardMaterial({ color: COLOR.sidewalk, roughness: 0.95, metalness: 0 }),
    );
    this.sidewalkMesh.position.y = 0.015;
    this.sidewalkMesh.receiveShadow = true;

    this.roadMesh = new THREE.Mesh(
      buildRoadGeometry(roads),
      new THREE.MeshStandardMaterial({ color: COLOR.road, roughness: 0.95, metalness: 0 }),
    );
    this.roadMesh.position.y = 0.03;
    this.roadMesh.receiveShadow = true;

    this.root.add(this.sidewalkMesh, this.roadMesh);

    this.#addCentralPlaza();
  }

  /**
   * Площадь в центре города.
   *
   * Занимает место, оставленное под неё в центральном квартале, поэтому
   * здания туда не встают.
   */
  #addCentralPlaza() {
    // Площадь занимает середину центрального квартала: четыре отложенных
    // места образуют квадрат со стороной 2 * PLOT, круг в него вписывается
    const radius = PLOT * 0.95;
    const geometry = new THREE.CircleGeometry(radius, 28);
    geometry.rotateX(-Math.PI / 2);

    this.plazaMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: COLOR.plaza, roughness: 0.9, metalness: 0 }),
    );
    this.plazaMesh.position.y = 0.035;
    this.plazaMesh.receiveShadow = true;

    this.root.add(this.plazaMesh);
  }

  #disposeRoads() {
    for (const key of ['sidewalkMesh', 'roadMesh', 'plazaMesh']) {
      const node = this[key];
      if (!node) continue;

      this.root.remove(node);
      node.geometry.dispose();
      node.material.dispose();
      this[key] = null;
    }
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
 * Склеивает полосы дорог в одну геометрию.
 *
 * Каждая полоса — четыре вершины и два треугольника. При сотне полос это
 * по-прежнему один вызов отрисовки вместо сотни.
 */
function buildRoadGeometry(roads) {
  const positions = [];
  const normals = [];
  const indices = [];
  let offset = 0;

  for (const road of roads) {
    const alongZ = road.axis === 'z';
    const halfWidth = road.width / 2;
    const halfLength = road.length / 2;

    // Смещение поперёк полосы и вдоль неё
    const across = alongZ ? { x: halfWidth, z: 0 } : { x: 0, z: halfWidth };
    const along = alongZ ? { x: 0, z: halfLength } : { x: halfLength, z: 0 };
    const cx = alongZ ? road.x : 0;
    const cz = alongZ ? 0 : road.z;

    const corners = [
      { x: cx - across.x - along.x, z: cz - across.z - along.z },
      { x: cx + across.x - along.x, z: cz + across.z - along.z },
      { x: cx + across.x + along.x, z: cz + across.z + along.z },
      { x: cx - across.x + along.x, z: cz - across.z + along.z },
    ];

    for (const corner of corners) {
      positions.push(corner.x, 0, corner.z);
      normals.push(0, 1, 0);
    }

    indices.push(offset, offset + 2, offset + 1, offset, offset + 3, offset + 2);
    offset += 4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
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

/**
 * Наибольший габарит здания: измеряется по склеенной геометрии каждого
 * типа. Определения функций hoisting'ом доступны выше по файлу.
 */
function measureMaxFootprint() {
  let max = 0;

  for (const model of Object.values(MODELS)) {
    const solid = model.parts.filter((part) => !part.window);
    const geometry = mergeGeometries(solid);

    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    max = Math.max(max, size.x, size.z);

    geometry.dispose();
  }

  return max;
}