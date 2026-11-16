// Bootstrap: wires the pure simulation to settings, input, the WebGL
// renderer, audio, music and the UI, and runs the two screens:
//   title — an attract-mode game flown by the autopilot behind the title menu
//   game  — the player's run (campaign / endless / daily)
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import './ui/styles.css';
import { createFixedStep, runAnimationLoop } from './core/loop.js';
import { wrapDelta } from './core/math.js';
import { TICK_HZ } from './data/tuning.js';
import { themeForLevel } from './data/themes.js';
import { PICKUPS } from './data/pickups.js';
import { UPGRADE_BY_ID } from './data/upgrades.js';
import { createGame, newRun, step, setWorldSize, setPaused } from './state/game.js';
import { createSettingsStore, effectScales } from './settings/settings.js';
import { createHighScores, dailySeed } from './settings/highscores.js';
import { createKeyboardInput } from './input/keyboard.js';
import { createGamepadInput } from './input/gamepad.js';
import { createTouchInput } from './input/touch.js';
import { createInput } from './input/input.js';
import { createAutopilot } from './ai/autopilot.js';
import { createAudioEngine } from './audio/engine.js';
import { createSfx } from './audio/sfx.js';
import { createMusic } from './audio/music.js';
import { createRenderer } from './render/renderer.js';
import { createHud } from './ui/hud.js';
import { createMenu, keyName } from './ui/menu.js';
import { createTitleScreen } from './ui/title.js';
import { createTutorial } from './ui/tutorial.js';
import { createDebugTools } from './debug/debug.js';
import { QUALITY, detectTier, createResolutionScaler } from './render/quality.js';

const params = new URLSearchParams(location.search);
const MODES = ['campaign', 'endless', 'daily'];
const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;
const seedFor = (mode) => (params.has('seed') ? Number(params.get('seed')) >>> 0 : mode === 'daily' ? dailySeed() : randomSeed());

// ---- Settings & persistence ----
const settings = createSettingsStore(undefined, {
  reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
});
const highScores = createHighScores();
const simOptions = (s) => ({ autoFire: s.fireMode === 'hold', assist: s.assist });

// ---- Simulation (one game object, reused for the attract demo and real runs) ----
const game = createGame({ width: innerWidth, height: innerHeight, seed: randomSeed(), options: simOptions(settings.get()), runMode: 'endless' });

// ---- Audio ----
const audio = createAudioEngine();
const sfx = createSfx(audio);
const music = createMusic(audio);
audio.onUnlock(() => music.start());
const unlockAudio = () => audio.unlock();

// ---- Input (and which device the player is using, for on-screen prompts) ----
let device = 'keyboard';
window.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (e.pointerType === 'touch') device = 'touch';
});
const keyboard = createKeyboardInput(window, {
  onFirstInput: () => {
    unlockAudio();
    device = 'keyboard';
  },
});
const gamepad = createGamepadInput();
const touch = createTouchInput({ onFirstTouch: unlockAudio });
const input = createInput({ keyboard, gamepad, touch, getShipAngle: () => game.ship.angle });
const autopilot = createAutopilot();

// ---- Presentation ----
const renderer = createRenderer(document.getElementById('game'));
const hud = createHud();
const debug = createDebugTools(game, renderer, params);
const pauseMenu = createMenu({
  root: document.getElementById('menu'),
  settings,
  sfx,
  onResume: () => setPaused(game, false),
  onQuit: () => showTitle(),
});
let title = null;
const titleSettings = createMenu({
  root: document.getElementById('titleSettingsMenu'),
  settings,
  sfx,
  resumeLabel: '← Back',
  onResume: () => title.back(),
});
title = createTitleScreen({
  settings, highScores, sfx,
  settingsMenu: titleSettings,
  onStart: (mode) => startGame(mode),
  onTutorial: () => startGame('campaign', { tutorial: true }),
});
const tutorial = createTutorial({
  root: document.getElementById('coach'),
  getDevice: () => device,
  getBindings: () => settings.get().bindings,
  onFinish: () => settings.set('tutorialDone', true),
  sfx,
});

// ---- Graphics quality: a tier (auto-detected or chosen) + adaptive resolution in auto ----
const detectedTier = detectTier(renderer.renderer);
const scaler = createResolutionScaler();
let tier = null;
function applyQuality(s) {
  const name = s.quality === 'auto' ? detectedTier : s.quality;
  if (name === tier) return;
  tier = name;
  scaler.reset();
  renderer.setRenderScale(1);
  renderer.setQuality(name);
}

let effects = effectScales(settings.get());
let timeScale = 1;
settings.subscribe((s) => {
  applyQuality(s);
  keyboard.setBindings(s.bindings);
  hud.setBindings(s.bindings, keyName);
  audio.setVolumes(s);
  game.options = { ...simOptions(s), training: game.options?.training ?? false };
  effects = effectScales(s);
  timeScale = s.gameSpeed;
});

// ---- Screens ----
let screen = 'title';
let attractRestart = 0;

function showTitle() {
  screen = 'title';
  tutorial.stop();
  newRun(game, { seed: randomSeed(), runMode: 'endless' });
  game.options.training = false;
  hud.reset();
  document.body.classList.add('screen-title');
  title.show();
  renderer.reseedBackground();
  music.setSector(0);
  music.start();
}

function startGame(mode, { tutorial: withTutorial = false } = {}) {
  screen = 'game';
  title.hide();
  document.body.classList.remove('screen-title');
  hud.reset();
  newRun(game, { seed: seedFor(mode), runMode: MODES.includes(mode) ? mode : 'campaign', intro: true });
  game.options.training = false;
  sfx.uiSelect();
  music.start();
  if (withTutorial || (mode === 'campaign' && !settings.get().tutorialDone)) tutorial.start(game);
  else tutorial.stop();
}

function retry() {
  startGame(game.runMode);
}

// Game-over panel buttons.
document.getElementById('gameOver').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'title') showTitle();
  else retry();
});

// ---- Keyboard routing (capture phase: UI sees keys before gameplay) ----
const UPGRADE_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2, ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm', Space: 'confirm' };
window.addEventListener('keydown', (e) => {
  const consume = () => { e.preventDefault(); e.stopPropagation(); };
  if (screen === 'title') {
    if (title.handleKey(e)) consume();
    return;
  }
  if (pauseMenu.handleKey(e)) return consume();
  if (game.mode === 'over' && (e.code === 'Escape' || e.code === 'KeyT')) {
    consume();
    showTitle();
    return;
  }
  if (game.mode === 'upgrade' && !game.paused && e.code in UPGRADE_KEYS) {
    consume();
    if (!e.repeat && hud.upgradeNav(UPGRADE_KEYS[e.code])) sfx.uiMove();
    return;
  }
  if (tutorial.active && !game.paused && e.code === 'Enter') {
    consume();
    tutorial.skip();
  }
}, true);
hud.cardsElement.addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (card) hud.upgradeNav(Number(card.dataset.index));
});

function resize() {
  setWorldSize(game, innerWidth, innerHeight);
  renderer.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'game') setPaused(game, true);
});

// ---- Event fan-out ----
function handleEvents() {
  for (const e of game.events) {
    renderer.onEvent(e);
    if (screen === 'title') continue; // the attract demo is visual only
    tutorial.onEvent(e);
    switch (e.type) {
      case 'runStarted': renderer.reseedBackground(); music.setSector(0); break;
      case 'shoot': sfx.shoot(e); gamepad.rumble(0, 0.12, 35); break;
      case 'bounce': sfx.bounce(e); break;
      case 'asteroidDestroyed':
        sfx.asteroidBreak(e);
        hud.popScore(e.x, e.y, e.points, e.hue);
        gamepad.rumble(e.size > 25 ? 0.35 : 0.1, 0.3, e.size > 25 ? 120 : 60);
        break;
      case 'asteroidHit': sfx.clank(e); break;
      case 'deflect': sfx.deflect(e); break;
      case 'blast': sfx.blast(e); gamepad.rumble(0.5, 0.4, 180); break;
      case 'comboUp': sfx.comboUp(e.multiplier); hud.toast(`×${e.multiplier} COMBO`); break;
      case 'overheated': sfx.overheated(); hud.toast('OVERHEAT', '#ff6b4b'); break;
      case 'dryFire': sfx.dryFire(); break;
      case 'hyperspaceOut': sfx.hyperspace(true); break;
      case 'hyperspaceIn':
        sfx.hyperspace(false);
        if (e.misjump) hud.toast('MISJUMP', '#ff9a5a');
        break;
      case 'shieldOn': sfx.shieldOn(); break;
      case 'shieldOff': sfx.shieldOff(); break;
      case 'shieldHit':
      case 'shieldRam': sfx.shieldHit(e); gamepad.rumble(0.2, 0.3, 60); break;
      case 'pickupCollected':
        sfx.pickup();
        hud.toast(PICKUPS[e.kind].label, PICKUPS[e.kind].color);
        break;
      case 'enemySpawned': hud.toast(e.kind === 'small' ? 'HUNTER INBOUND' : 'SAUCER INBOUND', '#ff8a7a'); break;
      case 'enemyShot': sfx.enemyShot(e); break;
      case 'enemyDestroyed':
        sfx.asteroidBreak({ size: 30, x: e.x, y: e.y });
        if (e.points) hud.popScore(e.x, e.y, e.points, 0.95);
        gamepad.rumble(0.4, 0.4, 120);
        break;
      case 'cometIncoming': hud.toast('COMET', '#bff4ff'); break;
      case 'waveStarted':
        if (e.boss) { sfx.bossRoar(); hud.toast('BOSS INCOMING', '#ff6b6b'); gamepad.rumble(0.6, 0.6, 600); }
        else if (e.wave > 1) { sfx.waveChime(); hud.toast(`WAVE ${e.wave}`); }
        break;
      case 'bossHit': sfx.clank(e); break;
      case 'bossShieldHit': sfx.deflect(e); break;
      case 'bossPhase': sfx.bossRoar(); hud.toast('SHIELDS UP', '#ff8aa0'); break;
      case 'turretDestroyed': sfx.blast(e); hud.popScore(e.x, e.y, e.points, 0.08); break;
      case 'bossDestroyed':
        sfx.blast(e);
        sfx.shipExplosion(e);
        hud.popScore(e.x, e.y, e.points, 0.12);
        hud.toast('BOSS DESTROYED');
        gamepad.rumble(1, 1, 700);
        break;
      case 'upgradeOffered':
        sfx.levelUp();
        hud.showUpgrades(e.choices, game.upgrades, (i) => input.choose(i));
        break;
      case 'upgradeChosen': sfx.uiSelect(); hud.hideUpgrades(); break;
      case 'shipDestroyed': sfx.shipExplosion(e); gamepad.rumble(0.9, 0.6, 350); break;
      case 'levelUp':
        if (e.level > 1) sfx.levelUp();
        hud.showLevelUp(e.intro, e.level);
        renderer.reseedBackground();
        music.setSector((e.level - 1) % 3);
        break;
      case 'transitionEnded': hud.hideLevelUp(); break;
      case 'paused': hud.showPaused(true); pauseMenu.open(true); break;
      case 'resumed': hud.showPaused(false); pauseMenu.open(false); break;
      case 'gameOver': tutorial.stop(); sfx.gameOver(); hud.showGameOver(false, finishRun()); music.stop(); break;
      case 'won': sfx.win(); hud.showGameOver(true, finishRun()); music.stop(3); break;
    }
  }
  game.events.length = 0;
}

/** Record the finished run and build the summary for the game-over panel. */
function finishRun() {
  const rank = game.score > 0 ? highScores.record(game.runMode, { score: game.score, sector: game.level }) : null;
  return {
    score: game.score, best: highScores.best(game.runMode), rank, mode: game.runMode,
    sector: game.level, bestCombo: game.combo.best, time: game.runTime,
    shots: game.tally.shots, hits: game.tally.hits, kills: game.tally.kills,
    upgrades: Object.entries(game.upgrades).map(([id, n]) => `${UPGRADE_BY_ID[id].name}${n > 1 ? ` ×${n}` : ''}`),
  };
}

// ---- Music intensity: crowding + nearest threat + sector + last life + boss ----
let intensity = 0;
function targetIntensity() {
  if (screen === 'title') return 0.25;
  if (game.mode !== 'playing') return 0.15;
  const { ship, world } = game;
  let nearest = Infinity;
  for (const a of game.asteroids) {
    const d = Math.hypot(wrapDelta(a.x - ship.x, world.width), wrapDelta(a.y - ship.y, world.height)) - a.size;
    if (d < nearest) nearest = d;
  }
  const danger = Math.max(0, Math.min(1, 1 - nearest / 260));
  const crowd = Math.min(1, game.asteroids.length / 14);
  const pressure = game.boss ? 0.45 : 0;
  return Math.min(1, 0.15 + crowd * 0.3 + danger * 0.45 + ((game.level - 1) % 3) * 0.12 + (game.lives === 1 ? 0.1 : 0) + pressure);
}

// ---- Loop ----
let simMs = 0;
const fixedStep = createFixedStep({
  hz: TICK_HZ,
  step: (dt) => {
    const t = performance.now();
    if (screen === 'title') {
      input.snapshot(); // drain player input so it can't leak into the next run
      step(game, autopilot(game), dt);
    } else {
      const inp = input.snapshot();
      // Retry re-seeds (so daily runs restart identically) instead of the sim's plain restart.
      if (game.mode === 'over' && inp.pressed.restart) retry();
      else step(game, inp, dt);
    }
    simMs += performance.now() - t;
  },
});

runAnimationLoop(fixedStep, ({ alpha, frameSeconds, now }) => {
  gamepad.poll();
  const edges = gamepad.takeMenu();
  if (Object.values(edges).some(Boolean)) device = 'gamepad';
  if (screen === 'title') {
    title.navigate(edges);
    if (game.mode === 'over' && (attractRestart += frameSeconds) > 2.5) {
      attractRestart = 0;
      newRun(game, { seed: randomSeed(), runMode: 'endless' });
    }
  } else if (game.paused) {
    pauseMenu.navigate(edges);
  } else if (game.mode === 'upgrade') {
    if (edges.left) hud.upgradeNav('left');
    if (edges.right) hud.upgradeNav('right');
    if (edges.confirm) hud.upgradeNav('confirm');
  } else if (game.mode === 'over' && edges.back) {
    showTitle();
  }

  game.fx.particleCap = QUALITY[tier].particleCap;
  if (settings.get().quality === 'auto' && !game.paused) {
    const scale = scaler.sample(frameSeconds);
    if (scale !== null) renderer.setRenderScale(scale);
  }

  debug.beforeFrame();
  handleEvents();
  const theme = themeForLevel(((game.level - 1) % 3) + 1);

  const t0 = performance.now();
  renderer.render(game, { alpha: game.paused ? 1 : alpha, frameSeconds, now, theme, effects });
  const renderMs = performance.now() - t0;

  if (screen === 'game') {
    hud.update(game, theme, frameSeconds);
    tutorial.update(frameSeconds * timeScale);
  }
  audio.setListener(game.ship.x, game.ship.y, game.world.width, game.world.height);
  sfx.setThrust(screen === 'game' && game.mode === 'playing' && !game.paused && game.ship.boosting);
  intensity += (targetIntensity() - intensity) * (1 - Math.exp(-frameSeconds * 1.5));
  music.setIntensity(intensity);
  music.setMuffled(game.paused || game.mode === 'transition' || game.mode === 'upgrade');

  debug.afterFrame(frameSeconds, now, { simMs, renderMs, quality: `${tier}${settings.get().quality === 'auto' ? ' (auto)' : ''} @ ${renderer.pixelRatio.toFixed(2)}×` });
  simMs = 0;
}, { timeScale: () => (screen === 'game' ? timeScale : 1) });

// Start on the title screen; ?mode=… (or ?play / ?stress) jumps straight into a run.
if (params.has('mode') || params.has('play') || params.has('stress')) startGame(params.get('mode') ?? 'campaign');
else showTitle();

// Offline play in production builds (the dev server stays uncached).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Console access for debugging, e.g. __game.seed to reproduce a run.
window.__game = game;
window.__debug = debug;
window.__settings = settings;
if (params.has('debug') || params.has('stress')) {
  window.__render = renderer.debugHandles;
  window.__audio = { engine: audio, music, get intensity() { return intensity; } };
  window.__menu = pauseMenu;
  window.__title = title;
  window.__tutorial = tutorial;
}
