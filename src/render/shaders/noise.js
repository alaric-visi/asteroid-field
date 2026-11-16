// Shared GLSL noise helpers (3D value noise + fBm).
export const NOISE_GLSL = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float vnoise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
      mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y),
      u.z);
  }
  // 3 octaves; normalised to roughly 0–1.
  float fbm3(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * vnoise3(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return v / 0.875;
  }
  // 2 octaves, for cheap surface grain.
  float fbm3lo(vec3 p) {
    return (vnoise3(p) * 0.5 + vnoise3(p * 2.03 + 17.1) * 0.25) / 0.75;
  }
`;
