# Asteroids 3D: Phased Improvement Plan

The goal is to take the single-file prototype (`legacy/asteroids-original.html`) and turn it into a polished, well-structured browser game in three areas:

1. **Graphics and visual style**: one coherent art direction, rendered entirely on the GPU.
2. **Technical execution**: modular code, frame-rate independence, performance headroom, tests.
3. **Gameplay**: deeper ship mechanics, enemies, asteroid behaviours, progression and replay value.

Each phase ends with a game you can play and ship. No phase leaves the game broken.

---

## Where the prototype stands

### What's already good (keep it)
- Elastic asteroid-vs-asteroid collisions with mass-weighted impulses. This gives the game a physical character most Asteroids clones lack.
- Per-level themes (rocky, icy, plasma) that drive colour, lighting and nebula. This is a good seed for a "sector" structure.
- Synthesised Web Audio SFX with no asset dependencies.
- Juice: screen shake, shockwaves, debris particles, invulnerability shield.

### Technical problems to fix
| # | Problem | Consequence |
|---|---------|-------------|
| T1 | Physics advances per `requestAnimationFrame` with no delta time | On a 120/144 Hz display the game runs 2–2.4× faster |
| T2 | Three stacked canvases (2D stars, WebGL asteroids, 2D gameplay) composited by the browser, with shake applied through CSS transforms | Ship and missiles can't be lit by or occluded by 3D objects; no shared post-processing; costly compositing |
| T3 | `splice()` inside nested `forEach` in missile/asteroid collision | Items get skipped; one missile can hit several asteroids; occasional missed hits |
| T4 | Ship collision loop doesn't `break` after a hit | Several lives can be lost in one frame |
| T5 | Plasma asteroids rewrite every vertex and call `computeVertexNormals()` on the CPU every frame | Scales badly; belongs in a vertex shader |
| T6 | A new geometry and material for every asteroid and child fragment; no pooling or instancing | GC churn and draw-call growth |
| T7 | Canvas 2D `shadowBlur` on every particle, missile and star, plus per-particle colour-string parsing each frame | The main CPU hotspot once particle counts rise |
| T8 | Screen wrapping teleports objects | Asteroids "pop" at the edges; collisions across the seam are missed |
| T9 | Three.js r128 from a CDN global; all state in module-level `let`s; win logic duplicated in two places | Hard to extend, test or upgrade |
| T10 | Tab as the boost key fights browser focus; no pause; no gamepad or touch input | Accessibility and platform reach |
| T11 | Stars are created once at the first window size and never re-laid out on resize | Empty regions after a window resize |

---

## Target directory structure

```
asteroids-3d/
├── index.html              # minimal shell: <canvas>, UI root, module entry
├── package.json            # Vite + three (pinned) + postprocessing + vitest
├── vite.config.js
├── legacy/                 # original prototype, kept as a behaviour reference
├── docs/                   # this plan, art bible, design notes
├── public/                 # fonts, static assets (if any)
├── src/
│   ├── main.js             # bootstrap: renderer, audio, input, state machine
│   ├── core/               # fixed-timestep loop, clock, event bus, seeded RNG, object pools, config
│   ├── input/              # keyboard / gamepad / touch → abstract actions (thrust, fire, …)
│   ├── state/              # game state machine: Title, Playing, Paused, SectorTransition, GameOver
│   ├── entities/           # Ship, Asteroid, Projectile, Enemy, Pickup (plain data + factories)
│   ├── systems/            # movement, wrap, collision (spatial hash), damage, scoring, spawning/wave director
│   ├── data/               # sectors.js, asteroidTypes.js, weapons.js, powerups.js, tuning.js
│   ├── render/
│   │   ├── background/     # nebula shader, parallax starfield, distant planets
│   │   ├── materials/      # rock, ice, plasma, ship, hologram materials
│   │   ├── shaders/        # GLSL chunks (noise, fresnel, dissolve)
│   │   ├── effects/        # GPU particles, trails, shockwaves, decals
│   │   └── post/           # bloom, chromatic aberration, vignette, film grain, tonemapping
│   ├── audio/              # mixer/buses, SFX synth, adaptive music
│   └── ui/                 # HUD, screens/, CSS
└── tests/
    ├── unit/               # physics, collision, scoring, wave director (vitest)
    └── e2e/                # Playwright smoke test: boots, plays, no console errors
```

**Architecture rule:** simulation code (`systems/`, `entities/`) never touches Three.js or the DOM. Renderers read simulation state and draw it. This keeps the game testable and makes visual rewrites safe.

---

## Phase 0: Foundation and parity port ✅ Done
*Goal: the same game, rebuilt on solid ground. Nothing should look or play differently, except the bug fixes.*

- Set up Vite with ES modules and the current `three` from npm, pinned. Optionally use TypeScript, or JSDoc with `checkJs`.
- **Fixed-timestep simulation** (60 Hz ticks with an accumulator) and **interpolated rendering**. Convert every per-frame constant (`0.99` drag, `0.12` turn, `life: 80`, …) into per-second units in `data/tuning.js`. Fixes T1.
- Split the code into the directory structure above. One `GameState` object, one state machine; win, loss and level-up handled in one place (T9).
- Collision: collect hits first, then resolve them (no mutation while iterating). One ship hit per tick (T3, T4).
- Input layer that maps keys to actions; remove Tab; add **P / Esc pause** (T10).
- Seeded RNG for all gameplay randomness. This makes bugs reproducible and enables daily-seed runs later.
- Tests: collision response, wrap, scoring and level progression in vitest.

**Exit criteria:** feature parity with the legacy file; runs at the same speed at 60/120/144 Hz; no splice-in-loop code; `npm test` passes.

**Status:** complete. Fixed T1, T3, T4, T9, T10 and T11. The plasma pulse now uses mesh scale instead of rewriting vertices on the CPU, which covers part of T5. Also fixed: holes in rock meshes (displaced vertices that were duplicated didn't line up), the spawn safe zone being centred on the old ship position, missile trails drawn across the screen when a missile wraps, and a run laid out at 0×0 when the page loads in a hidden tab. Rendering is still the three-canvas setup until Phase 1.

---

## Phase 1: Single GPU renderer ✅ Done
*Goal: everything drawn by one Three.js renderer, so lighting, depth and post-processing apply to the whole scene.*

- Remove the two 2D canvases. The **ship, missiles, particles, shockwaves, stars and nebula all move into the WebGL scene** (T2).
- Camera: switch to a **perspective camera with a slight top-down tilt** (about 10–15°). The play area stays a flat plane at z=0, but asteroids get real parallax and depth. Shake moves to the camera (with a small rotational component), not CSS.
- **Instanced rendering**: `InstancedMesh` for asteroids of each type, with a few pre-generated geometry variants per type plus random scale and rotation (T6). Pool projectiles and particles.
- **GPU particles**: a single `Points` or instanced quad system with additive blending and lifetime/colour ramps in the shader (T7).
- **Plasma pulse moves to a vertex shader** (`onBeforeCompile` or a custom `ShaderMaterial`) (T5).
- **Edge wrapping with ghosts**: draw a duplicate of any object within its radius of an edge, and test collisions across the seam (T8).
- **Post-processing stack** (pmndrs `postprocessing`): selective bloom, ACES tonemapping, vignette, subtle film grain, and chromatic aberration pulses on impacts.
- Responsive resize that reflows the background and keeps the play area's aspect ratio consistent (T11).

**Exit criteria:** one canvas; steady 60 fps with 200+ asteroids and 5,000 particles on a mid-range laptop; bloom-lit ship and missiles.

**Status:** complete. Fixed T2, T5, T6, T7 and T8.
- **One canvas.** The renderer is `src/render/renderer.js`, behind a single post-processing chain: bloom, ACES tone mapping, chromatic aberration that pulses on impacts, vignette and grain.
- **Off-axis perspective camera** (`render/camera.js`). Objects are seen at a tilt while the play plane still maps exactly onto the screen. Shake now moves the camera.
- **Instanced asteroids,** with 6 shape variants per type. Emissive glow follows each asteroid's own colour.
- **One sprite batch** (`render/effects/spriteBatch.js`) draws all glows, sparks, rings and debris shards.
- **Background:** a domain-warped fBm nebula that cross-fades when the theme changes, and a three-layer parallax starfield.
- **3D ship model** that banks into turns and carries a thrust light that lights up nearby asteroids. These were pulled forward from Phase 2.
- **Screen-edge wrapping:** asteroids and the ship draw a ghost copy on the far side of the screen, and collisions work across the edge.
- **Measured (`?stress`):** 200 asteroids and 5,000 particles (about 7,000 sprites) hold 60 fps in 35 draw calls at 2× pixel density, in a 617×612 viewport. Still to check: a full-screen window on lower-end hardware (Phase 6).

---

## Phase 2: Art direction and visual style ✅ Done
*Goal: replace "glow on everything" with a deliberate, recognisable look.*

**Write a short art bible first** (`docs/ART.md`) covering palette per sector, value structure (dark backgrounds, bright readable gameplay objects), and the rule that **gameplay-relevant objects always out-glow decoration**.

Suggested direction: *"cinematic neon-noir"*. Physically lit, dark, matte asteroids, with emissive colour reserved for threats, projectiles and the player.

- **Procedural asteroids**: displace an icosphere with fBm/ridged noise and craters, then apply triplanar-mapped procedural detail and baked AO in vertex colours.
  - *Rock:* rough basalt with warm edge highlights from the sector's rim light.
  - *Ice:* fresnel rim, faked subsurface glow, inner crack lines, and sparkle specular.
  - *Plasma:* dark crust with animated emissive magma veins (noise in the fragment shader) that brighten before the rock splits.
- **Destruction**: asteroids **fracture into real 3D chunks** (pre-fractured variants), plus dust puffs, glowing embers and a brief point light at the impact.
- **Ship**: a modelled low-poly hull (built in code or a small glTF), with emissive engine glow, a thrust point light that lights nearby asteroids, a ribbon engine trail, banking roll when turning, and a hex-pattern fresnel shield.
- **Backgrounds per sector**: a raymarched or fBm nebula shader, a three-layer parallax starfield, and a large distant planet or star per sector with matching key-light direction.
- **Hit feedback**: hit-stop (40–80 ms freeze on big kills), white flash on damaged objects, a radial distortion shockwave as a screen-space pass.
- **HUD restyle**: a typeface with character (e.g. a monospaced display font self-hosted in `public/fonts`), diegetic elements such as a shield ring around the ship and an ammo/heat arc, and score pops in world space.

**Exit criteria:** screenshots from each sector read as one game; a player can identify asteroid type from silhouette and material alone in greyscale.

**Status:** complete. The art bible is in `docs/ART.md`.
- **Procedural asteroid meshes** (`render/geometry/`), with silhouettes that read in greyscale (checked):
  - Rock: cratered and lumpy, with baked ambient occlusion
  - Ice: angular crystal shards
  - Plasma: smooth round blobs
- **Per-type materials** (`render/materials/`): granular basalt with a sector rim light; fresnel ice with crack lines and glints; dark crust with animated HDR magma veins. Freshly split asteroids flash white.
- **Destruction** (`render/destruction.js`): tumbling 3D chunks, dust puffs and impact lights.
- **Hit-stop** in the simulation: 60 ms when a big asteroid breaks, 140 ms when the ship is hit.
- **Lens effect:** one combined effect for the screen-space shockwave ripple and chromatic aberration.
- **Sector backdrops:** a banded gas giant, a ringed ice world and a dying star. Each is drawn in the nebula shader, and the key light's direction matches it.
- **Ship shield:** a hex-pattern fresnel shield.
- **HUD restyle:** corner HUD in Chakra Petch (bundled from npm), score count-up, ship icons for lives, world-space "+N" score pops, sector intro cards, and a controls hint that fades out.
- **Performance work:**
  - The nebula renders at half resolution.
  - Shaders are pre-compiled at load.
  - Render resolution is capped at 1.5× pixel density.
  - MSAA is used only on 1× screens.
  - Bloom uses 6 levels.
  - Result: `?stress` holds 60 fps on an Apple M1 in a 617×612 viewport. The debug overlay now also shows CPU time for the simulation and render separately.

---

## Phase 3: Game feel, audio and input ✅ Done
- **Ship handling pass**: tune acceleration curves, max speed, angular acceleration (instead of instant turn), and optional "assist" drag. Add fire rate, muzzle flash and recoil.
- **Audio**: a mixer with buses (SFX, music, UI) and a compressor/limiter on the master; stereo panning by screen x position; pitch variation on repeated SFX; distance-based low-pass.
- **Adaptive music**: a procedural synth track (Web Audio sequencer) with layers that intensify with asteroid count and danger, and a stinger on sector clear.
- **Input**: Gamepad API (with rumble where supported), touch controls (virtual stick and fire button), and remappable keys.
- **Accessibility settings**: reduce shake, reduce flashes, colour-blind-safe threat palette, game speed (0.75×), toggle hold vs. auto-fire.

**Status:** complete.
- **Handling:** turning has angular momentum (and takes analog input), speed is capped, flight assist is optional, fire has a cooldown with a buffered tap or auto-fire while held, and each shot has recoil. Covered by `tests/unit/ship.test.js`.
- **Audio graph** (`src/audio/engine.js`): SFX, UI and music buses feed a compressor and a limiter. Effects are panned by screen position, muffled with distance and given slight pitch variation.
- **Adaptive music** (`src/audio/music.js`): a lookahead sequencer with pad, bass, arpeggio and drum layers driven by danger, crowding, sector and last-life intensity. Each sector has its own chord progression, and the music is muffled while paused or between sectors.
- **Input:** remappable keyboard, Gamepad API (analog steering, rumble, menu navigation), and touch controls (aim stick, fire and thrust buttons, pause), all merged in `src/input/input.js`.
- **Settings** (`src/settings/settings.js`) are validated and saved to localStorage with guards, and covered by tests.
- **Pause menu** (`src/ui/menu.js`): volumes, shake (full, reduced or off), flashes (full or reduced), colour-blind-safe palette, game speed 100% or 75%, fire mode, flight assist, and key rebinding. It works with keyboard, gamepad and pointer.
- **Muzzle flash** and model recoil.
- **Not yet checked:** a real gamepad or touch device. Their input paths are wired up but haven't been tried on hardware, and the colour-blind palette hasn't been seen on screen.

---

## Phase 4: Extended gameplay ✅ Done (core)
*Goal: from three fixed levels to a replayable run-based game.*

### 4a. Core loop additions
- **Hyperspace** (a classic Asteroids move): teleport with a short charge and some risk.
- **Shield / energy meter**: a limited-use bubble that also rams small asteroids.
- **Weapon heat** instead of unlimited single shots: rewards rhythm over button-mashing.
- **Combo multiplier**: chained kills within a time window raise the multiplier; getting hit resets it.

### 4b. Asteroid behaviours (data-driven in `data/asteroidTypes.js`)
| Type | Behaviour |
|------|-----------|
| Rock | Baseline; splits 2→2 |
| Ice | Shatters into fast, small shards; leaves a slowing frost field briefly |
| Plasma | Explodes on death, damaging neighbours (chain reactions) |
| Metallic | Armoured; takes several hits and deflects shots at shallow angles |
| Magnetic | Pulls nearby asteroids and the ship toward it |
| Crystal | Drops pickups; fragile but erratic |
| Comet | Crosses the screen fast with a damaging tail; high score |

### 4c. Enemies
- **Saucers** (big and small, as a nod to the genre): one wanders and fires randomly, the other aims.
- **Drones**: swarm; flee from the player's aim cone.
- **Sector bosses**: a hollowed-out asteroid fortress with turrets, a "mother rock" that spawns fragments, a plasma core with shield phases.

### 4d. Progression structure
- **Sectors** (Rocky Belt → Ice Field → Plasma Nebula → new sectors such as Derelict Wreckage and Singularity). Each has 3–5 waves plus a boss.
- **Wave director**: budget-based spawning (threat points per wave) instead of hard-coded counts, scaled by sector and player performance.
- **Pickups**: spread shot, piercing laser, homing missiles, time-slow, extra ship, magnet.
- **Between-sector upgrades**: choose 1 of 3 (roguelite-style) so builds vary per run.
- **Modes**: Classic (endless), Campaign (sectors and bosses), Daily Seed (same RNG for everyone), Time Attack.
- **Persistence**: local high scores, unlocks and settings in `localStorage`, wrapped in try/catch.

**Status:** core complete. The simulation is now split into focused systems in `src/systems/`: `shipControl`, `combat`, `asteroids`, `enemies`, `hazards`, `pickups`, `combo`, `director` and `shipDamage`. `state/game.js` only sequences them. All the tuning lives in `src/data/`: `asteroidTypes`, `sectors`, `upgrades`, `pickups` and `tuning`.

What's in:
- **4a:** hyperspace (with misjump risk), a hold-to-use energy shield (it rams small rocks and bounces off big ones), weapon heat with overheat lockout, and a combo multiplier.
- **4b:** all seven asteroid types: rock, ice (frost fields), plasma (chain blasts), metal (armour and ricochet), magnetic (pull), crystal (guaranteed drop) and comet (lethal tail).
- **4c:** big and small saucers. The sector boss is an immovable core with destructible aimed turrets, spawns more rocks, and has a shield phase at half health.
- **4d:** budget-driven waves, three sectors each ending in a boss, five pickups, 11 upgrades offered three at a time between sectors, and run modes `?mode=campaign|endless|daily`. Endless and daily laps scale the difficulty. Daily uses a date-based seed. There are local top-10 high scores per mode and a run summary at game over.
- **Tests:** 62 unit tests, including `tests/unit/systems.test.js`.

Deferred:
- Drone swarms.
- Time Attack mode.
- Distinct boss designs per sector (today one boss design is parameterised per sector).
- A looping saucer engine sound.
- Choosing the mode from a menu instead of the URL (that belongs to Phase 5's title screen).

---

## Phase 5: UI, UX and meta ✅ Done
- **Title screen** with a live attract-mode simulation in the background, plus menus for mode select, settings, controls and high scores.
- **Pause menu** and a **run summary** screen (accuracy, biggest combo, sectors cleared, time).
- **Sector intro cards** with the sector name and threat preview, replacing the static "LEVEL 2 UNLOCKED!" panel.
- **Onboarding**: the first wave teaches thrust, fire and hyperspace with contextual prompts.

**Status:** complete.
- **Title screen** (`src/ui/title.js`): a live attract-mode game runs behind it, flown by `src/ai/autopilot.js`, an aiming pilot that also uses the shield and hyperspace, on the real simulation. Menu: Campaign, Endless, Daily Challenge (each showing its best score), High Scores (tabbed by mode), How to Play (controls from your current bindings, plus threat and pickup legends), and Settings (the same component as the pause menu).
- **Game title "Asteroid Field"**, set in `src/data/meta.js`.
- **Sector intro card:** the sector name, a briefing, threats ordered by frequency (comets and saucers included), and "N waves, then <boss>". It also shows at the start of a run, via `newRun(..., { intro: true })`.
- **Run summary:** score, best, rank, sector, longest chain, accuracy, kills, time and upgrades taken, with Retry (R / A / click) and Title (Esc / B / click). Retry reseeds, so a daily restart replays the same run.
- **Pause menu:** gained "Quit to title".
- **Tutorial** (`src/ui/tutorial.js`): runs on the first campaign, or on demand from How to Play. Six contextual steps (turn, thrust, fire, shield, hyperspace, go) with glyphs for the current device. The ship is indestructible during it (`options.training`), and Enter skips it.
- **Fix:** a key tapped and released between two simulation ticks now counts as held for one tick. Before, very quick taps were dropped.

---

## Phase 6: Performance, quality and release ✅ Done (deploy pending your go-ahead)
- **Quality tiers** (Low/Med/High/Ultra): pixel ratio, bloom resolution, particle cap, shadow toggle. Auto-detect on first run, plus **adaptive resolution** if frame time exceeds budget.
- **Profiling budget**: under 4 ms simulation, under 8 ms render on target hardware; a debug overlay (`?debug`) with FPS, draw calls, entity counts and collision checks.
- **Spatial hash** for collisions once entity counts grow, replacing the O(n²) pair loop.
- **Testing**: vitest for systems; a Playwright smoke test that boots the game, simulates input for 30 seconds and asserts no console errors.
- **Release**: static build to GitHub Pages, Netlify or Cloudflare Pages; PWA manifest and service worker for offline play; `prefers-reduced-motion` respected by default.

**Status:** complete apart from publishing. See `docs/PERFORMANCE.md`.
- **Quality:** four tiers (Low, Medium, High, Ultra) plus Auto, which detects a tier on first run and adds adaptive resolution. There's a Graphics setting in the menus, and the particle cap follows the tier.
- **Collisions:** a spatial-hash broad phase, tested to match the all-pairs results.
- **Reduced motion:** the OS setting changes the defaults (no shake, reduced flashes).
- **Bundle:** split into game code (48 kB gzipped), three.js (131 kB) and postprocessing (16 kB). The font is the Latin subset only. `base: './'` lets the build run from any URL path.
- **Offline and install:** a web app manifest, generated icons (including a maskable one) and a service worker. The page shell is fetched network-first and the hashed assets cache-first, so the game works offline after the first visit.
- **Tests:** `npm run test:e2e` runs Playwright smoke tests in the locally installed Chrome against the production build: the title and attract demo, 30 s of scripted play with no console errors, and the pause menu settings. Unit tests: 74.
- **Deploy workflow:** `.github/workflows/deploy.yml` tests, builds and publishes to GitHub Pages on each push to `main`. It hasn't been run, because the project isn't in a git repository yet.
- **Fix:** stress mode could freeze if the particle cap was below its target; the top-up loop is now capped.

---

## Suggested order and rough sizing

| Phase | Focus | Relative effort | Playable result |
|-------|-------|-----------------|-----------------|
| 0 | Foundation and parity | S | Same game, correct at any refresh rate |
| 1 | Single GPU renderer | M | Unified 3D scene with bloom |
| 2 | Art direction | L | Distinctive look; shareable screenshots |
| 3 | Feel, audio, input | M | Satisfying to play on keyboard, pad and touch |
| 4 | Extended gameplay | XL | Run-based game with enemies, bosses and builds |
| 5 | UI/UX and meta | M | Complete front-to-back product |
| 6 | Performance and release | M | Deployed, tiered and tested |

Phases 2 and 3 can overlap once Phase 1 lands. Phase 4 can start on the gameplay half (4a, 4b) as soon as Phase 0 is done, because the simulation and the renderer are decoupled.
