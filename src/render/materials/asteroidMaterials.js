// Asteroid materials: three.js standard/physical materials (so they keep
// correct lighting) with per-type shader patches. Shared uniforms let one
// update drive every material:
//   uTime      — animation clock
//   uRimColor  — sector accent, used for the rim light on rock
// Per-instance inputs: instance colour (tint), aFlash (0–1 white flash).
import * as THREE from 'three';
import { NOISE_GLSL } from '../shaders/noise.js';

export function createSharedAsteroidUniforms() {
  return {
    uTime: { value: 0 },
    uRimColor: { value: new THREE.Color(0xffaa44) },
  };
}

const COMMON_VERTEX_PARS = /* glsl */ `
  attribute float aFlash;
  varying float vFlash;
  varying vec3 vObjPos;
`;
const COMMON_VERTEX = /* glsl */ `
  vObjPos = position;
  vFlash = aFlash;
`;
const COMMON_FRAGMENT_PARS = /* glsl */ `
  uniform float uTime;
  uniform vec3 uRimColor;
  varying float vFlash;
  varying vec3 vObjPos;
  ${NOISE_GLSL}
`;

// Per type: GLSL injected after colour is applied (diffuse) and after
// emissive maps (emission). `normal` and `vViewPosition` are available there.
const TYPE_CODE = {
  rock: {
    diffuse: /* glsl */ `
      float grain = fbm3lo(vObjPos * 6.0);
      float speck = smoothstep(0.7, 0.8, grain);
      diffuseColor.rgb *= (0.7 + 0.55 * grain) * (1.0 - speck * 0.25);
    `,
    emission: /* glsl */ `
      float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
      totalEmissiveRadiance = uRimColor * fres * 0.45;
    `,
  },
  ice: {
    diffuse: /* glsl */ `
      diffuseColor.rgb *= 0.75;
    `,
    emission: /* glsl */ `
      float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5);
      float n = fbm3lo(vObjPos * 3.0 + 4.0);
      float crack = 1.0 - smoothstep(0.0, 0.03, abs(n - 0.5));
      vec3 cell = floor(vObjPos * 26.0);
      float h = hash13(cell);
      float glint = step(0.82, h) * smoothstep(0.9, 1.0, sin(h * 80.0 + uTime * 2.5 + dot(normal, vec3(4.0))) * 0.5 + 0.5);
      totalEmissiveRadiance = vColor * (0.06 + 0.22 * (1.0 - fres))
        + vec3(0.65, 0.92, 1.0) * (fres * 0.9 + crack * 0.55)
        + vec3(3.5) * glint;
    `,
  },
  metal: {
    diffuse: /* glsl */ `
      vec3 g = abs(fract(vObjPos * 3.5) - 0.5);
      float seam = smoothstep(0.46, 0.5, max(g.x, max(g.y, g.z)));
      diffuseColor.rgb *= 1.0 - seam * 0.55;
    `,
    emission: /* glsl */ `
      float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
      totalEmissiveRadiance = uRimColor * fres * 0.25;
    `,
  },
  magnetic: {
    diffuse: /* glsl */ `
      diffuseColor.rgb *= 0.5;
    `,
    emission: /* glsl */ `
      float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.0);
      float band = smoothstep(0.82, 1.0, sin(vObjPos.y * 16.0 - uTime * 5.0) * 0.5 + 0.5);
      totalEmissiveRadiance = vec3(0.35, 0.65, 1.8) * (band * 1.6 + fres * 0.6);
    `,
  },
  crystal: {
    diffuse: /* glsl */ `
      diffuseColor.rgb *= 0.6;
    `,
    emission: /* glsl */ `
      float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.0);
      float h = hash13(floor(vObjPos * 14.0));
      float glint = step(0.7, h) * smoothstep(0.85, 1.0, sin(h * 70.0 + uTime * 4.0) * 0.5 + 0.5);
      totalEmissiveRadiance = vColor * (0.5 + fres * 1.4) + vec3(3.0) * glint;
    `,
  },
  comet: {
    diffuse: /* glsl */ `
      diffuseColor.rgb *= 0.8;
    `,
    emission: /* glsl */ `
      float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.0);
      totalEmissiveRadiance = vec3(0.7, 0.95, 1.2) * (0.9 + fres * 1.5);
    `,
  },
  plasma: {
    diffuse: /* glsl */ `
      diffuseColor.rgb = vec3(0.025, 0.018, 0.022) + diffuseColor.rgb * 0.05;
    `,
    emission: /* glsl */ `
      float seed = vColor.r * 13.0 + vColor.b * 7.0;
      vec3 q = vObjPos * 2.2 + vec3(0.0, uTime * 0.22, seed);
      float n = fbm3(q + vnoise3(q * 1.6) * 1.3);
      float vein = 1.0 - smoothstep(0.0, 0.028, abs(n - 0.5));
      float halo = 1.0 - smoothstep(0.0, 0.12, abs(n - 0.5));
      float heat = 0.5 + 0.5 * sin(uTime * 3.0 + seed);
      float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.0);
      totalEmissiveRadiance = vColor * (vein * (2.6 + heat * 2.0) + halo * 0.12 + fres * 0.12);
    `,
  },
};

function patch(material, type, shared) {
  const code = TYPE_CODE[type];
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${COMMON_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${code.diffuse}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${code.emission}\ntotalEmissiveRadiance += vec3(1.1) * vFlash;`);
  };
  material.customProgramCacheKey = () => `asteroid-${type}`;
  return material;
}

export function createAsteroidMaterial(type, shared) {
  if (type === 'metal') {
    return patch(new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.32, metalness: 0.85, flatShading: true, vertexColors: true,
    }), type, shared);
  }
  if (type === 'magnetic') {
    return patch(new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.3, metalness: 0.6, flatShading: false, vertexColors: true,
    }), type, shared);
  }
  if (type === 'crystal' || type === 'comet') {
    return patch(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.1, metalness: 0.05, flatShading: true, vertexColors: true,
      transparent: type === 'crystal', opacity: 0.85, clearcoat: 1, clearcoatRoughness: 0.05,
    }), type, shared);
  }
  if (type === 'rock') {
    return patch(new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.95, metalness: 0.04, flatShading: true, vertexColors: true,
    }), type, shared);
  }
  if (type === 'ice') {
    return patch(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.14, metalness: 0.1, flatShading: true, vertexColors: true,
      transparent: true, opacity: 0.9, clearcoat: 1, clearcoatRoughness: 0.08,
    }), type, shared);
  }
  return patch(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.45, metalness: 0.1, flatShading: false, vertexColors: true,
  }), type, shared);
}
