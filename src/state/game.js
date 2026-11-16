// The game simulation: pure data in, pure data out. No DOM, no Three.js.
// Renderers, audio and UI react to `game.events`, which the caller drains.
//
// Modes: 'playing' ⇄ 'upgrade' (pick 1 of 3) → 'transition' (sector intro) → … → 'over'.
// `paused` is orthogonal to mode. Systems live in ../systems; this file only
// sequences them.

import { createRng } from '../core/rng.js';
import { SHIP, RUN_INTRO_SECONDS } from '../data/tuning.js';
import { createShip, createShipStats, resetShip } from '../entities/ship.js';
import { integrate } from '../systems/physics.js';
import { createEffects, updateEffects } from '../systems/effects.js';
import { createCombo, updateCombo } from '../systems/combo.js';
import { updateShip } from '../systems/shipControl.js';
import { updateAsteroids } from '../systems/asteroids.js';
import { updateEnemies } from '../systems/enemies.js';
import { updatePickups } from '../systems/pickups.js';
import { updateHazards } from '../systems/hazards.js';
import { resolvePlayerHits, resolveShipContacts } from '../systems/combat.js';
import { startSector, updateDirector, chooseUpgrade, sectorDef } from '../systems/director.js';
import { MISSILE } from '../data/tuning.js';

/**
 * Input for one tick.
 *   held     continuous actions        pressed  edge-triggered actions
 *   turn     optional analog steering (−1…1); otherwise left/right buttons
 *   choice   index of a chosen upgrade card while mode === 'upgrade'
 */
export const IDLE_INPUT = Object.freeze({
  held: Object.freeze({ left: false, right: false, thrust: false, fire: false, shield: false }),
  pressed: Object.freeze({ fire: false, pause: false, restart: false, hyperspace: false }),
  turn: undefined,
  choice: undefined,
});

/** Player-facing options the simulation honours (set from settings). */
export const DEFAULT_OPTIONS = Object.freeze({
  autoFire: true, // holding fire keeps shooting at autoFireInterval
  assist: false, // flight assist: brake when not thrusting
  training: false, // tutorial: the ship can't be destroyed
});

/** campaign: 3 sectors then win · endless: sectors loop, harder each lap · daily: endless with a date seed */
export const RUN_MODES = ['campaign', 'endless', 'daily'];

export function createGame({ width, height, seed = 1, options = DEFAULT_OPTIONS, runMode = 'campaign' }) {
  const game = {
    options: { ...DEFAULT_OPTIONS, ...options },
    runMode: RUN_MODES.includes(runMode) ? runMode : 'campaign',
    world: { width, height },
    seed: seed >>> 0,
    rng: createRng(seed),
    fxRng: createRng((seed ^ 0x9e3779b9) >>> 0),
    nextId: 1,
    events: [],
    time: 0,
  };
  startRun(game);
  return game;
}

/**
 * Start a fresh run with a new seed and/or mode (title screen → game, retry).
 * `intro: true` opens with the sector intro card before play begins.
 */
export function newRun(game, { seed = game.seed, runMode = game.runMode, intro = false } = {}) {
  game.seed = seed >>> 0;
  game.rng = createRng(game.seed);
  game.fxRng = createRng((game.seed ^ 0x9e3779b9) >>> 0);
  game.runMode = RUN_MODES.includes(runMode) ? runMode : 'campaign';
  game.events.length = 0;
  startRun(game, { intro });
}

export function startRun(game, { intro = false } = {}) {
  Object.assign(game, {
    mode: 'playing',
    paused: false,
    won: false,
    lives: SHIP.lives,
    score: 0,
    level: 1, // sector number (1-based; loops in endless modes)
    wave: 0,
    transitionTimer: 0,
    hitStop: 0,
    runTime: 0,
    ship: createShip(),
    stats: createShipStats(),
    upgrades: {}, // id → times taken
    upgradeChoices: null,
    combo: createCombo(),
    tally: { shots: 0, hits: 0, kills: 0 }, // for the run summary
    missiles: [],
    asteroids: [],
    newAsteroids: [], // spawned mid-tick; merged at the end of the tick
    enemies: [],
    enemyShots: [],
    boss: null,
    pickups: [],
    frostFields: [],
    blasts: [],
    director: null,
    fx: createEffects(),
  });
  resetShip(game.ship, game.world, game.stats);
  startSector(game);
  game.events.push({ type: 'runStarted', runMode: game.runMode });
  if (intro) {
    game.mode = 'transition';
    game.transitionTimer = RUN_INTRO_SECONDS;
    game.events.push({ type: 'levelUp', level: 1, intro: sectorDef(game).intro });
  }
}

export { sectorDef };

export function setWorldSize(game, width, height) {
  const { world } = game;
  if (width <= 0 || height <= 0 || (width === world.width && height === world.height)) return;
  const hadNoArea = world.width <= 0 || world.height <= 0;
  const sx = width / world.width;
  const sy = height / world.height;
  world.width = width;
  world.height = height;

  // Created before the window had a size (e.g. a hidden tab): lay the run out again.
  if (hadNoArea) {
    startRun(game);
    return;
  }

  // Otherwise keep everything in the same relative place.
  const bodies = [game.ship, ...game.asteroids, ...game.missiles, ...game.enemies, ...game.enemyShots, ...game.pickups];
  if (game.boss) bodies.push(game.boss);
  for (const b of bodies) {
    b.x *= sx; b.y *= sy;
    b.prevX = b.x; b.prevY = b.y;
  }
  for (const f of [...game.frostFields, ...game.blasts]) { f.x *= sx; f.y *= sy; }
  for (const m of game.missiles) m.trail.length = 0;
  game.fx.engineTrail.length = 0;
}

export function setPaused(game, paused) {
  if (game.mode === 'over' || game.paused === paused) return;
  game.paused = paused;
  game.events.push({ type: paused ? 'paused' : 'resumed' });
}

/** Advance the simulation by one fixed tick. */
export function step(game, input, dt) {
  const { pressed } = input;

  if (game.mode === 'over') {
    if (pressed.restart) {
      startRun(game);
      return;
    }
  } else if (pressed.pause) {
    setPaused(game, !game.paused);
  }
  if (game.paused) return;

  game.time += dt;
  snapshotPrevious(game);

  if (game.hitStop > 0) {
    game.hitStop -= dt;
    return;
  }

  if (game.mode === 'upgrade') {
    updateEffects(game.fx, dt);
    if (input.choice !== undefined) chooseUpgrade(game, input.choice);
    return;
  }

  if (game.mode === 'transition') {
    updateEffects(game.fx, dt);
    game.transitionTimer -= dt;
    if (game.transitionTimer <= 0) {
      game.mode = 'playing';
      game.events.push({ type: 'transitionEnded' });
    }
    return;
  }

  if (game.mode === 'over') {
    // Keep the field drifting behind the game-over panel.
    updateAsteroids(game, dt);
    updateEffects(game.fx, dt);
    flush(game);
    return;
  }

  game.runTime += dt;
  updateShip(game, input, dt);
  updateMissiles(game, dt);
  updateAsteroids(game, dt);
  updateEnemies(game, dt);
  updatePickups(game, dt);
  updateHazards(game, dt);
  updateEffects(game.fx, dt);
  resolvePlayerHits(game);
  resolveShipContacts(game);
  updateCombo(game, dt);
  flush(game);
  updateDirector(game, dt);
}

function snapshotPrevious(game) {
  const { ship } = game;
  ship.prevX = ship.x;
  ship.prevY = ship.y;
  ship.prevAngle = ship.angle;
  for (const list of [game.asteroids, game.missiles, game.enemies, game.enemyShots, game.pickups]) {
    for (const o of list) { o.prevX = o.x; o.prevY = o.y; }
  }
  if (game.boss) {
    game.boss.prevX = game.boss.x;
    game.boss.prevY = game.boss.y;
    game.boss.prevAngle = game.boss.angle;
  }
}

function updateMissiles(game, dt) {
  for (const m of game.missiles) {
    m.trail.push({ x: m.x, y: m.y });
    if (m.trail.length > MISSILE.trailLength) m.trail.shift();
    integrate(m, dt, game.world);
    m.life -= dt;
    if (m.life <= 0) m.dead = true;
  }
}

/** Drop everything destroyed this tick and merge newly spawned asteroids. */
function flush(game) {
  const alive = (o) => !o.dead;
  game.asteroids = game.asteroids.filter(alive).concat(game.newAsteroids);
  game.newAsteroids = [];
  game.missiles = game.missiles.filter(alive);
  game.enemies = game.enemies.filter(alive);
  game.enemyShots = game.enemyShots.filter(alive);
  game.pickups = game.pickups.filter(alive);
}
