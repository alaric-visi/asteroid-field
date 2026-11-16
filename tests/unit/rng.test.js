import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/core/rng.js';

describe('createRng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42), b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('differs between seeds and stays in [0, 1)', () => {
    const a = createRng(1), b = createRng(2);
    let same = 0;
    for (let i = 0; i < 1000; i++) {
      const x = a.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      if (x === b.next()) same++;
    }
    expect(same).toBeLessThan(5);
  });
});
