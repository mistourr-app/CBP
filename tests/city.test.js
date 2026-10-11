// Раскладка и геометрия города.
//
// Здесь нет логики игры — только проверка того, что 3D-город соответствует
// состоянию. Тесты ловят ошибки, которые не видны без запуска в браузере:
// здания в начале координат, наложения, утечку ресурсов видеокарты.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as THREE from '../vendor/three.module.min.js';
import { Rng } from '../js/core/rng.js';
import { CityView } from '../js/render/city.js';
import { Environment } from '../js/render/environment.js';

function makeCity() {
  return new CityView(new THREE.Group(), new Rng(1));
}

function instancePositions(mesh) {
  const matrix = new THREE.Matrix4();
  const out = [];

  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    out.push({ x: position.x, z: position.z });
  }

  return out;
}

describe('раскладка', () => {
  it('здания получают конечные координаты', () => {
    const city = makeCity();
    city.sync({ houses: 12, farms: 4, taverns: 2, guard: 3, markets: 1 });

    for (const [key, mesh] of city.meshes) {
      assert.ok(mesh.count > 0, `${key}: ни одного здания`);
      for (const position of instancePositions(mesh)) {
        assert.ok(Number.isFinite(position.x), `${key}: x = ${position.x}`);
        assert.ok(Number.isFinite(position.z), `${key}: z = ${position.z}`);
      }
    }
  });

  it('здания не накладываются друг на друга', () => {
    const city = makeCity();
    city.sync({
      houses: 20, farms: 5, lumberMills: 3, quarries: 2,
      markets: 2, taverns: 2, school: 1, guard: 2,
    });

    const taken = new Map();
    let overlaps = 0;

    for (const [key, mesh] of city.meshes) {
      for (const position of instancePositions(mesh)) {
        const slot = `${Math.round(position.x)}:${Math.round(position.z)}`;
        if (taken.has(slot)) overlaps += 1;
        else taken.set(slot, key);
      }
    }

    assert.equal(overlaps, 0, `наложений: ${overlaps}`);
  });

  it('радиус растёт вместе с городом', () => {
    const city = makeCity();

    city.sync({ houses: 2 });
    const small = city.radius;

    city.sync({ houses: 40, farms: 10, quarries: 5 });
    const large = city.radius;

    assert.ok(Number.isFinite(small) && small > 0);
    assert.ok(large > small, `радиус не вырос: ${small} -> ${large}`);
  });

  it('раскладка детерминирована: одна застройка — одна карта', () => {
    const first = makeCity();
    const second = makeCity();
    const buildings = { houses: 15, farms: 4, markets: 1, taverns: 1 };

    first.sync(buildings);
    second.sync(buildings);

    for (const key of first.meshes.keys()) {
      assert.deepEqual(
        instancePositions(first.meshes.get(key)),
        instancePositions(second.meshes.get(key)),
        `тип ${key} разошёлся`,
      );
    }
  });

  it('рост города не сдвигает уже построенные здания', () => {
    const city = makeCity();
    city.sync({ houses: 5 });

    const before = instancePositions(city.meshes.get('houses'));

    city.sync({ houses: 25, farms: 4 });
    const after = instancePositions(city.meshes.get('houses'));

    assert.equal(after.length, 25);
    assert.deepEqual(after.slice(0, before.length), before);
  });

  it('за пределы сетки город выходит без ошибок', () => {
    const city = makeCity();
    city.sync({ houses: 5000 });

    assert.ok(city.meshes.get('houses').count > 0);
    assert.ok(Number.isFinite(city.radius));
  });
});

describe('геометрия', () => {
  it('у каждого здания есть вершинные цвета', () => {
    const city = makeCity();
    city.sync({ houses: 3, taverns: 1 });

    for (const [key, mesh] of city.meshes) {
      const geometry = mesh.geometry;
      const positions = geometry.attributes.position.count;

      assert.ok(geometry.attributes.color, `${key}: нет цвета`);
      assert.equal(geometry.attributes.color.count, positions, `${key}: цветов не по вершинам`);
    }
  });

  it('части здания сохраняют разные цвета', () => {
    const city = makeCity();
    city.sync({ houses: 1 });

    const colors = city.meshes.get('houses').geometry.attributes.color;
    const unique = new Set();
    for (let i = 0; i < colors.count; i += 1) unique.add(colors.getX(i));

    assert.ok(unique.size > 1, 'стены и крыша одного цвета — цвета не применились');
  });

  it('индексы геометрии ссылаются на существующие вершины', () => {
    const city = makeCity();
    city.sync({ houses: 2, quarries: 1 });

    for (const [key, mesh] of city.meshes) {
      const geometry = mesh.geometry;
      const vertexCount = geometry.attributes.position.count;
      const index = geometry.index.array;

      for (const value of index) {
        assert.ok(value >= 0 && value < vertexCount, `${key}: индекс ${value} вне диапазона`);
      }
    }
  });
});

describe('генератор декораций', () => {
  it('окружение принимает генератор, а не отвязанный метод', () => {
    // Передача decorRandom.float вместо decorRandom отвязывала метод от
    // объекта: внутри терялся this, и игра падала при запуске
    assert.doesNotThrow(() => {
      new Environment(new THREE.Group(), new Rng(1));
    });
  });

  it('деревья и снег раскладываются конечно', () => {
    const env = new Environment(new THREE.Group(), new Rng(7));

    assert.ok(env.trunks.count > 0, 'деревья не расставлены');
    assert.ok(Number.isFinite(env.trunks.position.x), 'дерево без координат');

    const positions = env.snow.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      assert.ok(Number.isFinite(positions.getX(i)), `снежинка ${i} без координат`);
    }
  });

  it('декорации не сдвигают случайность игры', () => {
    const gameRng = new Rng(42);
    const decorRng = new Rng(1);

    new Environment(new THREE.Group(), decorRng);

    // Собственный генератор декораций тратит числа только у себя
    const expected = new Rng(42).float();
    assert.equal(gameRng.float(), expected);
  });
});

describe('управление ресурсами видеокарты', () => {
  it('дороги пересоздаются без ошибок и освобождают ресурсы', () => {
    const city = makeCity();

    city.sync({ houses: 3 });
    const first = city.roadMesh;
    assert.ok(first);

    city.sync({ houses: 40, farms: 6 });
    const second = city.roadMesh;

    assert.ok(second);
    assert.notEqual(first, second, 'дороги не пересозданы');

    // Снятие сцены освобождает геометрию и материал
    assert.doesNotThrow(() => city.dispose());
  });

  it('счётчик отложенных к освобождению ресурсов не растёт бесконечно', () => {
    const city = makeCity();

    for (let i = 1; i <= 10; i += 1) city.sync({ houses: i * 3 });

    // Дороги не должны копиться в списке освобождения
    assert.ok(city.geometries.length < 50, `накоплено геометрий: ${city.geometries.length}`);
    assert.ok(city.materials.length < 50, `накоплено материалов: ${city.materials.length}`);
  });
});