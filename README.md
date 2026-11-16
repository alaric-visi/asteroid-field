# Asteroid Field

A 3D WebGL arcade space shooter built with **Three.js**, **postprocessing**, and **Web Audio** — engineered around a deterministic, zero-DOM fixed-timestep simulation, instanced GPU rendering, and procedural audio synthesis.

> **Note:** `legacy/asteroids-original.html` contains the original single-file prototype kept as a behavior reference; `src/` is the modular rebuild.

---

## Key Features

- **Three Game Modes**:
  - **Campaign**: 3 escalating sectors (`HIVE CORE`, `GLACIER HEART`, `NOVA SEED`), each with threat-budgeted waves, saucers, hazards, and a multi-turret boss.
  - **Endless**: Loops sectors indefinitely with scaling difficulty per lap.
  - **Daily**: Endless mode seeded deterministically by the current calendar date (`dailySeed()`), so every player gets the exact same run.
- **Deterministic Seeded Simulation**: Reproducible runs via `?seed=<number>` (or `__game.seed`), powered by a pure simulation core decoupled from Three.js, DOM, and Web Audio.
- **7 Distinct Asteroid Archetypes**: Rock, Ice (frost fields), Plasma (chain detonations), Metal (glancing-angle ricochets), Magnetic (gravity wells), Crystal (guaranteed pickup drops), and Comets (non-wrapping with lethal tails).
- **Between-Sector Upgrades**: Draft 1 of 3 stackable upgrades across 11 ship/weapon/defense systems.
- **Procedural 3D Graphics & HDR Post-Processing**: Instanced procedural asteroid meshes, custom GLSL sprite batching, off-screen domain-warped fBm nebula, mipmap-blur bloom, ACES Filmic tone mapping, and screen-space shockwave refraction.
- **Adaptive Procedural Audio**: Pure Web Audio synthesizer for SFX and dynamic music that responds in real time to threat proximity, asteroid crowding, sector, and boss encounters.
- **Multi-Device Input & Accessibility**: Remappable keyboard, Gamepad API (with dual-motor rumble), and touch controls; colorblind-safe palette, reduced-motion support, configurable game speed (`1×` / `0.75×`), flight assist, and auto-fire modes.
- **PWA Offline Support**: Installs as a standalone app and caches assets via `public/sw.js` in production builds.

---

## Architecture Overview

The codebase enforces a strict boundary between **simulation** and **presentation**:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                             src/main.js                                 │
│  Bootstrap, screen state ('title' | 'game'), URL flags, event wiring    │
└───────┬──────────────────────────┬──────────────────────────┬───────────┘
        │ Fixed-timestep (60 Hz)   │ Per-frame (rAF)          │ Drains
        ▼                          ▼                          ▼
┌───────────────────┐    ┌──────────────────────┐   ┌─────────────────────┐
│  Simulation Core  │    │  Presentation Layer  │   │  game.events[]      │
│  src/state/game.js│    │  src/render/         │   │  (shot, blast,      │
│  src/systems/*    │    │  src/audio/          │   │   levelUp, bossHit, │
│  src/entities/*   │    │  src/ui/             │   │   upgradeOffered…)  │
│  src/core/*       │    └──────────────────────┘   └─────────────────────┘
│  (No DOM / WebGL) │
└───────────────────┘
```

1. **Simulation (`src/state/game.js`, `src/systems/`, `src/entities/`, `src/core/`)** operates on plain JavaScript objects with zero browser, DOM, or Three.js dependencies. It can be stepped headlessly in Node.js (and is unit-tested directly under Vitest).
2. **Input (`src/input/`, `src/ai/autopilot.js`)** normalizes keyboard, gamepad, touch, or the attract-mode AI into a uniform per-tick snapshot (`{ held, pressed, turn, choice }`).
3. **Events (`game.events`)**: Rather than calling audio or UI directly, simulation systems push typed event objects into `game.events`. Each animation frame, `src/main.js` drains `game.events` and dispatches side effects to `sfx`, `hud`, `music`, `renderer`, and `gamepad.rumble()`.
4. **Presentation (`src/render/`, `src/audio/`, `src/ui/`)** reads the current simulation state (plus the fixed-step interpolation factor `alpha`) to render the scene, update HUD elements, and modulate audio.

---

## Directory Structure

```text
├── .github/workflows/deploy.yml   # CI: unit tests, Vite build, GitHub Pages deploy
├── docs/                          # Design & engineering docs (PLAN.md, ART.md, PERFORMANCE.md)
├── legacy/                        # Original single-file prototype
├── public/                        # PWA manifest, icons, service worker (sw.js)
├── src/
│   ├── ai/autopilot.js            # Title-screen attract-mode AI pilot
│   ├── audio/                     # Web Audio engine, procedural SFX, adaptive music
│   ├── core/                      # Fixed-timestep loop, seeded PRNG, wrapped math, color helpers
│   ├── data/                      # Declarative tuning, asteroid types, sectors, themes, upgrades
│   ├── debug/debug.js             # ?debug / ?stress overlay & console instrumentation
│   ├── entities/                  # Pure data constructors (ship, asteroid, missile)
│   ├── input/                     # Keyboard, gamepad, touch, and unified input multiplexer
│   ├── render/                    # Three.js scene, instanced meshes, shaders, post-processing
│   │   ├── background/            # Off-screen fBm nebula + parallax starfield
│   │   ├── effects/               # GPU instanced sprite batch + particle/beam/trail rendering
│   │   ├── geometry/              # Procedural displaced asteroid geometry + 3D noise
│   │   ├── materials/             # Custom asteroid shader materials & shared uniforms
│   │   └── post/                  # HDR EffectComposer + custom LensEffect shader
│   ├── settings/                  # LocalStorage-backed settings & high-score tables
│   ├── state/game.js              # Simulation state, lifecycle (newRun/startRun), and step()
│   ├── systems/                   # Modular simulation systems & spatial-hash broad phase
│   └── ui/                        # HUD, title screen, pause/settings menu, interactive tutorial
├── tests/
│   ├── unit/                      # Vitest unit & simulation tests (Node environment)
│   └── e2e/smoke.spec.js          # Playwright browser smoke tests
├── index.html
├── playwright.config.js
└── vite.config.js
```

---

## Technical Deep Dive

### 1. Fixed-Timestep Loop & Determinism

- **Fixed Tick Rate (`src/core/loop.js`)**: `createFixedStep` runs the simulation at a constant `TICK_HZ` (`60 Hz`, `dt = 1/60`s) using a time accumulator clamped to `maxFrameSeconds = 0.25` to prevent spiral-of-death stalls on tab switches.
- **Time Scaling**: Accessibility speed (`gameSpeed`: `1` or `0.75`) scales the incoming `frameSeconds` *before* the accumulator rather than changing `dt`, preserving identical physics and collision outcomes.
- **Render Interpolation**: Before each simulation tick, `snapshotPrevious(game)` records `prevX`, `prevY`, and `prevAngle` on the ship, asteroids, missiles, enemies, enemy shots, pickups, and boss. `createFixedStep.advance()` returns `{ ticks, alpha }`, allowing the renderer to interpolate positions across wrapping boundaries via `lerpWrapped()`.
- **Dual PRNG Streams (`src/core/rng.js`)**:
  - `game.rng`: Drives all gameplay-affecting randomness (spawns, splits, upgrades, AI/saucer behavior).
  - `game.fxRng`: Seeded from `(seed ^ 0x9e3779b9) >>> 0`; drives purely cosmetic particle/visual variation so visual tweaks never desync gameplay determinism.

### 2. Toroidal World & Spatial Hash Collision

- **Seamless Wrapping**: The playfield wraps toroidally across `(world.width, world.height)`. Distance calculations use `wrapDelta()` (`src/core/math.js`) to find the shortest signed delta across screen edges.
- **Viewport Resizing (`setWorldSize`)**: Resizing the browser window scales all active entity coordinates proportionally so everything remains in the same relative position.
- **Uniform-Grid Broad Phase (`src/systems/spatialHash.js`)**: `forEachNearPair(items, radius, world, fn)` replaces $O(n^2)$ all-pairs checks with a toroidal uniform grid. Cell size is set to `max(2 * maxR, 1)`, guaranteeing that any two overlapping circles reside in the same cell or one of the 8 wrapping neighbor cells.

### 3. Simulation State Machine & Systems

`step(game, input, dt)` (`src/state/game.js`) sequences the following modes:
- `'playing'` ⇄ `'upgrade'` (pauses world updates while the player picks 1 of 3 cards; `chooseUpgrade` applies stat multipliers) → `'transition'` (sector intro banner) → `'over'` (asteroids continue drifting behind the game-over summary).
- `paused` is orthogonal to `mode`.
- `hitStop` freezes simulation ticks briefly on heavy impacts while keeping the renderer active.

Key systems in `src/systems/`:
- `shipControl.js` & `shipDamage.js`: Thrust, rotation, optional flight assist, weapon heat/cooldown, multi-barrel spread, shields, and hyperspace jumps (with misjump risk unless `Jump Drive` is acquired).
- `asteroids.js`: Type-specific behaviors—`ice` spawns slowing `frostFields`, `plasma` triggers delayed chain `blasts`, `metal` ricochets shots with incidence `< 0.35`, `magnetic` applies radial pull forces, `crystal` drops pickups, and `comet` crosses without wrapping while leaving a lethal trail.
- `director.js`: Manages sector progression (`SECTORS` & `COSTS` in `src/data/sectors.js`), threat-budget wave generation, periodic saucer/comet timers, and boss encounters.
- `combo.js` & `scoring.js`: Timed kill-streak multiplier tracking and run tallying.
- `ai/autopilot.js`: Runs on the title screen, feeding synthetic `{ held, pressed, turn, choice }` inputs into the real `step()` loop.

### 4. WebGL Rendering Pipeline (`src/render/`)

Everything renders into a single Three.js `Scene` (`src/render/renderer.js`):
- **Coordinate Mapping**: The `playfield` group is positioned at `(-w/2, h/2, 0)` with `scale(1, -1, 1)`, mapping simulation pixel coordinates `(x, y)` (top-left origin, Y-down) directly onto the `z = 0` plane.
- **Instanced Asteroids (`src/render/asteroids.js`)**: Pre-generates 6 procedural geometric variants (`VARIANTS = 6`) for each of the 7 asteroid types (`42` `InstancedMesh` pools). Draw calls remain constant regardless of asteroid or debris count. Entities near playfield edges automatically emit ghost instances on the opposite wrapped edge (`wrapOffsets`). Supports a standard palette and an Okabe–Ito inspired colorblind-safe palette (`SAFE_PALETTE`).
- **Batched GPU Sprites (`src/render/effects/spriteBatch.js`)**: Renders thousands of particles, sparks, rings, and debris shards in two draw calls (`solid` NormalBlending capacity `1024`, `glow` AdditiveBlending capacity `4096`). Uses instanced quads with custom GLSL SDFs (`glow`, `spark`, `ring`, `shard`) rather than `gl.POINTS`, avoiding driver point-size limits on large shockwaves.
- **Off-Screen Procedural Nebula (`src/render/background/nebula.js`)**: Renders domain-warped fBm clouds and the sector's backdrop planet/star into an off-screen render target at a fraction of screen resolution (`quality.nebulaScale`), then upsamples it behind the starfield and playfield.
- **2-Pass HDR Post-Processing (`src/render/post/postprocessing.js`)**:
  - Uses `EffectComposer` with `THREE.HalfFloatType` (and conditional MSAA when `pixelRatio < 1.5`).
  - **Pass 1**: `BloomEffect` (`mipmapBlur`, `luminanceThreshold: 0.7`, `intensity: 1.3`) → `ToneMappingEffect` (`ACES_FILMIC`).
  - **Pass 2**: Custom `LensEffect` (up to `MAX_WAVES` screen-space shockwave refraction ripples + impact-driven chromatic aberration) → `VignetteEffect` → `NoiseEffect` (film grain).
- **Quality Tiers & Adaptive Resolution (`src/render/quality.js`)**:
  - Four tiers (`low`, `medium`, `high`, `ultra`) controlling `maxPixelRatio`, `msaa`, `bloomLevels`, `nebulaScale`, and `particleCap`.
  - First-run `detectTier()` inspects `WEBGL_debug_renderer_info`, `navigator.deviceMemory`, `maxTextureSize`, and pointer coarseness.
  - In `auto` quality mode, `createResolutionScaler()` monitors a 60-frame sliding window against a `1000 / 58 ms` budget, stepping render scale (`0.6`–`1.0`) down if `> 20%` of frames are late and probing upward after `10 s` of calm frames.

### 5. Procedural Web Audio (`src/audio/`)

- **Audio Graph (`src/audio/engine.js`)**: Routes `sfx`, `ui`, and `music` gain buses into `master` → `DynamicsCompressor` (`-18 dB` threshold, `4:1`) → limiter (`-2 dB` threshold, `20:1`) → `ctx.destination`. Initializes lazily on the first user gesture.
- **Spatialized SFX (`src/audio/sfx.js`)**: `audio.spatial(x, y)` applies stereo panning based on horizontal position relative to the ship and attenuates high frequencies with a low-pass filter based on wrapped distance.
- **Dynamic Music (`src/audio/music.js`)**: `src/main.js` computes a smoothed `intensity` (`0`–`1`) from asteroid crowding, nearest threat distance, sector index, last-life tension, and active boss fights, and muffles the mix during pause, upgrade selection, and sector transitions.

---

## Development & Scripts

```bash
npm install
npm run dev        # Start Vite dev server (http://localhost:5183, strictPort)
npm test           # Run Vitest unit tests (tests/unit/**/*.test.js in Node)
npm run test:watch # Run Vitest in watch mode
npm run test:e2e   # Run Playwright smoke tests (tests/e2e/smoke.spec.js)
npm run build      # Production build to dist/ (chunks three & postprocessing)
npm run preview    # Serve dist/ locally (http://localhost:4173)
```

### URL Flags & Debug Console

URL query parameters can be combined:
- `?mode=campaign` | `?mode=endless` | `?mode=daily` — Skip the title screen and launch directly into that mode.
- `?play` — Skip the title screen and start a campaign.
- `?seed=<number>` — Force a deterministic RNG seed.
- `?debug` — Show the telemetry overlay (FPS, frame time, sim/render ms, draw calls, entity counts, quality/resolution scale).
- `?stress` — Spawn 200 asteroids and ~5,000 live particles for performance profiling.

Exposed globals in browser DevTools:
- Always available: `window.__game`, `window.__debug`, `window.__settings`
- With `?debug` or `?stress`: `window.__render`, `window.__audio`, `window.__menu`, `window.__title`, `window.__tutorial`

---

## Controls

| Action | Keyboard (remappable) | Gamepad | Touch |
|---|---|---|---|
| Turn | `←` `→` / `A` `D` | Left stick, D-pad | Point left stick in desired facing direction |
| Thrust | `↑` / `W` | `RT`, `B`, D-pad up | `THRUST` button, or push stick to the rim |
| Fire | `Space` (hold to auto-fire) | `A`, `RB`, `X` | `FIRE` button |
| Hyperspace | `Shift` / `S` / `↓` | `LB` | `JUMP` button |
| Shield (hold) | `E` / `Q` | `LT` | `SHIELD` button |
| Pause / Settings | `P` / `Esc` | `Start` | `II` button |
| Restart (Game Over) | `R` | `A`, `Y` | Tap `FIRE` or the panel |

---

## Deployment

`dist/` is a self-contained static build using relative asset paths (`base: './'` in `vite.config.js`), so it can be hosted from any subpath.

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs unit tests, builds `dist/`, and deploys to GitHub Pages (enable **Settings → Pages → Source → GitHub Actions**).
