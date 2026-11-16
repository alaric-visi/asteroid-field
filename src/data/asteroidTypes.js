// Asteroid archetypes (docs/PLAN.md §4b). Everything type-specific lives here
// so new behaviours are data plus one hook in systems/asteroids.js.
//   points / hp      — per size tier [large (>30), medium (>15), small]
//   children         — fragments on destruction (0 = doesn't split)
//   color            — hue range (degrees), saturation, lightness
// Behaviour keys (optional): frost, blast, deflectBelow, pull, jitter, drop, comet.
export const ASTEROID_TYPES = {
  rock: {
    label: 'Rock', blurb: 'Splits in two',
    points: [20, 50, 100], hp: [1, 1, 1], children: 2,
    color: { hue: [16, 36], sat: 0.55, light: 0.5 },
  },
  ice: {
    label: 'Ice', blurb: 'Shatters fast; leaves slowing frost',
    points: [40, 100, 200], hp: [1, 1, 1], children: 3, childSpeed: 1.6,
    frost: { radiusMul: 2.2, seconds: 3.5 }, // leaves a field that slows the ship
    color: { hue: [180, 240], sat: 0.7, light: 0.5 },
  },
  plasma: {
    label: 'Plasma', blurb: 'Detonates — chain them',
    points: [80, 200, 400], hp: [1, 1, 1], children: 2,
    blast: { radiusMul: 2.6, delay: 0.12 }, // detonates, damaging neighbours (chains)
    color: { hue: [300, 340], sat: 0.8, light: 0.6 },
  },
  metal: {
    label: 'Metal', blurb: 'Armoured; glancing shots ricochet',
    points: [60, 150, 300], hp: [3, 2, 1], children: 2,
    deflectBelow: 0.35, // glancing shots (incidence < this) ricochet off
    color: { hue: [205, 225], sat: 0.15, light: 0.55 },
  },
  magnetic: {
    label: 'Magnetic', blurb: 'Pulls you and other rocks in',
    points: [150, 300, 450], hp: [3, 3, 2], children: 0,
    pull: { radius: 280, strength: 170 }, // drags the ship and other rocks toward it
    color: { hue: [212, 228], sat: 0.6, light: 0.38 },
  },
  crystal: {
    label: 'Crystal', blurb: 'Always drops a pickup',
    points: [250, 250, 250], hp: [1, 1, 1], children: 0,
    jitter: 90, drop: true, // erratic drift; always drops a pickup
    color: { hue: [95, 140], sat: 0.8, light: 0.6 },
  },
  comet: {
    label: 'Comet', blurb: 'Fast, and its tail is lethal',
    points: [400, 400, 400], hp: [1, 1, 1], children: 0,
    comet: true, // crosses the screen once, doesn't wrap; its tail is lethal
    color: { hue: [185, 200], sat: 0.5, light: 0.8 },
  },
};

export const COMET_SIZE = 14;

/** 0 = large, 1 = medium, 2 = small. */
export function sizeTier(size) {
  return size > 30 ? 0 : size > 15 ? 1 : 2;
}
