// Turns simulation effect state (particles, shockwaves, missiles, engine
// trail) into sprites. Colours are pushed above 1.0 where they should bloom.
import { lerpWrapped } from '../../core/math.js';
import { SHAPE } from './spriteBatch.js';
import { linearRgb, hexToLinear } from '../colors.js';

const MISSILE_HEAD = hexToLinear('#fff4cc', 4.0);
const MISSILE_HALO = hexToLinear('#ffc832', 1.2);
const MISSILE_TRAIL = hexToLinear('#ffb020', 1.8);
const ENGINE_TRAIL = hexToLinear('#ff8c1e', 1.2);
const ENGINE_TRAIL_LIFE = 16 / 60;
const FX_Z = 30; // above most asteroids so sparks aren't swallowed
const FROST = hexToLinear('#9fe6ff', 1.4);

/** Emit sprites along a polyline, subdividing for a continuous ribbon; breaks at wrap jumps. */
function ribbon(points, maxJump, spacing, emit) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) > maxJump || Math.abs(dy) > maxJump) continue;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      emit(a.x + dx * t, a.y + dy * t, (i - 1 + t) / (points.length - 1), a, b, t);
    }
  }
}

export function drawEffects(game, { alpha }, glow, solid) {
  const { width, height } = game.world;
  const maxJump = Math.min(width, height) / 2;
  const { fx } = game;

  // Frost fields: a cold shimmer that fades as the field expires.
  for (const f of game.frostFields) {
    const k = Math.min(1, f.life / f.maxLife * 1.5);
    glow.push(f.x, f.y, -20, f.r, FROST[0] * 0.35, FROST[1] * 0.35, FROST[2] * 0.35, 0.35 * k, SHAPE.glow);
    glow.push(f.x, f.y, -18, f.r, FROST[0], FROST[1], FROST[2], 0.35 * k, SHAPE.ring, 0, 2 / f.r);
  }

  // Engine exhaust ribbon.
  ribbon(fx.engineTrail, maxJump, 3, (x, y, _u, a, b, t) => {
    const life = (a.life + (b.life - a.life) * t) / ENGINE_TRAIL_LIFE;
    glow.push(x, y, -2, 2 + life * 3, ENGINE_TRAIL[0], ENGINE_TRAIL[1], ENGINE_TRAIL[2], 0.35 * life, SHAPE.glow);
  });

  // Missiles: tapered trail plus a white-hot head.
  for (const m of game.missiles) {
    const hx = lerpWrapped(m.prevX, m.x, alpha, width);
    const hy = lerpWrapped(m.prevY, m.y, alpha, height);
    const points = m.trail.length ? [...m.trail, { x: hx, y: hy }] : [];
    ribbon(points, maxJump, 1.5, (x, y, u) => {
      glow.push(x, y, 0, 1.4 + u * 2.0, MISSILE_TRAIL[0], MISSILE_TRAIL[1], MISSILE_TRAIL[2], 0.08 + u * 0.35, SHAPE.spark);
    });
    glow.push(hx, hy, 1, 5, MISSILE_HEAD[0], MISSILE_HEAD[1], MISSILE_HEAD[2], 1, SHAPE.spark);
    glow.push(hx, hy, 0, 14, MISSILE_HALO[0], MISSILE_HALO[1], MISSILE_HALO[2], 0.35, SHAPE.glow);
  }

  // Particles: glowing sparks and solid tumbling debris.
  for (const p of fx.particles) {
    const a = p.life / p.maxLife;
    if (p.kind === 'spark') {
      const c = linearRgb(p.rgb, 2.4);
      glow.push(p.x, p.y, FX_Z, p.size * a * 1.8, c[0], c[1], c[2], a, SHAPE.spark);
    } else {
      const c = linearRgb(p.rgb, 1.1);
      solid.push(p.x, p.y, FX_Z, p.size * a * 1.1, c[0], c[1], c[2], a, SHAPE.shard, -p.rot);
      glow.push(p.x, p.y, FX_Z - 1, p.size * a * 2, c[0], c[1], c[2], a * 0.25, SHAPE.glow);
    }
  }

  // Shockwave rings (constant 2.5 px line width).
  for (const sw of fx.shockwaves) {
    const c = linearRgb(sw.rgb, 1.8);
    glow.push(sw.x, sw.y, FX_Z, sw.r, c[0], c[1], c[2], sw.alpha, SHAPE.ring, 0, 2.5 / Math.max(sw.r, 1));
  }
}
