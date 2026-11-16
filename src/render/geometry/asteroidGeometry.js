// Procedural asteroid meshes (unit radius). Each type has a distinct silhouette
// so it reads even in greyscale (see docs/ART.md §2):
//   rock   — lumpy, cratered, elongated; ambient occlusion baked into vertex colours
//   ice    — few large angular facets, stretched like a crystal
//   plasma — smooth round blob
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3, noise3, seededRandom } from './noise.js';

function baseSphere(detail) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g); // share vertices so displacement keeps the surface closed
  return g;
}

function randomUnitVector(rand) {
  const z = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), z);
}

/** Apply per-vertex radius and AO, then a non-uniform stretch along a random axis. */
function finish(g, radiusAt, aoAt, stretch, rand) {
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const r = radiusAt(v);
    const ao = aoAt(v, r);
    pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const axis = randomUnitVector(rand);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(), q, new THREE.Vector3(stretch, 1 / Math.sqrt(stretch), 1 / Math.sqrt(stretch)));
  const inv = new THREE.Matrix4().makeRotationFromQuaternion(q.clone().invert());
  g.applyMatrix4(inv).applyMatrix4(m);

  // Normalise so the bounding radius ≈ 1 (collision radius stays honest).
  g.computeBoundingSphere();
  const s = 1 / g.boundingSphere.radius;
  g.scale(s * 1.04, s * 1.04, s * 1.04);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function rock(seed) {
  const rand = seededRandom(seed);
  const craters = Array.from({ length: 5 + Math.floor(rand() * 4) }, () => ({
    c: randomUnitVector(rand),
    r: 0.25 + rand() * 0.35,
    depth: 0.06 + rand() * 0.08,
  }));
  const craterAt = (v) => {
    let h = 0;
    for (const k of craters) {
      const d = Math.acos(Math.min(1, v.dot(k.c))) / k.r;
      if (d < 1) h -= (1 - d * d) * k.depth; // bowl
      else if (d < 1.5) h += Math.exp(-(((d - 1.1) / 0.18) ** 2)) * k.depth * 0.35; // raised rim
    }
    return h;
  };
  return finish(
    baseSphere(3),
    (v) => 1 + (fbm3(v.x * 1.7, v.y * 1.7, v.z * 1.7, seed) - 0.5) * 0.55 + craterAt(v),
    (v, r) => Math.max(0.3, Math.min(1, 0.72 + (r - 1) * 2.2)),
    1.15 + rand() * 0.25,
    rand,
  );
}

function ice(seed) {
  const rand = seededRandom(seed);
  return finish(
    baseSphere(1),
    (v) => 0.75 + noise3(v.x * 2.6 + 9, v.y * 2.6, v.z * 2.6, seed) * 0.55,
    (v, r) => Math.max(0.55, Math.min(1, 0.8 + (r - 1) * 1.2)),
    1.35 + rand() * 0.35,
    rand,
  );
}

function plasma(seed) {
  const rand = seededRandom(seed);
  return finish(
    baseSphere(3),
    (v) => 1 + (fbm3(v.x * 1.3, v.y * 1.3, v.z * 1.3, seed, 3) - 0.5) * 0.16,
    () => 1,
    1.05 + rand() * 0.08,
    rand,
  );
}

function metal(seed) {
  const rand = seededRandom(seed);
  // Terraced radius → flat armour plates.
  return finish(
    baseSphere(2),
    (v) => 0.86 + Math.round(fbm3(v.x * 1.4, v.y * 1.4, v.z * 1.4, seed, 2) * 6) / 6 * 0.28,
    (v, r) => Math.max(0.45, Math.min(1, 0.7 + (r - 1) * 2)),
    1.1 + rand() * 0.15,
    rand,
  );
}

function magnetic(seed) {
  const rand = seededRandom(seed);
  return finish(
    baseSphere(3),
    (v) => 1 + Math.sin(v.y * 14) * 0.025 + (noise3(v.x * 2, v.y * 2, v.z * 2, seed) - 0.5) * 0.06,
    () => 1,
    1.0 + rand() * 0.05,
    rand,
  );
}

function crystal(seed) {
  const rand = seededRandom(seed);
  return finish(
    baseSphere(0),
    (v) => 0.75 + noise3(v.x * 3 + 2, v.y * 3, v.z * 3, seed) * 0.5,
    () => 0.9,
    2.0 + rand() * 0.4,
    rand,
  );
}

function comet(seed) {
  const rand = seededRandom(seed);
  return finish(
    baseSphere(1),
    (v) => 0.85 + noise3(v.x * 2.5, v.y * 2.5, v.z * 2.5, seed) * 0.3,
    () => 0.9,
    1.15,
    rand,
  );
}

const BUILDERS = { rock, ice, plasma, metal, magnetic, crystal, comet };

export function makeAsteroidGeometry(type, variant) {
  return BUILDERS[type](1000 + variant * 7919 + type.length * 131);
}
