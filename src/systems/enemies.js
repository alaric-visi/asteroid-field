// Saucers, the sector boss, and enemy shots.
import { ENEMY, PICKUP } from '../data/tuning.js';
import { ASTEROID_TYPES } from '../data/asteroidTypes.js';
import { SECTORS } from '../data/sectors.js';
import { circlesOverlap, wrapDelta, wrapPosition } from '../core/math.js';
import { hexToRgb, hslToRgb } from '../core/color.js';
import { createAsteroid } from '../entities/asteroid.js';
import { spawnBurst, spawnShockwave, addShake } from './effects.js';
import { registerKill } from './combo.js';
import { spawnPickup } from './pickups.js';
import { damageAsteroid } from './asteroids.js';

const SAUCER_RGB = { big: hexToRgb('#7dffb0'), small: hexToRgb('#ff6b8a') };

export const sectorDef = (game) => SECTORS[(game.level - 1) % SECTORS.length];
export const loopIndex = (game) => Math.floor((game.level - 1) / SECTORS.length);

function fireShot(game, x, y, angle, speedMul = 1) {
  const speed = ENEMY.shotSpeed * speedMul;
  game.enemyShots.push({
    x, y, prevX: x, prevY: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    life: ENEMY.shotLife, dead: false,
  });
  game.events.push({ type: 'enemyShot', x, y });
}

function aimAt(game, x, y) {
  const { ship, world } = game;
  return Math.atan2(wrapDelta(ship.y - y, world.height), wrapDelta(ship.x - x, world.width));
}

// ---- Saucers ----

export function spawnSaucer(game, kind) {
  const { rng, world } = game;
  const def = ENEMY.saucer[kind];
  const fromLeft = rng.chance(0.5);
  const x = fromLeft ? -def.radius : world.width + def.radius;
  game.enemies.push({
    id: game.nextId++, kind, x, y: rng.range(0.15, 0.85) * world.height, prevX: x, prevY: 0,
    vx: (fromLeft ? 1 : -1) * def.speed * (1 + 0.1 * loopIndex(game)), vy: 0,
    radius: def.radius, hp: def.hp, fireTimer: def.fireEvery, turnTimer: rng.range(0.6, 1.6),
    entered: false, dead: false,
  });
  game.events.push({ type: 'enemySpawned', kind });
}

export function damageEnemy(game, e, amount = 1) {
  if (e.dead) return;
  e.hp -= amount;
  if (e.hp <= 0) destroyEnemy(game, e, { byPlayer: true });
  else game.events.push({ type: 'enemyHit', x: e.x, y: e.y });
}

export function destroyEnemy(game, e, { byPlayer }) {
  if (e.dead) return;
  e.dead = true;
  const { fx, fxRng, rng } = game;
  const points = byPlayer ? registerKill(game, ENEMY.saucer[e.kind].points) : 0;
  if (byPlayer && rng.chance(PICKUP.saucerDropChance[e.kind])) spawnPickup(game, e.x, e.y);
  spawnBurst(fx, fxRng, e.x, e.y, SAUCER_RGB[e.kind], 22);
  spawnShockwave(fx, e.x, e.y, SAUCER_RGB[e.kind], 1.3);
  addShake(fx, 6);
  game.events.push({ type: 'enemyDestroyed', kind: e.kind, x: e.x, y: e.y, points });
}

function updateSaucers(game, dt) {
  const { rng, world, ship } = game;
  const loop = loopIndex(game);
  for (const e of game.enemies) {
    if (e.dead) continue;
    e.turnTimer -= dt;
    if (e.turnTimer <= 0) {
      e.vy = [-0.6, 0, 0.6][Math.floor(rng.next() * 3)] * Math.abs(e.vx);
      e.turnTimer = rng.range(0.8, 1.8);
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (e.y < 0) e.y += world.height;
    else if (e.y > world.height) e.y -= world.height;
    if (e.x > 0 && e.x < world.width) e.entered = true;
    else if (e.entered) { e.dead = true; continue; } // escaped off the far edge

    e.fireTimer -= dt;
    if (e.fireTimer <= 0 && ship.alive && e.entered) {
      const def = ENEMY.saucer[e.kind];
      const angle = e.kind === 'small'
        ? aimAt(game, e.x, e.y) + rng.signed(0.5 / (1 + loop))
        : rng.angle();
      fireShot(game, e.x, e.y, angle);
      e.fireTimer = def.fireEvery * rng.range(0.8, 1.2);
    }

    // Saucers don't survive flying into rocks.
    for (const a of game.asteroids) {
      if (!a.dead && a.type !== 'comet' && circlesOverlap(e, a, e.radius, a.size, world)) {
        destroyEnemy(game, e, { byPlayer: false });
        damageAsteroid(game, a, 1, { byPlayer: false });
        break;
      }
    }
  }
}

function updateEnemyShots(game, dt) {
  const { world } = game;
  for (const s of game.enemyShots) {
    s.life -= dt;
    if (s.life <= 0) { s.dead = true; continue; }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    wrapPosition(s, world.width, world.height);
    for (const a of game.asteroids) {
      if (!a.dead && circlesOverlap(s, a, ENEMY.shotRadius, a.size, world)) { s.dead = true; break; }
    }
  }
}

// ---- Boss ----

export function turretPosition(boss, t) {
  const a = boss.angle + t.offset;
  return { x: boss.x + Math.cos(a) * boss.radius * 0.92, y: boss.y + Math.sin(a) * boss.radius * 0.92 };
}

export function spawnBoss(game) {
  const { rng, world, ship } = game;
  const def = sectorDef(game).boss;
  const loop = loopIndex(game);
  // Enter at whichever quadrant centre is furthest from the ship.
  const spots = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map(([u, v]) => ({ x: u * world.width, y: v * world.height }));
  spots.sort((p, q) => Math.hypot(q.x - ship.x, q.y - ship.y) - Math.hypot(p.x - ship.x, p.y - ship.y));
  const color = ASTEROID_TYPES[def.type].color;
  const hue = (color.hue[0] + color.hue[1]) / 720;
  const hp = Math.round(def.hp * (1 + 0.5 * loop));
  game.boss = {
    id: game.nextId++, type: def.type, x: spots[0].x, y: spots[0].y, prevX: spots[0].x, prevY: spots[0].y,
    vx: rng.signed(70), vy: rng.signed(70), radius: ENEMY.boss.radius,
    hp, maxHp: hp, angle: 0, prevAngle: 0, spin: 0.35,
    turrets: Array.from({ length: def.turrets }, (_, i) => ({
      offset: (i / def.turrets) * Math.PI * 2, hp: ENEMY.boss.turretHp, alive: true, cooldown: 1.5 + i * 0.45,
    })),
    phase: 1, shieldTimer: 0, broodTimer: 5,
    hue, sat: color.sat, light: color.light, rgb: hslToRgb(hue, color.sat, color.light),
  };
  game.events.push({ type: 'bossSpawned', bossType: def.type });
}

function updateBoss(game, dt) {
  const boss = game.boss;
  if (!boss) return;
  const { rng, world, ship } = game;
  boss.x += boss.vx * dt;
  boss.y += boss.vy * dt;
  wrapPosition(boss, world.width, world.height);
  boss.angle += boss.spin * dt * (boss.phase === 2 ? 1.7 : 1);
  boss.shieldTimer = Math.max(0, boss.shieldTimer - dt);

  for (const t of boss.turrets) {
    if (!t.alive) continue;
    t.cooldown -= dt;
    if (t.cooldown <= 0 && ship.alive && !ship.jump) {
      const p = turretPosition(boss, t);
      fireShot(game, p.x, p.y, aimAt(game, p.x, p.y) + rng.signed(0.25), 0.9);
      t.cooldown = (boss.phase === 2 ? 1.2 : 1.9) + rng.next() * 0.8;
    }
  }

  boss.broodTimer -= dt;
  if (boss.broodTimer <= 0) {
    boss.broodTimer = boss.phase === 2 ? 5 : 7.5;
    if (game.asteroids.length < ENEMY.boss.maxBrood) {
      const size = sectorDef(game).size / 2;
      for (let i = 0; i < 2; i++) {
        const a = rng.angle();
        const r = boss.radius + size + 4;
        game.newAsteroids.push(createAsteroid(game, {
          x: boss.x + Math.cos(a) * r, y: boss.y + Math.sin(a) * r, size,
          vx: Math.cos(a) * 120 + boss.vx, vy: Math.sin(a) * 120 + boss.vy, type: boss.type, fromSplit: true,
        }));
      }
      game.events.push({ type: 'bossBrood', x: boss.x, y: boss.y });
    }
  }

  // The boss is immovable: rocks bounce off it.
  for (const a of game.asteroids) {
    if (a.dead || a.type === 'comet') continue;
    const dx = wrapDelta(a.x - boss.x, world.width);
    const dy = wrapDelta(a.y - boss.y, world.height);
    const d = Math.hypot(dx, dy) || 1;
    const min = boss.radius + a.size;
    if (d >= min) continue;
    const nx = dx / d, ny = dy / d;
    a.x += nx * (min - d);
    a.y += ny * (min - d);
    const vn = (a.vx - boss.vx) * nx + (a.vy - boss.vy) * ny;
    if (vn < 0) { a.vx -= 1.8 * vn * nx; a.vy -= 1.8 * vn * ny; }
  }
}

function destroyBoss(game) {
  const boss = game.boss;
  const { fx, fxRng } = game;
  const points = registerKill(game, ENEMY.boss.pointsPerSector * game.level);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    spawnBurst(fx, fxRng, boss.x + Math.cos(a) * boss.radius * 0.6, boss.y + Math.sin(a) * boss.radius * 0.6, boss.rgb, 24);
  }
  spawnShockwave(fx, boss.x, boss.y, boss.rgb, 2.6);
  spawnShockwave(fx, boss.x, boss.y, [255, 255, 255], 1.6);
  addShake(fx, 26);
  game.hitStop = Math.max(game.hitStop, 0.35);
  spawnPickup(game, boss.x - 20, boss.y);
  spawnPickup(game, boss.x + 20, boss.y);
  game.events.push({
    type: 'bossDestroyed', x: boss.x, y: boss.y, radius: boss.radius, bossType: boss.type,
    hue: boss.hue, sat: boss.sat, light: boss.light, points,
  });
  game.boss = null;
  game.director.bossDefeated = true;
}

/** Damage the boss core (missiles, blasts). Ignored while its shield is up. */
export function damageBoss(game, amount) {
  const boss = game.boss;
  if (!boss) return;
  if (boss.shieldTimer > 0) {
    game.events.push({ type: 'bossShieldHit', x: boss.x, y: boss.y });
    return;
  }
  boss.hp -= amount;
  game.events.push({ type: 'bossHit', x: boss.x, y: boss.y, hp: boss.hp });
  if (boss.phase === 1 && boss.hp <= boss.maxHp / 2) {
    boss.phase = 2;
    boss.shieldTimer = 3;
    boss.broodTimer = 0;
    game.events.push({ type: 'bossPhase', phase: 2, x: boss.x, y: boss.y });
  }
  if (boss.hp <= 0) destroyBoss(game);
}

/** Missile vs boss (turrets first, then the core). Returns true if it hit. */
export function missileHitsBoss(game, m, missileRadius) {
  const boss = game.boss;
  if (!boss) return false;
  const { world, fx, fxRng } = game;
  for (const t of boss.turrets) {
    if (!t.alive) continue;
    const p = turretPosition(boss, t);
    if (!circlesOverlap(m, p, missileRadius, ENEMY.boss.turretRadius, world)) continue;
    m.dead = true;
    t.hp--;
    if (t.hp <= 0) {
      t.alive = false;
      const points = registerKill(game, ENEMY.boss.turretPoints);
      spawnBurst(fx, fxRng, p.x, p.y, [255, 170, 80], 18);
      spawnShockwave(fx, p.x, p.y, [255, 170, 80]);
      addShake(fx, 5);
      game.events.push({ type: 'turretDestroyed', x: p.x, y: p.y, points });
    } else {
      game.events.push({ type: 'bossHit', x: p.x, y: p.y, hp: boss.hp });
    }
    return true;
  }
  if (circlesOverlap(m, boss, missileRadius, boss.radius, world)) {
    m.dead = true;
    damageBoss(game, 1);
    return true;
  }
  return false;
}

export function updateEnemies(game, dt) {
  updateSaucers(game, dt);
  updateBoss(game, dt);
  updateEnemyShots(game, dt);
}
