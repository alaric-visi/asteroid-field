// Cosmetic effect state (particles, shockwaves, engine trail, shake).
// Simulated on the fixed tick so it looks identical at any refresh rate,
// but uses its own RNG so it never perturbs gameplay determinism.
import { SHAKE, LEGACY_HZ } from '../data/tuning.js';
import { perTick } from '../core/math.js';
import { hexToRgb } from '../core/color.js';

const THRUST_COLORS = [hexToRgb('#ff6600'), hexToRgb('#ffcc33')];

/** `particleCap` is set by the presentation layer from the quality tier. */
export function createEffects() {
  return { particles: [], shockwaves: [], engineTrail: [], shake: 0, particleCap: Infinity };
}

export function spawnBurst(fx, rng, x, y, rgb, count = 12) {
  for (let i = 0; i < count; i++) {
    if (fx.particles.length >= fx.particleCap) return;
    const angle = (Math.PI * 2 * i) / count + rng.next() * 0.4;
    const speed = (1.5 + rng.next() * 4) * LEGACY_HZ;
    const life = (34 + rng.next() * 20) / LEGACY_HZ;
    fx.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: 54 / LEGACY_HZ,
      rgb,
      size: 2.5 + rng.next() * 3.5,
      kind: rng.chance(0.35) ? 'debris' : 'spark',
      rot: rng.angle(),
      rotSpeed: rng.signed(0.3) * LEGACY_HZ,
    });
  }
}

export function spawnThrustParticle(fx, rng, x, y, angle) {
  if (fx.particles.length >= fx.particleCap) return;
  const life = 22 / LEGACY_HZ;
  fx.particles.push({
    x: x + rng.signed(6),
    y: y + rng.signed(6),
    vx: (-Math.cos(angle) * 3 + rng.signed(2)) * LEGACY_HZ,
    vy: (-Math.sin(angle) * 3 + rng.signed(2)) * LEGACY_HZ,
    life,
    maxLife: life,
    rgb: THRUST_COLORS[rng.chance(0.5) ? 0 : 1],
    size: 2 + rng.next() * 2.5,
    kind: 'spark',
    rot: 0,
    rotSpeed: 0,
  });
}

/** `scale` > 1 makes a bigger, faster ring (blasts, boss death). */
export function spawnShockwave(fx, x, y, rgb, scale = 1) {
  fx.shockwaves.push({ x, y, r: 4, alpha: 0.9, rgb, growth: 8 * LEGACY_HZ * scale });
}

export function addShake(fx, amount) {
  fx.shake = Math.min(SHAKE.max, fx.shake + amount);
}

export function pushEngineTrail(fx, x, y) {
  fx.engineTrail.push({ x, y, life: 16 / LEGACY_HZ });
}

export function updateEffects(fx, dt) {
  const particleDrag = perTick(0.98, dt);
  fx.particles = fx.particles.filter((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= particleDrag;
    p.vy *= particleDrag;
    p.rot += p.rotSpeed * dt;
    p.life -= dt;
    return p.life > 0;
  });

  const growthDecay = perTick(0.94, dt);
  const alphaDecay = perTick(0.9, dt);
  fx.shockwaves = fx.shockwaves.filter((sw) => {
    sw.r += sw.growth * dt;
    sw.growth *= growthDecay;
    sw.alpha *= alphaDecay;
    return sw.alpha > 0.02;
  });

  fx.engineTrail = fx.engineTrail.filter((p) => (p.life -= dt) > 0);

  if (fx.shake > 0) {
    fx.shake *= perTick(SHAKE.decayPerLegacyFrame, dt);
    if (fx.shake < 0.05) fx.shake = 0;
  }
}
