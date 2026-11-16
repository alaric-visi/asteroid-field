// The single place the player ship takes damage, so every source (rocks,
// comet tails, saucers, shots, blasts, the boss) obeys the same rules.
import { SHAKE, HIT_STOP } from '../data/tuning.js';
import { hexToRgb } from '../core/color.js';
import { resetShip } from '../entities/ship.js';
import { spawnBurst, spawnShockwave, addShake } from './effects.js';
import { breakCombo } from './combo.js';

const SHIP_DEBRIS = hexToRgb('#00ccff');
const SHIP_SHOCKWAVE = hexToRgb('#66d9ff');

export function shipIsVulnerable(ship) {
  return ship.alive && !ship.jump && ship.invulnerable <= 0 && !ship.shieldActive;
}

/** Returns true if the ship was destroyed. */
export function damageShip(game) {
  const { ship, fx, fxRng } = game;
  if (!shipIsVulnerable(ship) || game.options.training) return false;

  game.lives--;
  spawnBurst(fx, fxRng, ship.x, ship.y, SHIP_DEBRIS, 26);
  spawnShockwave(fx, ship.x, ship.y, SHIP_SHOCKWAVE);
  addShake(fx, SHAKE.shipHit);
  game.hitStop = Math.max(game.hitStop, HIT_STOP.shipHit);
  breakCombo(game);
  game.events.push({ type: 'shipDestroyed', x: ship.x, y: ship.y });

  if (game.lives <= 0) {
    ship.alive = false;
    ship.boosting = false;
    ship.shieldActive = false;
    game.mode = 'over';
    game.won = false;
    game.events.push({ type: 'gameOver', score: game.score });
  } else {
    resetShip(ship, game.world, game.stats);
    fx.engineTrail = [];
  }
  return true;
}
