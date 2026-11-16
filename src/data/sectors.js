// Campaign structure: each sector is a few budgeted waves then a boss.
// After the last sector, campaign mode is won; endless and daily modes loop
// the sectors with rising difficulty (see director.js).
//   budget  — threat points per wave; spent on asteroids at COSTS
//   weights — relative odds of each asteroid type
//   saucers — odds of a big / small saucer each time the saucer timer fires
//   comets  — odds a comet crosses each time the comet timer fires
export const SECTORS = [
  {
    size: 40, speed: 120, waves: 3, budget: [10, 13, 16],
    weights: { rock: 1, crystal: 0.12 },
    saucers: { big: 0.6, small: 0 }, comets: 0,
    boss: { type: 'rock', hp: 30, turrets: 3, name: 'HIVE CORE' },
    intro: { subtitle: 'Clear the belt. Break the Hive.' },
  },
  {
    size: 35, speed: 165, waves: 3, budget: [13, 16, 19],
    weights: { ice: 1, rock: 0.4, metal: 0.35, crystal: 0.12 },
    saucers: { big: 0.5, small: 0.4 }, comets: 0.5,
    boss: { type: 'ice', hp: 42, turrets: 4, name: 'GLACIER HEART' },
    intro: { subtitle: 'Shards scatter fast — and leave frost behind' },
  },
  {
    size: 32, speed: 190, waves: 4, budget: [15, 18, 21, 24],
    weights: { plasma: 1, metal: 0.4, magnetic: 0.35, ice: 0.3, crystal: 0.12 },
    saucers: { big: 0.3, small: 0.7 }, comets: 0.6,
    boss: { type: 'plasma', hp: 56, turrets: 5, name: 'NOVA SEED' },
    intro: { subtitle: 'Volatile cores detonate — chain them' },
  },
];

/** Threat cost of one large asteroid of each type. */
export const COSTS = { rock: 2, ice: 3, plasma: 4, metal: 4, magnetic: 5, crystal: 3 };
