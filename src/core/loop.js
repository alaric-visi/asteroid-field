// Fixed-timestep simulation with a render callback that receives an
// interpolation factor. Simulation speed is independent of display refresh rate.

const EPSILON = 1e-9;

export function createFixedStep({ hz = 60, maxFrameSeconds = 0.25, step }) {
  const dt = 1 / hz;
  let accumulator = 0;
  return {
    dt,
    /** Advance by real elapsed time; runs zero or more ticks. */
    advance(frameSeconds) {
      accumulator += Math.min(Math.max(frameSeconds, 0), maxFrameSeconds);
      let ticks = 0;
      while (accumulator >= dt - EPSILON) {
        step(dt);
        accumulator -= dt;
        ticks++;
      }
      return { ticks, alpha: Math.min(Math.max(accumulator / dt, 0), 1) };
    },
  };
}

/**
 * Drive a fixed-step simulation from requestAnimationFrame (browser only).
 * `timeScale()` slows or speeds simulated time (e.g. 0.75 for an easier game)
 * without changing the tick size, so the simulation stays deterministic.
 */
export function runAnimationLoop(fixedStep, render, { timeScale = () => 1 } = {}) {
  let last = performance.now();
  function frame(now) {
    const frameSeconds = (now - last) / 1000;
    last = now;
    const { alpha } = fixedStep.advance(frameSeconds * timeScale());
    render({ alpha, frameSeconds: Math.min(frameSeconds, 0.25), now: now / 1000 });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
