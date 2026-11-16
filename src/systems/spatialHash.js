// Uniform-grid broad phase on the wrapping playfield. Replaces the O(n²)
// all-pairs check: each body is compared only with bodies in its own and the
// eight neighbouring cells (wrapping across screen edges).
//
// Cells are at least `2 × largest radius` wide, so any two touching bodies are
// always in the same or adjacent cells.

/**
 * Call fn(i, j) once for every pair (i < j) whose bounding circles could
 * overlap. `radius(item)` gives each item's radius.
 */
export function forEachNearPair(items, radius, world, fn) {
  const n = items.length;
  if (n < 2) return;
  let maxR = 0;
  for (const it of items) maxR = Math.max(maxR, radius(it));
  const cell = Math.max(2 * maxR, 1);
  const cols = Math.max(1, Math.floor(world.width / cell));
  const rows = Math.max(1, Math.floor(world.height / cell));
  const cw = world.width / cols;
  const ch = world.height / rows;

  const grid = new Map();
  const cx = new Int32Array(n);
  const cy = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((Math.floor(items[i].x / cw) % cols) + cols) % cols;
    const y = ((Math.floor(items[i].y / ch) % rows) + rows) % rows;
    cx[i] = x;
    cy[i] = y;
    const key = y * cols + x;
    let bucket = grid.get(key);
    if (!bucket) grid.set(key, (bucket = []));
    bucket.push(i);
  }

  const seen = new Set();
  for (let i = 0; i < n; i++) {
    seen.clear();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = ((cy[i] + dy + rows) % rows) * cols + ((cx[i] + dx + cols) % cols);
        if (seen.has(key)) continue; // tiny grids wrap onto the same cell
        seen.add(key);
        const bucket = grid.get(key);
        if (!bucket) continue;
        for (const j of bucket) if (j > i) fn(i, j);
      }
    }
  }
}
