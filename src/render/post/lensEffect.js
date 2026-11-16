// One full-screen effect for all "lens" distortions, so they cost a single
// pass: screen-space shockwave refraction (up to MAX_WAVES ripples) followed by
// radial chromatic aberration. Each wave: (centre u, centre v, radius in
// screen heights, strength).
import { Uniform, Vector2, Vector4 } from 'three';
import { Effect, EffectAttribute } from 'postprocessing';

export const MAX_WAVES = 4;

const fragmentShader = /* glsl */ `
  uniform vec4 waves[${MAX_WAVES}];
  uniform float aspect;
  uniform vec2 aberration;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 p = uv;
    for (int i = 0; i < ${MAX_WAVES}; i++) {
      vec4 w = waves[i];
      if (w.w <= 0.0) continue;
      vec2 d = p - w.xy;
      d.x *= aspect;
      float dist = length(d);
      float band = 1.0 - smoothstep(0.0, 0.035, abs(dist - w.z));
      vec2 dir = d / max(dist, 1e-4);
      dir.x /= aspect;
      p -= dir * band * w.w;
    }

    vec2 fromCentre = (p - 0.5) * vec2(aspect, 1.0);
    vec2 offset = aberration * smoothstep(0.25, 1.0, length(fromCentre));
    vec4 g = texture2D(inputBuffer, p);
    float r = texture2D(inputBuffer, p + offset).r;
    float b = texture2D(inputBuffer, p - offset).b;
    outputColor = vec4(r, g.g, b, g.a);
  }
`;

export class LensEffect extends Effect {
  constructor() {
    super('LensEffect', fragmentShader, {
      attributes: EffectAttribute.CONVOLUTION, // samples neighbouring pixels
      uniforms: new Map([
        ['waves', new Uniform(Array.from({ length: MAX_WAVES }, () => new Vector4()))],
        ['aspect', new Uniform(1)],
        ['aberration', new Uniform(new Vector2())],
      ]),
    });
  }

  /** `list` items: { x, y, r, strength } in screen pixels. */
  setWaves(list, width, height) {
    this.uniforms.get('aspect').value = width / height;
    const waves = this.uniforms.get('waves').value;
    for (let i = 0; i < MAX_WAVES; i++) {
      const w = list[i];
      if (w) waves[i].set(w.x / width, 1 - w.y / height, w.r / height, w.strength);
      else waves[i].set(0, 0, 0, 0);
    }
  }

  setAberration(x, y) {
    this.uniforms.get('aberration').value.set(x, y);
  }
}
