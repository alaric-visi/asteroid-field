// Seeded pseudo-random generator (mulberry32). All gameplay randomness goes
// through one of these so a run can be reproduced from its seed.
export function createRng(seed = 1) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed: seed >>> 0,
    next,
    /** Uniform in [min, max). */
    range: (min, max) => min + (max - min) * next(),
    /** Uniform in [-scale/2, scale/2) — matches the legacy `(Math.random() - 0.5) * scale`. */
    signed: (scale = 1) => (next() - 0.5) * scale,
    chance: (p) => next() < p,
    angle: () => next() * Math.PI * 2,
  };
}
