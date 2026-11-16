// HDR post stack, kept to two full-screen effect passes:
//   1. bloom → ACES tone mapping
//   2. lens (shockwave refraction + chromatic aberration) → vignette → grain
// MSAA only on standard-density screens; on high-DPI screens the extra
// resolution already hides aliasing and MSAA on the HDR buffer is costly.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, NoiseEffect, BlendFunction,
} from 'postprocessing';
import { LensEffect } from './lensEffect.js';

export function createPostProcessing(renderer, scene, camera) {
  const msaa = renderer.getPixelRatio() >= 1.5 ? 0 : Math.min(4, renderer.capabilities.maxSamples);
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: msaa });

  const bloom = new BloomEffect({
    mipmapBlur: true, levels: 6, luminanceThreshold: 0.7, luminanceSmoothing: 0.25, intensity: 1.3, radius: 0.72,
  });
  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const lens = new LensEffect();
  const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.62 });
  const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  noise.blendMode.opacity.value = 0.05;

  const passes = {
    render: new RenderPass(scene, camera),
    bloom: new EffectPass(camera, bloom, toneMapping),
    finish: new EffectPass(camera, lens, vignette, noise),
  };
  Object.values(passes).forEach((p) => composer.addPass(p));

  return {
    composer,
    passes,
    setSize: (w, h) => composer.setSize(w, h),
    /** Apply a quality tier: antialiasing (only at low pixel ratios) and bloom blur depth. */
    setQuality(quality, pixelRatio) {
      composer.multisampling = pixelRatio < 1.5 ? Math.min(quality.msaa, renderer.capabilities.maxSamples) : 0;
      bloom.mipmapBlurPass.levels = quality.bloomLevels;
    },
    /**
     * `impact` is the current screen-shake magnitude (drives the aberration pulse);
     * `waves` are on-screen shockwaves for the refraction ripple.
     */
    update(impact, waves, width, height) {
      const o = Math.min(impact, 20) * 0.00022;
      lens.setAberration(o, o * 0.6);
      lens.setWaves(waves, width, height);
    },
    render: (dt) => composer.render(dt),
  };
}
