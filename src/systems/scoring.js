import { ASTEROID_TYPES } from '../data/asteroidTypes.js';

export function scoreForAsteroid(asteroid) {
  const [large, medium, small] = ASTEROID_TYPES[asteroid.type].points;
  if (asteroid.size > 30) return large;
  if (asteroid.size > 15) return medium;
  return small;
}
