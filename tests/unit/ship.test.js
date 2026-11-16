import { describe, it, expect } from 'vitest';
import { createGame, step } from '../../src/state/game.js';
import { SHIP } from '../../src/data/tuning.js';
import { input, stillAsteroid } from './helpers.js';

const DT = 1 / 60;
function soloGame(options) {
  const game = createGame({ width: 2000, height: 2000, seed: 5, options });
  // One parked asteroid far from the flight path keeps "level cleared" from ending the run.
  game.asteroids = [stillAsteroid(game, { x: 1900, y: 1900, size: 10 })];
  game.ship.invulnerable = 999;
  return game;
}
const run = (game, ticks, inp) => { for (let i = 0; i < ticks; i++) step(game, inp, DT); };

describe('turning', () => {
  it('ramps up to the max turn rate instead of snapping', () => {
    const game = soloGame();
    step(game, input({ held: { right: true } }), DT);
    expect(game.ship.angVel).toBeGreaterThan(0);
    expect(game.ship.angVel).toBeLessThan(SHIP.maxTurnRate);
    run(game, 30, input({ held: { right: true } }));
    expect(game.ship.angVel).toBeCloseTo(SHIP.maxTurnRate);
  });
  it('settles quickly when released', () => {
    const game = soloGame();
    run(game, 30, input({ held: { left: true } }));
    run(game, 10, input());
    expect(game.ship.angVel).toBe(0);
  });
  it('accepts analog turn input', () => {
    const game = soloGame();
    run(game, 60, input({ turn: 0.5 }));
    expect(game.ship.angVel).toBeCloseTo(SHIP.maxTurnRate * 0.5);
  });
});

describe('thrust', () => {
  it('caps speed at maxSpeed', () => {
    const game = soloGame();
    run(game, 600, input({ held: { thrust: true } }));
    expect(Math.hypot(game.ship.vx, game.ship.vy)).toBeLessThanOrEqual(SHIP.maxSpeed + 1e-6);
  });
  it('flight assist brakes harder when coasting', () => {
    const plain = soloGame({ assist: false });
    const assisted = soloGame({ assist: true });
    for (const g of [plain, assisted]) {
      run(g, 30, input({ held: { thrust: true } }));
      run(g, 60, input());
    }
    expect(Math.hypot(assisted.ship.vx, assisted.ship.vy)).toBeLessThan(Math.hypot(plain.ship.vx, plain.ship.vy) * 0.5);
  });
});

describe('firing', () => {
  it('auto-fires at a fixed rate while held', () => {
    const game = soloGame({ autoFire: true });
    run(game, 60, input({ held: { fire: true } }));
    const shots = Math.floor(1 / SHIP.autoFireInterval) + 1;
    expect(game.missiles.length).toBeGreaterThanOrEqual(shots - 1);
    expect(game.missiles.length).toBeLessThanOrEqual(shots);
  });
  it('does not auto-fire when auto-fire is off', () => {
    const game = soloGame({ autoFire: false });
    step(game, input({ held: { fire: true }, pressed: { fire: true } }), DT);
    run(game, 59, input({ held: { fire: true } }));
    expect(game.missiles).toHaveLength(1);
  });
  it('buffers a tap made during cooldown instead of dropping it', () => {
    const game = soloGame({ autoFire: false });
    step(game, input({ pressed: { fire: true } }), DT);
    step(game, input({ pressed: { fire: true } }), DT); // during cooldown
    expect(game.missiles).toHaveLength(1);
    run(game, Math.ceil(SHIP.tapFireInterval / DT), input());
    expect(game.missiles).toHaveLength(2);
  });
  it('kicks the ship backwards (recoil)', () => {
    const game = soloGame();
    step(game, input({ pressed: { fire: true } }), DT);
    // Ship faces up (−y), so recoil pushes it down (+y).
    expect(game.ship.vy).toBeGreaterThan(0);
  });
});
