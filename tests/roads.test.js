// ============================================================================
// Город из кварталов: улицы не должны пересекать застройку.
//
// Первая версия пустила дороги между каждым зданием, и город читался как
// ряд полосок. Теперь здания стоят вплотную внутри квартала, а улица
// проходит между кварталами. Проверяем именно это.
// ============================================================================

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as THREE from '../vendor/three.module.min.js';
import { Rng } from '../js/core/rng.js';
import {
  BLOCK_PITCH,
  CityView,
  MAX_FOOTPRINT,
  PLOT,
  PLOT_GAP,
  ROAD_WIDTH,
  roadsFor,
} from '../js/render/city.js';

function makeCity(buildings = {}) {
  const city = new CityView(new THREE.Group(), new Rng(1));
  city.sync(buildings);
  return city;
}

function instances(mesh) {
  const matrix = new THREE.Matrix4();
  const out = [];
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, matrix);
    out.push(new THREE.Vector3().setFromMatrixPosition(matrix));
  }
  return out;
}

/**
 * Габарит типа здания по настоящей геометрии: только ширина и глубина.
 * Высота в габарит по земле не входит — иначе храм с высоким шпилем
 * считался бы шире участка.
 */
function footprintOf(key) {
  const city = makeCity({ [key]: 1 });
  const mesh = city.meshes.get(key);
  if (!mesh) return 0;
  mesh.geometry.computeBoundingBox();
  const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
  return Math.max(size.x, size.z);
}

/** Расстояние от координаты до ближайшей осевой улицы. */
function distanceToNearestStreet(coordinate) {
  // Осевые улицы проходят по границам центрированных кварталов:
  // (k + 0.5) * BLOCK_PITCH, смещённые на половину проезжей части
  const lane = (coordinate + ROAD_WIDTH / 2) / BLOCK_PITCH - 0.5;
  return Math.abs(coordinate - (Math.round(lane) + 0.5) * BLOCK_PITCH + ROAD_WIDTH / 2);
}

const SAMPLE = {
  houses: 30, farms: 8, lumberMills: 5, quarries: 4,
  markets: 3, taverns: 3, school: 2, guard: 2, guard: 3,
};

describe('улицы не пересекают застройку', () => {
  it('ни одно здание не стоит на улице', () => {
    const city = makeCity(SAMPLE);
    let collisions = 0;
    const details = [];

    for (const [key, mesh] of city.meshes) {
      const half = footprintOf(key) / 2;

      for (const position of instances(mesh)) {
        const dx = distanceToNearestStreet(position.x);
        const dz = distanceToNearestStreet(position.z);

        if (dx < half - 0.01 || dz < half - 0.01) {
          collisions += 1;
          if (details.length < 5) {
            details.push(`${key} в (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`);
          }
        }
      }
    }

    assert.equal(collisions, 0, `зданий на улице: ${collisions}. ${details.join('; ')}`);
  });

  it('улица шире проезжей части и уже квартала', () => {
    assert.ok(ROAD_WIDTH > 3, `улица слишком узкая: ${ROAD_WIDTH}`);
    assert.ok(ROAD_WIDTH < BLOCK_PITCH, 'улица шире квартала');
  });

  it('здание помещается в участок', () => {
    for (const key of Object.keys(SAMPLE)) {
      assert.ok(footprintOf(key) <= PLOT + 0.01,
        `${key}: ширина ${footprintOf(key).toFixed(2)} больше участка ${PLOT}`);
    }
    assert.ok(MAX_FOOTPRINT <= PLOT, 'габарит здания больше участка');
  });

  it('соседние здания внутри квартала стоят вплотную', () => {
    // Именно это отличает квартал от разреженной сетки
    assert.ok(PLOT_GAP < 1.2, `между домами слишком большой зазор: ${PLOT_GAP}`);
    assert.ok(PLOT_GAP >= 0, 'здания перекрываются');
  });
});

describe('кварталы', () => {
  it('застройка собирается в плотные группы, а не в равномерную решётку', () => {
    const city = makeCity({ houses: 16 });

    // В одном квартале 4×4 места: расстояния между соседями должны
    // повторяться, а не быть произвольными
    const positions = instances(city.meshes.get('houses'))
      .map((p) => `${Math.round(p.x)}:${Math.round(p.z)}`)
      .sort();

    assert.equal(new Set(positions).size, positions.length, 'здания совпали');

    const xs = [...new Set(positions.map((p) => Number(p.split(':')[0])))].sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);

    assert.ok(gaps.length > 0, 'нет данных о промежутках');
    for (const gap of gaps) {
      assert.ok(Math.abs(gap - PLOT) < 1 || Math.abs(gap - (PLOT + ROAD_WIDTH)) < 1,
        `промежуток между домами неожиданный: ${gap}`);
    }
  });

  it('центр города оставлен под площадь', () => {
    const city = makeCity({ houses: 30 });
    const near = instances(city.meshes.get('houses'))
      .filter((p) => Math.hypot(p.x, p.z) < PLOT);

    // В центральном квартале 12 мест из 16, центральные четыре заняты
    // площадью. Ближайшие к нулю здания стоят за её краем.
    for (const position of near) {
      assert.ok(Math.abs(position.x) > 3 && Math.abs(position.z) > 3,
        `здание стоит в центре площади: (${position.x}, ${position.z})`);
    }
  });

  it('типы зданий перемежаются, а не собраны в отдельные районы', () => {
    const city = makeCity({ houses: 24, farms: 12, taverns: 6 });

    const kindsAt = [];
    for (const [key, mesh] of city.meshes) {
      for (const position of instances(mesh)) {
        kindsAt.push({ key, ring: Math.round(Math.hypot(position.x, position.z)) });
      }
    }

    // В одном квартале должны встречаться разные типы. Если все здания
    // идут подряд по типам, первые 12 участков достанутся только домам.
    const byRing = new Map();
    for (const item of kindsAt) {
      const bucket = Math.floor(item.ring / 10);
      byRing.set(bucket, (byRing.get(bucket) ?? new Set()).add(item.key));
    }

    const mixed = [...byRing.values()].filter((set) => set.size > 1);
    assert.ok(mixed.length > 0, 'все здания одного типа оказались рядом');
  });

  it('постройка нового здания не двигает уже построенные', () => {
    const city = makeCity({ houses: 10 });
    const before = instances(city.meshes.get('houses')).map((p) => p.toArray());

    city.sync({ houses: 30, farms: 4 });
    const after = instances(city.meshes.get('houses')).map((p) => p.toArray());

    assert.deepEqual(after.slice(0, before.length), before);
  });
});

describe('сетка улиц', () => {
  it('улицы идут по границам кварталов', () => {
    const roads = roadsFor({ x: 80, z: 80 });
    assert.ok(roads.length > 0, 'улиц не построено');

    for (const road of roads) {
      const lane = road.axis === 'z' ? road.x : road.z;
      const inBlocks = Math.abs(lane / BLOCK_PITCH - 0.5) < 0.01
        || Math.abs(lane / BLOCK_PITCH + 0.5) < 0.01;
      assert.ok(!inBlocks, `улица по центру квартала: ${lane}`);
      assert.equal(road.width, ROAD_WIDTH);
    }
  });

  it('улицы не идут через центр города', () => {
    const roads = roadsFor({ x: 80, z: 80 });
    const lanes = roads.map((r) => (r.axis === 'z' ? r.x : r.z));

    assert.ok(!lanes.includes(0), 'улица проходит через площадь');
    assert.ok(lanes.some((l) => l < 0) && lanes.some((l) => l > 0),
      'улицы не сходятся вокруг центра');
  });

  it('улицы не уходят за пределы застройки', () => {
    // Застройка вытянута вдоль x: улицы вдоль z не нужны справа
    const reach = { x: 70, z: 30 };
    const roads = roadsFor(reach);

    for (const road of roads) {
      if (road.axis === 'z') {
        assert.ok(road.length <= (reach.z + ROAD_WIDTH) * 2 + 0.01,
          `улица вдоль z длиннее застройки: ${road.length}`);
        assert.ok(Math.abs(road.x) <= reach.x + ROAD_WIDTH, `улица далеко: ${road.x}`);
      } else {
        assert.ok(road.length <= (reach.x + ROAD_WIDTH) * 2 + 0.01,
          `улица вдоль x длиннее застройки: ${road.length}`);
        assert.ok(Math.abs(road.z) <= reach.z + ROAD_WIDTH, `улица далеко: ${road.z}`);
      }
    }
  });

  it('улиц нет там, где нет застройки', () => {
    const roads = roadsFor({ x: 70, z: 20 });

    const farVerticals = roads.filter(
      (r) => r.axis === 'z' && Math.abs(r.x) > 70 + ROAD_WIDTH,
    );
    const farHorizontals = roads.filter(
      (r) => r.axis === 'x' && Math.abs(r.z) > 20 + ROAD_WIDTH,
    );

    assert.equal(farVerticals.length, 0, 'вертикальная улица без застройки');
    assert.equal(farHorizontals.length, 0, 'горизонтальная улица без застройки');
  });

  it('улиц заметно меньше, чем зданий', () => {
    const city = makeCity(SAMPLE);
    const buildings = Object.values(SAMPLE).reduce((a, b) => a + b, 0);
    const extent = city.layout.extent();
    const roads = roadsFor(extent).length;

    assert.ok(roads < buildings,
      `улиц ${roads} для ${buildings} зданий — это снова сетка, а не кварталы`);
  });

  it('улицы покрывают застройку', () => {
    const city = makeCity(SAMPLE);
    const extent = city.layout.extent();
    const roads = roadsFor(extent);

    for (const [key, mesh] of city.meshes) {
      for (const position of instances(mesh)) {
        const hasStreetX = roads.some((r) => r.axis === 'z');
        const hasStreetZ = roads.some((r) => r.axis === 'x');
        assert.ok(hasStreetX && hasStreetZ, `${key}: нет улиц`);
      }
    }
  });
});