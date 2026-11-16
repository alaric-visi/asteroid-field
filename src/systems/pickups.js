import { PICKUP } from '../data/tuning.js';
import { PICKUPS } from '../data/pickups.js';
import { circlesOverlap, wrapDelta, wrapPosition, perTick } from '../core/math.js';

function pickKind(rng) {
  const entries = Object.entries(PICKUPS);
  let r = rng.next() * entries.reduce((s, [, p]) => s + p.weight, 0);
  for (const [kind, p] of entries) {
    r -= p.weight;
    if (r <= 0) return kind;
  }
  return entries[0][0];
}

export function spawnPickup(game, x, y, kind = pickKind(game.rng)) {
  const { rng } = game;
  game.pickups.push({
    id: game.nextId++, kind, x, y, prevX: x, prevY: y,
    vx: rng.signed(80), vy: rng.signed(80), life: PICKUP.life, dead: false,
  });
  game.events.push({ type: 'pickupSpawned', kind, x, y });
}

function apply(game, p) {
  const { ship, stats } = game;
  if (PICKUPS[p.kind].timed) ship.buffs[p.kind] = PICKUP.buffSeconds;
  else if (p.kind === 'shield') ship.energy = stats.shieldMax;
  else if (p.kind === 'life') game.lives = Math.min(game.lives + 1, 9);
  game.events.push({ type: 'pickupCollected', kind: p.kind, x: p.x, y: p.y });
}

export function updatePickups(game, dt) {
  const { ship, world, stats } = game;
  const drag = perTick(0.985, dt);
  const canCollect = ship.alive && !ship.jump;
  for (const p of game.pickups) {
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }
    if (canCollect && stats.magnet > 0) {
      const dx = wrapDelta(ship.x - p.x, world.width);
      const dy = wrapDelta(ship.y - p.y, world.height);
      const d = Math.hypot(dx, dy);
      if (d < stats.magnet && d > 1) {
        p.vx += (dx / d) * 900 * dt;
        p.vy += (dy / d) * 900 * dt;
      }
    }
    p.vx *= drag;
    p.vy *= drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    wrapPosition(p, world.width, world.height);
    if (canCollect && circlesOverlap(ship, p, ship.radius + 4, PICKUP.radius, world)) {
      p.dead = true;
      apply(game, p);
    }
  }
}
