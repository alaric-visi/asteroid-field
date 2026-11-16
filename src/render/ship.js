// The player ship as a lit 3D model: extruded hull built from the legacy
// silhouette, glass canopy, theme-coloured wing fins, bank on turns, a thrust
// light that illuminates nearby asteroids, and ghost copies at screen seams.
import * as THREE from 'three';
import { lerpWrapped } from '../core/math.js';
import { SHIP } from '../data/tuning.js';
import { wrapOffsets } from './wrap.js';
import { SHAPE } from './effects/spriteBatch.js';
import { hexToLinear } from './colors.js';
import { createShield } from './shield.js';

const MAX_BANK = 0.5; // rad
const MUZZLE_SECONDS = 0.07;
const MUZZLE_COLOR = hexToLinear('#fff1c4', 6.0);
const FLAME_STOPS = [
  [5.0, 4.6, 3.2],
  [4.0, 1.9, 0.25],
  [2.4, 0.45, 0.04],
  [1.0, 0.08, 0.0],
];

function extrude(points, depth, bevel = 0.8) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

function buildModel(accentMaterial) {
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: 0x3aa0e8, metalness: 0.6, roughness: 0.32, flatShading: true,
    emissive: 0x0a3a5c, emissiveIntensity: 0.8,
  });
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfe9ff, metalness: 0.1, roughness: 0.05, emissive: 0x7fd4ff, emissiveIntensity: 1.6,
  });

  const hull = new THREE.Mesh(extrude([[19, 0], [-9, -10], [-4, 0], [-9, 10]], 5, 1.4), hullMaterial);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), canopyMaterial);
  canopy.scale.set(6, 2.4, 2.2);
  canopy.position.set(9, 0, 3.2);
  const finTop = new THREE.Mesh(extrude([[-4, -8.5], [-8, -9.5], [-6, -4]], 6.5, 0.5), accentMaterial);
  const finBottom = new THREE.Mesh(extrude([[-4, 8.5], [-6, 4], [-8, 9.5]], 6.5, 0.5), accentMaterial);

  const bank = new THREE.Group();
  bank.add(hull, canopy, finTop, finBottom);
  const root = new THREE.Group();
  root.add(bank);
  return root;
}

export function createShipView(parent) {
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xffaa44, emissive: 0xffaa44, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.4, flatShading: true,
  });
  const main = buildModel(accentMaterial);
  parent.add(main);
  const ghosts = [0, 1, 2].map(() => {
    const g = main.clone(true); // shares geometry and materials
    g.visible = false;
    parent.add(g);
    return g;
  });

  const thrustLight = new THREE.PointLight(0xff8a2a, 0, 360, 0);
  parent.add(thrustLight);

  const shield = createShield(SHIP.radius + 10);
  parent.add(shield.mesh);
  let shieldLevel = 0;
  const cockpitColor = hexToLinear('#ffb428', 3.0);
  const offsets = [];
  let bank = 0;
  let accent = null;
  let thrustLevel = 0;
  let muzzle = 0; // 1 → 0 over MUZZLE_SECONDS after each shot
  const jumps = []; // hyperspace effects: { x, y, t, kind: 'out' | 'in' }
  let kick = 0; // recoil offset of the model, px

  function place(model, x, y, angle) {
    model.position.set(x - Math.cos(angle) * kick, y - Math.sin(angle) * kick, 0);
    model.rotation.z = angle;
    model.children[0].rotation.x = bank;
  }

  function update(game, { alpha, frameSeconds, now, theme }, glow) {
    const { ship, world } = game;
    const dt = game.paused ? 0 : frameSeconds;

    if (theme.accent !== accent) {
      accent = theme.accent;
      accentMaterial.color.set(accent);
      accentMaterial.emissive.set(accent);
    }

    const invulnerableFrames = Math.ceil(ship.invulnerable * 60);
    const visible = ship.alive && !ship.jump && (invulnerableFrames === 0 || Math.floor(invulnerableFrames / 4) % 2 === 1);
    const x = lerpWrapped(ship.prevX, ship.x, alpha, world.width);
    const y = lerpWrapped(ship.prevY, ship.y, alpha, world.height);
    const angle = ship.prevAngle + (ship.angle - ship.prevAngle) * alpha;

    // Bank into turns (turn rate is recovered from the last tick's angle change).
    const turn = (ship.angle - ship.prevAngle) * 60 / SHIP.turnRate;
    bank += (Math.max(-1, Math.min(1, turn)) * MAX_BANK - bank) * (1 - Math.exp(-dt * 10));

    main.visible = visible;
    place(main, x, y, angle);
    wrapOffsets(x, y, ship.radius + 8, world.width, world.height, offsets);
    ghosts.forEach((g, i) => {
      const k = (i + 1) * 2;
      g.visible = visible && k < offsets.length;
      if (g.visible) place(g, x + offsets[k], y + offsets[k + 1], angle);
    });

    const cos = Math.cos(angle), sin = Math.sin(angle);
    const boosting = visible && ship.boosting && game.mode === 'playing';
    thrustLevel += ((boosting ? 1 : 0) - thrustLevel) * (1 - Math.exp(-dt * 14));
    thrustLight.intensity = thrustLevel * (game.paused ? 3 : 2.6 + Math.random() * 0.8);
    thrustLight.position.set(x - cos * 22, y - sin * 22, 30);

    // Shield: stays solid (no blink) and fades out as invulnerability ends.
    const shieldTarget = !ship.alive || ship.jump ? 0
      : ship.shieldActive ? 1.15
      : ship.invulnerable > 0 ? Math.min(1, ship.invulnerable / 0.4) : 0;
    shieldLevel += (shieldTarget - shieldLevel) * (1 - Math.exp(-frameSeconds * 12));
    shield.mesh.position.set(x, y, 0);
    shield.update(shieldLevel * (0.85 + Math.sin(now * 20) * 0.15), now);

    // Hyperspace: a collapsing ring where the ship left, a bloom where it arrives.
    for (let i = jumps.length - 1; i >= 0; i--) {
      const j = jumps[i];
      j.t += dt;
      const k = j.t / 0.45;
      if (k >= 1) { jumps.splice(i, 1); continue; }
      const r = j.kind === 'out' ? 46 * (1 - k) + 4 : 6 + 60 * k;
      glow.push(j.x, j.y, 8, r, 1.2, 2.2, 4, (1 - k) * 0.9, SHAPE.ring, 0, 3 / r);
      glow.push(j.x, j.y, 6, 26 * (1 - k) + 6, 2, 3, 4.5, (1 - k) * 0.8, SHAPE.spark);
    }

    // Heat: the nose glows red as the cannon heats up, and flickers when locked.
    if (visible && ship.heat > 55) {
      const h = (ship.heat - 55) / 45;
      const flick = ship.overheated ? 0.6 + 0.4 * Math.sin(now * 30) : 1;
      glow.push(x + cos * 12, y + sin * 12, 6, 5 + h * 5, 3.5, 0.5, 0.1, h * 0.8 * flick, SHAPE.spark);
    }

    muzzle = Math.max(0, muzzle - dt / MUZZLE_SECONDS);
    kick *= Math.exp(-dt * 25);

    if (!visible) return;

    if (muzzle > 0) {
      const mx = x + cos * 21, my = y + sin * 21;
      glow.push(mx, my, 4, 9 * muzzle, MUZZLE_COLOR[0], MUZZLE_COLOR[1], MUZZLE_COLOR[2], muzzle, SHAPE.spark);
      glow.push(mx + cos * 6, my + sin * 6, 4, 5 * muzzle, MUZZLE_COLOR[0], MUZZLE_COLOR[1] * 0.8, MUZZLE_COLOR[2] * 0.5, muzzle * 0.8, SHAPE.spark);
    }

    // Engine flame: a short column of hot sprites behind the hull.
    if (boosting && !game.paused) {
      const flicker = 0.8 + Math.sin(game.time * 54) * 0.2;
      const length = (16 + Math.random() * 10) * flicker;
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const stop = FLAME_STOPS[Math.min(FLAME_STOPS.length - 1, Math.floor(t * (FLAME_STOPS.length - 1) + 0.5))];
        const d = 5 + length * t;
        glow.push(x - cos * d, y - sin * d, 0, 5.5 * (1 - t) + 2, stop[0], stop[1], stop[2], 0.9 - t * 0.5, SHAPE.spark);
      }
    }

    const cockpitPulse = 0.7 + Math.sin(game.time * 7.2) * 0.3;
    glow.push(x + cos * 4, y + sin * 4, 6, 4.5, cockpitColor[0], cockpitColor[1], cockpitColor[2], cockpitPulse * 0.8, SHAPE.spark);
  }

  return {
    update,
    onShoot() {
      muzzle = 1;
      kick = 2.5;
    },
    onHyperspace(e) {
      jumps.push({ x: e.x, y: e.y, t: 0, kind: e.type === 'hyperspaceOut' ? 'out' : 'in' });
    },
  };
}
