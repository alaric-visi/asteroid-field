// Player settings: defaults, validation and persistence. Storage can be
// unavailable (private mode, blocked site data), so every access is guarded
// and the game always runs on defaults if it fails.

const STORAGE_KEY = 'asteroids3d.settings.v1';

export const DEFAULT_BINDINGS = Object.freeze({
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  thrust: ['ArrowUp', 'KeyW'],
  fire: ['Space'],
  hyperspace: ['ShiftLeft', 'KeyS', 'ArrowDown'],
  shield: ['KeyE', 'KeyQ'],
  pause: ['KeyP', 'Escape'],
  restart: ['KeyR'],
});

export const DEFAULT_SETTINGS = Object.freeze({
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  shake: 'full', // full | reduced | off
  flashes: 'full', // full | reduced
  palette: 'standard', // standard | colorblind
  gameSpeed: 1, // 1 | 0.75
  fireMode: 'hold', // hold (auto-fire) | tap
  assist: false, // flight assist
  quality: 'auto', // auto | low | medium | high | ultra
  tutorialDone: false, // first-run tutorial completed or skipped
  bindings: DEFAULT_BINDINGS,
});

const CHOICES = {
  shake: ['full', 'reduced', 'off'],
  flashes: ['full', 'reduced'],
  palette: ['standard', 'colorblind'],
  gameSpeed: [1, 0.75],
  fireMode: ['hold', 'tap'],
  assist: [false, true],
  quality: ['auto', 'low', 'medium', 'high', 'ultra'],
  tutorialDone: [false, true],
};

function sanitize(raw, defaults = DEFAULT_SETTINGS) {
  const out = { ...defaults, bindings: { ...DEFAULT_BINDINGS } };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of ['masterVolume', 'musicVolume', 'sfxVolume']) {
    const v = Number(raw[key]);
    if (Number.isFinite(v)) out[key] = Math.min(1, Math.max(0, Math.round(v * 10) / 10));
  }
  for (const [key, allowed] of Object.entries(CHOICES)) {
    if (allowed.includes(raw[key])) out[key] = raw[key];
  }
  if (raw.bindings && typeof raw.bindings === 'object') {
    for (const action of Object.keys(DEFAULT_BINDINGS)) {
      const keys = raw.bindings[action];
      if (Array.isArray(keys) && keys.length && keys.every((k) => typeof k === 'string')) out.bindings[action] = [...keys];
    }
  }
  return out;
}

/**
 * `reducedMotion` (from the OS setting) changes the *defaults* only: no screen
 * shake and reduced flashes until the player chooses otherwise.
 */
export function createSettingsStore(storage = safeStorage(), { reducedMotion = false } = {}) {
  const defaults = reducedMotion ? { ...DEFAULT_SETTINGS, shake: 'off', flashes: 'reduced' } : DEFAULT_SETTINGS;
  let current = sanitize(read(storage), defaults);
  const listeners = new Set();

  function commit(next) {
    current = sanitize(next, defaults);
    write(storage, current);
    listeners.forEach((fn) => fn(current));
  }

  return {
    get: () => current,
    set: (key, value) => commit({ ...current, [key]: value }),
    /** Cycle a choice setting forwards (+1) or backwards (−1). */
    cycle(key, direction = 1) {
      const options = CHOICES[key];
      const i = options.indexOf(current[key]);
      commit({ ...current, [key]: options[(i + direction + options.length) % options.length] });
    },
    /** Nudge a 0–1 volume by ±0.1. */
    nudge(key, direction) {
      commit({ ...current, [key]: current[key] + direction * 0.1 });
    },
    /** Make `code` the primary key for `action`, removing it from any other action. */
    bind(action, code) {
      const bindings = {};
      for (const [a, keys] of Object.entries(current.bindings)) {
        const rest = keys.filter((k) => k !== code);
        bindings[a] = a === action ? [code, ...rest.filter((k) => k !== keys[0])] : rest.length ? rest : keys;
      }
      commit({ ...current, bindings });
    },
    resetBindings: () => commit({ ...current, bindings: { ...DEFAULT_BINDINGS } }),
    subscribe(fn) {
      listeners.add(fn);
      fn(current);
      return () => listeners.delete(fn);
    },
  };
}

/** Derived values the renderer and simulation use. */
export function effectScales(settings) {
  return {
    shakeScale: settings.shake === 'full' ? 1 : settings.shake === 'reduced' ? 0.35 : 0,
    flashScale: settings.flashes === 'full' ? 1 : 0.3,
    palette: settings.palette,
  };
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function read(storage) {
  try {
    return JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
}
function write(storage, value) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage full or blocked: settings still apply for this session */
  }
}
