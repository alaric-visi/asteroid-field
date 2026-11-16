// One draw call for thousands of camera-facing sprites (glows, sparks, rings,
// debris shards). Instanced quads rather than gl.POINTS, so there is no
// driver point-size limit on large shockwaves.
import * as THREE from 'three';

export const SHAPE = { glow: 0, spark: 1, ring: 2, shard: 3 };

const vertexShader = /* glsl */ `
  attribute vec3 iPos;
  attribute float iSize;
  attribute vec4 iColor;
  attribute vec3 iParams; // shape, rotation, extra
  varying vec2 vUv;
  varying vec4 vColor;
  varying vec2 vShape;
  void main() {
    float c = cos(iParams.y), s = sin(iParams.y);
    vec2 corner = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    mv.xy += corner * iSize;
    gl_Position = projectionMatrix * mv;
    vUv = position.xy;
    vColor = iColor;
    vShape = iParams.xz;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying vec4 vColor;
  varying vec2 vShape;

  float edge(vec2 a, vec2 b, vec2 p) {
    vec2 e = b - a, q = p - a;
    return e.x * q.y - e.y * q.x;
  }

  void main() {
    float d = length(vUv);
    float a;
    if (vShape.x < 0.5) {            // soft glow
      a = exp(-d * d * 3.5) * (1.0 - smoothstep(0.8, 1.0, d));
    } else if (vShape.x < 1.5) {     // spark: hot core + halo
      float core = smoothstep(0.4, 0.0, d);
      float halo = exp(-d * d * 6.0) * 0.55;
      a = clamp(core + halo, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, d));
    } else if (vShape.x < 2.5) {     // ring with thickness vShape.y (uv units)
      float t = max(vShape.y, 0.01);
      float aa = fwidth(d);
      a = 1.0 - smoothstep(t * 0.5, t * 0.5 + aa, abs(d - (1.0 - t * 0.5)));
    } else {                         // irregular debris shard
      vec2 p0 = vec2(-1.0, -0.6), p1 = vec2(1.0, -0.3), p2 = vec2(0.6, 1.0), p3 = vec2(-0.7, 0.5);
      float m = min(min(edge(p0, p1, vUv), edge(p1, p2, vUv)), min(edge(p2, p3, vUv), edge(p3, p0, vUv)));
      a = smoothstep(0.0, fwidth(m) * 1.5, m);
    }
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }
`;

const ATTRS = [
  ['iPos', 3],
  ['iSize', 1],
  ['iColor', 4],
  ['iParams', 3],
];

export function createSpriteBatch({ capacity = 1024, blending = THREE.AdditiveBlending, renderOrder = 10 } = {}) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, depthTest: true, blending,
    // The playfield group is y-mirrored, which flips winding; billboards must not be culled.
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;

  let cap = 0;
  let count = 0;
  const buffers = {};

  function allocate(newCap) {
    if (cap > 0) geometry.dispose(); // release GPU buffers before swapping attributes
    for (const [name, size] of ATTRS) {
      const array = new Float32Array(newCap * size);
      if (buffers[name]) array.set(buffers[name].array);
      const attr = new THREE.InstancedBufferAttribute(array, size);
      attr.setUsage(THREE.DynamicDrawUsage);
      buffers[name] = attr;
      geometry.setAttribute(name, attr);
    }
    cap = newCap;
  }
  allocate(capacity);

  return {
    mesh,
    get count() { return count; },
    begin() { count = 0; },
    push(x, y, z, size, r, g, b, alpha, shape = SHAPE.glow, rotation = 0, extra = 0) {
      if (count >= cap) allocate(cap * 2);
      const i = count++;
      const p = buffers.iPos.array, s = buffers.iSize.array, c = buffers.iColor.array, q = buffers.iParams.array;
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
      s[i] = size;
      c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = alpha;
      q[i * 3] = shape; q[i * 3 + 1] = rotation; q[i * 3 + 2] = extra;
    },
    end() {
      geometry.instanceCount = count;
      mesh.visible = count > 0;
      for (const [name, size] of ATTRS) {
        const attr = buffers[name];
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, count * size);
        attr.needsUpdate = true;
      }
    },
  };
}
