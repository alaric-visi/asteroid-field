// The single WebGL renderer. Everything — background, asteroids, ship,
// missiles, particles — is drawn into one scene and one post-processing chain.
//
// The `playfield` group maps simulation pixels (origin top-left, y down)
// straight onto the z = 0 plane, so render code uses game coordinates as-is.
import * as THREE from 'three';
import { createPlayfieldCamera } from './camera.js';
import { createNebula } from './background/nebula.js';
import { createStarfield } from './background/starfield.js';
import { createSpriteBatch } from './effects/spriteBatch.js';
import { drawEffects } from './effects/effectsView.js';
import { createAsteroidView } from './asteroids.js';
import { createShipView } from './ship.js';
import { createDestructionView } from './destruction.js';
import { createEnemyView } from './enemies.js';
import { createPickupView } from './pickups.js';
import { MAX_WAVES } from './post/lensEffect.js';
import { createPostProcessing } from './post/postprocessing.js';
import { QUALITY } from './quality.js';

const PARALLAX = 0.035; // how strongly the background drifts against ship motion
const SHAKE_ROLL = 0.0012; // rad of camera roll per unit of shake

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, stencil: false, powerPreference: 'high-performance',
  });
  renderer.info.autoReset = false;
  let quality = QUALITY.high;
  let renderScale = 1; // adaptive-resolution multiplier on top of the tier
  const pixelRatio = () => Math.max(0.5, Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio) * renderScale);
  renderer.setPixelRatio(pixelRatio());

  const scene = new THREE.Scene();
  const view = createPlayfieldCamera();

  const playfield = new THREE.Group();
  playfield.scale.set(1, -1, 1);
  scene.add(playfield);

  // Lighting: cool ambient, white key from top-left, theme-coloured rim from bottom-right.
  scene.add(new THREE.AmbientLight(0x8899ff, 0.35));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.7); // direction follows the sector theme
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0xffaa44, 2.2, 0, 0);
  rimLight.position.set(400, -300, 300);
  scene.add(rimLight);

  const nebula = createNebula();
  const stars = createStarfield(nebula.bodyUniforms);
  scene.add(nebula.mesh, stars.points);

  const glow = createSpriteBatch({ capacity: 4096, blending: THREE.AdditiveBlending, renderOrder: 20 });
  const solid = createSpriteBatch({ capacity: 1024, blending: THREE.NormalBlending, renderOrder: 19 });
  playfield.add(solid.mesh, glow.mesh);

  const asteroids = createAsteroidView(playfield);
  const ship = createShipView(playfield);
  const destruction = createDestructionView(playfield, asteroids);
  const enemies = createEnemyView(playfield, asteroids);
  const pickups = createPickupView(playfield);
  const waves = [];
  const post = createPostProcessing(renderer, scene, view.camera);
  renderer.compile(scene, view.camera); // warm every shader program before the first frame

  const parallax = new THREE.Vector2();
  let width = 1, height = 1;
  let accent = null;

  function resize(w, h) {
    if (w <= 0 || h <= 0) return;
    width = w;
    height = h;
    view.setPlayfield(w, h);
    playfield.position.set(-w / 2, h / 2, 0);
    post.setSize(w, h);
    nebula.resize(w, h, renderer.getPixelRatio(), quality.nebulaScale);
    stars.setPixelRatio(renderer.getPixelRatio());
  }

  function render(game, frame) {
    const dt = game.paused ? 0 : frame.frameSeconds;
    const { shakeScale, flashScale } = frame.effects;
    const shake = game.paused ? 0 : game.fx.shake * shakeScale;

    view.update((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake * SHAKE_ROLL);

    if (frame.theme.accent !== accent) {
      accent = frame.theme.accent;
      rimLight.color.set(accent);
      const [lx, ly, lz] = frame.theme.lightDir;
      keyLight.position.set(lx * 800, ly * 800, lz * 800);
    }

    parallax.x += (game.ship.vx * dt / width) * PARALLAX;
    parallax.y -= (game.ship.vy * dt / height) * PARALLAX;
    nebula.update(frame.frameSeconds, frame.now, frame.theme, parallax);
    stars.update(frame.now, parallax);

    glow.begin();
    solid.begin();
    asteroids.begin();
    asteroids.update(game, frame, glow);
    destruction.update(game, frame, solid);
    enemies.update(game, frame, glow);
    asteroids.end();
    pickups.update(game, frame, glow);
    ship.update(game, frame, glow);
    drawEffects(game, frame, glow, solid);
    glow.end();
    solid.end();

    // Strongest recent shockwaves drive the screen-space refraction ripple.
    waves.length = 0;
    for (const sw of game.fx.shockwaves) waves.push({ x: sw.x, y: sw.y, r: sw.r, strength: sw.alpha * 0.007 * flashScale });
    waves.sort((a, b) => b.strength - a.strength).length = Math.min(waves.length, MAX_WAVES);
    post.update(game.paused ? 0 : game.fx.shake * flashScale, waves, width, height);
    renderer.info.reset();
    nebula.renderOffscreen(renderer);
    post.render(frame.frameSeconds);
  }

  return {
    resize,
    render,
    reseedBackground: () => nebula.reseed(),
    get renderer() { return renderer; },
    /** Apply a quality tier (see quality.js). */
    setQuality(tierName) {
      quality = QUALITY[tierName] ?? QUALITY.high;
      renderer.setPixelRatio(pixelRatio());
      post.setQuality(quality, renderer.getPixelRatio());
      resize(width, height);
    },
    /** Adaptive-resolution multiplier (0.5–1). */
    setRenderScale(scale) {
      renderScale = scale;
      renderer.setPixelRatio(pixelRatio());
      resize(width, height);
    },
    get pixelRatio() { return renderer.getPixelRatio(); },
    /** Internals for console profiling (?debug). */
    debugHandles: { scene, playfield, nebula: nebula.mesh, stars: stars.points, post },
    onEvent(e) {
      if (e.type === 'asteroidDestroyed') destruction.onAsteroidDestroyed(e);
      else if (e.type === 'shipDestroyed') destruction.onShipDestroyed(e);
      else if (e.type === 'shoot') ship.onShoot(e);
      else if (e.type === 'asteroidHit') asteroids.onHit(e.id, performance.now() / 1000);
      else if (e.type === 'hyperspaceOut' || e.type === 'hyperspaceIn') ship.onHyperspace(e);
      else if (e.type === 'bossDestroyed') {
        destruction.onAsteroidDestroyed({ ...e, asteroidType: e.bossType, size: e.radius, vx: 0, vy: 0 });
        destruction.onAsteroidDestroyed({ ...e, asteroidType: e.bossType, size: e.radius * 0.7, vx: 0, vy: 0 });
      } else if (e.type === 'enemyDestroyed') destruction.onShipDestroyed(e);
    },
    stats: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      sprites: glow.count + solid.count,
    }),
  };
}
