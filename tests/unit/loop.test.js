import { describe, it, expect } from 'vitest';
import { createFixedStep } from '../../src/core/loop.js';

function ticksFor(fps, seconds) {
  let ticks = 0;
  const loop = createFixedStep({ hz: 60, step: () => ticks++ });
  for (let i = 0; i < fps * seconds; i++) loop.advance(1 / fps);
  return ticks;
}

describe('createFixedStep', () => {
  it.each([30, 60, 75, 120, 144, 240])('runs 60 ticks per second at %i fps', (fps) => {
    expect(ticksFor(fps, 5)).toBe(300);
  });
  it('clamps huge frame gaps (e.g. returning to a background tab)', () => {
    let ticks = 0;
    const loop = createFixedStep({ hz: 60, step: () => ticks++ });
    loop.advance(10);
    expect(ticks).toBe(15);
  });
  it('reports interpolation alpha in [0, 1]', () => {
    const loop = createFixedStep({ hz: 60, step: () => {} });
    const { ticks, alpha } = loop.advance(1 / 120);
    expect(ticks).toBe(0);
    expect(alpha).toBeCloseTo(0.5);
  });
});
