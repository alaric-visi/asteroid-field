import { ASTEROID } from '../data/tuning.js';
import { ASTEROID_TYPES, sizeTier } from '../data/asteroidTypes.js';
import { hslToRgb } from '../core/color.js';

/** Colour defaults to a random pick from the type's palette. */
export function createAsteroid(game, { x, y, size, vx, vy, type, hue, sat, light, fromSplit = false }) {
  const rng = game.rng;
  const def = ASTEROID_TYPES[type];
  if (hue === undefined) {
    hue = rng.range(def.color.hue[0], def.color.hue[1]) / 360;
    sat = def.color.sat;
    light = def.color.light;
  }
  const hp = def.hp[sizeTier(size)];
  return {
    id: game.nextId++,
    x, y, prevX: x, prevY: y,
    vx, vy,
    size,
    type,
    hue, sat, light,
    rgb: hslToRgb(hue, sat, light),
    hp, maxHp: hp,
    // 3D tumble rates in rad/s — simulation-owned because collisions knock them.
    spin: {
      x: rng.signed(ASTEROID.spinJitter),
      y: rng.signed(ASTEROID.spinJitter),
      z: rng.signed(ASTEROID.spinJitter),
    },
    pulsePhase: rng.angle(),
    fromSplit, // born from a destroyed parent (renderers flash it)
    dead: false,
    age: 0,
    jitterTimer: rng.range(0.5, 1.5), // crystal drift changes
    entered: false, // comets: has it crossed into the screen yet?
  };
}
