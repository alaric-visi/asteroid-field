import { describe, it, expect } from 'vitest';
import { resolveAsteroidCollisions } from '../../src/systems/physics.js';
import { wrapPosition } from '../../src/core/math.js';
import { createRng } from '../../src/core/rng.js';

const body = (x, y, vx, vy, size) => ({ x, y, vx, vy, size, spin: { x: 0, y: 0, z: 0 } });

describe('resolveAsteroidCollisions', () => {
  it('conserves momentum and separates overlapping asteroids', () => {
    const a = body(0, 0, 100, 0, 40);
    const b = body(50, 0, -50, 0, 20);
    const momentum = (o) => o.size * o.size * o.vx;
    const before = momentum(a) + momentum(b);
    let impacts = 0;
    resolveAsteroidCollisions([a, b], createRng(1), null, () => impacts++);
    expect(momentum(a) + momentum(b)).toBeCloseTo(before, 6);
    expect(Math.abs(b.x - a.x)).toBeCloseTo(60, 6);
    expect(a.vx).toBeLessThan(b.vx); // now separating
    expect(impacts).toBe(1);
  });
  it('ignores asteroids that are not touching', () => {
    const a = body(0, 0, 10, 0, 10), b = body(100, 0, -10, 0, 10);
    resolveAsteroidCollisions([a, b], createRng(1));
    expect(a.vx).toBe(10);
    expect(b.vx).toBe(-10);
  });
});

describe('collisions across the screen-wrap seam', () => {
  it('bounces asteroids touching across the left/right edge', () => {
    const world = { width: 800, height: 600 };
    const a = body(5, 300, -50, 0, 20); // near the left edge, moving left
    const b = body(790, 300, 50, 0, 20); // near the right edge, moving right
    resolveAsteroidCollisions([a, b], createRng(1), world);
    expect(a.vx).toBeGreaterThan(0); // pushed back right
    expect(b.vx).toBeLessThan(0);
    for (const o of [a, b]) {
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.x).toBeLessThanOrEqual(800);
    }
  });
});

describe('wrapPosition', () => {
  it('wraps across all four edges, preserving overshoot', () => {
    const p = { x: -5, y: 610 };
    wrapPosition(p, 800, 600);
    expect(p).toEqual({ x: 795, y: 10 });
  });
});
