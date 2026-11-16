import { describe, it, expect } from 'vitest';
import { createGame, step, setWorldSize } from '../../src/state/game.js';
import { createFixedStep } from '../../src/core/loop.js';
import { SECTORS } from '../../src/data/sectors.js';
import { LEVEL_TRANSITION_SECONDS, HIT_STOP, WAVE_BREAK_SECONDS } from '../../src/data/tuning.js';
import { createMissile } from '../../src/entities/missile.js';
import { input, stillAsteroid, run } from './helpers.js';

const DT = 1 / 60;
const newGame = (seed = 7, runMode) => createGame({ width: 800, height: 600, seed, runMode });
const parkedMissile = (x, y) => Object.assign(createMissile(x, y, 0), { vx: 0, vy: 0 });

/** Clear the field and wait out the wave break. */
function clearWave(game) {
  game.asteroids = [];
  game.boss = null;
  run(game, Math.ceil(WAVE_BREAK_SECONDS / DT) + 3);
}

describe('run setup', () => {
  it('opens sector 1 with a budgeted first wave, away from the ship', () => {
    const game = newGame();
    expect(game.level).toBe(1);
    expect(game.wave).toBe(1);
    expect(game.asteroids.length).toBeGreaterThanOrEqual(3);
    for (const a of game.asteroids) {
      expect(Object.keys(SECTORS[0].weights)).toContain(a.type);
      expect(Math.hypot(a.x - 400, a.y - 300)).toBeGreaterThanOrEqual(150);
    }
  });
  it('is reproducible from the seed', () => {
    const a = newGame(99), b = newGame(99);
    expect(a.asteroids.map((x) => [x.x, x.y, x.vx, x.type])).toEqual(b.asteroids.map((x) => [x.x, x.y, x.vx, x.type]));
  });
});

describe('missile hits', () => {
  it('a missile destroys exactly one asteroid even when it overlaps two', () => {
    const game = newGame();
    game.ship.invulnerable = 999;
    game.asteroids = [
      stillAsteroid(game, { x: 100, y: 100, size: 10 }),
      stillAsteroid(game, { x: 112, y: 100, size: 10 }),
    ];
    game.missiles = [parkedMissile(106, 100)];
    step(game, input(), DT);
    expect(game.missiles).toHaveLength(0);
    expect(game.asteroids).toHaveLength(1);
    expect(game.score).toBe(100);
  });
  it('splits large asteroids into two halves and scores by size and type', () => {
    const game = newGame();
    game.ship.invulnerable = 999;
    game.asteroids = [stillAsteroid(game, { x: 100, y: 100, size: 40 })];
    game.missiles = [parkedMissile(100, 100)];
    step(game, input(), DT);
    expect(game.score).toBe(20);
    expect(game.asteroids).toHaveLength(2);
    expect(game.asteroids.every((a) => a.size === 20 && a.fromSplit)).toBe(true);
  });
});

describe('ship damage', () => {
  it('loses only one life when several asteroids touch the ship at once', () => {
    const game = newGame();
    const { x, y } = game.ship;
    game.ship.invulnerable = 0;
    game.asteroids = [
      stillAsteroid(game, { x: x + 15, y, size: 10 }),
      stillAsteroid(game, { x: x - 15, y, size: 10 }),
      stillAsteroid(game, { x, y: y + 15, size: 10 }),
    ];
    step(game, input(), DT);
    expect(game.lives).toBe(2);
    expect(game.ship.invulnerable).toBeGreaterThan(0);
  });
  it('ends the run when the last life is lost', () => {
    const game = newGame();
    game.lives = 1;
    game.ship.invulnerable = 0;
    game.asteroids = [stillAsteroid(game, { x: game.ship.x, y: game.ship.y, size: 10 })];
    step(game, input(), DT);
    expect(game.mode).toBe('over');
    expect(game.won).toBe(false);
    expect(game.events.some((e) => e.type === 'gameOver')).toBe(true);
  });
  it('restarts on R after game over', () => {
    const game = newGame();
    game.mode = 'over';
    game.score = 500;
    step(game, input({ pressed: { restart: true } }), DT);
    expect(game.mode).toBe('playing');
    expect(game.score).toBe(0);
    expect(game.lives).toBe(3);
  });
});

describe('hit-stop', () => {
  it('freezes the simulation briefly after a big asteroid is destroyed', () => {
    const game = newGame();
    game.ship.invulnerable = 999;
    game.asteroids = [stillAsteroid(game, { x: 100, y: 100, size: 40 })];
    game.missiles = [parkedMissile(100, 100)];
    step(game, input(), DT);
    expect(game.hitStop).toBeCloseTo(HIT_STOP.bigAsteroid);
    expect(game.events.find((ev) => ev.type === 'asteroidDestroyed')).toMatchObject({ x: 100, y: 100, size: 40, points: 20 });
    const shipX = game.ship.x;
    step(game, input({ held: { thrust: true } }), DT);
    expect(game.ship.x).toBe(shipX);
    run(game, 10);
    expect(game.hitStop).toBeLessThanOrEqual(0);
  });
});

describe('sector progression', () => {
  it('advances to the next wave after a short break when the field is clear', () => {
    const game = newGame();
    clearWave(game);
    expect(game.wave).toBe(2);
    expect(game.asteroids.length).toBeGreaterThan(0);
    expect(game.mode).toBe('playing');
  });
  it('brings in the boss after the last wave', () => {
    const game = newGame();
    for (let w = 0; w < SECTORS[0].waves; w++) clearWave(game);
    expect(game.boss).not.toBeNull();
    expect(game.boss.turrets).toHaveLength(SECTORS[0].boss.turrets);
  });
  it('offers three upgrades after the boss, then starts the next sector', () => {
    const game = newGame();
    game.ship.invulnerable = 999;
    for (let w = 0; w < SECTORS[0].waves; w++) clearWave(game);
    game.boss.hp = 1;
    game.boss.shieldTimer = 0;
    game.missiles = [parkedMissile(game.boss.x, game.boss.y)];
    step(game, input(), DT);
    expect(game.boss).toBeNull();
    clearWave(game);
    run(game, 30); // hit-stop from the boss kill
    expect(game.mode).toBe('upgrade');
    expect(game.upgradeChoices).toHaveLength(3);
    const chosen = game.upgradeChoices[1];
    step(game, input({ choice: 1 }), DT);
    expect(game.upgrades[chosen]).toBe(1);
    expect(game.level).toBe(2);
    expect(game.mode).toBe('transition');
    run(game, Math.ceil(LEVEL_TRANSITION_SECONDS / DT) + 2);
    expect(game.mode).toBe('playing');
    expect(game.asteroids.every((a) => Object.keys(SECTORS[1].weights).includes(a.type))).toBe(true);
  });
  it('wins the campaign after the final sector boss', () => {
    const game = newGame(7, 'campaign');
    game.level = SECTORS.length;
    game.director.bossDefeated = true;
    clearWave(game);
    expect(game.mode).toBe('over');
    expect(game.won).toBe(true);
  });
  it('keeps going in endless mode, with a bigger budget each lap', () => {
    const game = newGame(7, 'endless');
    game.level = SECTORS.length;
    game.director.bossDefeated = true;
    clearWave(game);
    expect(game.mode).toBe('upgrade');
    step(game, input({ choice: 0 }), DT);
    expect(game.level).toBe(SECTORS.length + 1);
  });
});

describe('pause', () => {
  it('freezes the simulation and resumes on a second press', () => {
    const game = newGame();
    step(game, input({ pressed: { pause: true } }), DT);
    const snapshot = JSON.stringify(game.asteroids.map((a) => [a.x, a.y]));
    run(game, 60, input({ held: { thrust: true } }));
    expect(JSON.stringify(game.asteroids.map((a) => [a.x, a.y]))).toBe(snapshot);
    step(game, input({ pressed: { pause: true } }), DT);
    expect(game.paused).toBe(false);
  });
});

describe('refresh-rate independence', () => {
  function simulate(fps, seconds) {
    const game = newGame(1234);
    game.ship.invulnerable = 999;
    const loop = createFixedStep({ hz: 60, step: (dt) => step(game, input({ held: { thrust: true, left: true } }), dt) });
    for (let i = 0; i < fps * seconds; i++) loop.advance(1 / fps);
    return game;
  }
  it('produces the same state at 60 Hz and 144 Hz', () => {
    const a = simulate(60, 3);
    const b = simulate(144, 3);
    expect(b.ship.x).toBeCloseTo(a.ship.x, 6);
    expect(b.ship.y).toBeCloseTo(a.ship.y, 6);
    expect(b.asteroids.map((x) => x.x)).toEqual(a.asteroids.map((x) => x.x));
  });
});

describe('world resizing', () => {
  it('lays the run out again if it was created with no size (hidden tab)', () => {
    const game = createGame({ width: 0, height: 0, seed: 3 });
    setWorldSize(game, 800, 600);
    expect([game.ship.x, game.ship.y]).toEqual([400, 300]);
    for (const a of game.asteroids) expect(Math.hypot(a.x - 400, a.y - 300)).toBeGreaterThanOrEqual(150);
  });
  it('scales positions proportionally on an ordinary resize', () => {
    const game = newGame();
    const [ax, ay] = [game.asteroids[0].x, game.asteroids[0].y];
    setWorldSize(game, 1600, 300);
    expect(game.ship.x).toBe(800);
    expect(game.ship.y).toBe(150);
    expect(game.asteroids[0].x).toBeCloseTo(ax * 2);
    expect(game.asteroids[0].y).toBeCloseTo(ay / 2);
  });
});

describe('runs from the title screen', () => {
  it('newRun reseeds, switches mode and can open on the sector intro', async () => {
    const { newRun } = await import('../../src/state/game.js');
    const game = newGame(1);
    game.score = 900;
    newRun(game, { seed: 42, runMode: 'daily', intro: true });
    expect(game.seed).toBe(42);
    expect(game.runMode).toBe('daily');
    expect(game.score).toBe(0);
    expect(game.mode).toBe('transition');
    const again = newGame(1);
    newRun(again, { seed: 42, runMode: 'daily' });
    expect(again.asteroids.map((a) => [a.x, a.y])).toEqual(game.asteroids.map((a) => [a.x, a.y]));
  });
  it('training mode makes the ship indestructible', () => {
    const game = newGame();
    game.options.training = true;
    game.ship.invulnerable = 0;
    game.asteroids = [stillAsteroid(game, { x: game.ship.x, y: game.ship.y, size: 20 })];
    run(game, 10);
    expect(game.lives).toBe(3);
  });
  it('tallies shots, hits and kills for the run summary', () => {
    const game = newGame();
    game.ship.invulnerable = 999;
    game.asteroids = [stillAsteroid(game, { x: 100, y: 100, size: 10 })];
    game.missiles = [parkedMissile(100, 100)];
    step(game, input({ pressed: { fire: true } }), DT);
    expect(game.tally).toMatchObject({ shots: 1, hits: 1, kills: 1 });
  });
});
