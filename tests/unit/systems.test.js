import { describe, it, expect } from 'vitest';
import { step } from '../../src/state/game.js';
import { WEAPON, HYPERSPACE, SHIELD, COMBO, FROST } from '../../src/data/tuning.js';
import { createMissile } from '../../src/entities/missile.js';
import { spawnPickup } from '../../src/systems/pickups.js';
import { spawnSaucer } from '../../src/systems/enemies.js';
import { spawnComet } from '../../src/systems/asteroids.js';
import { input, stillAsteroid, arena, run } from './helpers.js';

const DT = 1 / 60;
const parked = (x, y, angle = 0) => Object.assign(createMissile(x, y, angle), { vx: 0, vy: 0 });

describe('combo multiplier', () => {
  it('rises every few quick kills and resets when the window lapses', () => {
    const game = arena();
    for (let i = 0; i < COMBO.killsPerStep; i++) {
      game.asteroids.push(stillAsteroid(game, { x: 200 + i * 60, y: 200, size: 10 }));
      game.missiles.push(parked(200 + i * 60, 200));
    }
    step(game, input(), DT);
    expect(game.combo.count).toBe(COMBO.killsPerStep);
    expect(game.combo.multiplier).toBe(2);
    run(game, Math.ceil(COMBO.window / DT) + 1);
    expect(game.combo.multiplier).toBe(1);
  });
  it('is broken by taking a hit', () => {
    const game = arena();
    game.combo.count = 12;
    game.combo.multiplier = 3;
    game.asteroids.push(stillAsteroid(game, { x: game.ship.x, y: game.ship.y, size: 10 }));
    step(game, input(), DT);
    expect(game.combo.multiplier).toBe(1);
  });
});

describe('weapon heat', () => {
  it('overheats under sustained fire, locks, then recovers', () => {
    const game = arena({ autoFire: true });
    game.ship.invulnerable = 999;
    run(game, 480, input({ held: { fire: true } }));
    expect(game.events.some((e) => e.type === 'overheated')).toBe(true);
    game.ship.heat = WEAPON.maxHeat;
    game.ship.overheated = true;
    const before = game.missiles.length;
    step(game, input({ pressed: { fire: true } }), DT);
    expect(game.missiles.length).toBe(before);
    run(game, 180);
    expect(game.ship.overheated).toBe(false);
  });
  it('rapid-fire pickup makes no heat', () => {
    const game = arena({ autoFire: true });
    game.ship.buffs.rapid = 5;
    run(game, 60, input({ held: { fire: true } }));
    expect(game.ship.heat).toBe(0);
  });
  it('spread pickup fires three barrels', () => {
    const game = arena();
    game.ship.buffs.spread = 5;
    step(game, input({ pressed: { fire: true } }), DT);
    expect(game.missiles).toHaveLength(3);
  });
});

describe('hyperspace', () => {
  it('vanishes, reappears elsewhere, and goes on cooldown', () => {
    const game = arena();
    game.stats.safeJump = true;
    const start = { x: game.ship.x, y: game.ship.y };
    step(game, input({ pressed: { hyperspace: true } }), DT);
    expect(game.ship.jump?.phase).toBe('out');
    run(game, Math.ceil((HYPERSPACE.chargeSeconds + HYPERSPACE.reappearSeconds) / DT) + 2);
    expect(game.ship.jump).toBeNull();
    expect(Math.hypot(game.ship.x - start.x, game.ship.y - start.y)).toBeGreaterThan(1);
    step(game, input({ pressed: { hyperspace: true } }), DT);
    expect(game.ship.jump).toBeNull(); // still cooling down
  });
  it('cannot be hit mid-jump', () => {
    const game = arena();
    step(game, input({ pressed: { hyperspace: true } }), DT);
    game.asteroids.push(stillAsteroid(game, { x: game.ship.x, y: game.ship.y, size: 20 }));
    step(game, input(), DT);
    expect(game.lives).toBe(3);
  });
});

describe('energy shield', () => {
  it('blocks damage and smashes small rocks, draining energy', () => {
    const game = arena();
    game.asteroids.push(stillAsteroid(game, { x: game.ship.x + 18, y: game.ship.y, size: 10 }));
    step(game, input({ held: { shield: true } }), DT);
    expect(game.lives).toBe(3);
    expect(game.asteroids.find((a) => a.x === game.ship.x + 18)).toBeUndefined();
    expect(game.ship.energy).toBeLessThan(SHIELD.max);
  });
  it('runs out and needs a minimum charge to restart', () => {
    const game = arena();
    run(game, 200, input({ held: { shield: true } }));
    expect(game.ship.shieldActive).toBe(false);
    expect(game.ship.energy).toBe(0);
  });
});

describe('asteroid behaviours', () => {
  it('metal takes several hits', () => {
    const game = arena();
    const metal = stillAsteroid(game, { x: 300, y: 300, size: 40, type: 'metal', hp: 3, maxHp: 3 });
    game.asteroids.push(metal);
    for (let i = 0; i < 2; i++) {
      game.missiles.push(createMissile(262, 300, 0)); // head-on from the left
      step(game, input(), DT);
      run(game, 6);
    }
    expect(metal.dead).toBe(false);
    expect(metal.hp).toBe(1);
  });
  it('metal ricochets glancing shots', () => {
    const game = arena();
    game.asteroids.push(stillAsteroid(game, { x: 300, y: 300, size: 40, type: 'metal', hp: 3, maxHp: 3 }));
    // Skimming the top edge, travelling right.
    const m = createMissile(300, 300 - 41, 0);
    game.missiles.push(m);
    step(game, input(), DT);
    expect(game.events.some((e) => e.type === 'deflect')).toBe(true);
    expect(game.asteroids.some((a) => a.type === 'metal' && a.hp === 3)).toBe(true);
  });
  it('plasma detonates and chains into neighbours', () => {
    const game = arena();
    game.ship.invulnerable = 999;
    game.asteroids.push(
      stillAsteroid(game, { x: 400, y: 400, size: 12, type: 'plasma' }),
      stillAsteroid(game, { x: 440, y: 400, size: 12, type: 'plasma' }),
      stillAsteroid(game, { x: 480, y: 400, size: 12, type: 'plasma' }),
    );
    game.missiles.push(parked(400, 400));
    run(game, 40);
    expect(game.asteroids.filter((a) => a.type === 'plasma')).toHaveLength(0);
    expect(game.events.filter((e) => e.type === 'blast').length).toBeGreaterThanOrEqual(1);
  });
  it('ice leaves a frost field that slows the ship', () => {
    const game = arena();
    game.ship.invulnerable = 999;
    game.asteroids.push(stillAsteroid(game, { x: game.ship.x + 22, y: game.ship.y, size: 12, type: 'ice' }));
    game.missiles.push(parked(game.ship.x + 22, game.ship.y));
    step(game, input(), DT);
    expect(game.frostFields).toHaveLength(1);
    step(game, input(), DT);
    expect(game.ship.frosted).toBe(true);
    expect(FROST.thrustMul).toBeLessThan(1);
  });
  it('magnetic rocks pull the ship in', () => {
    const game = arena();
    game.asteroids.push(stillAsteroid(game, { x: game.ship.x + 150, y: game.ship.y, size: 25, type: 'magnetic', hp: 3 }));
    run(game, 30);
    expect(game.ship.vx).toBeGreaterThan(0);
  });
  it('crystals always drop a pickup', () => {
    const game = arena();
    game.asteroids.push(stillAsteroid(game, { x: 300, y: 300, size: 25, type: 'crystal' }));
    game.missiles.push(parked(300, 300));
    step(game, input(), DT);
    expect(game.pickups).toHaveLength(1);
  });
  it('comets cross once and leave without blocking the wave', () => {
    const game = arena();
    spawnComet(game);
    const comet = game.asteroids.find((a) => a.type === 'comet');
    expect(comet).toBeDefined();
    run(game, 60 * 12);
    expect(game.asteroids.find((a) => a.type === 'comet')).toBeUndefined();
  });
});

describe('pickups', () => {
  it('are collected on contact and apply their effect', () => {
    const game = arena();
    game.ship.energy = 10;
    spawnPickup(game, game.ship.x, game.ship.y, 'shield');
    step(game, input(), DT);
    expect(game.ship.energy).toBe(game.stats.shieldMax);
    spawnPickup(game, game.ship.x, game.ship.y, 'life');
    step(game, input(), DT);
    expect(game.lives).toBe(4);
  });
});

describe('saucers', () => {
  it('cross the screen, shoot, and score when destroyed', () => {
    const game = arena();
    game.ship.invulnerable = 999;
    spawnSaucer(game, 'small');
    run(game, 120);
    expect(game.events.some((e) => e.type === 'enemyShot') || game.enemyShots.length > 0).toBe(true);
    const saucer = game.enemies[0];
    game.missiles.push(parked(saucer.x, saucer.y));
    step(game, input(), DT);
    expect(game.enemies).toHaveLength(0);
    expect(game.score).toBeGreaterThanOrEqual(1000);
  });
});
