// Synthesised sound effects on top of the audio engine. Every effect gets a
// little random pitch variation so repeated sounds don't feel mechanical, and
// positional effects pan and muffle by where they happen.

const vary = (amount = 0.06) => 1 + (Math.random() - 0.5) * amount;

export function createSfx(engine) {
  let thrustGain = null;

  function tone({ freqStart, freqEnd = freqStart, duration = 0.15, type = 'sine', volume = 0.3, delay = 0, out, detune = 1 }) {
    const ctx = engine.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(freqStart * detune, 1), t0);
    if (freqEnd !== freqStart) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd * detune, 1), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain).connect(out ?? engine.buses.sfx);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  function noiseBurst({ duration = 0.3, volume = 0.4, filterFreqStart = 2000, filterFreqEnd = 200, delay = 0, out }) {
    const ctx = engine.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = engine.noise;
    src.playbackRate.value = vary(0.2);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreqStart, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(filterFreqEnd, 40), t0 + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    src.connect(filter).connect(gain).connect(out ?? engine.buses.sfx);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + duration + 0.03);
  }

  return {
    shoot({ x, y } = {}) {
      if (!engine.ctx) return;
      const out = engine.spatial(x, y);
      tone({ freqStart: 900, freqEnd: 240, duration: 0.11, type: 'sawtooth', volume: 0.12, out, detune: vary(0.1) });
      tone({ freqStart: 1800, freqEnd: 600, duration: 0.05, type: 'square', volume: 0.03, out, detune: vary(0.1) });
    },
    asteroidBreak({ size, x, y }) {
      if (!engine.ctx) return;
      const out = engine.spatial(x, y);
      const big = size > 25;
      const d = vary(0.12);
      noiseBurst({ duration: big ? 0.45 : 0.22, volume: big ? 0.38 : 0.22, filterFreqStart: (big ? 1800 : 2600) * d, filterFreqEnd: 150, out });
      tone({ freqStart: big ? 160 : 280, freqEnd: big ? 50 : 100, duration: big ? 0.4 : 0.18, volume: 0.24, out, detune: d });
    },
    shipExplosion({ x, y } = {}) {
      if (!engine.ctx) return;
      const out = engine.spatial(x, y);
      noiseBurst({ duration: 0.8, volume: 0.55, filterFreqStart: 2500, filterFreqEnd: 80, out });
      tone({ freqStart: 140, freqEnd: 35, duration: 0.8, volume: 0.4, out });
    },
    bounce({ intensity, x, y }) {
      if (!engine.ctx) return;
      tone({
        freqStart: 480 + Math.random() * 200, freqEnd: 180, duration: 0.05, type: 'triangle',
        volume: Math.min(0.2, 0.05 + intensity * 0.03), out: engine.spatial(x, y),
      });
    },
    levelUp: () => [440, 554, 659, 880].forEach((f, i) => tone({ freqStart: f, duration: 0.18, type: 'square', volume: 0.14, delay: i * 0.09, out: engine.buses.ui })),
    win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone({ freqStart: f, duration: 0.22, type: 'square', volume: 0.16, delay: i * 0.1, out: engine.buses.ui })),
    gameOver: () => tone({ freqStart: 220, freqEnd: 70, duration: 0.9, type: 'sawtooth', volume: 0.2, out: engine.buses.ui }),
    hyperspace(out) {
      const out_ = engine.buses.sfx;
      tone({ freqStart: out ? 300 : 1600, freqEnd: out ? 1800 : 260, duration: 0.3, type: 'sine', volume: 0.18, out: out_ });
      noiseBurst({ duration: 0.25, volume: 0.12, filterFreqStart: out ? 600 : 5000, filterFreqEnd: out ? 6000 : 400, out: out_ });
    },
    shieldOn: () => tone({ freqStart: 220, freqEnd: 440, duration: 0.18, type: 'triangle', volume: 0.1 }),
    shieldOff: () => tone({ freqStart: 440, freqEnd: 180, duration: 0.15, type: 'triangle', volume: 0.08 }),
    shieldHit({ x, y } = {}) {
      if (!engine.ctx) return;
      tone({ freqStart: 1400, freqEnd: 500, duration: 0.12, type: 'square', volume: 0.07, out: engine.spatial(x, y), detune: vary(0.15) });
    },
    overheated: () => [880, 660, 880, 660].forEach((f, i) => tone({ freqStart: f, duration: 0.08, type: 'square', volume: 0.07, delay: i * 0.09, out: engine.buses.ui })),
    dryFire: () => tone({ freqStart: 180, freqEnd: 120, duration: 0.05, type: 'square', volume: 0.08 }),
    pickup: () => [660, 880, 1320].forEach((f, i) => tone({ freqStart: f, duration: 0.12, type: 'triangle', volume: 0.12, delay: i * 0.05, out: engine.buses.ui })),
    deflect({ x, y } = {}) {
      if (!engine.ctx) return;
      tone({ freqStart: 2400, freqEnd: 3200, duration: 0.09, type: 'sine', volume: 0.1, out: engine.spatial(x, y), detune: vary(0.2) });
    },
    clank({ x, y } = {}) {
      if (!engine.ctx) return;
      const out = engine.spatial(x, y);
      tone({ freqStart: 420, freqEnd: 300, duration: 0.12, type: 'square', volume: 0.1, out, detune: vary(0.15) });
      noiseBurst({ duration: 0.08, volume: 0.12, filterFreqStart: 4000, filterFreqEnd: 1500, out });
    },
    blast({ x, y } = {}) {
      if (!engine.ctx) return;
      const out = engine.spatial(x, y);
      noiseBurst({ duration: 0.7, volume: 0.5, filterFreqStart: 3000, filterFreqEnd: 60, out });
      tone({ freqStart: 110, freqEnd: 30, duration: 0.7, volume: 0.4, out });
    },
    enemyShot({ x, y } = {}) {
      if (!engine.ctx) return;
      tone({ freqStart: 520, freqEnd: 200, duration: 0.12, type: 'square', volume: 0.06, out: engine.spatial(x, y), detune: vary(0.1) });
    },
    bossRoar() {
      tone({ freqStart: 70, freqEnd: 45, duration: 1.4, type: 'sawtooth', volume: 0.25 });
      tone({ freqStart: 105, freqEnd: 60, duration: 1.4, type: 'sawtooth', volume: 0.15 });
    },
    comboUp: (m) => tone({ freqStart: 500 + m * 90, duration: 0.1, type: 'triangle', volume: 0.09, out: engine.buses.ui }),
    waveChime: () => [523, 784].forEach((f, i) => tone({ freqStart: f, duration: 0.2, type: 'triangle', volume: 0.1, delay: i * 0.12, out: engine.buses.ui })),
    uiMove: () => tone({ freqStart: 1200, freqEnd: 1000, duration: 0.04, type: 'triangle', volume: 0.06, out: engine.buses.ui }),
    uiSelect: () => tone({ freqStart: 700, freqEnd: 1400, duration: 0.08, type: 'triangle', volume: 0.08, out: engine.buses.ui }),
    setThrust(on) {
      const ctx = engine.ctx;
      if (!ctx) return;
      if (on && !thrustGain) {
        const src = ctx.createBufferSource();
        src.buffer = engine.noise;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 180;
        filter.Q.value = 0.7;
        thrustGain = ctx.createGain();
        thrustGain.gain.value = 0;
        src.connect(filter).connect(thrustGain).connect(engine.buses.sfx);
        src.start();
      }
      if (thrustGain) {
        const g = thrustGain.gain;
        g.cancelScheduledValues(ctx.currentTime);
        g.setValueAtTime(g.value, ctx.currentTime);
        g.linearRampToValueAtTime(on ? 0.1 : 0, ctx.currentTime + 0.08);
      }
    },
  };
}
