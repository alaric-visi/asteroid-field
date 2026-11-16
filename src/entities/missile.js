import { MISSILE } from '../data/tuning.js';

export function createMissile(x, y, angle, speedMul = 1, pierce = 0) {
  return {
    x, y, prevX: x, prevY: y,
    vx: Math.cos(angle) * MISSILE.speed * speedMul,
    vy: Math.sin(angle) * MISSILE.speed * speedMul,
    life: MISSILE.lifeSeconds,
    trail: [],
    pierce, // further targets it may pass through
    hitIds: null, // targets already pierced (lazily a Set)
    dead: false,
  };
}
