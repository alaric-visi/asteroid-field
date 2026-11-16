import { IDLE_INPUT, createGame, step } from '../../src/state/game.js';

export function input({ held = {}, pressed = {}, turn, choice } = {}) {
  return {
    held: { ...IDLE_INPUT.held, ...held },
    pressed: { ...IDLE_INPUT.pressed, ...pressed },
    turn,
    choice,
  };
}

export function stillAsteroid(game, overrides) {
  return {
    id: game.nextId++, prevX: 0, prevY: 0, vx: 0, vy: 0, size: 40, type: 'rock',
    hue: 0.1, sat: 0.7, light: 0.5, rgb: [200, 120, 60], spin: { x: 0, y: 0, z: 0 }, pulsePhase: 0,
    hp: 1, maxHp: 1, dead: false, age: 0, jitterTimer: 1, entered: false, fromSplit: false,
    ...overrides,
  };
}

/** A game with an empty arena plus one parked rock (so the wave doesn't end). */
export function arena(options, seed = 5) {
  const game = createGame({ width: 2000, height: 2000, seed, options });
  game.asteroids = [stillAsteroid(game, { x: 1900, y: 1900, size: 10 })];
  game.ship.invulnerable = 0;
  game.director.saucerTimer = game.director.cometTimer = 1e9; // no surprise visitors
  game.events.length = 0;
  return game;
}

export const run = (game, ticks, inp = input(), dt = 1 / 60) => {
  for (let i = 0; i < ticks; i++) step(game, inp, dt);
};
