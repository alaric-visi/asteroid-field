// Player ship per tick: hyperspace, shield, turning, thrust, firing (with
// heat and pickup buffs), integration.
import { SHIP, SHAKE, WEAPON, HYPERSPACE, SHIELD, FROST } from '../data/tuning.js';
import { perTick, wrapPosition, wrapDelta } from '../core/math.js';
import { createMissile } from '../entities/missile.js';
import { spawnThrustParticle, pushEngineTrail, addShake } from './effects.js';

function approach(value, target, maxDelta) {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}

// ---- Hyperspace ----

/** Clearance from the nearest threat if the ship appeared at (x, y). */
function clearance(game, x, y) {
  const { world } = game;
  let best = Infinity;
  const consider = (o, r) => {
    const d = Math.hypot(wrapDelta(o.x - x, world.width), wrapDelta(o.y - y, world.height)) - r;
    if (d < best) best = d;
  };
  for (const a of game.asteroids) if (!a.dead) consider(a, a.size);
  for (const e of game.enemies) consider(e, e.radius);
  for (const s of game.enemyShots) consider(s, 0);
  if (game.boss) consider(game.boss, game.boss.radius);
  return best;
}

function pickDestination(game) {
  const { rng, world, stats } = game;
  const randomPoint = () => ({ x: rng.range(40, world.width - 40), y: rng.range(40, world.height - 40) });
  const misjump = !stats.safeJump && rng.chance(HYPERSPACE.misjumpChance);
  if (misjump) return { ...randomPoint(), misjump: true };
  let best = null;
  for (let i = 0; i < HYPERSPACE.candidates; i++) {
    const p = randomPoint();
    p.clear = clearance(game, p.x, p.y);
    if (!best || p.clear > best.clear) best = p;
  }
  return { x: best.x, y: best.y, misjump: false };
}

/** Returns true while the ship is in hyperspace (and therefore not controllable). */
function updateHyperspace(game, pressed, dt) {
  const { ship, stats } = game;
  ship.jumpCooldown = Math.max(0, ship.jumpCooldown - dt);

  if (ship.jump) {
    ship.jump.t -= dt;
    if (ship.jump.phase === 'out' && ship.jump.t <= 0) {
      const dest = pickDestination(game);
      ship.x = ship.prevX = dest.x;
      ship.y = ship.prevY = dest.y;
      ship.jump = { phase: 'in', t: HYPERSPACE.reappearSeconds };
      game.events.push({ type: 'hyperspaceIn', x: dest.x, y: dest.y, misjump: dest.misjump });
    } else if (ship.jump.phase === 'in' && ship.jump.t <= 0) {
      ship.jump = null;
      ship.invulnerable = Math.max(ship.invulnerable, 0.3);
    }
    return ship.jump !== null;
  }

  if (pressed.hyperspace && ship.jumpCooldown <= 0) {
    ship.jump = { phase: 'out', t: HYPERSPACE.chargeSeconds };
    ship.jumpCooldown = HYPERSPACE.cooldown * stats.jumpCooldownMul;
    ship.vx *= 0.2;
    ship.vy *= 0.2;
    ship.boosting = false;
    if (ship.shieldActive) { ship.shieldActive = false; game.events.push({ type: 'shieldOff' }); }
    game.events.push({ type: 'hyperspaceOut', x: ship.x, y: ship.y });
    return true;
  }
  return false;
}

// ---- Shield ----

function updateShield(game, wanted, dt) {
  const { ship, stats } = game;
  const canHold = ship.energy > (ship.shieldActive ? 0 : SHIELD.minToActivate);
  const active = wanted && canHold;
  if (active !== ship.shieldActive) game.events.push({ type: active ? 'shieldOn' : 'shieldOff' });
  ship.shieldActive = active;

  if (active) {
    ship.energy -= SHIELD.drain * dt;
    ship.shieldRegenDelay = SHIELD.regenDelay;
    if (ship.energy <= 0) {
      ship.energy = 0;
      ship.shieldActive = false;
      game.events.push({ type: 'shieldOff', depleted: true });
    }
  } else {
    ship.shieldRegenDelay -= dt;
    if (ship.shieldRegenDelay <= 0) {
      ship.energy = Math.min(stats.shieldMax, ship.energy + SHIELD.regen * stats.shieldRegenMul * dt);
    }
  }
}

// ---- Weapon ----

function fireVolley(game, interval) {
  const { ship, stats, fx } = game;
  const cos = Math.cos(ship.angle), sin = Math.sin(ship.angle);
  const mx = ship.x + cos * SHIP.muzzleOffset;
  const my = ship.y + sin * SHIP.muzzleOffset;
  const extra = stats.spread + (ship.buffs.spread > 0 ? 1 : 0);
  const pierce = stats.pierce + (ship.buffs.pierce > 0 ? 2 : 0);
  const angles = [0];
  for (let i = 1; i <= extra; i++) angles.push(i * WEAPON.spreadAngle, -i * WEAPON.spreadAngle);
  for (const da of angles) game.missiles.push(createMissile(mx, my, ship.angle + da, stats.missileSpeedMul, pierce));
  game.tally.shots += angles.length;

  const rapid = ship.buffs.rapid > 0;
  ship.fireCooldown = interval * (rapid ? 0.6 : 1);
  ship.fireQueued = false;
  ship.vx -= cos * SHIP.recoil;
  ship.vy -= sin * SHIP.recoil;
  addShake(fx, SHAKE.fire);
  game.events.push({ type: 'shoot', x: mx, y: my, angle: ship.angle, barrels: angles.length });

  if (!rapid) {
    ship.heat += WEAPON.heatPerShot * stats.heatMul * (1 + WEAPON.extraShotHeat * extra);
    if (ship.heat >= WEAPON.maxHeat) {
      ship.heat = WEAPON.maxHeat;
      ship.overheated = true;
      game.events.push({ type: 'overheated' });
    }
  }
}

function updateWeapon(game, { held, pressed }, dt) {
  const { ship, stats, options } = game;
  ship.heat = Math.max(0, ship.heat - WEAPON.coolRate * stats.coolMul * dt);
  if (ship.overheated && ship.heat <= WEAPON.recoverBelow) {
    ship.overheated = false;
    game.events.push({ type: 'cooled' });
  }

  ship.fireCooldown = Math.max(0, ship.fireCooldown - dt);
  if (pressed.fire) ship.fireQueued = true;
  const autoFiring = options.autoFire && held.fire;
  if ((ship.fireQueued || autoFiring) && ship.fireCooldown <= 0) {
    if (ship.overheated) {
      if (pressed.fire) game.events.push({ type: 'dryFire' });
      ship.fireQueued = false;
      return;
    }
    fireVolley(game, ship.fireQueued ? SHIP.tapFireInterval : SHIP.autoFireInterval);
  }
}

// ---- Tick ----

export function updateShip(game, input, dt) {
  const { ship, fx, fxRng, options, stats, world } = game;
  if (!ship.alive) return;
  const { held, pressed, turn } = input;

  for (const kind of Object.keys(ship.buffs)) {
    ship.buffs[kind] -= dt;
    if (ship.buffs[kind] <= 0) {
      delete ship.buffs[kind];
      game.events.push({ type: 'buffExpired', kind });
    }
  }
  ship.invulnerable = Math.max(0, ship.invulnerable - dt);

  if (updateHyperspace(game, pressed, dt)) return;
  updateShield(game, held.shield, dt);

  // Turning with angular momentum.
  const turnInput = turn ?? (held.right ? 1 : 0) - (held.left ? 1 : 0);
  const targetRate = Math.max(-1, Math.min(1, turnInput)) * SHIP.maxTurnRate;
  const speedingUp = Math.sign(targetRate) === Math.sign(ship.angVel) && Math.abs(targetRate) > Math.abs(ship.angVel);
  ship.angVel = approach(ship.angVel, targetRate, (speedingUp || ship.angVel === 0 ? SHIP.turnAccel : SHIP.turnDecel) * dt);
  ship.angle += ship.angVel * dt;

  // Thrust (weaker inside frost fields), capped speed.
  ship.boosting = held.thrust;
  const cos = Math.cos(ship.angle), sin = Math.sin(ship.angle);
  if (ship.boosting) {
    const thrust = SHIP.thrust * stats.thrustMul * (ship.frosted ? FROST.thrustMul : 1);
    ship.vx += cos * thrust * dt;
    ship.vy += sin * thrust * dt;
    const maxSpeed = SHIP.maxSpeed * Math.sqrt(stats.thrustMul);
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > maxSpeed) {
      ship.vx *= maxSpeed / speed;
      ship.vy *= maxSpeed / speed;
    }
    if (fxRng.chance(0.5)) {
      spawnThrustParticle(fx, fxRng, ship.x - cos * SHIP.exhaustOffset, ship.y - sin * SHIP.exhaustOffset, ship.angle);
    }
    pushEngineTrail(fx, ship.x - cos * SHIP.trailOffset, ship.y - sin * SHIP.trailOffset);
  }

  updateWeapon(game, input, dt);

  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  let dragFactor = options.assist && !ship.boosting ? SHIP.assistDragPerLegacyFrame : SHIP.dragPerLegacyFrame;
  if (ship.frosted) dragFactor = Math.min(dragFactor, FROST.dragPerLegacyFrame);
  const drag = perTick(dragFactor, dt);
  ship.vx *= drag;
  ship.vy *= drag;
  wrapPosition(ship, world.width, world.height);
}
