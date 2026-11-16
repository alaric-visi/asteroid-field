// Developer tools, enabled by URL flags:
//   ?debug  — FPS / frame-time / draw-call overlay
//   ?stress — 200 asteroids and a sustained ~5,000 particles, ship invulnerable
import { createAsteroid } from '../entities/asteroid.js';
import { spawnBurst } from '../systems/effects.js';

const STRESS_ASTEROIDS = 200;
const STRESS_PARTICLES = 5000;
const TYPES = ['rock', 'ice', 'plasma'];

export function createDebugTools(game, renderer, params) {
  const debug = params.has('debug') || params.has('stress');
  const stress = params.has('stress');
  let panel = null;
  if (debug) {
    panel = document.createElement('div');
    panel.className = 'debug';
    document.body.appendChild(panel);
  }

  const frameTimes = [];
  const cpu = { sim: 0, render: 0 };
  let lastPanelUpdate = 0;

  function topUpStress() {
    const { rng, fxRng, world } = game;
    game.ship.invulnerable = 999;
    while (game.asteroids.length < STRESS_ASTEROIDS) {
      const type = TYPES[game.asteroids.length % 3];
      game.asteroids.push(createAsteroid(game, {
        x: rng.next() * world.width, y: rng.next() * world.height,
        size: 8 + rng.next() * 22, vx: rng.signed(160), vy: rng.signed(160), type,
        hue: (type === 'rock' ? 30 : type === 'ice' ? 200 : 315) / 360, sat: 0.7, light: 0.55,
      }));
    }
    // Respect the quality tier's particle cap, or this loop would never finish.
    const target = Math.min(STRESS_PARTICLES, game.fx.particleCap);
    for (let guard = 0; game.fx.particles.length < target && guard < 1000; guard++) {
      spawnBurst(game.fx, fxRng, fxRng.next() * world.width, fxRng.next() * world.height, [255, 200, 120], 40);
    }
  }

  return {
    beforeFrame() {
      if (stress && game.mode !== 'over') topUpStress();
    },
    afterFrame(frameSeconds, now, { simMs = 0, renderMs = 0, quality = '' } = {}) {
      // Exponential moving averages of CPU time spent per frame.
      cpu.sim += (simMs - cpu.sim) * 0.05;
      cpu.render += (renderMs - cpu.render) * 0.05;
      if (!panel) return;
      frameTimes.push(frameSeconds);
      if (frameTimes.length > 120) frameTimes.shift();
      if (now - lastPanelUpdate < 0.25) return;
      lastPanelUpdate = now;
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const worst = Math.max(...frameTimes);
      const s = renderer.stats();
      panel.textContent = [
        `fps        ${(1 / avg).toFixed(0)}`,
        `frame avg  ${(avg * 1000).toFixed(1)} ms  worst ${(worst * 1000).toFixed(1)} ms`,
        `cpu sim    ${cpu.sim.toFixed(2)} ms  render ${cpu.render.toFixed(2)} ms`,
        `quality    ${quality}`,
        `draw calls ${s.calls}`,
        `triangles  ${s.triangles}`,
        `sprites    ${s.sprites}`,
        `asteroids  ${game.asteroids.length}`,
        `particles  ${game.fx.particles.length}`,
        `seed       ${game.seed}`,
      ].join('\n');
    },
    stats: () => {
      const avg = frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, frameTimes.length);
      return {
        fps: 1 / avg, avgMs: avg * 1000, worstMs: Math.max(...frameTimes) * 1000,
        cpuSimMs: cpu.sim, cpuRenderMs: cpu.render, ...renderer.stats(),
      };
    },
  };
}
