// Area hazards left behind by destroyed asteroids:
//   frost fields — slow the ship while inside (ice)
//   blasts       — delayed detonations that damage everything nearby (plasma);
//                  plasma rocks caught in a blast queue their own → chain reactions
import { circlesOverlap, wrapDelta } from '../core/math.js';
import { spawnBurst, spawnShockwave, addShake } from './effects.js';
import { damageAsteroid } from './asteroids.js';
import { damageEnemy, damageBoss } from './enemies.js';
import { damageShip } from './shipDamage.js';

const BLAST_CORE = [255, 240, 255];

function detonate(game, b) {
  const { fx, fxRng, world, ship } = game;
  spawnShockwave(fx, b.x, b.y, b.rgb, 1.9);
  spawnShockwave(fx, b.x, b.y, BLAST_CORE, 1.2);
  spawnBurst(fx, fxRng, b.x, b.y, b.rgb, 26);
  addShake(fx, 9);
  game.events.push({ type: 'blast', x: b.x, y: b.y, r: b.r });

  for (const a of game.asteroids) {
    if (!a.dead && circlesOverlap(a, b, a.size, b.r, world)) damageAsteroid(game, a, 1, { byPlayer: true });
  }
  for (const e of game.enemies) {
    if (!e.dead && circlesOverlap(e, b, e.radius, b.r, world)) damageEnemy(game, e, 2);
  }
  if (game.boss && circlesOverlap(game.boss, b, game.boss.radius, b.r, world)) damageBoss(game, 2);
  if (ship.alive && circlesOverlap(ship, b, ship.radius, b.r * 0.75, world)) damageShip(game);
}

export function updateHazards(game, dt) {
  const { ship, world } = game;

  game.frostFields = game.frostFields.filter((f) => (f.life -= dt) > 0);
  ship.frosted = game.frostFields.some((f) => {
    const d = Math.hypot(wrapDelta(ship.x - f.x, world.width), wrapDelta(ship.y - f.y, world.height));
    return d < f.r;
  });

  // Detonating can queue new blasts (chains); those wait for their own delay.
  const due = [];
  game.blasts = game.blasts.filter((b) => {
    b.delay -= dt;
    if (b.delay > 0) return true;
    due.push(b);
    return false;
  });
  for (const b of due) detonate(game, b);
}
