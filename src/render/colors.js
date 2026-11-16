// sRGB byte → linear float lookup, for feeding simulation colours ([r,g,b] 0–255)
// into the linear HDR pipeline without per-frame Math.pow.
const LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LUT[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

const scratch = [0, 0, 0];

/** Returns a shared scratch array — copy it if you need to keep it. */
export function linearRgb(rgb, scale = 1) {
  scratch[0] = LUT[rgb[0]] * scale;
  scratch[1] = LUT[rgb[1]] * scale;
  scratch[2] = LUT[rgb[2]] * scale;
  return scratch;
}

export function hexToLinear(hex, scale = 1) {
  const v = parseInt(hex.slice(1), 16);
  return [LUT[(v >> 16) & 255] * scale, LUT[(v >> 8) & 255] * scale, LUT[v & 255] * scale];
}
