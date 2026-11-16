// Three-layer parallax starfield as GPU points in clip space. Layers drift
// against the ship's motion at different rates for a sense of depth.
import * as THREE from 'three';

const COUNT = 900;

const vertexShader = /* glsl */ `
  attribute vec2 aUv;
  attribute float aSize;
  attribute float aLayer;
  attribute float aTwinkle;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec2 uParallax;
  uniform vec4 uBody;
  uniform float uBodyMix;
  uniform vec2 uAspect;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = fract(aUv - uParallax * (0.2 + aLayer * 0.4));
    gl_Position = vec4(uv * 2.0 - 1.0, 0.9995, 1.0);
    vAlpha = max(0.08, 0.4 + 0.4 * sin(uTime * aTwinkle + aPhase));
    // Hidden behind the backdrop planet (same mapping as the nebula shader).
    vec2 bp = (uv - 0.5) * uAspect * 2.4 + uParallax * 0.12 - uBody.xy;
    if (length(bp) < uBody.z * 1.02) vAlpha *= 1.0 - uBodyMix;
    vColor = aColor * (1.0 + aLayer * 0.8);
    gl_PointSize = aSize * uPixelRatio * (aLayer > 1.5 ? 3.0 : 2.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = smoothstep(0.55, 0.0, d);
    float halo = exp(-d * d * 4.0) * 0.35;
    float a = (core + halo) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

export function createStarfield(bodyUniforms) {
  const uv = new Float32Array(COUNT * 2);
  const size = new Float32Array(COUNT);
  const layer = new Float32Array(COUNT);
  const twinkle = new Float32Array(COUNT);
  const phase = new Float32Array(COUNT);
  const color = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    const r = Math.random();
    const l = r < 0.65 ? 0 : r < 0.92 ? 1 : 2;
    uv[i * 2] = Math.random();
    uv[i * 2 + 1] = Math.random();
    layer[i] = l;
    size[i] = l === 0 ? 0.5 + Math.random() * 0.7 : l === 1 ? 0.8 + Math.random() * 1.0 : 1.2 + Math.random() * 1.4;
    twinkle[i] = 0.4 + Math.random() * 1.6;
    phase[i] = Math.random() * Math.PI * 2;
    const tint = Math.random();
    const [cr, cg, cb] = tint < 0.08 ? [0.55, 0.65, 1.0] : tint < 0.15 ? [1.0, 0.75, 0.55] : [1, 1, 1];
    color.set([cr, cg, cb], i * 3);
  }

  const geometry = new THREE.BufferGeometry();
  // `position` is required by three.js for draw-range bookkeeping; the shader ignores it.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  geometry.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geometry.setAttribute('aLayer', new THREE.BufferAttribute(layer, 1));
  geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkle, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(color, 3));

  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uParallax: { value: new THREE.Vector2() },
    ...bodyUniforms,
  };
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -50;

  return {
    points,
    setPixelRatio(pr) { uniforms.uPixelRatio.value = pr; },
    update(now, parallax) {
      uniforms.uTime.value = now;
      uniforms.uParallax.value.copy(parallax);
    },
  };
}
