// Visual theme per level (see docs/ART.md §3).
//   accent      — rim light, UI accent, ship fins
//   nebulaA/B   — background nebula colours (sRGB bytes, authored dim)
//   lightDir    — where the key light comes from (x right, y up, z toward viewer);
//                 also lights the backdrop planet so the two agree
//   backdrop    — distant body: kind 0 = banded gas giant, 1 = ringed ice world, 2 = star.
//                 x, y, radius are in backdrop space (screen centre = 0, height ≈ ±1.1);
//                 colours are linear RGB.
export const THEMES = [
  {
    name: 'rocky', title: 'ROCKY BELT', accent: '#ffaa44',
    nebulaA: [58, 28, 10], nebulaB: [90, 40, 15],
    lightDir: [-0.55, 0.65, 0.5],
    backdrop: { kind: 0, x: 1.25, y: -0.6, radius: 0.78, colorA: [0.42, 0.2, 0.08], colorB: [0.75, 0.48, 0.24] },
  },
  {
    name: 'icy', title: 'ICE FIELD', accent: '#44e0ff',
    nebulaA: [8, 30, 46], nebulaB: [10, 60, 78],
    lightDir: [0.6, 0.55, 0.55],
    backdrop: { kind: 1, x: -1.25, y: 0.5, radius: 0.42, colorA: [0.22, 0.42, 0.62], colorB: [0.7, 0.88, 1.0] },
  },
  {
    name: 'plasma', title: 'PLASMA NEBULA', accent: '#ff55e0',
    nebulaA: [40, 8, 46], nebulaB: [70, 10, 60],
    lightDir: [0.65, 0.6, 0.45],
    backdrop: { kind: 2, x: 1.35, y: 0.62, radius: 0.16, colorA: [1.4, 0.45, 1.15], colorB: [0.7, 0.15, 0.6] },
  },
];

export function themeForLevel(level) {
  return THEMES[level - 1] ?? THEMES[0];
}
