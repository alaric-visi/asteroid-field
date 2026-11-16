import { LEGACY_HZ } from '../data/tuning.js';

/**
 * Convert a legacy "multiply by this every frame" factor into the
 * equivalent factor for an arbitrary dt, so decay is frame-rate independent.
 */
export function perTick(factorPerLegacyFrame, dt) {
  return factorPerLegacyFrame ** (dt * LEGACY_HZ);
}

export function wrapPosition(obj, width, height) {
  if (obj.x < 0) obj.x += width;
  else if (obj.x > width) obj.x -= width;
  if (obj.y < 0) obj.y += height;
  else if (obj.y > height) obj.y -= height;
}

/** Shortest signed distance along a wrapping axis of length `span`. */
export function wrapDelta(d, span) {
  if (!span) return d;
  if (d > span / 2) return d - span;
  if (d < -span / 2) return d + span;
  return d;
}

/** Circle overlap test. Pass `world` to measure across screen-wrap seams. */
export function circlesOverlap(a, b, radiusA, radiusB, world) {
  const dx = wrapDelta(a.x - b.x, world?.width);
  const dy = wrapDelta(a.y - b.y, world?.height);
  const r = radiusA + radiusB;
  return dx * dx + dy * dy < r * r;
}

/** Interpolate a coordinate, snapping instead of sweeping across a screen-wrap. */
export function lerpWrapped(prev, current, alpha, span) {
  const delta = current - prev;
  if (Math.abs(delta) > span / 2) return current;
  return prev + delta * alpha;
}
