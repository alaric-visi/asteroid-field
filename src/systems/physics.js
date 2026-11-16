import { ASTEROID } from '../data/tuning.js';
import { wrapPosition, wrapDelta } from '../core/math.js';
import { forEachNearPair } from './spatialHash.js';

export function integrate(body, dt, world) {
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  wrapPosition(body, world.width, world.height);
}

/**
 * Elastic asteroid-vs-asteroid collisions with mass ∝ size², measured across
 * screen-wrap seams when `world` is given.
 * Calls onImpact({ x, y, speed }) for each resolved impact (speed in px/s).
 */
export function resolveAsteroidCollisions(asteroids, rng, world, onImpact) {
  const { restitution, collisionSpinKick } = ASTEROID;

  const resolvePair = (i, j) => {
    {
      const a = asteroids[i];
      const b = asteroids[j];

      let dx = wrapDelta(b.x - a.x, world?.width);
      let dy = wrapDelta(b.y - a.y, world?.height);
      let distance = Math.sqrt(dx * dx + dy * dy);
      const minDist = a.size + b.size;
      if (distance >= minDist) return;

      if (distance === 0) {
        // Exact overlap: nudge apart in a random direction.
        const nudge = rng.angle();
        dx = Math.cos(nudge);
        dy = Math.sin(nudge);
        distance = 0.01;
      }

      const nx = dx / distance;
      const ny = dy / distance;

      // Separate, mass-weighted.
      const overlap = minDist - distance;
      const massA = a.size * a.size;
      const massB = b.size * b.size;
      const totalMass = massA + massB;
      a.x -= nx * overlap * (massB / totalMass);
      a.y -= ny * overlap * (massB / totalMass);
      b.x += nx * overlap * (massA / totalMass);
      b.y += ny * overlap * (massA / totalMass);
      if (world) {
        wrapPosition(a, world.width, world.height);
        wrapPosition(b, world.width, world.height);
      }

      // Only resolve if approaching.
      const velAlongNormal = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (velAlongNormal >= 0) return;

      const impulse = (-(1 + restitution) * velAlongNormal) / (1 / massA + 1 / massB);
      a.vx -= (impulse * nx) / massA;
      a.vy -= (impulse * ny) / massA;
      b.vx += (impulse * nx) / massB;
      b.vy += (impulse * ny) / massB;

      a.spin.x += rng.signed(collisionSpinKick);
      a.spin.y += rng.signed(collisionSpinKick);
      b.spin.x += rng.signed(collisionSpinKick);
      b.spin.y += rng.signed(collisionSpinKick);

      onImpact?.({ x: a.x + nx * a.size, y: a.y + ny * a.size, speed: Math.abs(velAlongNormal) });
    }
  };

  // Broad phase: a spatial hash on the wrapping playfield (all pairs without one).
  if (world) forEachNearPair(asteroids, (a) => a.size, world, resolvePair);
  else for (let i = 0; i < asteroids.length; i++) for (let j = i + 1; j < asteroids.length; j++) resolvePair(i, j);
}
