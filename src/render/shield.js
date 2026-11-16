// Hex-patterned energy shield: a fresnel sphere around the ship, shown while
// invulnerable. Additive, so it glows and blooms without hiding the hull.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec3 vObj;
  void main() {
    vObj = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uStrength;
  uniform float uTime;
  uniform vec3 uColor;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec3 vObj;

  float hexDist(vec2 p) {
    p = abs(p);
    return max(dot(p, normalize(vec2(1.0, 1.732))), p.x);
  }
  vec2 hexCell(vec2 uv) {
    vec2 r = vec2(1.0, 1.732), h = r * 0.5;
    vec2 a = mod(uv, r) - h;
    vec2 b = mod(uv - h, r) - h;
    return dot(a, a) < dot(b, b) ? a : b;
  }

  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir))), 2.2);
    vec2 gv = hexCell(vObj.xy * 0.45 + vec2(0.0, uTime * 0.6));
    float edge = smoothstep(0.38, 0.48, hexDist(gv));
    float sweep = 0.5 + 0.5 * sin(vObj.y * 0.35 - uTime * 6.0);
    float a = (fres * 0.85 + edge * (0.12 + 0.5 * fres) * (0.6 + 0.4 * sweep)) * uStrength;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export function createShield(radius) {
  const uniforms = {
    uStrength: { value: 0 },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0.45, 0.8, 1.0).multiplyScalar(1.8) },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 16),
    new THREE.ShaderMaterial({
      vertexShader, fragmentShader, uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }),
  );
  mesh.scale.z = 0.6; // flattened so it hugs the ship rather than towering over it
  mesh.renderOrder = 25;
  return {
    mesh,
    setColor(r, g, b) {
      uniforms.uColor.value.setRGB(r, g, b);
    },
    update(strength, now) {
      uniforms.uStrength.value = strength;
      uniforms.uTime.value = now;
      mesh.visible = strength > 0.001;
    },
  };
}
