// Web Audio graph:
//
//   sfx ─┐
//   ui  ─┼─► master ─► compressor ─► limiter ─► speakers
//   music┘
//
// The context is created on the first user gesture (browsers block audio
// before one). Positional sounds get stereo panning by screen x and a
// low-pass that closes with distance from the ship.

export function createAudioEngine() {
  let ctx = null;
  const buses = {};
  let master = null;
  let noise = null;
  const listener = { x: 0, y: 0, width: 1, height: 1 };
  const volumes = { master: 0.8, music: 0.6, sfx: 0.9 };
  const unlockListeners = [];

  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(volumes.master, t, 0.05);
    buses.music.gain.setTargetAtTime(volumes.music * 0.55, t, 0.05);
    buses.sfx.gain.setTargetAtTime(volumes.sfx, t, 0.05);
    buses.ui.gain.setTargetAtTime(volumes.sfx * 0.8, t, 0.05);
  }

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;

      master = ctx.createGain();
      master.connect(compressor).connect(limiter).connect(ctx.destination);
      for (const name of ['sfx', 'ui', 'music']) {
        buses[name] = ctx.createGain();
        buses[name].connect(master);
      }

      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      applyVolumes();
      unlockListeners.forEach((fn) => fn());
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  /**
   * Destination node for a sound at game position (x, y). Returns the sfx bus
   * directly when no position is given.
   */
  function spatial(x, y) {
    if (x === undefined) return buses.sfx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, (x / listener.width) * 2 - 1)) * 0.75;
    const dist = Math.hypot(x - listener.x, y - listener.y) / Math.hypot(listener.width, listener.height);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1200 + 16000 * (1 - Math.min(1, dist * 1.6)) ** 2;
    pan.connect(lowpass).connect(buses.sfx);
    return pan;
  }

  return {
    get ctx() { return ctx; },
    get noise() { return noise; },
    buses,
    unlock,
    onUnlock: (fn) => unlockListeners.push(fn),
    spatial,
    setListener(x, y, width, height) {
      Object.assign(listener, { x, y, width, height });
    },
    setVolumes({ masterVolume, musicVolume, sfxVolume }) {
      Object.assign(volumes, { master: masterVolume, music: musicVolume, sfx: sfxVolume });
      applyVolumes();
    },
  };
}
