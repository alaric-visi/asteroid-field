// Pickups: a spinning, glowing octahedron in the pickup's colour, ringed by a
// pulse. Blinks during its last three seconds.
import * as THREE from 'three';
import { lerpWrapped } from '../core/math.js';
import { PICKUPS } from '../data/pickups.js';
import { SHAPE } from './effects/spriteBatch.js';
import { hexToLinear } from './colors.js';

export function createPickupView(parent) {
  const geometry = new THREE.OctahedronGeometry(7, 0);
  const materials = {};
  const colors = {};
  for (const [kind, p] of Object.entries(PICKUPS)) {
    materials[kind] = new THREE.MeshStandardMaterial({
      color: p.color, emissive: p.color, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.3, flatShading: true,
    });
    colors[kind] = hexToLinear(p.color, 2.5);
  }
  const meshes = new Map();

  function update(game, { alpha, now }, glow) {
    const { world } = game;
    const seen = new Set();
    for (const p of game.pickups) {
      seen.add(p.id);
      let m = meshes.get(p.id);
      if (!m) {
        m = new THREE.Mesh(geometry, materials[p.kind]);
        parent.add(m);
        meshes.set(p.id, m);
      }
      const x = lerpWrapped(p.prevX, p.x, alpha, world.width);
      const y = lerpWrapped(p.prevY, p.y, alpha, world.height);
      const visible = p.life > 3 || Math.floor(now * 8) % 2 === 0;
      m.visible = visible;
      m.position.set(x, y, 20 + Math.sin(now * 3 + p.id) * 3);
      m.rotation.set(now * 1.3, now * 2.1, 0);
      if (!visible) continue;
      const c = colors[p.kind];
      const pulse = (now * 1.2 + p.id * 0.37) % 1;
      glow.push(x, y, 10, 12 + pulse * 14, c[0], c[1], c[2], 0.6 * (1 - pulse), SHAPE.ring, 0, 1.5 / (12 + pulse * 14));
      glow.push(x, y, 5, 22, c[0] * 0.4, c[1] * 0.4, c[2] * 0.4, 0.35, SHAPE.glow);
    }
    for (const [id, m] of meshes) {
      if (!seen.has(id)) { parent.remove(m); meshes.delete(id); }
    }
  }

  return { update };
}
