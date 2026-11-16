import { circlesOverlap } from '../core/math.js';

/**
 * Pair each missile with at most one asteroid, and each asteroid with at most
 * one missile. Returns [{ missileIndex, asteroidIndex }]. Does not mutate.
 */
export function findMissileHits(missiles, asteroids, missileRadius, world) {
  const hits = [];
  const taken = new Set();
  for (let mi = 0; mi < missiles.length; mi++) {
    for (let ai = 0; ai < asteroids.length; ai++) {
      if (taken.has(ai)) continue;
      if (circlesOverlap(missiles[mi], asteroids[ai], missileRadius, asteroids[ai].size, world)) {
        hits.push({ missileIndex: mi, asteroidIndex: ai });
        taken.add(ai);
        break;
      }
    }
  }
  return hits;
}

/** First asteroid touching the ship, or null. */
export function findShipHit(ship, asteroids, world) {
  return asteroids.find((a) => circlesOverlap(ship, a, ship.radius, a.size, world)) ?? null;
}
