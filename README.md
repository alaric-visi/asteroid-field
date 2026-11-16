# Asteroid Field

A browser arcade space shooter built with Three.js. The project is being rebuilt from a single-file prototype; see [docs/PLAN.md](docs/PLAN.md) for the phased roadmap.

- `legacy/`: the original single-file prototype, kept as a behaviour reference.
- `src/`: the modular rebuild (Phase 0 onward).
- `docs/`: the plan, art bible and design notes.

## Running

```bash
npm install
npm run dev        # http://localhost:5183
npm test           # unit tests (vitest)
npm run test:e2e   # smoke tests in your installed Google Chrome (Playwright)
npm run build      # production build in dist/ (works from any URL path)
npm run preview    # serve the production build locally
```

## Deploying

`dist/` is a static site: upload it anywhere. To publish to GitHub Pages, push to a GitHub repository's `main` branch and set **Settings → Pages → Source** to "GitHub Actions". The included workflow (`.github/workflows/deploy.yml`) then tests, builds and publishes on every push. The game can be installed as an app and plays offline after the first visit.

Performance notes and the quality tiers are in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

The game opens on a title screen with mode select, high scores, how to play and settings. The game is titled *Asteroid Field*; the name lives in `src/data/meta.js`.

URL flags (they can be combined):
- `?mode=campaign` / `?mode=endless` / `?mode=daily` skips the title and starts that mode. Campaign is 3 sectors, each with waves and a boss. Endless loops the sectors and gets harder each lap. Daily is endless with the same seed for everyone that day.
- `?play` skips the title and starts a campaign.
- `?seed=<number>` replays a run with the same asteroid layout and behaviour. In the console, `__game.seed` shows the current run's seed.
- `?debug` shows an overlay with FPS, frame time, draw calls and entity counts.
- `?stress` spawns 200 asteroids and keeps about 5,000 particles alive, for performance testing.

## Controls

| Action | Keyboard (remappable) | Gamepad | Touch |
|--------|----------------------|---------|-------|
| Turn | ← → / A D | Left stick, d-pad | Point the left stick where you want to face |
| Thrust | ↑ / W | RT, B, d-pad up | THRUST button, or push the stick to the rim |
| Fire | Space (hold to auto-fire) | A, RB, X | FIRE button |
| Hyperspace | Shift / S / ↓ | LB | JUMP button |
| Shield (hold) | E / Q | LT | SHIELD button |
| Pause / settings | P / Esc | Start | II button |
| Restart (game over) | R | A, Y | Tap FIRE or the panel |

Settings (volume, shake, flashes, colour-blind palette, game speed, fire mode, flight assist, key bindings) are in the pause menu and saved in the browser.
