// ============================================================================
// palette.js — цвета сцены по времени суток и сезону.
//
// Раньше освещение менялось рывками по остатку от деления номера дня, а цвета
// земли и неба были заданы константами. Здесь они вычисляются плавно.
// ============================================================================

import * as THREE from '../../vendor/three.module.min.js';

/** Ключевые кадры суток: 0 — полночь, 0.5 — полдень. */
const DAY_KEYS = [
  { t: 0.00, name: 'night',    skyTop: 0x050817, skyBottom: 0x0d1430, sun: 0x2a3a72, sunPower: 0.12, ambient: 0.10, star: 1.0 },
  { t: 0.22, name: 'dawn',     skyTop: 0x1d2a5c, skyBottom: 0xd98a5f, sun: 0xffb27a, sunPower: 0.65, ambient: 0.28, star: 0.35 },
  { t: 0.30, name: 'morning',  skyTop: 0x2b4a8f, skyBottom: 0x9fc4e8, sun: 0xfff0d4, sunPower: 1.05, ambient: 0.42, star: 0.0 },
  { t: 0.50, name: 'noon',     skyTop: 0x2b6ec4, skyBottom: 0xa8d4f0, sun: 0xfffaf0, sunPower: 1.25, ambient: 0.50, star: 0.0 },
  { t: 0.72, name: 'evening',  skyTop: 0x2b4a8f, skyBottom: 0xe0926a, sun: 0xffc38a, sunPower: 0.80, ambient: 0.30, star: 0.15 },
  { t: 0.80, name: 'dusk',     skyTop: 0x151d46, skyBottom: 0x6b3f6e, sun: 0x8f6bb5, sunPower: 0.30, ambient: 0.16, star: 0.6 },
  { t: 1.00, name: 'night',    skyTop: 0x050817, skyBottom: 0x0d1430, sun: 0x2a3a72, sunPower: 0.12, ambient: 0.10, star: 1.0 },
];

/** Цвета земли, травы и деревьев по сезонам. */
export const SEASON_COLORS = {
  spring: { ground: 0x4a7a2e, tree: 0x5aa03c, accent: 0x8fd14f },
  summer: { ground: 0x3f6f26, tree: 0x3f8a33, accent: 0x7ec850 },
  autumn: { ground: 0x6b6a32, tree: 0xc9873a, accent: 0xe0a03f },
  winter: { ground: 0xa8b8c4, tree: 0x4a5f4a, accent: 0xdcecf5 },
};

const COLOR_KEYS = ['skyTop', 'skyBottom', 'sun'];

function lerpColor(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

/**
 * Плавно интерполирует цвета между соседними ключами суток.
 * @param {number} phase 0..1 — фаза суток
 */
export function skyPalette(phase) {
  const t = ((phase % 1) + 1) % 1;

  let from = DAY_KEYS[0];
  let to = DAY_KEYS[DAY_KEYS.length - 1];

  for (let i = 0; i < DAY_KEYS.length - 1; i += 1) {
    if (t >= DAY_KEYS[i].t && t <= DAY_KEYS[i + 1].t) {
      from = DAY_KEYS[i];
      to = DAY_KEYS[i + 1];
      break;
    }
  }

  const span = to.t - from.t || 1;
  const local = (t - from.t) / span;

  const out = { name: local < 0.5 ? from.name : to.name, star: 0, sunPower: 0, ambient: 0 };
  for (const key of COLOR_KEYS) out[key] = lerpColor(from[key], to[key], local);
  out.sunPower = from.sunPower + (to.sunPower - from.sunPower) * local;
  out.ambient = from.ambient + (to.ambient - from.ambient) * local;
  out.star = from.star + (to.star - from.star) * local;

  return out;
}

/** Насколько сейчас темно: 1 — полночь, 0 — полдень. Используется для окон. */
export function nightAmount(phase) {
  return 1 - skyPalette(phase).sunPower;
}

export const COLOR = {
  water: 0x2f6fa8,
  waterDeep: 0x1d4a75,
  stone: 0x8d94a5,
  road: 0x39404f,
  plaza: 0x6b7280,
  soil: 0x5a4530,
};