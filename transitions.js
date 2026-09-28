import * as THREE from 'three';

// Full-screen "veil" drawn on top of the 3D scene. Scene changes happen
// *behind* a covered veil, so the swap is never visible:
//
//   cover(mode)  : veil grows until the screen is filled   (progress 0 → 1)
//   ...swap scene state while covered...
//   reveal(mode) : a hole opens in the veil                (progress 0 → 1, invert = 1)
//
// Modes: see MODES. Add new ones as another `if (uMode == N)` branch.

export const MODES = { portal: 0, liquid: 1, flash: 2, wipe: 3 };

const frag = /* glsl */ `
  precision highp float;
  uniform float uProgress;
  uniform float uInvert;
  uniform int   uMode;
  uniform vec3  uColor;
  uniform vec2  uRes;
  uniform float uTime;
  uniform vec2  uCenter;   // portal/flash origin in UV space (main.js keeps it on the hero)
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
    vec2 p = (vUv - uCenter) * aspect;
    // distance to the farthest corner, so an off-centre portal still covers all
    float reach = length(max(uCenter, 1.0 - uCenter) * aspect);
    float t = uProgress;
    float shape = 0.0;   // 1 = veil present
    float rim = 0.0;     // glowing edge

    if (uMode == 0) {            // portal: circle with a wobbling, glowing rim
      float r = length(p) + (noise(p * 5.0 + uTime * 0.4) - 0.5) * 0.08;
      float edge = mix(-0.12, reach + 0.15, t);
      shape = smoothstep(edge + 0.015, edge - 0.015, r);
      rim = smoothstep(0.10, 0.0, abs(r - edge)) * step(0.001, t) * step(t, 0.999);
    } else if (uMode == 1) {     // liquid: noisy surface rises from the bottom
      float n = noise(vec2(vUv.x * 5.0, uTime * 0.6)) * 0.12
              + noise(vec2(vUv.x * 17.0, uTime * 1.3)) * 0.05;
      float h = t * 1.35 - 0.2 + n;
      shape = smoothstep(h + 0.01, h - 0.01, vUv.y);
      rim = smoothstep(0.05, 0.0, abs(vUv.y - h)) * step(0.001, t) * step(t, 0.999) * 0.6;
    } else if (uMode == 2) {     // flash: radial light burst
      float r = length(p);
      shape = smoothstep(0.0, 1.0, t * 1.6 - r / reach * 0.9);
      shape = mix(shape, 1.0, smoothstep(0.8, 1.0, t));
      rim = (1.0 - smoothstep(0.0, 0.5, r)) * sin(t * 3.14159) * 0.8;
    } else {                     // wipe: diagonal sweep with ragged edge
      float d = (vUv.x + vUv.y) * 0.5 + (noise(vUv * 12.0) - 0.5) * 0.06;
      shape = smoothstep(t * 1.2 - 0.1 + 0.01, t * 1.2 - 0.1 - 0.01, d);
    }

    float a = mix(shape, 1.0 - shape, uInvert);
    vec3 col = uColor + rim;
    gl_FragColor = vec4(col, clamp(max(a, rim), 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export function createVeil() {
  const uniforms = {
    uProgress: { value: 0 },
    uInvert: { value: 0 },
    uMode: { value: 0 },
    uColor: { value: new THREE.Color('#ffffff') },
    uRes: { value: new THREE.Vector2(innerWidth, innerHeight) },
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: frag,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    uniforms,
    render(renderer, time) {
      uniforms.uTime.value = time;
      // skip the draw entirely while the veil is fully open
      const open = uniforms.uInvert.value === 1 ? uniforms.uProgress.value >= 1 : uniforms.uProgress.value <= 0;
      if (open) return;
      renderer.render(scene, camera);
    },
    resize(w, h) { uniforms.uRes.value.set(w, h); },
  };
}

// Timeline helpers. Both are scrub-safe: every value is set with a tween so
// scrolling backwards restores the previous state exactly.
export function cover(tl, veil, { mode = 'portal', color = '#ffffff', duration = 0.5 } = {}, at) {
  const u = veil.uniforms;
  tl.to(u.uMode, { value: MODES[mode], duration: 0 }, at)
    .to(u.uInvert, { value: 0, duration: 0 }, '<')
    .to(u.uColor.value, { ...hexToRgb(color), duration: 0 }, '<')
    .fromTo(u.uProgress, { value: 0 }, { value: 1, duration, ease: 'power2.in', immediateRender: false }, '<');
  return tl;
}

export function reveal(tl, veil, { mode = 'portal', duration = 0.5 } = {}, at) {
  const u = veil.uniforms;
  tl.to(u.uMode, { value: MODES[mode], duration: 0 }, at)
    .to(u.uInvert, { value: 1, duration: 0 }, '<')
    .fromTo(u.uProgress, { value: 0 }, { value: 1, duration, ease: 'power2.out', immediateRender: false }, '<');
  return tl;
}

function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return { r: c.r, g: c.g, b: c.b };
}
