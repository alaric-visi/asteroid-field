// Asteroid behaviours, damage and destruction. Type-specific rules come from
// data/asteroidTypes.js; this module interprets them.
import { ASTEROID, ASTEROID as A, HIT_STOP, PICKUP } from '../data/tuning.js';
import { ASTEROID_TYPES, COMET_SIZE, sizeTier } from '../data/asteroidTypes.js';
import { wrapDelta, wrapPosition } from '../core/math.js';
import { createAsteroid } from '../entities/asteroid.js';
import { resolveAsteroidCollisions } from './physics.js';
import { spawnBurst, spawnShockwave, addShake } from './effects.js';
import { registerKill } from './combo.js';
import { spawnPickup } from './pickups.js';

const WHITE = [255, 255, 255];

// ---- Spawning ----

/** Spawn a field asteroid at least `clearance` px (wrapped) from the ship. */
export function spawnFieldAsteroid(game, type, size, speed, clearance = 200) {
  const { rng, world, ship } = game;
  let x = 0, y = 0;
  for (let i = 0; i < 40; i++) {
    x = rng.next() * world.width;
    y = rng.next() * world.height;
    if (Math.hypot(wrapDelta(x - ship.x, world.width), wrapDelta(y - ship.y, world.height)) >= clearance) break;
  }
  const a = createAsteroid(game, { x, y, size, vx: rng.signed(speed), vy: rng.signed(speed), type });
  game.asteroids.push(a);
  return a;
}

/** A comet enters from a random edge and crosses the screen once. */
export function spawnComet(game) {
  const { rng, world } = game;
  const side = Math.floor(rng.next() * 4);
  const m = COMET_SIZE * 3;
  const start = [
    { x: -m, y: rng.next() * world.height },
    { x: world.width + m, y: rng.next() * world.height },
    { x: rng.next() * world.width, y: -m },
    { x: rng.next() * world.width, y: world.height + m },
  ][side];
  const tx = rng.range(0.25, 0.75) * world.width;
  const ty = rng.range(0.25, 0.75) * world.height;
  const d = Math.hypot(tx - start.x, ty - start.y);
  const speed = rng.range(320, 420);
  const a = createAsteroid(game, {
    x: start.x, y: start.y, size: COMET_SIZE,
    vx: ((tx - start.x) / d) * speed, vy: ((ty - start.y) / d) * speed, type: 'comet',
  });
  game.asteroids.push(a);
  game.events.push({ type: 'cometIncoming', x: start.x, y: start.y });
}

// ---- Per-tick behaviour ----

function magnetise(game, magnet, pull, dt) {
  const { world, ship } = game;
  const tug = (body, strength) => {
    const dx = wrapDelta(magnet.x - body.x, world.width);
    const dy = wrapDelta(magnet.y - body.y, world.height);
    const d = Math.hypot(dx, dy);
    if (d >= pull.radius || d < 1) return;
    const f = strength * (1 - d / pull.radius) * dt;
    body.vx += (dx / d) * f;
    body.vy += (dy / d) * f;
  };
  if (ship.alive && !ship.jump) tug(ship, pull.strength);
  for (const other of game.asteroids) {
    if (other !== magnet && !other.dead && other.type !== 'magnetic' && other.type !== 'comet') tug(other, pull.strength * 0.6);
  }
}

export function updateAsteroids(game, dt) {
  const { world, rng } = game;
  for (const a of game.asteroids) {
    if (a.dead) continue;
    a.age += dt;
    const def = ASTEROID_TYPES[a.type];

    if (def.pull) magnetise(game, a, def.pull, dt);
    if (def.jitter) {
      a.jitterTimer -= dt;
      if (a.jitterTimer <= 0) {
        a.vx += rng.signed(def.jitter * 2);
        a.vy += rng.signed(def.jitter * 2);
        const s = Math.hypot(a.vx, a.vy);
        if (s > 140) { a.vx *= 140 / s; a.vy *= 140 / s; }
        a.jitterTimer = rng.range(0.6, 1.4);
      }
    }

    a.x += a.vx * dt;
    a.y += a.vy * dt;
    if (def.comet) {
      // Comets don't wrap: they cross once and leave.
      const inside = a.x > 0 && a.x < world.width && a.y > 0 && a.y < world.height;
      if (inside) a.entered = true;
      else if (a.entered) a.dead = true;
    } else {
      wrapPosition(a, world.width, world.height);
    }
  }

  const solid = game.asteroids.filter((a) => !a.dead && a.type !== 'comet');
  resolveAsteroidCollisions(solid, game.rng, world, (impact) => {
    if (impact.speed <= ASTEROID.bounceFxMinSpeed) return;
    const perFrameSpeed = impact.speed / 60; // legacy units drive effect intensity
    spawnBurst(game.fx, game.fxRng, impact.x, impact.y, WHITE, Math.min(6, Math.floor(perFrameSpeed)));
    addShake(game.fx, Math.min(3, perFrameSpeed * 0.4));
    game.events.push({ type: 'bounce', intensity: perFrameSpeed, x: impact.x, y: impact.y });
  });
}

// ---- Damage ----

/** Returns true if the asteroid was destroyed. */
export function damageAsteroid(game, a, amount = 1, { byPlayer = true } = {}) {
  if (a.dead) return false;
  a.hp -= amount;
  if (a.hp > 0) {
    game.events.push({ type: 'asteroidHit', id: a.id, x: a.x, y: a.y, asteroidType: a.type, hp: a.hp });
    return false;
  }
  destroyAsteroid(game, a, { byPlayer });
  return true;
}

export function destroyAsteroid(game, a, { byPlayer = true } = {}) {
  if (a.dead) return;
  a.dead = true;
  const { rng, fx, fxRng } = game;
  const def = ASTEROID_TYPES[a.type];
  const points = byPlayer ? registerKill(game, def.points[sizeTier(a.size)]) : 0;

  if (def.children > 0 && a.size > A.minSplitSize) {
    const jitter = A.childVelocityJitter * (def.childSpeed ?? 1);
    for (let i = 0; i < def.children; i++) {
      const child = createAsteroid(game, {
        x: a.x + rng.signed(A.childPositionJitter),
        y: a.y + rng.signed(A.childPositionJitter),
        size: a.size / 2, vx: 0, vy: 0, type: a.type,
        hue: a.hue, sat: a.sat, light: a.light, fromSplit: true,
      });
      child.vx = a.vx * A.childVelocityKeep + rng.signed(jitter);
      child.vy = a.vy * A.childVelocityKeep + rng.signed(jitter);
      game.newAsteroids.push(child);
    }
  }
  if (def.frost) {
    game.frostFields.push({ x: a.x, y: a.y, r: a.size * def.frost.radiusMul, life: def.frost.seconds, maxLife: def.frost.seconds });
  }
  if (def.blast) {
    game.blasts.push({ x: a.x, y: a.y, r: a.size * def.blast.radiusMul, delay: def.blast.delay, rgb: a.rgb });
  }
  if (def.drop || (byPlayer && a.size <= 15 && rng.chance(PICKUP.smallAsteroidDropChance))) spawnPickup(game, a.x, a.y);

  spawnBurst(fx, fxRng, a.x, a.y, a.rgb, 16);
  spawnShockwave(fx, a.x, a.y, a.rgb);
  addShake(fx, Math.min(6, a.size / 8));
  if (byPlayer && a.size >= HIT_STOP.bigAsteroidMinSize) game.hitStop = Math.max(game.hitStop, HIT_STOP.bigAsteroid);
  game.events.push({
    type: 'asteroidDestroyed',
    id: a.id,
    x: a.x, y: a.y, vx: a.vx, vy: a.vy,
    size: a.size,
    asteroidType: a.type,
    hue: a.hue, sat: a.sat, light: a.light,
    points,
  });
}

/**
 * Armoured asteroids ricochet glancing shots. Returns true (and reflects the
 * missile) if `m` should bounce off `a` rather than damage it.
 */
export function tryDeflect(game, m, a, missileRadius) {
  const def = ASTEROID_TYPES[a.type];
  if (!def.deflectBelow) return false;
  if (!m.vx && !m.vy) return false; // no direction, no ricochet
  const { world } = game;
  const nx0 = wrapDelta(m.x - a.x, world.width);
  const ny0 = wrapDelta(m.y - a.y, world.height);
  const nd = Math.hypot(nx0, ny0) || 1;
  const nx = nx0 / nd, ny = ny0 / nd;
  const speed = Math.hypot(m.vx, m.vy) || 1;
  const incidence = -(m.vx * nx + m.vy * ny) / speed; // 1 = head-on, 0 = grazing
  if (incidence >= def.deflectBelow) return false;
  const dot = m.vx * nx + m.vy * ny;
  m.vx -= 2 * dot * nx;
  m.vy -= 2 * dot * ny;
  m.x = a.x + nx * (a.size + missileRadius + 1);
  m.y = a.y + ny * (a.size + missileRadius + 1);
  m.trail.length = 0;
  game.events.push({ type: 'deflect', x: m.x, y: m.y });
  return true;
}

/** Points along a comet's tail, used for collision (lethal to the ship). */
export function cometTail(a, out = []) {
  out.length = 0;
  const s = Math.hypot(a.vx, a.vy) || 1;
  for (const d of [22, 46, 70]) out.push({ x: a.x - (a.vx / s) * d, y: a.y - (a.vy / s) * d });
  return out;
}
