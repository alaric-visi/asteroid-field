// Kill combos: each kill within COMBO.window of the last extends the chain;
// every COMBO.killsPerStep kills raise the score multiplier. Taking a hit
// (or letting the window lapse) resets it.
import { COMBO } from '../data/tuning.js';

export function createCombo() {
  return { count: 0, timer: 0, multiplier: 1, best: 0 };
}

/** Award points for a kill, applying the multiplier. Returns points awarded. */
export function registerKill(game, basePoints) {
  const c = game.combo;
  game.tally.kills++;
  c.count++;
  c.timer = COMBO.window;
  const before = c.multiplier;
  c.multiplier = Math.min(COMBO.maxMultiplier, 1 + Math.floor(c.count / COMBO.killsPerStep));
  if (c.multiplier > before) game.events.push({ type: 'comboUp', multiplier: c.multiplier });
  c.best = Math.max(c.best, c.count);
  const points = basePoints * c.multiplier;
  game.score += points;
  return points;
}

export function breakCombo(game) {
  const c = game.combo;
  if (c.count >= COMBO.killsPerStep) game.events.push({ type: 'comboBroken', count: c.count });
  c.count = 0;
  c.timer = 0;
  c.multiplier = 1;
}

export function updateCombo(game, dt) {
  const c = game.combo;
  if (c.count === 0) return;
  c.timer -= dt;
  if (c.timer <= 0) {
    c.count = 0;
    c.multiplier = 1;
  }
}
