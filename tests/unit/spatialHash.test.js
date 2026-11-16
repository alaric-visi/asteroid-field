import { describe, it, expect } from 'vitest';
import { forEachNearPair } from '../../src/systems/spatialHash.js';
import { circlesOverlap } from '../../src/core/math.js';
import { createRng } from '../../src/core/rng.js';

function scene(seed, n, world) {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => ({ x: rng.next() * world.width, y: rng.next() * world.height, size: 5 + rng.next() * 35 }));
}

function overlappingPairs(items, world, viaHash) {
  const out = new Set();
  const test = (i, j) => {
    if (circlesOverlap(items[i], items[j], items[i].size, items[j].size, world)) out.add(`${i}-${j}`);
  };
  if (viaHash) forEachNearPair(items, (a) => a.size, world, test);
  else for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) test(i, j);
  return out;
}

describe('spatial hash broad phase', () => {
  it.each([
    [1, 200, { width: 1280, height: 720 }],
    [2, 300, { width: 900, height: 900 }],
    [3, 60, { width: 120, height: 100 }], // tiny world: grid wraps onto itself
  ])('finds exactly the brute-force overlapping pairs (seed %i)', (seed, n, world) => {
    const items = scene(seed, n, world);
    expect(overlappingPairs(items, world, true)).toEqual(overlappingPairs(items, world, false));
  });

  it('finds pairs that touch across the screen edge', () => {
    const world = { width: 800, height: 600 };
    const items = [{ x: 5, y: 300, size: 20 }, { x: 790, y: 300, size: 20 }];
    expect(overlappingPairs(items, world, true).size).toBe(1);
  });

  it('checks far fewer pairs than all-pairs on a crowded field', () => {
    const world = { width: 1920, height: 1080 };
    const items = scene(4, 400, world).map((a) => ({ ...a, size: 10 + (a.size % 10) }));
    let checks = 0;
    forEachNearPair(items, (a) => a.size, world, () => checks++);
    expect(checks).toBeLessThan((400 * 399) / 2 / 5);
  });
});
