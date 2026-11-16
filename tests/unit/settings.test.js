import { describe, it, expect } from 'vitest';
import { createSettingsStore, DEFAULT_SETTINGS } from '../../src/settings/settings.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, data };
}

describe('settings store', () => {
  it('falls back to defaults on missing or corrupt storage', () => {
    expect(createSettingsStore(null).get().shake).toBe(DEFAULT_SETTINGS.shake);
    const corrupt = memoryStorage({ 'asteroids3d.settings.v1': '{not json' });
    expect(createSettingsStore(corrupt).get().musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
  });
  it('persists and reloads, rejecting invalid values', () => {
    const storage = memoryStorage();
    const a = createSettingsStore(storage);
    a.set('shake', 'off');
    a.set('palette', 'neon'); // invalid → ignored
    a.nudge('musicVolume', 1);
    const b = createSettingsStore(storage);
    expect(b.get().shake).toBe('off');
    expect(b.get().palette).toBe('standard');
    expect(b.get().musicVolume).toBe(0.7);
  });
  it('clamps volumes and cycles choices', () => {
    const s = createSettingsStore(memoryStorage());
    for (let i = 0; i < 20; i++) s.nudge('sfxVolume', 1);
    expect(s.get().sfxVolume).toBe(1);
    s.cycle('shake', 1);
    expect(s.get().shake).toBe('reduced');
    s.cycle('shake', -1);
    s.cycle('shake', -1);
    expect(s.get().shake).toBe('off');
  });
  it('rebinding moves a key off any other action', () => {
    const s = createSettingsStore(memoryStorage());
    s.bind('fire', 'KeyW'); // KeyW was a thrust key
    expect(s.get().bindings.fire[0]).toBe('KeyW');
    expect(s.get().bindings.thrust).not.toContain('KeyW');
    expect(s.get().bindings.thrust).toContain('ArrowUp');
  });
});

describe('keyboard taps', () => {
  it('a key pressed and released between ticks still counts as held for one tick', async () => {
    const { createKeyboardInput } = await import('../../src/input/keyboard.js');
    const listeners = {};
    const target = { addEventListener: (type, fn) => { listeners[type] = fn; } };
    const kb = createKeyboardInput(target);
    kb.setBindings({ left: ['ArrowLeft'] });
    const ev = (code) => ({ code, repeat: false, preventDefault() {} });
    listeners.keydown(ev('ArrowLeft'));
    listeners.keyup(ev('ArrowLeft'));
    expect(kb.snapshot().held.left).toBe(true);
    expect(kb.snapshot().held.left).toBe(false);
  });
});

describe('reduced motion and quality', () => {
  it('turns shake off and flashes down by default when the OS asks for reduced motion', async () => {
    const { createSettingsStore } = await import('../../src/settings/settings.js');
    const s = createSettingsStore(memoryStorage(), { reducedMotion: true });
    expect(s.get().shake).toBe('off');
    expect(s.get().flashes).toBe('reduced');
    s.set('shake', 'full'); // the player's explicit choice wins
    expect(s.get().shake).toBe('full');
  });
  it('accepts quality tiers and rejects unknown ones', async () => {
    const { createSettingsStore } = await import('../../src/settings/settings.js');
    const s = createSettingsStore(memoryStorage());
    expect(s.get().quality).toBe('auto');
    s.set('quality', 'ultra');
    expect(s.get().quality).toBe('ultra');
    s.set('quality', 'potato');
    expect(s.get().quality).toBe('auto');
  });
});

describe('adaptive resolution', () => {
  it('steps down under sustained late frames and back up after a calm spell', async () => {
    const { createResolutionScaler } = await import('../../src/render/quality.js');
    const r = createResolutionScaler({ min: 0.6, max: 1, step: 0.1 });
    let changed = null;
    for (let i = 0; i < 120 && changed === null; i++) changed = r.sample(1 / 30);
    expect(changed).toBe(0.9);
    for (let i = 0; i < 60 * 12; i++) r.sample(1 / 60);
    expect(r.scale).toBe(1);
  });
});
