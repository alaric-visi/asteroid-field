// Full-screen procedural nebula (domain-warped fBm) plus the sector's backdrop
// planet/star, coloured by the level theme.
//
// It is soft and slow-moving, so it renders off-screen at half resolution
// (a quarter of the pixels) and a cheap textured quad upsamples it into the
// main scene, drawn in clip space behind everything.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uAspect;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec2 uSeed;
  uniform vec2 uParallax;
  uniform vec4 uBody;        // x, y, radius, kind
  uniform vec3 uBodyA;
  uniform vec3 uBodyB;
  uniform vec3 uLightDir;
  uniform float uBodyMix;    // 0–1 fade for sector changes
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 p = (vUv - 0.5) * uAspect * 2.4 + uSeed + uParallax * 0.35;
    float t = uTime * 0.015;
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 0.6), fbm(p + 3.0 * q + vec2(8.3, 2.8)));
    float n = fbm(p + 2.5 * r);

    float cloud = smoothstep(0.42, 1.0, n);
    vec3 col = mix(uColorA, uColorB, smoothstep(0.25, 0.8, r.x)) * cloud;
    col += uColorB * pow(cloud, 4.0) * 1.5;               // bright filaments
    float dust = smoothstep(0.55, 0.78, fbm(p * 1.7 - r + 11.0));
    col *= 1.0 - dust * 0.65;                               // dark dust lanes

    col += vec3(0.0012, 0.0012, 0.0035);

    // ---- Distant body (backdrop planet or star) ----
    vec2 bp = (vUv - 0.5) * uAspect * 2.4 + uParallax * 0.12 - uBody.xy;
    float br = uBody.z;
    float d = length(bp) / br;
    vec3 L = normalize(uLightDir);
    vec3 body = vec3(0.0);
    float cover = 0.0;

    if (uBody.w < 1.5) {
      if (d < 1.0) {
        vec3 n = vec3(bp / br, sqrt(1.0 - d * d));
        float lit = smoothstep(-0.15, 0.6, dot(n, L));
        float swirl = fbm(n.xy * 3.0 + uTime * 0.004);
        float bands = uBody.w < 0.5
          ? fbm(vec2(n.y * 7.0 + swirl * 1.6, n.x * 0.6))          // gas giant bands
          : fbm(n.xy * 4.5 + swirl);                                 // icy mottling
        vec3 surf = mix(uBodyA, uBodyB, smoothstep(0.25, 0.75, bands));
        body = surf * (0.008 + lit * 0.2);
        cover = smoothstep(1.0, 0.985, d);
      }
      // Atmospheric rim, brighter on the lit side.
      vec3 rn = normalize(vec3(bp, 0.0));
      float rimLit = smoothstep(-0.2, 0.8, dot(rn, L));
      float atmo = exp(-abs(d - 1.0) * 26.0) * (0.02 + rimLit * 0.22);
      body += uBodyB * atmo;

      if (uBody.w > 0.5) {
        // Tilted ring: hidden where it passes behind the planet.
        vec2 rp = mat2(0.94, -0.34, 0.34, 0.94) * bp;
        float e = length(vec2(rp.x, rp.y * 4.2)) / br;
        float ring = smoothstep(1.45, 1.5, e) * (1.0 - smoothstep(2.1, 2.2, e));
        ring *= 0.55 + 0.45 * sin(e * 40.0);
        bool behind = rp.y > 0.0 && d < 1.0;
        if (!behind) {
          body = mix(body, uBodyB * (0.03 + rimLit * 0.14), ring * 0.8);
          cover = max(cover, ring * 0.8);
        }
      }
    } else {
      // Star: hot disk, limb darkening and a soft corona.
      float limb = d < 1.0 ? sqrt(1.0 - d * d) : 0.0;
      body = uBodyA * (0.35 + 0.65 * limb) * step(d, 1.0);
      cover = smoothstep(1.0, 0.95, d);
      float corona = exp(-max(d - 1.0, 0.0) * 2.2) * (1.0 + 0.25 * sin(atan(bp.y, bp.x) * 9.0 + uTime * 0.3));
      body += uBodyB * corona * 0.3 * step(1.0, d);
    }

    col = mix(col, body, cover * uBodyMix) + body * (1.0 - cover) * uBodyMix;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const BRIGHTNESS = 2.4; // theme colours are authored dim (0–255 bytes); lift them a little

function themeColor(bytes, out) {
  const lin = (b) => { const c = b / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return out.set(lin(bytes[0]) * BRIGHTNESS, lin(bytes[1]) * BRIGHTNESS, lin(bytes[2]) * BRIGHTNESS);
}

export function createNebula() {
  const uniforms = {
    uTime: { value: 0 },
    uAspect: { value: new THREE.Vector2(1, 1) },
    uColorA: { value: new THREE.Vector3() },
    uColorB: { value: new THREE.Vector3() },
    uSeed: { value: new THREE.Vector2() },
    uParallax: { value: new THREE.Vector2() },
    uBody: { value: new THREE.Vector4() },
    uBodyA: { value: new THREE.Vector3() },
    uBodyB: { value: new THREE.Vector3() },
    uLightDir: { value: new THREE.Vector3(0, 1, 1) },
    uBodyMix: { value: 0 },
  };
  const quad = new THREE.PlaneGeometry(2, 2);

  // Off-screen pass: the expensive procedural shader at reduced resolution.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const offscreenScene = new THREE.Scene();
  const offscreenCamera = new THREE.Camera(); // unused by the clip-space shader
  const generator = new THREE.Mesh(quad, new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false,
  }));
  generator.frustumCulled = false;
  offscreenScene.add(generator);

  // On-screen: upsample with hardware bilinear filtering.
  const mesh = new THREE.Mesh(quad, new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv;
      void main() { gl_FragColor = texture2D(map, vUv); }
    `,
    uniforms: { map: { value: target.texture } },
    depthTest: false, depthWrite: false,
  }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;

  const targetA = new THREE.Vector3();
  const targetB = new THREE.Vector3();
  let themeName = null;
  let bodyTheme = null; // theme whose backdrop is currently shown

  function applyBody(theme) {
    const b = theme.backdrop;
    uniforms.uBody.value.set(b.x, b.y, b.radius, b.kind);
    uniforms.uBodyA.value.fromArray(b.colorA);
    uniforms.uBodyB.value.fromArray(b.colorB);
    uniforms.uLightDir.value.fromArray(theme.lightDir);
    bodyTheme = theme;
  }

  function reseed() {
    uniforms.uSeed.value.set(Math.random() * 100, Math.random() * 100);
  }
  reseed();

  return {
    mesh,
    reseed,
    /** Uniforms the starfield reads to hide stars behind the backdrop body. */
    bodyUniforms: { uBody: uniforms.uBody, uBodyMix: uniforms.uBodyMix, uAspect: uniforms.uAspect },
    /** `pixelRatio` is the renderer's; the nebula renders at `scale` of it (quality tier). */
    resize(w, h, pixelRatio = 1, scale = 0.5) {
      uniforms.uAspect.value.set(w / Math.max(w, h), h / Math.max(w, h)).multiplyScalar(1.6);
      target.setSize(Math.max(1, Math.round(w * pixelRatio * scale)), Math.max(1, Math.round(h * pixelRatio * scale)));
    },
    /** Render the procedural pass into its target; call before the main render. */
    renderOffscreen(renderer) {
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(offscreenScene, offscreenCamera);
      renderer.setRenderTarget(previous);
    },
    update(dt, now, theme, parallax) {
      themeColor(theme.nebulaA, targetA);
      themeColor(theme.nebulaB, targetB);
      if (themeName === null) {
        uniforms.uColorA.value.copy(targetA);
        uniforms.uColorB.value.copy(targetB);
      } else {
        // Cross-fade colours when the level theme changes.
        const k = 1 - Math.exp(-dt * 1.5);
        uniforms.uColorA.value.lerp(targetA, k);
        uniforms.uColorB.value.lerp(targetB, k);
      }
      themeName = theme.name;

      // Backdrop body: fade out, swap, fade in when the sector changes.
      if (!bodyTheme) applyBody(theme);
      const mix = uniforms.uBodyMix;
      if (bodyTheme !== theme) {
        mix.value = Math.max(0, mix.value - dt * 1.2);
        if (mix.value === 0) applyBody(theme);
      } else {
        mix.value = Math.min(1, mix.value + dt * 0.8);
      }

      uniforms.uTime.value = now;
      uniforms.uParallax.value.copy(parallax);
    },
  };
}
