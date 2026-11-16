// Instanced asteroid rendering: one InstancedMesh per (type, shape variant),
// so draw calls stay flat however many asteroids (and debris chunks) exist.
// Objects near an edge get a ghost instance on the far side of the seam.
//
// Per frame: begin() → update() (live asteroids) → add() (e.g. debris) → end().
import * as THREE from 'three';
import { lerpWrapped } from '../core/math.js';
import { wrapOffsets } from './wrap.js';
import { SHAPE } from './effects/spriteBatch.js';
import { makeAsteroidGeometry } from './geometry/asteroidGeometry.js';
import { createAsteroidMaterial, createSharedAsteroidUniforms } from './materials/asteroidMaterials.js';

export const VARIANTS = 6;
const TYPES = ['rock', 'ice', 'plasma', 'metal', 'magnetic', 'crystal', 'comet'];
const HIT_FLASH_SECONDS = 0.12;
const GLOW_ALPHA = { rock: 0, metal: 0, ice: 0.2, magnetic: 0.18, crystal: 0.3, comet: 0.45 };
const COMET_TAIL = [0.55, 0.95, 1.4];
const MAGNET_RING = [0.4, 0.75, 1.6];
const DEPTH_RANGE = 50; // asteroids sit at slightly different heights for parallax
const GLOW_RADIUS = 1.3; // × asteroid size
const SPLIT_FLASH_SECONDS = 0.18;
const STRIDE = 7; // rotation, x, y, z, scale, color, flash

// Colour-blind-safe threat palette: distinct in hue *and* brightness for all
// common colour-vision deficiencies (Okabe–Ito inspired). Silhouettes and
// materials already differ per type, so colour is a secondary cue.
const SAFE_PALETTE = {
  rock: { h: 30 / 360, s: 0.18, l: 0.45 }, // neutral grey-brown
  ice: { h: 202 / 360, s: 0.75, l: 0.62 }, // sky blue
  plasma: { h: 38 / 360, s: 1.0, l: 0.5 }, // orange (hot = danger)
  metal: { h: 0, s: 0, l: 0.7 }, // light grey
  magnetic: { h: 230 / 360, s: 0.8, l: 0.35 }, // deep blue
  crystal: { h: 55 / 360, s: 0.9, l: 0.7 }, // pale yellow
  comet: { h: 200 / 360, s: 0.3, l: 0.9 }, // near white
};

export function createAsteroidView(parent) {
  const shared = createSharedAsteroidUniforms();
  const pools = [];
  const poolByKey = new Map();
  for (const type of TYPES) {
    const material = createAsteroidMaterial(type, shared);
    for (let v = 0; v < VARIANTS; v++) {
      const pool = { geometry: makeAsteroidGeometry(type, v), material, mesh: null, flash: null, capacity: 0, items: [] };
      pools.push(pool);
      poolByKey.set(`${type}:${v}`, pool);
    }
  }

  const states = new Map(); // asteroid id → render-only state

  // Create every pool's mesh up front so renderer.compile() can build all
  // shader programs at load instead of hitching on first appearance.
  const dummy = new THREE.Object3D();
  const offsets = [];
  let accent = null;

  function ensureCapacity(pool, n) {
    if (n <= pool.capacity) return;
    let cap = Math.max(16, pool.capacity);
    while (cap < n) cap *= 2;
    if (pool.mesh) {
      parent.remove(pool.mesh);
      pool.mesh.dispose();
      pool.geometry.dispose(); // drop GPU buffers; re-uploaded with the new per-instance attribute
    }
    pool.flash = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    pool.flash.setUsage(THREE.DynamicDrawUsage);
    pool.geometry.setAttribute('aFlash', pool.flash);
    const mesh = new THREE.InstancedMesh(pool.geometry, pool.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    parent.add(mesh);
    pool.mesh = mesh;
    pool.capacity = cap;
  }

  function begin() {
    for (const pool of pools) pool.items.length = 0;
  }

  /** Queue one instance. `rotation` is an Euler; `color` a THREE.Color. */
  function add(type, variant, x, y, z, rotation, scale, color, flash = 0) {
    poolByKey.get(`${type}:${variant}`).items.push(rotation, x, y, z, scale, color, flash);
  }

  function end() {
    for (const pool of pools) {
      const n = pool.items.length / STRIDE;
      if (n === 0 && !pool.mesh) continue;
      ensureCapacity(pool, n);
      const { mesh, items, flash } = pool;
      for (let i = 0; i < n; i++) {
        const o = i * STRIDE;
        dummy.position.set(items[o + 1], items[o + 2], items[o + 3]);
        dummy.rotation.copy(items[o]);
        dummy.scale.setScalar(items[o + 4]);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, items[o + 5]);
        flash.array[i] = items[o + 6];
      }
      mesh.count = n;
      mesh.visible = n > 0; // skip empty pools entirely
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      flash.needsUpdate = true;
    }
  }

  function colorFor(a, palette, out) {
    const p = palette === 'colorblind' ? SAFE_PALETTE[a.type] : null;
    return p ? out.setHSL(p.h, p.s, p.l + (a.light - 0.55) * 0.3) : out.setHSL(a.hue, a.sat, a.light);
  }

  function stateFor(a, now, palette) {
    let st = states.get(a.id);
    if (st && st.palette !== palette) {
      colorFor(a, palette, st.color);
      st.palette = palette;
    }
    if (!st) {
      st = {
        palette,
        rotation: new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28),
        depthZ: (Math.random() - 0.5) * DEPTH_RANGE,
        variant: a.id % VARIANTS,
        color: colorFor(a, palette, new THREE.Color()),
        born: now,
      };
      states.set(a.id, st);
    }
    return st;
  }

  /** Metal and other multi-hit rocks flash when struck but not destroyed. */
  function onHit(id, now) {
    const st = states.get(id);
    if (st) st.hitAt = now;
  }

  function update(game, { alpha, frameSeconds, now, theme, effects }, glow) {
    const { width, height } = game.world;
    const dt = game.paused || game.hitStop > 0 ? 0 : frameSeconds;
    shared.uTime.value = now;
    if (theme.accent !== accent) {
      accent = theme.accent;
      shared.uRimColor.value.set(accent);
    }

    const seen = new Set();
    for (const a of game.asteroids) {
      seen.add(a.id);
      const st = stateFor(a, now, effects.palette);
      st.rotation.x += a.spin.x * dt;
      st.rotation.y += a.spin.y * dt;
      st.rotation.z += a.spin.z * dt;

      const x = lerpWrapped(a.prevX, a.x, alpha, width);
      const y = lerpWrapped(a.prevY, a.y, alpha, height);
      const pulse = a.type === 'plasma' ? 1 + Math.sin(now * 4 + a.pulsePhase) * 0.06 : 1;
      const splitFlash = a.fromSplit ? Math.max(0, 1 - (now - st.born) / SPLIT_FLASH_SECONDS) : 0;
      const hitFlash = st.hitAt ? Math.max(0, 1 - (now - st.hitAt) / HIT_FLASH_SECONDS) : 0;
      const flash = Math.max(splitFlash, hitFlash) * effects.flashScale;
      const glowAlpha = GLOW_ALPHA[a.type] ?? (0.14 + Math.sin(now * 6 + a.pulsePhase) * 0.06); // plasma pulses
      const { r, g, b } = st.color;

      if (a.type === 'comet') drawCometTail(a, x, y, glow);
      if (a.type === 'magnetic') drawMagnetRings(a, x, y, now, glow);

      wrapOffsets(x, y, a.size * GLOW_RADIUS, width, height, offsets);
      for (let i = 0; i < offsets.length; i += 2) {
        const px = x + offsets[i], py = y + offsets[i + 1];
        add(a.type, st.variant, px, py, st.depthZ, st.rotation, a.size * pulse, st.color, flash);
        if (glowAlpha > 0) glow.push(px, py, st.depthZ - a.size, a.size * GLOW_RADIUS * pulse, r, g, b, glowAlpha, SHAPE.glow);
      }
    }

    for (const id of states.keys()) if (!seen.has(id)) states.delete(id);
  }

  function drawCometTail(a, x, y, glow) {
    const s = Math.hypot(a.vx, a.vy) || 1;
    const dx = -a.vx / s, dy = -a.vy / s;
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const d = 8 + t * 80;
      const wobble = Math.sin(i * 1.7) * t * 6;
      glow.push(x + dx * d - dy * wobble, y + dy * d + dx * wobble, -4, (1 - t) * 11 + 3,
        COMET_TAIL[0] * 2.2, COMET_TAIL[1] * 2.2, COMET_TAIL[2] * 2.2, (1 - t) * 0.5, SHAPE.glow);
    }
  }

  function drawMagnetRings(a, x, y, now, glow) {
    const R = 280; // matches data/asteroidTypes.js magnetic.pull.radius
    for (let k = 0; k < 2; k++) {
      const t = (now * 0.5 + k * 0.5) % 1; // rings contract toward the core
      const r = a.size + (R - a.size) * (1 - t);
      glow.push(x, y, -6, r, MAGNET_RING[0], MAGNET_RING[1], MAGNET_RING[2], 0.12 * Math.sin(t * Math.PI), SHAPE.ring, 0, 1.5 / r);
    }
  }

  for (const pool of pools) ensureCapacity(pool, 16);

  return { begin, add, update, end, onHit };
}
