// The run's structure: sectors of budgeted waves, then a boss, then a choice
// of upgrades, then the next sector. Campaign mode is won after the last
// sector; endless/daily modes loop the sectors with rising difficulty.
import { LEVEL_TRANSITION_SECONDS, WAVE_BREAK_SECONDS } from '../data/tuning.js';
import { SECTORS, COSTS } from '../data/sectors.js';
import { UPGRADES, UPGRADE_BY_ID } from '../data/upgrades.js';
import { resetShip } from '../entities/ship.js';
import { spawnFieldAsteroid, spawnComet } from './asteroids.js';
import { spawnSaucer, spawnBoss, sectorDef, loopIndex } from './enemies.js';

export { sectorDef, loopIndex };

function weightedPick(rng, weights) {
  const entries = Object.entries(weights);
  let r = rng.next() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

export function startSector(game) {
  const { rng } = game;
  game.wave = 0;
  game.director = {
    waveBreak: 0,
    bossDefeated: false,
    saucerTimer: rng.range(10, 18),
    cometTimer: rng.range(12, 20),
  };
  startWave(game);
}

export function startWave(game) {
  const { rng } = game;
  const def = sectorDef(game);
  const loop = loopIndex(game);
  game.wave++;

  if (game.wave > def.waves) {
    spawnBoss(game);
    game.events.push({ type: 'waveStarted', wave: game.wave, waves: def.waves, boss: true });
    return;
  }

  let budget = def.budget[game.wave - 1] * (1 + 0.35 * loop);
  const speed = def.speed * (1 + 0.1 * loop);
  let crystals = 0;
  while (budget >= 2) {
    const affordable = Object.fromEntries(Object.entries(def.weights).filter(([t]) => COSTS[t] <= budget && (t !== 'crystal' || crystals < 1)));
    if (Object.keys(affordable).length === 0) break;
    const type = weightedPick(rng, affordable);
    budget -= COSTS[type];
    if (type === 'crystal') crystals++;
    // Non-splitting types spawn a little smaller.
    const size = type === 'magnetic' || type === 'crystal' ? def.size * 0.75 : def.size;
    spawnFieldAsteroid(game, type, size, speed);
  }
  game.events.push({ type: 'waveStarted', wave: game.wave, waves: def.waves, boss: false });
}

function offerUpgrades(game) {
  const { rng } = game;
  const pool = UPGRADES.filter((u) => (game.upgrades[u.id] ?? 0) < u.max).map((u) => u.id);
  const choices = [];
  while (choices.length < 3 && pool.length) choices.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  game.upgradeChoices = choices;
  game.mode = 'upgrade';
  game.events.push({ type: 'upgradeOffered', choices });
}

function sectorCleared(game) {
  game.events.push({ type: 'sectorCleared', level: game.level });
  if (game.runMode === 'campaign' && game.level >= SECTORS.length) {
    game.ship.boosting = false;
    game.mode = 'over';
    game.won = true;
    game.events.push({ type: 'won', score: game.score });
    return;
  }
  offerUpgrades(game);
}

/** Apply the chosen upgrade (index into upgradeChoices) and begin the next sector. */
export function chooseUpgrade(game, index) {
  const id = game.upgradeChoices?.[index];
  if (!id) return;
  UPGRADE_BY_ID[id].apply(game.stats, game);
  game.upgrades[id] = (game.upgrades[id] ?? 0) + 1;
  game.upgradeChoices = null;
  game.events.push({ type: 'upgradeChosen', id });

  game.level++;
  resetShip(game.ship, game.world, game.stats);
  game.fx.engineTrail = [];
  game.missiles = [];
  game.enemyShots = [];
  game.enemies = [];
  game.pickups = [];
  game.frostFields = [];
  game.blasts = [];
  game.asteroids = [];
  startSector(game);
  game.mode = 'transition';
  game.transitionTimer = LEVEL_TRANSITION_SECONDS;
  game.events.push({ type: 'levelUp', level: game.level, intro: sectorDef(game).intro });
}

export function updateDirector(game, dt) {
  if (game.mode !== 'playing') return;
  const { rng } = game;
  const def = sectorDef(game);
  const d = game.director;
  const loop = loopIndex(game);
  const fighting = !game.boss && !d.bossDefeated;

  // Timed visitors during regular waves.
  if (fighting) {
    d.saucerTimer -= dt;
    if (d.saucerTimer <= 0) {
      d.saucerTimer = rng.range(14, 22) / (1 + 0.2 * loop);
      if (game.enemies.length === 0) {
        if (rng.chance(def.saucers.small)) spawnSaucer(game, 'small');
        else if (rng.chance(def.saucers.big)) spawnSaucer(game, 'big');
      }
    }
    d.cometTimer -= dt;
    if (d.cometTimer <= 0) {
      d.cometTimer = rng.range(15, 25);
      if (rng.chance(def.comets)) spawnComet(game);
    }
  }

  // Comets and saucers don't hold up a wave; rocks and the boss do.
  const clear = !game.boss && game.asteroids.every((a) => a.dead || a.type === 'comet');
  if (!clear) {
    d.waveBreak = 0;
    return;
  }
  if (d.waveBreak <= 0) {
    d.waveBreak = WAVE_BREAK_SECONDS;
    game.events.push({ type: 'waveCleared', wave: game.wave });
    return;
  }
  d.waveBreak -= dt;
  if (d.waveBreak > 0) return;

  if (d.bossDefeated) sectorCleared(game);
  else startWave(game);
}
