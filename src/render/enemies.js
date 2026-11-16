// Saucers, the boss's turrets and shield, and enemy shots. The boss's rocky
// core is drawn through the instanced asteroid pools (same materials).
import * as THREE from 'three';
import { lerpWrapped } from '../core/math.js';
import { ENEMY } from '../data/tuning.js';
import { turretPosition } from '../systems/enemies.js';
import { SHAPE } from './effects/spriteBatch.js';
import { hexToLinear } from './colors.js';
import { createShield } from './shield.js';

const KIND = {
  big: { accent: 0x5dffa0, light: hexToLinear('#7dffb0', 3) },
  small: { accent: 0xff4f7a, light: hexToLinear('#ff6b8a', 3) },
};
const SHOT = hexToLinear('#ff5a7a', 3.5);
const SHOT_CORE = hexToLinear('#fff0f4', 4);

function saucerGeometry() {
  // Classic flying-saucer profile, revolved around the view axis.
  const pts = [[0, -3], [6, -3.2], [14, -1.2], [22, 0], [14, 1.6], [8, 3], [0, 3.2]].map(([r, h]) => new THREE.Vector2(r / 22, h / 22));
  const g = new THREE.LatheGeometry(pts, 24);
  g.rotateX(Math.PI / 2); // lathe axis Y → view axis Z
  return g;
}

export function createEnemyView(parent, asteroids) {
  const hull = saucerGeometry();
  const dome = new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, 0.1);
  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa4b4, metalness: 0.8, roughness: 0.3 });
  const domeMaterials = {
    big: new THREE.MeshStandardMaterial({ color: 0x113322, emissive: KIND.big.accent, emissiveIntensity: 1.2, roughness: 0.1 }),
    small: new THREE.MeshStandardMaterial({ color: 0x331118, emissive: KIND.small.accent, emissiveIntensity: 1.4, roughness: 0.1 }),
  };
  const saucers = new Map();

  const turretGeometry = new THREE.CylinderGeometry(0.55, 0.75, 0.9, 10).rotateX(Math.PI / 2);
  const barrelGeometry = new THREE.BoxGeometry(1.4, 0.28, 0.28).translate(0.7, 0, 0.2);
  const turretMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.7, roughness: 0.35, emissive: 0xff5520, emissiveIntensity: 0.25 });
  const turrets = [];
  const shield = createShield(ENEMY.boss.radius + 14);
  shield.mesh.scale.z = 0.5;
  shield.setColor?.(1.8, 0.5, 0.4);
  parent.add(shield.mesh);
  const bossRotation = new THREE.Euler();
  const bossColor = new THREE.Color();

  function saucerMesh(e) {
    let m = saucers.get(e.id);
    if (!m) {
      m = new THREE.Group();
      const body = new THREE.Mesh(hull, hullMaterial);
      const cap = new THREE.Mesh(dome, domeMaterials[e.kind]);
      m.add(body, cap);
      m.scale.setScalar(e.radius);
      parent.add(m);
      saucers.set(e.id, m);
    }
    return m;
  }

  function turretMesh(i) {
    if (!turrets[i]) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(turretGeometry, turretMaterial), new THREE.Mesh(barrelGeometry, turretMaterial));
      g.scale.setScalar(ENEMY.boss.turretRadius);
      parent.add(g);
      turrets[i] = g;
    }
    return turrets[i];
  }

  function update(game, { alpha, now, frameSeconds }, glow) {
    const { world, ship } = game;
    const W = world.width, H = world.height;

    // Saucers
    const seen = new Set();
    for (const e of game.enemies) {
      seen.add(e.id);
      const m = saucerMesh(e);
      const x = lerpWrapped(e.prevX, e.x, alpha, W);
      const y = lerpWrapped(e.prevY, e.y, alpha, H);
      m.position.set(x, y, 10);
      m.rotation.set(0.35 + Math.sign(e.vy) * 0.2, Math.sign(e.vx) * 0.15, now * 2.5);
      const c = KIND[e.kind].light;
      for (let i = 0; i < 6; i++) {
        const a = now * 3 + (i / 6) * Math.PI * 2;
        const blink = 0.5 + 0.5 * Math.sin(now * 12 + i * 2);
        glow.push(x + Math.cos(a) * e.radius * 0.85, y + Math.sin(a) * e.radius * 0.45, 14, 3, c[0], c[1], c[2], 0.5 + blink * 0.5, SHAPE.spark);
      }
      glow.push(x, y, 0, e.radius * 2.2, c[0] * 0.3, c[1] * 0.3, c[2] * 0.3, 0.25, SHAPE.glow);
    }
    for (const [id, m] of saucers) {
      if (!seen.has(id)) { parent.remove(m); saucers.delete(id); }
    }

    // Enemy shots
    for (const s of game.enemyShots) {
      const x = lerpWrapped(s.prevX, s.x, alpha, W);
      const y = lerpWrapped(s.prevY, s.y, alpha, H);
      const sp = Math.hypot(s.vx, s.vy) || 1;
      for (let i = 1; i <= 4; i++) {
        glow.push(x - (s.vx / sp) * i * 4, y - (s.vy / sp) * i * 4, 2, 4 - i * 0.6, SHOT[0], SHOT[1], SHOT[2], 0.5 - i * 0.1, SHAPE.spark);
      }
      glow.push(x, y, 3, 6, SHOT_CORE[0], SHOT_CORE[1], SHOT_CORE[2], 1, SHAPE.spark);
      glow.push(x, y, 0, 14, SHOT[0] * 0.4, SHOT[1] * 0.4, SHOT[2] * 0.4, 0.35, SHAPE.glow);
    }

    // Boss
    const boss = game.boss;
    turrets.forEach((t) => { t.visible = false; });
    if (!boss) {
      shield.update(0, now);
      return;
    }
    const bx = lerpWrapped(boss.prevX, boss.x, alpha, W);
    const by = lerpWrapped(boss.prevY, boss.y, alpha, H);
    bossRotation.set(0.5, 0.25, boss.angle);
    bossColor.setHSL(boss.hue, boss.sat, boss.light * (0.7 + 0.3 * (boss.hp / boss.maxHp)));
    const hurt = 1 - boss.hp / boss.maxHp;
    asteroids.add(boss.type, 0, bx, by, -10, bossRotation, boss.radius, bossColor, Math.max(0, Math.sin(now * 9) * hurt * 0.25));
    glow.push(bx, by, -40, boss.radius * 1.4, boss.rgb[0] / 255, boss.rgb[1] / 255, boss.rgb[2] / 255, 0.1 + hurt * 0.15, SHAPE.glow);

    boss.turrets.forEach((t, i) => {
      if (!t.alive) return;
      const p = turretPosition({ ...boss, x: bx, y: by }, t);
      const g = turretMesh(i);
      g.visible = true;
      g.position.set(p.x, p.y, 18);
      g.rotation.set(0, 0, Math.atan2(ship.y - p.y, ship.x - p.x));
      const charge = Math.max(0, 1 - t.cooldown / 0.4); // glows just before firing
      glow.push(p.x, p.y, 26, 6 + charge * 6, 3, 1.2, 0.4, 0.3 + charge * 0.7, SHAPE.spark);
    });

    shield.mesh.position.set(bx, by, 0);
    shield.update(boss.shieldTimer > 0 ? 0.9 + Math.sin(now * 14) * 0.1 : 0, now);
  }

  return { update };
}
