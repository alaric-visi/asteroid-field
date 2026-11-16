# Art Bible: "Cinematic Neon-Noir"

The look in one sentence: **dark, physically lit space where light means danger or power.**

## 1. Value structure (the most important rule)
- **Backgrounds stay dark.** The nebula, planets and stars live below roughly 25% brightness. They set the mood but never compete with gameplay.
- **Gameplay objects are mid-tones**, lit by the key and rim lights so their 3D form reads clearly.
- **Emission (glow) is reserved** for things the player must track: the ship, missiles, plasma veins, impacts, the shield and pickups. If something glows, it matters.
- **Rule of thumb:** convert a screenshot to greyscale. The ship, missiles and asteroids should still be the brightest, clearest shapes.

## 2. Silhouette and material by asteroid type
Each type must be identifiable by **shape alone** (greyscale, no glow):

| Type | Silhouette | Surface | Emission |
|------|-----------|---------|----------|
| Rock | Lumpy, cratered, slightly elongated | Matte basalt, granular, dark crevices (baked AO), warm rim from the sector light | None beyond the rim light |
| Ice | Angular crystal: few large flat facets, stretched along one axis | Glassy and translucent, with a bright fresnel edge | Faint inner glow, crack lines, sparkle glints |
| Plasma | Smooth, round, slightly pulsing blob | Near-black crust | Animated magma veins (HDR, they bloom) |

## 3. Palette per sector
Each sector has one **accent** colour (rim light, UI accent, wing fins) and one **background pair** (nebula colours A and B).

| Sector | Accent | Nebula | Backdrop | Key light |
|--------|--------|--------|----------|-----------|
| 1 · Rocky Belt | Amber `#ffaa44` | Rust / umber | Banded gas giant, lower right | Warm, from top-left |
| 2 · Ice Field | Cyan `#44e0ff` | Deep teal | Ringed ice world, upper left | Cool, from top-right |
| 3 · Plasma Nebula | Magenta `#ff55e0` | Violet | Dying star, upper right | Hot pink, from the star |

The player ship is always **cool blue with an amber cockpit**, so it never blends into any sector.

## 4. Light
- Three lights: cool ambient fill, a white key light whose direction matches the backdrop's light source, and a point light in the sector's accent colour as the rim.
- The ship's thrust casts orange light on nearby asteroids.
- Impacts flash a brief point light in the colour of the destroyed asteroid.

## 5. Feedback language
| Event | Response |
|-------|----------|
| Big asteroid destroyed | 3D chunks fly apart, a dust puff, an impact light, a screen-space shockwave ripple, a short hit-stop (60 ms) |
| Child asteroid spawned | White flash as it splits off |
| Ship destroyed | Large shockwave, chromatic aberration spike, longer hit-stop (140 ms) |
| Score | A floating "+N" at the impact point, in the asteroid type's colour |

## 6. UI
- Typeface: **Chakra Petch** (bundled from npm, so no runtime font CDN).
- The HUD sits at the screen corners: score top-left, lives as ship icons, sector name top-right in the accent colour.
- Panels: dark translucent glass, a thin border in the accent colour, uppercase letter-spaced titles.
- The controls hint fades out once the player is playing and returns when paused.
