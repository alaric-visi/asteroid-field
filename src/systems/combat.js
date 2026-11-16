// Contact resolution after everything has moved:
//   player missiles vs boss / saucers / asteroids
//   the ship vs asteroids, comet tails, saucers, the boss and enemy shots
import { MISSILE, ENEMY, SHIELD } from '../data/tuning.js';
import { circlesOverlap, wrapDelta } from '../core/math.js';
import { damageAsteroid, destroyAsteroid, tryDeflect, cometTail } from './asteroids.js';
import { damageEnemy, destroyEnemy, missileHitsBoss } from './enemies.js';
import { damageShip } from './shipDamage.js';

function consume(m, id) {
  if (m.pierce > 0) {
    m.pierce--;
    (m.hitIds ??= new Set()).add(id);
  } else {
    m.dead = true;
  }
}

export function resolvePlayerHits(game) {
  const { world } = game;
  const r = MISSILE.radius;
  for (const m of game.missiles) {
    if (m.dead) continue;
    if (missileHitsBoss(game, m, r)) { game.tally.hits++; continue; }

    for (const e of game.enemies) {
      if (e.dead || m.hitIds?.has(e.id)) continue;
      if (circlesOverlap(m, e, r, e.radius, world)) {
        damageEnemy(game, e, 1);
        game.tally.hits++;
        consume(m, e.id);
        break;
      }
    }
    if (m.dead) continue;

    for (const a of game.asteroids) {
      if (a.dead || m.hitIds?.has(a.id)) continue;
      if (!circlesOverlap(m, a, r, a.size, world)) continue;
      if (tryDeflect(game, m, a, r)) break;
      damageAsteroid(game, a, 1);
      game.tally.hits++;
      consume(m, a.id);
      break; // one target per missile per tick
    }
  }
}

/** Shield contact: smash small rocks; bounce off big ones. */
function shieldContact(game, a) {
  const { ship, world } = game;
  if (a.type === 'comet' || a.size <= SHIELD.ramMaxSize) {
    destroyAsteroid(game, a, { byPlayer: true });
    ship.energy = Math.max(0, ship.energy - SHIELD.ramCost);
    game.events.push({ type: 'shieldRam', x: a.x, y: a.y });
    return;
  }
  const dx = wrapDelta(ship.x - a.x, world.width);
  const dy = wrapDelta(ship.y - a.y, world.height);
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d, ny = dy / d;
  ship.x = a.x + nx * (a.size + ship.radius + 1);
  ship.y = a.y + ny * (a.size + ship.radius + 1);
  const vn = (ship.vx - a.vx) * nx + (ship.vy - a.vy) * ny;
  if (vn < 0) {
    ship.vx -= 1.6 * vn * nx;
    ship.vy -= 1.6 * vn * ny;
    a.vx += 0.3 * vn * nx;
    a.vy += 0.3 * vn * ny;
  }
  ship.vx += nx * 60;
  ship.vy += ny * 60;
  ship.energy = Math.max(0, ship.energy - SHIELD.bounceCost);
  game.events.push({ type: 'shieldHit', x: ship.x - nx * ship.radius, y: ship.y - ny * ship.radius });
}

const tail = [];

export function resolveShipContacts(game) {
  const { ship, world } = game;
  if (!ship.alive || ship.jump) return;
  const touching = (o, r) => circlesOverlap(ship, o, ship.radius, r, world);

  for (const a of game.asteroids) {
    if (a.dead || !touching(a, a.size)) continue;
    if (ship.shieldActive) shieldContact(game, a);
    else if (damageShip(game)) return;
  }

  for (const a of game.asteroids) {
    if (a.dead || a.type !== 'comet' || ship.shieldActive) continue;
    for (const p of cometTail(a, tail)) {
      if (touching(p, 9) && damageShip(game)) return;
    }
  }

  for (const e of game.enemies) {
    if (e.dead || !touching(e, e.radius)) continue;
    const protectedShip = ship.shieldActive || ship.invulnerable > 0;
    destroyEnemy(game, e, { byPlayer: protectedShip });
    if (!protectedShip && damageShip(game)) return;
  }

  if (game.boss && touching(game.boss, game.boss.radius)) {
    if (ship.shieldActive) shieldContact(game, { ...game.boss, size: game.boss.radius, type: 'boss' });
    else if (damageShip(game)) return;
  }

  for (const s of game.enemyShots) {
    if (s.dead || !touching(s, ENEMY.shotRadius)) continue;
    s.dead = true;
    if (ship.shieldActive) {
      ship.energy = Math.max(0, ship.energy - SHIELD.shotCost);
      game.events.push({ type: 'shieldHit', x: s.x, y: s.y });
    } else if (damageShip(game)) {
      return;
    }
  }
}
