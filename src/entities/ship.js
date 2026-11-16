import { SHIP, SHIELD } from '../data/tuning.js';

/** Upgradeable stats; they persist across lives for the whole run. */
export function createShipStats() {
  return {
    spread: 0, // extra barrel pairs
    heatMul: 1,
    coolMul: 1,
    shieldMax: SHIELD.max,
    shieldRegenMul: 1,
    pierce: 0,
    jumpCooldownMul: 1,
    safeJump: false,
    thrustMul: 1,
    magnet: 0, // pickup attraction radius, px
    missileSpeedMul: 1,
  };
}

export function createShip() {
  return {
    x: 0, y: 0, prevX: 0, prevY: 0,
    angle: -Math.PI / 2, prevAngle: -Math.PI / 2,
    vx: 0, vy: 0,
    angVel: 0, // rad/s
    radius: SHIP.radius,
    boosting: false,
    invulnerable: 0, // seconds remaining
    alive: true,
    // weapon
    fireCooldown: 0,
    fireQueued: false, // a tap during cooldown fires as soon as it ends
    heat: 0,
    overheated: false,
    // abilities
    energy: SHIELD.max,
    shieldActive: false,
    shieldRegenDelay: 0,
    jump: null, // { phase: 'out' | 'in', t } while in hyperspace
    jumpCooldown: 0,
    frosted: false,
    buffs: {}, // pickup kind → seconds remaining
  };
}

export function resetShip(ship, world, stats) {
  Object.assign(ship, createShip(), {
    x: world.width / 2, y: world.height / 2,
    prevX: world.width / 2, prevY: world.height / 2,
    invulnerable: SHIP.invulnerableSeconds,
    energy: stats?.shieldMax ?? SHIELD.max,
  });
}
