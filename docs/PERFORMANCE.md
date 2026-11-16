# Performance

## Budget (60 fps target)
| | Budget | Measured (Apple M1, 617×612, `?stress`: 200 asteroids, 5,000 particles, High) |
|---|---|---|
| Simulation (CPU) | < 4 ms | about 0.9 ms |
| Render submission (CPU) | < 4 ms | about 0.6 ms |
| Frame | 16.7 ms | 16.7 ms (vsync-locked), worst 17.7 ms |
| Draw calls | < 60 | about 33 |

## Quality tiers (`src/render/quality.js`)
| Tier | Max pixel ratio | MSAA | Bloom levels | Nebula res | Particle cap |
|------|----|----|----|----|----|
| Low | 1.0× | – | 4 | 0.35× | 1,500 |
| Medium | 1.25× | – | 5 | 0.45× | 3,000 |
| High | 1.5× | 4× (below 1.5×) | 6 | 0.5× | 6,000 |
| Ultra | 2.0× | 4× (below 1.5×) | 8 | 0.75× | 10,000 |

- **Auto (default):** picks a tier from device hints, so a software GPU or ≤ 2 GB of memory gets Low, and touch, ≤ 4 GB or small textures get Medium. Adaptive resolution then lowers the render scale (0.6–1×) when more than 20% of recent frames miss the budget. After 10 calm seconds it tries a step up, and backs off for 30 s if that causes misses. Choosing a fixed tier turns adaptive resolution off.
- **Reduced motion:** when the OS asks for it, shake defaults to off and flashes to reduced.

## What was expensive, and what fixed it
Found by toggling layers in `?debug` (exposed as `__render`), not by guessing:
1. **Full-screen passes, not geometry.** Removing all 200 asteroids saved only about 3 ms. The fix was merging the shockwave and chromatic aberration into one lens pass, rendering the nebula at half resolution off-screen, and capping pixel ratio at 1.5×.
2. **MSAA on the half-float buffer** cost about 14 ms at 2×. It's now only used below 1.5×.
3. **Collisions** use a spatial hash (`src/systems/spatialHash.js`) instead of checking every pair. It's tested to find exactly the same pairs.

## How to profile
- `?debug` shows FPS, average and worst frame, CPU time for the simulation and render, the quality tier and resolution, draw calls, triangles, sprites and entity counts.
- `?stress` adds 200 asteroids and sustains particles up to the tier's cap.
- Frame times are vsync-quantised, so "slightly over budget" shows as 33 ms. Judge headroom by toggling layers (`__render.scene`, `__render.post.passes`), not by the average alone.
