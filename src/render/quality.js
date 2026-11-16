// Graphics quality tiers, first-run auto-detection, and adaptive resolution.
//   maxPixelRatio  render resolution cap (× CSS pixels)
//   msaa           antialiasing samples on the HDR buffer (only used below 1.5×)
//   bloomLevels    mip levels in the bloom blur (fewer = cheaper, tighter glow)
//   nebulaScale    resolution of the off-screen nebula pass (× render resolution)
//   particleCap    most live particles (cosmetic; extra spawns are skipped)
export const QUALITY = {
  low: { label: 'Low', maxPixelRatio: 1, msaa: 0, bloomLevels: 4, nebulaScale: 0.35, particleCap: 1500 },
  medium: { label: 'Medium', maxPixelRatio: 1.25, msaa: 0, bloomLevels: 5, nebulaScale: 0.45, particleCap: 3000 },
  high: { label: 'High', maxPixelRatio: 1.5, msaa: 4, bloomLevels: 6, nebulaScale: 0.5, particleCap: 6000 },
  ultra: { label: 'Ultra', maxPixelRatio: 2, msaa: 4, bloomLevels: 8, nebulaScale: 0.75, particleCap: 10000 },
};
export const TIERS = ['low', 'medium', 'high', 'ultra'];

/** Best guess for a device we've never measured. */
export function detectTier(renderer) {
  const gl = renderer.getContext();
  const caps = renderer.capabilities;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const memory = navigator.deviceMemory ?? 8; // GB, Chromium only
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
  const software = /swiftshader|llvmpipe|software/i.test(gpu);
  if (software || memory <= 2) return 'low';
  if (coarse || memory <= 4 || caps.maxTextureSize < 8192) return 'medium';
  return 'high';
}

/**
 * Adaptive resolution. Frame times are quantised by vsync (a slightly slow
 * frame shows up as a whole missed refresh), so this watches the share of
 * frames over budget rather than the average:
 *   >20% of recent frames late  → drop render scale a step
 *   10 s with almost none late  → try one step up; if that immediately
 *                                  causes misses, step back and hold for 30 s
 */
export function createResolutionScaler({ min = 0.6, max = 1, step = 0.1, budgetMs = 1000 / 58 } = {}) {
  let scale = max;
  let window = [];
  let calm = 0;
  let holdUntil = 0;
  let probing = 0; // seconds left in a step-up trial
  let clock = 0;

  return {
    get scale() { return scale; },
    reset() { scale = max; window = []; calm = 0; holdUntil = 0; probing = 0; },
    /** Feed one frame; returns the new scale if it changed, else null. */
    sample(frameSeconds) {
      clock += frameSeconds;
      window.push(frameSeconds * 1000 > budgetMs);
      if (window.length < 60) return null;
      if (window.length > 60) window.shift();
      const lateShare = window.filter(Boolean).length / window.length;

      if (probing > 0) {
        probing -= frameSeconds;
        if (lateShare > 0.2) {
          probing = 0;
          holdUntil = clock + 30;
          scale = Math.max(min, +(scale - step).toFixed(2));
          window = [];
          return scale;
        }
      }
      if (lateShare > 0.2 && scale > min) {
        scale = Math.max(min, +(scale - step).toFixed(2));
        window = [];
        calm = 0;
        return scale;
      }
      calm = lateShare < 0.03 ? calm + frameSeconds : 0;
      if (calm > 10 && scale < max && clock > holdUntil) {
        scale = Math.min(max, +(scale + step).toFixed(2));
        calm = 0;
        probing = 3;
        window = [];
        return scale;
      }
      return null;
    },
  };
}
