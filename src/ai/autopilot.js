// Attract-mode pilot for the title screen. Produces the same per-tick input a
// player would ({ held, pressed, turn, choice }) from the game state, so the
// demo runs on the real simulation. Not meant to be good — just watchable.
import { wrapDelta } from '../core/math.js';
import { MISSILE } from '../data/tuning.js';

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createAutopilot(random = Math.random) {
  let patrolTimer = 0;
  let patrolAngle = 0;

  return function think(game) {
    const { ship, world } = game;
    const held = { left: false, right: false, thrust: false, fire: false, shield: false };
    const pressed = { fire: false, pause: false, restart: false, hyperspace: false };
    const choice = game.mode === 'upgrade' ? Math.floor(random() * (game.upgradeChoices?.length || 1)) : undefined;
    if (!ship.alive || ship.jump) return { held, pressed, turn: undefined, choice };

    // Nearest threat (by surface distance) and the best target to shoot.
    let threat = null, threatDist = Infinity, target = null, targetDist = Infinity;
    const consider = (o, r) => {
      const dx = wrapDelta(o.x - ship.x, world.width);
      const dy = wrapDelta(o.y - ship.y, world.height);
      const d = Math.hypot(dx, dy) - r;
      if (d < threatDist) { threatDist = d; threat = o; }
      if (d < targetDist) { targetDist = d; target = { o, dx, dy, d }; }
    };
    for (const a of game.asteroids) if (!a.dead) consider(a, a.size);
    for (const e of game.enemies) consider(e, e.radius);
    if (game.boss) consider(game.boss, game.boss.radius);

    let turn = 0;
    if (target) {
      // Lead the target by the missile's flight time.
      const t = Math.hypot(target.dx, target.dy) / MISSILE.speed;
      const aim = Math.atan2(target.dy + target.o.vy * t, target.dx + target.o.vx * t);
      const err = wrapAngle(aim - ship.angle);
      turn = Math.max(-1, Math.min(1, err * 3));
      held.fire = Math.abs(err) < 0.22 && targetDist < 520 && !ship.overheated;
    }

    // Drift around a little when nothing is close, so the demo moves.
    patrolTimer -= 1 / 60;
    if (patrolTimer <= 0) {
      patrolTimer = 1.5 + random() * 2;
      patrolAngle = random() * Math.PI * 2;
    }
    const speed = Math.hypot(ship.vx, ship.vy);
    if (threatDist > 220 && speed < 140 && Math.abs(wrapAngle(patrolAngle - ship.angle)) < 0.6) held.thrust = true;

    if (threatDist < 40) {
      if (ship.energy > 25) held.shield = true;
      else if (ship.jumpCooldown <= 0) pressed.hyperspace = true;
    }
    return { held, pressed, turn, choice };
  };
}
