// Procedural adaptive soundtrack. A 16-step sequencer schedules notes slightly
// ahead on the audio clock (the "lookahead" pattern), so timing is sample-
// accurate even if the main thread stutters.
//
// Layers fade in with intensity (0–1), which the game sets from danger:
//   pad   always      bass  ≥ ~0.15     arp  ≥ ~0.4     drums ≥ ~0.6
// Each sector has its own chord progression; the change lands on a bar line.

const BPM = 112;
const STEP = 60 / BPM / 4; // one 16th note, seconds
const LOOKAHEAD = 0.12; // schedule this far ahead, seconds
const TICK_MS = 25;

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// [root MIDI note, chord intervals], one chord per bar.
const PROGRESSIONS = [
  [[57, [0, 3, 7]], [53, [0, 4, 7]], [48, [0, 4, 7]], [55, [0, 4, 7]]], // Am  F  C  G   — rocky
  [[50, [0, 3, 7]], [46, [0, 4, 7]], [53, [0, 4, 7]], [48, [0, 4, 7]]], // Dm  Bb F  C   — icy
  [[52, [0, 3, 7]], [53, [0, 4, 7]], [52, [0, 3, 7]], [50, [0, 3, 7]]], // Em  F  Em Dm  — plasma (phrygian)
];
const BASS = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 2, 1, 3];

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createMusic(engine) {
  let layers = null; // { pad, bass, arp, drums, filter }
  let timer = null;
  let step = 0;
  let nextTime = 0;
  let intensity = 0;
  let sector = 0;
  let pendingSector = 0;

  function build() {
    const ctx = engine.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 18000;
    filter.connect(engine.buses.music);
    const gain = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(filter);
      return g;
    };
    layers = { pad: gain(), bass: gain(), arp: gain(), drums: gain(), filter };
  }

  function voice(type, freq, t, duration, volume, out, { attack = 0.005, filterFrom, filterTo } = {}) {
    const ctx = engine.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(volume, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    let node = osc;
    if (filterFrom) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(filterFrom, t);
      f.frequency.exponentialRampToValueAtTime(filterTo, t + duration);
      node = osc.connect(f);
    }
    node.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.05);
    return osc;
  }

  function noiseHit(t, duration, volume, type, freq, out) {
    const ctx = engine.ctx;
    const src = ctx.createBufferSource();
    src.buffer = engine.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(volume, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(env).connect(out);
    src.start(t, Math.random());
    src.stop(t + duration + 0.02);
  }

  function scheduleStep(s, t) {
    const bar = Math.floor(s / 16);
    const s16 = s % 16;
    if (s16 === 0) sector = pendingSector; // change key on the bar line
    const [root, intervals] = PROGRESSIONS[sector][bar % 4];
    const tones = [...intervals.map((i) => root + i), root + 12];

    if (s16 === 0) {
      // Pad: detuned saws, held for the whole bar.
      for (const n of [root - 12, ...tones.slice(0, 3)]) {
        for (const detune of [-0.004, 0.004]) {
          voice('sawtooth', midi(n) * (1 + detune), t, STEP * 16 + 0.6, 0.035, layers.pad, { attack: 0.4, filterFrom: 1400, filterTo: 600 });
        }
      }
    }
    if (BASS[s16] && intensity > 0.08) {
      voice('sawtooth', midi(root - 12), t, STEP * 1.8, 0.2, layers.bass, { filterFrom: 900, filterTo: 160 });
    }
    if (intensity > 0.32) {
      const n = tones[ARP[s16] % tones.length] + 12;
      voice('triangle', midi(n), t, STEP * 1.6, 0.075, layers.arp);
    }
    if (intensity > 0.5 && s16 % 2 === 1) noiseHit(t, 0.04, s16 % 4 === 3 ? 0.1 : 0.05, 'highpass', 7000, layers.drums);
    if (intensity > 0.6 && (s16 === 0 || s16 === 8 || (intensity > 0.85 && (s16 === 6 || s16 === 14)))) {
      voice('sine', 140, t, 0.28, 0.55, layers.drums, { filterFrom: 2000, filterTo: 200 });
      voice('sine', 55, t + 0.01, 0.25, 0.35, layers.drums);
    }
    if (intensity > 0.78 && (s16 === 4 || s16 === 12)) {
      noiseHit(t, 0.16, 0.22, 'bandpass', 1800, layers.drums);
      voice('triangle', 190, t, 0.1, 0.12, layers.drums);
    }
  }

  function tick() {
    const ctx = engine.ctx;
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextTime);
      nextTime += STEP;
      step++;
    }
    // Ease layer levels toward the current intensity.
    const t = ctx.currentTime;
    layers.pad.gain.setTargetAtTime(0.8, t, 0.5);
    layers.bass.gain.setTargetAtTime(smoothstep(0.08, 0.3, intensity), t, 0.6);
    layers.arp.gain.setTargetAtTime(smoothstep(0.32, 0.55, intensity), t, 0.6);
    layers.drums.gain.setTargetAtTime(smoothstep(0.5, 0.75, intensity), t, 0.4);
  }

  return {
    start() {
      if (!engine.ctx) return;
      if (!layers) build();
      if (timer) return;
      step = 0;
      nextTime = engine.ctx.currentTime + 0.1;
      layers.filter.frequency.setTargetAtTime(18000, engine.ctx.currentTime, 0.1);
      timer = setInterval(tick, TICK_MS);
    },
    stop(fade = 1.5) {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      const t = engine.ctx.currentTime;
      for (const name of ['pad', 'bass', 'arp', 'drums']) layers[name].gain.setTargetAtTime(0, t, fade / 4);
    },
    setIntensity(v) {
      intensity = Math.max(0, Math.min(1, v));
    },
    setSector(index) {
      pendingSector = Math.max(0, Math.min(PROGRESSIONS.length - 1, index));
    },
    /** Muffle (paused, between sectors) or open up the mix. */
    setMuffled(on) {
      if (!layers) return;
      layers.filter.frequency.setTargetAtTime(on ? 650 : 18000, engine.ctx.currentTime, 0.15);
    },
    get playing() { return timer !== null; },
  };
}
