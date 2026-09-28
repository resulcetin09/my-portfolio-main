import * as THREE from 'three';

// Scene transitions.
//
// Three families (see SKILL.md → "Transition grammar"):
//   no veil     cut, oneshot            — the world changes without covering the frame
//   plain veil  dip, iris, wipe, push, bands   — clean, no glow
//   signature   portal, liquid, flash, pixel, ink — creative / glowing; budgeted per TONE
//
// Veil transitions draw a full-screen shape over the 3D scene and swap the
// world *behind* it, so the swap is never visible:
//   cover : shape grows until the screen is filled   (progress 0 → 1)
//   swap  : world changes with duration-0 tweens
//   reveal: a hole opens in the shape                (progress 0 → 1, invert = 1)
// Use `transition()` — it picks the right sequence for every mode.

export const TONES = {
  // budget = max signature transitions per film; bloom = default strength
  editorial: { budget: 0, bloom: 0.12 },
  cinematic: { budget: 1, bloom: 0.35 },
  spectacle: { budget: 3, bloom: 0.6 },
};

export const MODES = {
  dip:    { id: 0, family: 'plain' },                  // fade through a colour
  iris:   { id: 1, family: 'plain' },                  // clean circle from the hero
  wipe:   { id: 2, family: 'plain', soft: 0.08 },      // soft straight edge
  push:   { id: 3, family: 'plain', soft: 0.002 },     // hard edge; exits the far side
  bands:  { id: 4, family: 'plain' },                  // staggered bars
  portal: { id: 5, family: 'signature', rim: 1 },      // wobbling circle, glowing rim
  liquid: { id: 6, family: 'signature', rim: 0.6 },    // noisy surface rising
  flash:  { id: 7, family: 'signature', rim: 0.8 },    // radial light burst
  pixel:  { id: 8, family: 'signature' },              // blocky dissolve
  ink:    { id: 9, family: 'signature' },              // organic ink bloom from the hero
  cut:     { family: 'none' },                         // hard cut, no veil
  oneshot: { family: 'none' },                         // continuous: world tweens while the camera moves
};

const DIRS = { right: [1, 0], left: [-1, 0], up: [0, 1], down: [0, -1] };

const frag = /* glsl */ `
  precision highp float;
  uniform float uProgress;
  uniform float uInvert;
  uniform int   uMode;
  uniform vec3  uColor;
  uniform vec2  uRes;
  uniform float uTime;
  uniform vec2  uCenter;   // origin for iris/portal/flash/pixel/ink (main.js keeps it on the hero)
  uniform vec2  uDir;      // travel direction for wipe/push/bands
  uniform float uRim;      // glow strength on the moving edge (0 = none)
  uniform float uSoft;     // edge softness for wipe/push
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  // note: smoothstep(a, b, x) is undefined for a >= b in GLSL — always pass a < b
  // 0..1 position of this pixel along uDir
  float along(vec2 uv, vec2 dir) {
    return dot(uv - 0.5, dir) / (0.5 * (abs(dir.x) + abs(dir.y))) * 0.5 + 0.5;
  }

  void main() {
    vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
    vec2 p = (vUv - uCenter) * aspect;
    float reach = length(max(uCenter, 1.0 - uCenter) * aspect); // to the farthest corner
    float t = uProgress;
    float live = step(0.001, t) * step(t, 0.999);                 // edge glow only mid-move
    float shape = 0.0;   // 1 = covered
    float edgeDist = 1.0;
    float glow = -1.0;   // modes may set their own glow; otherwise it follows the edge

    if (uMode == 0) {                       // dip
      shape = smoothstep(0.0, 1.0, t);
    } else if (uMode == 1) {                // iris
      float edge = mix(-0.01, reach + 0.01, t);
      float r = length(p);
      shape = 1.0 - smoothstep(edge - 0.002, edge + 0.002, r);
      edgeDist = abs(r - edge);
    } else if (uMode == 2 || uMode == 3) {  // wipe / push
      float x = along(vUv, uDir);
      float edge = mix(-uSoft, 1.0 + uSoft, t);
      shape = 1.0 - smoothstep(edge - uSoft, edge + uSoft, x);
      edgeDist = abs(x - edge);
    } else if (uMode == 4) {                // bands
      vec2 perp = vec2(-uDir.y, uDir.x);
      float n = 7.0;
      float band = floor(along(vUv, perp) * n);
      float local = clamp(t * 1.6 - band / n * 0.6, 0.0, 1.0);
      shape = step(along(vUv, uDir), local);
    } else if (uMode == 5) {                // portal
      float r = length(p) + (noise(p * 5.0 + uTime * 0.4) - 0.5) * 0.08;
      float edge = mix(-0.12, reach + 0.15, t);
      shape = 1.0 - smoothstep(edge - 0.015, edge + 0.015, r);
      edgeDist = abs(r - edge);
    } else if (uMode == 6) {                // liquid
      float n = noise(vec2(vUv.x * 5.0, uTime * 0.6)) * 0.12
              + noise(vec2(vUv.x * 17.0, uTime * 1.3)) * 0.05;
      float h = t * 1.35 - 0.2 + n;
      shape = 1.0 - smoothstep(h - 0.01, h + 0.01, vUv.y);
      edgeDist = abs(vUv.y - h) * 2.0;
    } else if (uMode == 7) {                // flash
      float r = length(p);
      shape = smoothstep(0.0, 1.0, t * 1.6 - r / reach * 0.9);
      shape = mix(shape, 1.0, smoothstep(0.8, 1.0, t));
      glow = (1.0 - smoothstep(0.0, 0.5, r)) * sin(t * 3.14159);
    } else if (uMode == 8) {                // pixel
      vec2 cell = floor(vUv * aspect * 22.0);
      float threshold = hash(cell) * 0.65 + length(p) / reach * 0.35;
      shape = step(threshold, t);
    } else {                                // ink
      float threshold = length(p) / reach * 0.62 + fbm(p * 3.0 + uTime * 0.05) * 0.5;
      shape = smoothstep(threshold - 0.015, threshold + 0.015, t * 1.15);
      edgeDist = abs(threshold - t * 1.15) * 3.0;
    }

    float a = mix(shape, 1.0 - shape, uInvert);
    float g = glow >= 0.0 ? glow : 1.0 - smoothstep(0.0, 0.1, edgeDist);
    float rim = uRim * live * g;
    gl_FragColor = vec4(uColor + rim, clamp(max(a, rim), 0.0, 1.0));
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
    uDir: { value: new THREE.Vector2(1, 0) },
    uRim: { value: 0 },
    uSoft: { value: 0.08 },
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

// ------------------------------------------------------------------ timeline helpers
// All scrub-safe: every value is set with a tween, so scrolling backwards
// restores the previous state exactly.

function setup(tl, veil, mode, { rim, dir = 'right' }, at) {
  const m = MODES[mode];
  if (!m || m.id === undefined) throw new Error(`[transitions] "${mode}" is not a veil mode`);
  const u = veil.uniforms;
  const [dx, dy] = DIRS[dir] ?? dir;
  tl.to(u.uMode, { value: m.id, duration: 0 }, at)
    .to(u.uRim, { value: rim ?? m.rim ?? 0, duration: 0 }, at)
    .to(u.uSoft, { value: m.soft ?? 0.08, duration: 0 }, at)
    .to(u.uDir.value, { x: dx, y: dy, duration: 0 }, at);
}

export function cover(tl, veil, { mode = 'iris', color = '#ffffff', duration = 0.4, ...opts } = {}, at) {
  const u = veil.uniforms;
  setup(tl, veil, mode, opts, at);
  tl.to(u.uInvert, { value: 0, duration: 0 }, at)
    .to(u.uColor.value, { ...hexToRgb(color), duration: 0 }, at)
    .fromTo(u.uProgress, { value: 0 }, { value: 1, duration, ease: 'power2.in', immediateRender: false }, at);
  return tl;
}

export function reveal(tl, veil, { mode = 'iris', duration = 0.4, ...opts } = {}, at) {
  const u = veil.uniforms;
  setup(tl, veil, mode, opts, at);
  tl.to(u.uInvert, { value: 1, duration: 0 }, at)
    .fromTo(u.uProgress, { value: 0 }, { value: 1, duration, ease: 'power2.out', immediateRender: false }, at);
  return tl;
}

/**
 * One call per scene change, for every family.
 *
 *   transition(tl, veil, { mode: 'iris', color: '#f4efe9' }, t, (at, d) => {
 *     world(tl, WORLDS.paper, at, d);                 // tweens of duration d at time `at`
 *     tl.to(rig.position, { x: 1.4, duration: d }, at);
 *   });
 *
 * `swap(at, d)` adds the world/pose changes. For veil modes and `cut` d = 0
 * (instant, hidden or on a hard cut); for `oneshot` d = the blend length, so
 * the world changes visibly while the camera keeps moving.
 *
 * Options: mode, color (veil colour — usually the next world's background),
 * duration (per half for veils, whole blend for oneshot), rim (override glow),
 * dir ('right' | 'left' | 'up' | 'down' — wipe/push/bands), out (a different
 * veil mode for the reveal half).
 *
 * Returns the time at which the new scene is fully on screen.
 */
export function transition(tl, veil, opts, at, swap) {
  const { mode = 'iris', duration = 0.4, out } = opts;
  if (mode === 'cut') {
    swap(at, 0);
    return at;
  }
  if (mode === 'oneshot') {
    const d = opts.duration ?? 0.8;
    swap(at, d);
    return at + d;
  }
  cover(tl, veil, opts, at);
  swap(at + duration, 0);
  reveal(tl, veil, { ...opts, mode: out ?? mode }, at + duration);
  return at + duration * 2;
}

/**
 * Checks the film's transition choices against its tone (call once after
 * building SCENES). Logs a warning if the signature budget is exceeded or two
 * signature transitions sit back to back — both read as a demo reel.
 */
export function auditTransitions(tone, modes) {
  const { budget } = TONES[tone] ?? TONES.cinematic;
  const sig = modes.map((m) => MODES[m]?.family === 'signature');
  const count = sig.filter(Boolean).length;
  if (count > budget) console.warn(`[scroll-cinema] ${count} signature transitions; "${tone}" allows ${budget}.`);
  if (sig.some((s, i) => s && sig[i - 1])) console.warn('[scroll-cinema] two signature transitions in a row — separate them with a plain one.');
  return { count, budget };
}

function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return { r: c.r, g: c.g, b: c.b };
}
