// Every gameplay constant, in per-second units. The legacy prototype used
// per-frame values at an assumed 60 fps; the conversions are noted alongside.

export const TICK_HZ = 60;
/** The frame rate the legacy per-frame constants were authored against. */
export const LEGACY_HZ = 60;

export const SHIP = {
  lives: 3,
  radius: 12,
  // Turning has angular momentum: it ramps up to maxTurnRate and settles
  // quickly on release, instead of the legacy instant 7.2 rad/s.
  maxTurnRate: 6.2, // rad/s
  turnAccel: 42, // rad/s² while turning toward the input
  turnDecel: 70, // rad/s² while settling / reversing
  turnRate: 6.2, // alias used by renderers for banking
  thrust: 760, // px/s²  (legacy 0.25 px/frame² = 900)
  maxSpeed: 560, // px/s hard cap (legacy had none, so it reached ~1,500)
  dragPerLegacyFrame: 0.99, // applied via perTick()
  assistDragPerLegacyFrame: 0.965, // extra braking when flight assist is on and not thrusting
  tapFireInterval: 0.1, // s between shots when tapping
  autoFireInterval: 0.16, // s between shots while holding (auto-fire)
  recoil: 14, // px/s pushed backwards per shot
  invulnerableSeconds: 2, // (legacy 120 frames)
  muzzleOffset: 18,
  exhaustOffset: 18,
  trailOffset: 16,
};

export const MISSILE = {
  speed: 600, // px/s (legacy 10 px/frame)
  lifeSeconds: 80 / 60,
  radius: 3,
  trailLength: 8,
};

export const ASTEROID = {
  restitution: 0.9,
  spawnSafeRadius: 150,
  minSplitSize: 15, // asteroids larger than this split in two
  childPositionJitter: 20,
  childVelocityKeep: 0.8,
  childVelocityJitter: 180, // px/s (legacy 3 px/frame)
  spinJitter: 1.2, // rad/s (legacy 0.02 rad/frame)
  collisionSpinKick: 1.8, // rad/s (legacy 0.03 rad/frame)
  bounceFxMinSpeed: 72, // px/s (legacy 1.2 px/frame)
};

export const LEVEL_TRANSITION_SECONDS = 3; // legacy 180 frames

/** Brief simulation freeze on heavy impacts, to sell their weight. */
export const HIT_STOP = {
  bigAsteroidMinSize: 30, // initial-size asteroids in every level
  bigAsteroid: 0.06,
  shipHit: 0.14,
};

export const SHAKE = {
  max: 28,
  decayPerLegacyFrame: 0.88,
  fire: 1.5,
  shipHit: 16,
};

/** Weapon heat: firing builds heat; at max the cannon locks until it cools. */
export const WEAPON = {
  maxHeat: 100,
  heatPerShot: 8,
  coolRate: 32, // heat/s
  recoverBelow: 35, // an overheated cannon unlocks below this
  spreadAngle: 0.14, // rad between spread shots
  extraShotHeat: 0.3, // each extra spread barrel adds 30% heat
};

export const HYPERSPACE = {
  chargeSeconds: 0.3, // vanish
  reappearSeconds: 0.25, // materialise (invulnerable)
  cooldown: 4,
  misjumpChance: 0.12, // lands somewhere random instead of somewhere safe
  candidates: 14, // destinations sampled when picking a safe spot
};

export const SHIELD = {
  max: 100,
  drain: 40, // energy/s while held
  regen: 12, // energy/s after regenDelay
  regenDelay: 1,
  minToActivate: 12,
  ramMaxSize: 15, // asteroids this small are smashed by the shield
  ramCost: 8,
  bounceCost: 12,
  shotCost: 8,
};

export const COMBO = {
  window: 2.5, // seconds to land the next kill
  killsPerStep: 5, // kills per +1 multiplier
  maxMultiplier: 8,
};

export const PICKUP = {
  life: 10,
  radius: 12,
  buffSeconds: 10,
  smallAsteroidDropChance: 0.05,
  saucerDropChance: { big: 0.4, small: 0.6 },
};

export const ENEMY = {
  shotSpeed: 280,
  shotLife: 2.2,
  shotRadius: 4,
  saucer: {
    big: { radius: 22, hp: 2, speed: 110, fireEvery: 1.4, points: 200 },
    small: { radius: 13, hp: 1, speed: 150, fireEvery: 1.1, points: 1000 },
  },
  boss: { radius: 86, turretRadius: 13, turretHp: 5, turretPoints: 250, pointsPerSector: 3000, maxBrood: 14 },
};

export const FROST = { dragPerLegacyFrame: 0.94, thrustMul: 0.45 };

export const WAVE_BREAK_SECONDS = 1.4;

/** Sector intro card shown when a run begins (later sectors use LEVEL_TRANSITION_SECONDS). */
export const RUN_INTRO_SECONDS = 2.4;
