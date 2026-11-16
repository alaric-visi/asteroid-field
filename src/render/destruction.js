// Cosmetic destruction: 3D rock chunks that tumble out of a destroyed asteroid,
// expanding dust puffs, and short-lived impact lights. Driven by simulation
// events; uses Math.random because none of it affects gameplay.
import * as THREE from 'three';
import { SHAPE } from './effects/spriteBatch.js';
import { VARIANTS } from './asteroids.js';

const LIGHTS = 2; // every lit pixel pays for every light, so keep this small
const DUST_GREY = new THREE.Color(0.18, 0.17, 0.16);

export function createDestructionView(parent, asteroids) {
  const chunks = [];
  const puffs = [];
  const lights = Array.from({ length: LIGHTS }, () => {
    const l = new THREE.PointLight(0xffffff, 0, 300, 0);
    parent.add(l);
    return { light: l, peak: 0, age: Infinity };
  });
  let nextLight = 0;

  function flashLight(x, y, color, peak) {
    const slot = lights[nextLight++ % LIGHTS];
    slot.light.position.set(x, y, 60);
    slot.light.color.copy(color);
    slot.peak = peak;
    slot.age = 0;
  }

  function onAsteroidDestroyed(e) {
    const color = new THREE.Color().setHSL(e.hue, e.sat, e.light);
    const count = e.size > 30 ? 10 : e.size > 15 ? 7 : 4;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 170;
      const maxLife = 0.6 + Math.random() * 0.7;
      chunks.push({
        type: e.asteroidType,
        variant: Math.floor(Math.random() * VARIANTS),
        x: e.x + Math.cos(a) * e.size * 0.35,
        y: e.y + Math.sin(a) * e.size * 0.35,
        z: 0,
        vx: e.vx * 0.5 + Math.cos(a) * speed,
        vy: e.vy * 0.5 + Math.sin(a) * speed,
        vz: (Math.random() - 0.25) * 220,
        rotation: new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
        spin: [(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12],
        scale: e.size * (0.13 + Math.random() * 0.16),
        life: maxLife,
        maxLife,
        color,
      });
    }
    const dust = color.clone().lerp(DUST_GREY, 0.55);
    for (let i = 0; i < 3; i++) {
      puffs.push({
        x: e.x + (Math.random() - 0.5) * e.size * 0.5,
        y: e.y + (Math.random() - 0.5) * e.size * 0.5,
        vx: e.vx * 0.3 + (Math.random() - 0.5) * 40,
        vy: e.vy * 0.3 + (Math.random() - 0.5) * 40,
        from: e.size * 0.5, to: e.size * (1.6 + Math.random() * 0.6),
        life: 0.9, maxLife: 0.9, color: dust,
      });
    }
    flashLight(e.x, e.y, color, 2.5 + e.size / 10);
  }

  function onShipDestroyed(e) {
    const cyan = new THREE.Color(0.3, 0.8, 1.0);
    flashLight(e.x, e.y, cyan, 9);
    for (let i = 0; i < 4; i++) {
      puffs.push({
        x: e.x, y: e.y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60,
        from: 10, to: 70 + Math.random() * 40, life: 1.1, maxLife: 1.1, color: cyan.clone().multiplyScalar(0.4),
      });
    }
  }

  function update(game, { frameSeconds, effects }, solid) {
    const dt = game.paused || game.hitStop > 0 ? 0 : frameSeconds;
    const drag = Math.pow(0.4, dt);

    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i];
      c.life -= dt;
      if (c.life <= 0) { chunks.splice(i, 1); continue; }
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      c.vx *= drag; c.vy *= drag; c.vz *= drag;
      c.rotation.x += c.spin[0] * dt;
      c.rotation.y += c.spin[1] * dt;
      c.rotation.z += c.spin[2] * dt;
      const age = c.maxLife - c.life;
      const shrink = Math.min(1, c.life / (c.maxLife * 0.35));
      asteroids.add(c.type, c.variant, c.x, c.y, c.z, c.rotation, c.scale * shrink, c.color, Math.max(0, 1 - age / 0.12) * 0.7 * effects.flashScale);
    }

    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.life -= dt;
      if (p.life <= 0) { puffs.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const t = 1 - p.life / p.maxLife;
      const ease = 1 - (1 - t) ** 3;
      const size = p.from + (p.to - p.from) * ease;
      solid.push(p.x, p.y, -15, size, p.color.r, p.color.g, p.color.b, 0.32 * (1 - t), SHAPE.glow);
    }

    for (const slot of lights) {
      slot.age += dt;
      slot.light.intensity = slot.age < 1 ? slot.peak * Math.exp(-slot.age * 12) * (0.4 + 0.6 * effects.flashScale) : 0;
    }
  }

  return { onAsteroidDestroyed, onShipDestroyed, update };
}
