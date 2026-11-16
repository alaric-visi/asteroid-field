// Offsets at which to draw extra copies of an object that overlaps a screen
// edge, so it slides across the seam instead of popping. Always includes [0, 0].
export function wrapOffsets(x, y, radius, width, height, out = []) {
  out.length = 0;
  const xs = [0];
  const ys = [0];
  if (x < radius) xs.push(width);
  else if (x > width - radius) xs.push(-width);
  if (y < radius) ys.push(height);
  else if (y > height - radius) ys.push(-height);
  for (const ox of xs) for (const oy of ys) out.push(ox, oy);
  return out; // flat [ox0, oy0, ox1, oy1, ...]
}
