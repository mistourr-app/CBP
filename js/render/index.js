// ============================================================================
// render/index.js — сборка 3D-сцены и игрового цикла отрисовки.
//
// Если WebGL недоступен, модуль не бросает исключение, а возвращает пустой
// контроллер: в прототипе падение THREE означало, что не запускалась даже
// текстовая часть игры.
// ============================================================================

import { Rng } from '../core/rng.js';
import { CityView } from './city.js';
import { Environment } from './environment.js';
import { nightAmount } from './palette.js';
import { SceneView } from './scene.js';

const NOOP_RENDERER = {
  onCityChanged() {},
  dispose() {},
};

export function startRender({ canvas, session }) {
  if (!canvas || !hasWebGL()) {
    document.body.classList.add('no-webgl');
    console.warn('WebGL недоступен — игра работает без 3D-фона');
    return NOOP_RENDERER;
  }

  let scene;
  try {
    scene = new SceneView(canvas);
  } catch (error) {
    document.body.classList.add('no-webgl');
    console.warn('Не удалось создать WebGL-контекст — игра работает без 3D-фона', error);
    return NOOP_RENDERER;
  }

  // Отдельный генератор: расход случайных чисел на окружение не должен
  // сдвигать случайность самой игры
  const decorRandom = new Rng(0x5eed1234);
  const environment = new Environment(scene.world, decorRandom.float);
  const city = new CityView(scene.world, decorRandom.float);

  const controller = {
    onCityChanged() {
      const radius = city.sync(session.state.buildings);
      scene.fitTo(radius + 14);
      scene.setShadowExtent(radius + 30);
      environment.setSeason(session.state.season.id);
    },
    dispose() {
      stop();
      city.dispose();
      environment.dispose();
      scene.dispose();
    },
  };

  controller.onCityChanged();

  // -- Цикл отрисовки -------------------------------------------------------

  let frame = 0;
  let running = true;

  const loop = () => {
    if (!running) return;
    frame = requestAnimationFrame(loop);

    const dt = Math.min(scene.clock.getDelta(), 0.1);

    scene.update(dt);
    city.setNight(nightAmount(scene.timeOfDay));
    environment.setWinter(session.state.season.id === 'winter', scene.dayLight);
    environment.update(dt, scene.dayLight);
    scene.render();
  };

  const start = () => {
    if (frame) return;
    scene.clock.getDelta(); // сбрасывает накопленное время паузы
    frame = requestAnimationFrame(loop);
  };

  const stop = () => {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  const onResize = () => scene.resize();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // Скрытая вкладка не должна молотить видеокарту
  const onVisibility = () => {
    if (document.hidden) stop();
    else { running = true; start(); }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const originalDispose = controller.dispose.bind(controller);
  controller.dispose = () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    originalDispose();
  };

  start();
  return controller;
}

function hasWebGL() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
      (probe.getContext('webgl2') || probe.getContext('webgl')),
    );
  } catch {
    return false;
  }
}