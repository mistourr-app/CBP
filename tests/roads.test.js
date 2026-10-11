// ============================================================================
// Дороги и застройка не должны пересекаться.
//
// В прототипе дороги шли крестом через центр, а клетки застройки стояли в
// начале координат. Поэтому здания в центральной строке и столбце — а это
// всегда первая постройка — оказывались прямо на дороге.
// ============================================================================

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as THREE from '../vendor/three.module.min.js';
import { Rng } from '../js/core/rng.js';
import { CityView, CELL, ROAD_WIDTH, roadsFor } from '../js/render/city.js';

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

/** Полуразмер пятна застройки: половина наибольшего здания. */
const HALF_PLOT = (CELL - ROAD_WIDTH) / 2;

/** Есть ли у здания габарит шире дороги. */
function footprintOf(key) {
  const city = makeCity({ [key]: 1 });
  const mesh = city.meshes.get(key);
  if (!mesh) return 0;
  mesh.geometry.computeBoundingBox();
  const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
  return Math.max(size.x, size.z);
}

describe('дороги не пересекают застройку', () => {
  const sample = {
    houses: 14, farms: 6, lumberMills: 4, quarries: 3,
    markets: 2, temples: 2, schools: 1, walls: 2, towers: 2,
  };

  it('ни одно здание не стоит на дороге', () => {
    const city = makeCity(sample);
    let collisions = 0;
    const details = [];

    for (const [key, mesh] of city.meshes) {
      const half = footprintOf(key) / 2;

      for (const position of instances(mesh)) {
        // Расстояние от центра здания до ближайшей дороги по каждой оси.
        // Дороги идут по границам клеток: координата (k + 0.5) * CELL.
        const dx = distanceToNearestRoad(position.x);
        const dz = distanceToNearestRoad(position.z);

        // Здание пересекает дорогу, если до неё меньше его габарита
        if (dx < half - 0.01 || dz < half - 0.01) {
          collisions += 1;
          if (details.length < 5) details.push(`${key} в (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`);
        }
      }
    }

    assert.equal(collisions, 0, `зданий на дороге: ${collisions}. ${details.join('; ')}`);
  });

  it('дорога помещается в промежуток между клетками', () => {
    assert.ok(ROAD_WIDTH > 2, `дорога слишком узкая: ${ROAD_WIDTH}`);
    assert.ok(ROAD_WIDTH < CELL, 'дорога шире клетки');
    assert.ok(HALF_PLOT > 1.5, `на клетке мало места под здание: ${HALF_PLOT * 2}`);
  });

  it('самое широкое здание помещается между дорогами', () => {
    for (const key of Object.keys(sample)) {
      const size = footprintOf(key);
      assert.ok(size <= CELL - ROAD_WIDTH + 0.01,
        `${key}: ширина ${size.toFixed(2)} не влезает в промежуток ${(CELL - ROAD_WIDTH).toFixed(2)}`);
    }
  });
});

describe('сетка дорог', () => {
  it('дороги идут по границам клеток, а не по их центрам', () => {
    const roads = roadsFor(2);
    assert.ok(roads.length > 0, 'дорог не построено');

    for (const road of roads) {
      // Положение полосы задаётся только одной координатой: у вертикальной
      // дороги это x, у горизонтальной — z. Вторая равна нулю и центром
      // пролёта не является.
      const lane = road.axis === 'z' ? road.x : road.z;

      const onCellCenter = Math.abs(lane % CELL) < 1e-9;
      assert.ok(!onCellCenter, `дорога через центр клетки: ${lane}`);

      // И наоборот: это ровно середина промежутка между клетками
      const cells = lane / CELL;
      assert.ok(Math.abs(cells - Math.round(cells)) > 0.49,
        `дорога не между клетками: ${lane}`);

      assert.equal(road.width, ROAD_WIDTH);
    }
  });

  it('дороги образуют сетку: пересекаются по обе стороны от центра', () => {
    const roads = roadsFor(3);
    const vertical = roads.filter((r) => r.axis === 'z');
    const horizontal = roads.filter((r) => r.axis === 'x');

    assert.ok(vertical.length > 0 && horizontal.length > 0, 'нет дорог одного из направлений');

    // Через центр дороги не идут — там площадь. Но с двух сторон от
    // центра сетка должна смыкаться, иначе город разорван надвое.
    for (const [name, list, axis] of [
      ['вертикальные', vertical, 'x'],
      ['горизонтальные', horizontal, 'z'],
    ]) {
      const offsets = list.map((r) => r[axis]);
      assert.ok(offsets.some((v) => v < 0), `${name}: нет дороги слева/сверху`);
      assert.ok(offsets.some((v) => v > 0), `${name}: нет дороги справа/снизу`);
      assert.ok(!offsets.includes(0), `${name}: дорога проходит через центр`);
    }
  });

  it('сетка расширяется вместе с городом', () => {
    const small = roadsFor(1).length;
    const big = roadsFor(4).length;
    assert.ok(big > small, `сетка не выросла: ${small} → ${big}`);
  });

  it('дороги покрывают застройку с запасом', () => {
    const city = makeCity({ houses: 30, farms: 8, quarries: 4 });
    const roads = roadsFor(Math.ceil(city.radius / CELL) + 1);

    for (const [key, mesh] of city.meshes) {
      for (const position of instances(mesh)) {
        const coveredX = roads.some((r) => r.axis === 'z' && Math.abs(position.x - r.x) <= CELL);
        const coveredZ = roads.some((r) => r.axis === 'x' && Math.abs(position.z - r.z) <= CELL);
        assert.ok(coveredX && coveredZ, `${key} вне сетки дорог: (${position.x}, ${position.z})`);
      }
    }
  });
});

/** Расстояние от координаты до ближайшей дороги, идущей вдоль другой оси. */
function distanceToNearestRoad(coordinate) {
  // Дороги расположены в (k + 0.5) * CELL
  const nearest = Math.round(coordinate / CELL - 0.5) + 0.5;
  return Math.abs(coordinate - nearest * CELL);
}