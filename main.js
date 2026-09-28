import { lang, LABELS } from './i18n.js'; // first: translates copy before words are split
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createVeil, cover, reveal } from './transitions.js';
import { splitWords } from './split-text.js';
import { createReel, titleCardTexture, createHoverPreview } from './work.js';

gsap.registerPlugin(ScrollTrigger);

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = matchMedia('(max-width: 768px)').matches;
const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
const S = (desktop, mobile) => (isSmall ? mobile : desktop);
const canvas = document.getElementById('stage');

// ------------------------------------------------------------------ renderer
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  document.documentElement.classList.add('no-webgl');
  throw new Error('WebGL unavailable — showing static fallback');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, isSmall ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; // keeps project screenshots true to colour
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#070708');
scene.fog = new THREE.Fog('#070708', 9, 30);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

// Timeline moves camRig (the shot); camera's local z is the load-in dolly.
const camRig = new THREE.Group();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
camRig.add(camera);
scene.add(camRig);
camRig.position.set(0, 0, S(12, 15));

const key = new THREE.DirectionalLight('#ffffff', 2.2);
key.position.set(3, 4, 6);
const rimLight = new THREE.DirectionalLight('#e8a25a', 1.4);
rimLight.position.set(-4, 1, -2);
scene.add(key, rimLight, new THREE.AmbientLight('#ffffff', 0.3));

let composer = null;
const bloom = { strength: 0.3 };
if (!isSmall) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const pass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), bloom.strength, 0.5, 0.85);
  Object.defineProperty(bloom, 'strength', { get: () => pass.strength, set: (v) => { pass.strength = v; } });
  composer.addPass(pass);
  composer.addPass(new OutputPass());
}

const veil = createVeil();
const preview = createHoverPreview();

// ------------------------------------------------------------------ hero: the lens
const rig = new THREE.Group();
scene.add(rig);
rig.position.set(S(1.7, 0), S(0, 0.95), 0);
rig.scale.setScalar(S(1, 0.6));
rig.rotation.set(0.12, -0.5, 0.05);
// Scroll-driven numbers, applied to parts in frame().
//   open: iris 0 closed → 1 fully open      spin: blade-ring rotation (rad)
//   panel: featured image inside the lens    zoom: its Ken Burns scale
//   turn: reel front card (float index)      reel: reel opacity
const pose = { open: 0, spin: 0, panel: 0, zoom: 1.2, turn: 0, reel: 0, glass: 1 };
const OPEN_ANGLE = THREE.MathUtils.degToRad(55); // matches OPEN_DEG in tools/hero.py
let parts = null;

async function loadHero() {
  const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  try {
    const gltf = await loader.loadAsync('./models/hero.glb', (e) => progress.set('hero', e.total ? e.loaded / e.total : 0.5));
    return gltf.scene;
  } catch (err) {
    console.warn('[scroll-cinema] models/hero.glb not found — using procedural hero', err);
    return proceduralHero();
  }
}

// Fallback lens if the GLB can't load: a barrel ring and flat blades.
function proceduralHero() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#111', metalness: 1, roughness: 0.3 });
  const barrel = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.2, 24, 96), metal);
  barrel.name = 'Hero_Barrel';
  g.add(barrel);
  for (let i = 0; i < 9; i++) {
    const pivot = new THREE.Group();
    const a = (i / 9) * Math.PI * 2;
    pivot.position.set(Math.cos(a), Math.sin(a), -i * 0.007);
    pivot.name = `Hero_Blade_${String(i).padStart(2, '0')}`;
    const blade = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24, 0, 1.6), metal);
    blade.rotation.z = a + 2.2;
    pivot.add(blade);
    g.add(pivot);
  }
  return g;
}

// Featured project, seen *through* the lens: a circular panel behind the blades.
const panelFrag = /* glsl */ `
  uniform sampler2D uMap; uniform float uOpacity; uniform float uZoom; uniform vec2 uCenter;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float mask = 1.0 - smoothstep(0.47, 0.48, length(p));
    vec2 tuv = vec2(p.x / 2.08, p.y) * uZoom + uCenter;
    vec3 c = texture2D(uMap, tuv).rgb;
    c *= 1.0 - smoothstep(0.25, 0.5, length(p)) * 0.55; // lens vignette
    if (mask < 0.5) discard;
    gl_FragColor = vec4(c * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`;
const panel = new THREE.Mesh(
  new THREE.PlaneGeometry(2.3, 2.3),
  new THREE.ShaderMaterial({
    uniforms: { uMap: { value: null }, uOpacity: { value: 0 }, uZoom: { value: 1.2 }, uCenter: { value: new THREE.Vector2(0.62, 0.5) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: panelFrag,
  }),
);
panel.position.z = -0.3; // inside the barrel, behind the blades
panel.visible = false;
rig.add(panel);

// ------------------------------------------------------------------ dust
const dust = (() => {
  const count = S(1400, 500);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
    pos[i * 3 + 2] = -Math.random() * 26 + 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.024, color: '#f1d9b0', transparent: true, opacity: 0.45, depthWrite: false }));
  scene.add(pts);
  return pts;
})();

// ------------------------------------------------------------------ projects
let projects = [];
let reel = null;
let textures = [];

async function loadProjects() {
  const data = await (await fetch('./data/projects.json')).json();
  projects = data.projects;
  await document.fonts.ready; // title cards draw with the site fonts
  const loader = new THREE.TextureLoader();
  let done = 0;
  textures = await Promise.all(projects.map(async (p) => {
    const tex = p.shot
      ? await loader.loadAsync(p.shot).catch(() => titleCardTexture(p))
      : titleCardTexture(p);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    progress.set('shots', ++done / projects.length);
    return tex;
  }));
}

const tagline = (p) => p.tagline?.[lang] ?? p.tagline?.en ?? p.description;

function fillFeatured() {
  const i = Math.max(0, projects.findIndex((p) => p.featured));
  const p = projects[i];
  const el = document.querySelector('[data-scene="featured"]');
  el.querySelector('[data-f="title"]').textContent = p.title;
  el.querySelector('[data-f="tagline"]').textContent = tagline(p);
  el.querySelector('[data-f="tags"]').innerHTML = p.tags.map((t) => `<li>${t}</li>`).join('');
  const live = el.querySelector('[data-f="url"]');
  if (p.url) live.href = p.url; else live.remove();
  el.querySelector('[data-f="github"]').href = p.github;
  panel.material.uniforms.uMap.value = textures[i];
}

function fillWork() {
  document.querySelector('[data-count]').textContent = `(${String(projects.length).padStart(2, '0')})`;
  const list = document.querySelector('[data-work-list]');
  list.innerHTML = projects.map((p, i) => `
    <li><a class="work-row" data-index="${i}" href="${p.url ?? p.github}" target="_blank" rel="noopener noreferrer"
         aria-label="${p.title} — ${tagline(p).replace(/"/g, '&quot;')}">
      <span class="work-row__n">${String(i + 1).padStart(2, '0')}</span>
      <span class="work-row__title">${p.title}</span>
      <span class="work-row__meta"><span>${p.tags.slice(0, 2).join(' · ')}</span>${p.cinema ? '<span class="work-row__cinema" title="Built with Scroll Cinema">● SC</span>' : ''} ${p.year ?? ''} ↗</span>
    </a></li>`).join('');

  if (!canHover || reducedMotion) return;
  // hover preview: screenshot follows the cursor and bends with its speed
  const u = preview.uniforms;
  // anchor the preview just right of the list; it follows the cursor loosely
  const spot = (e) => {
    const r = list.getBoundingClientRect();
    return [r.right + 28 + (e.clientX - r.left) * 0.12, e.clientY];
  };
  list.addEventListener('pointerenter', (e) => preview.jump(...spot(e)));
  list.addEventListener('pointermove', (e) => preview.move(...spot(e)));
  list.querySelectorAll('.work-row').forEach((row) => {
    row.addEventListener('pointerenter', () => {
      preview.setTexture(textures[Number(row.dataset.index)]);
      gsap.to(u.uAlpha, { value: 1, duration: 0.35, overwrite: true });
      gsap.fromTo(preview.state, { scale: 0.86 }, { scale: 1, duration: 0.6, ease: 'expo.out', overwrite: true });
    });
  });
  list.addEventListener('pointerleave', () => gsap.to(u.uAlpha, { value: 0, duration: 0.3, overwrite: true }));
}

// ------------------------------------------------------------------ scenes
// One timeline, 1 unit = one viewport. Every scene has its own shot.
const WORLDS = {
  ink:   { bg: '#070708', fg: '#f1ede6', muted: 'rgb(241 237 230 / .6)', line: 'rgb(241 237 230 / .22)' },
  paper: { bg: '#eeebe5', fg: '#121212', muted: 'rgb(18 18 18 / .62)', line: 'rgb(18 18 18 / .18)' },
  field: { bg: '#141d17', fg: '#f2ecd9', muted: 'rgb(242 236 217 / .62)', line: 'rgb(242 236 217 / .22)' },
  night: { bg: '#0a0e1a', fg: '#f1ede6', muted: 'rgb(241 237 230 / .58)', line: 'rgb(241 237 230 / .18)' },
};
const labels = LABELS[lang];
const SCENES = [
  { id: 'intro', length: 2 },
  { id: 'manifesto', length: 2.2 },
  { id: 'featured', length: 2.6 },
  { id: 'work', length: 3.6 },
  { id: 'contact', length: 2 },
].map((s, i) => ({ ...s, label: labels[i] }));
const TR = 0.4;
const io = { ease: 'power2.inOut' };
const snap = (tl, target, vars, t) => tl.to(target, { ...vars, duration: 0 }, t);

function world(tl, w, t, bloomStrength) {
  const c = new THREE.Color(w.bg);
  tl.to(scene.background, { r: c.r, g: c.g, b: c.b, duration: 0 }, t)
    .to(scene.fog.color, { r: c.r, g: c.g, b: c.b, duration: 0 }, t)
    .to(document.documentElement, { '--bg': w.bg, '--fg': w.fg, '--muted': w.muted, '--line': w.line, duration: 0 }, t)
    .to(bloom, { strength: bloomStrength, duration: 0 }, t);
}

const BUILD = {
  // 1 — a closed lens alone in the dark; the camera rolls in.
  intro(tl, t, s) {
    tl.to(camRig.position, { z: S(6.4, 8.6), duration: s.length, ...io }, t)
      .to(rig.rotation, { y: -0.12, x: 0.02, duration: s.length, ...io }, t)
      .to(pose, { open: 0.14, spin: 0.5, duration: s.length, ...io }, t);
  },

  // 2 — the iris opens into paper; the lens turns side-on to show its depth.
  manifesto(tl, t, s) {
    cover(tl, veil, { mode: 'portal', color: WORLDS.paper.bg, duration: TR }, t);
    world(tl, WORLDS.paper, t + TR, 0.05);
    snap(tl, camRig.position, { x: 0, y: 0, z: 6.2 }, t + TR);
    snap(tl, rig.position, { x: S(2.05, 0.2), y: S(-0.05, 1) }, t + TR);
    snap(tl, rig.rotation, { x: 0.15, y: 1.15, z: 0.1 }, t + TR);
    snap(tl, rig.scale, { x: S(1.0, 0.62), y: S(1.0, 0.62), z: S(1.0, 0.62) }, t + TR);
    snap(tl, pose, { open: 0.3 }, t + TR);
    snap(tl, dust.material, { opacity: 0 }, t + TR);
    reveal(tl, veil, { mode: 'portal', duration: TR }, t + TR);
    const a = t + TR, d = s.length - TR;
    tl.to(rig.rotation, { y: 0.5, duration: d, ...io }, a)
      .to(pose, { open: 1, spin: 1.8, duration: d, ...io }, a)
      .to(camRig.position, { z: 5.4, duration: d, ...io }, a);
  },

  // 3 — dive into the lens, flash, and the featured project is inside it.
  featured(tl, t, s) {
    tl.to(camRig.position, { x: S(2.05, 0.2), y: S(-0.05, 1), z: 1.4, duration: TR, ease: 'power3.in' }, t);
    cover(tl, veil, { mode: 'flash', color: '#f3e6c8', duration: TR }, t);
    world(tl, WORLDS.field, t + TR, 0.3);
    snap(tl, camRig.position, { x: 0, y: 0, z: 6.8 }, t + TR);
    snap(tl, rig.position, { x: S(1.85, 0), y: S(0, 1.05) }, t + TR);
    snap(tl, rig.rotation, { x: 0, y: 0, z: 0 }, t + TR);
    snap(tl, rig.scale, { x: S(0.98, 0.64), y: S(0.98, 0.64), z: S(0.98, 0.64) }, t + TR);
    snap(tl, pose, { open: 1, panel: 1, zoom: 1.25, glass: 0 }, t + TR); // no front element: look straight in
    snap(tl, dust.material, { opacity: 0.35 }, t + TR);
    reveal(tl, veil, { mode: 'flash', duration: TR }, t + TR);
    const a = t + TR, d = s.length - TR;
    tl.to(camRig.position, { z: 5.7, duration: d, ...io }, a)
      .to(pose, { zoom: 0.85, spin: 3.2, duration: d, ...io }, a)
      .to(rig.rotation, { x: 0.08, y: -0.2, duration: d, ...io }, a);
  },

  // 4 — liquid night; the lens shrinks into the hub of a turning reel of work.
  work(tl, t, s) {
    cover(tl, veil, { mode: 'liquid', color: WORLDS.night.bg, duration: TR }, t);
    world(tl, WORLDS.night, t + TR, 0.1);
    snap(tl, camRig.position, { x: 0, y: S(1.5, 2.2), z: S(9.6, 12.5) }, t + TR);
    snap(tl, camRig.rotation, { x: S(-0.15, -0.14) }, t + TR);
    snap(tl, rig.position, { x: S(2.1, 0), y: S(0.1, 2.55) }, t + TR); // phones: reel above the list
    snap(tl, rig.rotation, { x: 0.35, y: 0, z: 0 }, t + TR);
    snap(tl, rig.scale, { x: S(0.6, 0.5), y: S(0.6, 0.5), z: S(0.6, 0.5) }, t + TR);
    snap(tl, pose, { panel: 0, open: 0.55, reel: 1, turn: 0, glass: 1 }, t + TR);
    snap(tl, dust.material, { opacity: 0.5 }, t + TR);
    reveal(tl, veil, { mode: 'liquid', duration: TR }, t + TR);
    const a = t + TR + 0.2, d = s.length - TR - 0.55;
    tl.to(pose, { turn: projects.length - 1, spin: 5, duration: d, ease: 'power1.inOut' }, a)
      .to(camRig.position, { z: S(8.8, 11.8), duration: d, ...io }, a);
  },

  // 5 — back to paper; the iris closes slowly. Calm, centred.
  contact(tl, t, s) {
    cover(tl, veil, { mode: 'portal', color: WORLDS.paper.bg, duration: TR }, t);
    world(tl, WORLDS.paper, t + TR, 0.05);
    snap(tl, camRig.position, { x: 0, y: 0, z: 6.2 }, t + TR);
    snap(tl, camRig.rotation, { x: 0 }, t + TR);
    snap(tl, rig.position, { x: 0, y: S(1.0, 1.1) }, t + TR);
    snap(tl, rig.rotation, { x: 0.12, y: -0.45, z: 0 }, t + TR);
    snap(tl, rig.scale, { x: S(0.58, 0.45), y: S(0.58, 0.45), z: S(0.58, 0.45) }, t + TR);
    snap(tl, pose, { reel: 0, open: 0.9 }, t + TR);
    snap(tl, dust.material, { opacity: 0 }, t + TR);
    reveal(tl, veil, { mode: 'portal', duration: TR }, t + TR);
    const a = t + TR, d = s.length - TR;
    tl.to(pose, { open: 0.1, spin: 6, duration: d, ...io }, a)
      .to(rig.rotation, { y: 0.3, duration: d, ...io }, a)
      .to(camRig.position, { z: 5.6, duration: d, ...io }, a);
  },
};

// ------------------------------------------------------------------ copy
const WORDS = '.w > span';
const EXTRAS = '.eyebrow,.lede,.tags,.links,.credit,.scroll-cue,.hint,.work-list li';
function copyIn(tl, id, at) {
  const el = document.querySelector(`.copy[data-scene="${id}"]`);
  tl.to(el, { autoAlpha: 1, duration: 0 }, at)
    .fromTo(el.querySelectorAll(WORDS), { yPercent: 110 }, { yPercent: 0, stagger: 0.03, duration: 0.35, ease: 'power3.out', immediateRender: false }, at)
    .fromTo(el.querySelectorAll(EXTRAS), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, stagger: 0.025, duration: 0.3, ease: 'power2.out', immediateRender: false }, at + 0.08);
}
function copyOut(tl, id, at) {
  const el = document.querySelector(`.copy[data-scene="${id}"]`);
  tl.to(el.querySelectorAll(WORDS), { yPercent: -110, stagger: 0.012, duration: 0.22, ease: 'power2.in' }, at)
    .to(el.querySelectorAll(EXTRAS), { autoAlpha: 0, duration: 0.15 }, at)
    .to(el, { autoAlpha: 0, duration: 0 }, at + 0.26);
}

let starts = [];
let total = 0;
let scrollVelocity = 0;
function buildStory() {
  total = SCENES.reduce((sum, s) => sum + s.length, 0);
  document.getElementById('story').style.height = `${(total + 1) * 100}lvh`;
  const tl = gsap.timeline({ defaults: { ease: 'none' }, paused: true });
  let t = 0;
  SCENES.forEach((s, i) => {
    starts.push(t);
    BUILD[s.id](tl, t, s);
    if (i) copyIn(tl, s.id, t + TR * 2 + 0.05);
    if (i < SCENES.length - 1) copyOut(tl, s.id, t + s.length - 0.3);
    t += s.length;
  });
  tl.to({}, { duration: 0.001 }, total);

  const bar = document.querySelector('[data-hud-bar]');
  const idx = document.querySelector('[data-hud-index]');
  const label = document.querySelector('[data-hud-label]');
  const tc = document.querySelector('[data-hud-tc]');
  let current = -1;
  ScrollTrigger.create({
    trigger: '#story', start: 'top top', end: 'bottom bottom',
    scrub: reducedMotion ? true : 1, animation: tl,
    onUpdate(self) { scrollVelocity = self.getVelocity(); },
  });
  tl.eventCallback('onUpdate', () => {
    {
      const p = tl.progress();
      bar.style.transform = `scaleX(${p})`;
      // film timecode: a 90-second reel, 24 fps
      const secs = p * 90;
      tc.textContent = [Math.floor(secs / 60), Math.floor(secs % 60), Math.floor((secs % 1) * 24)].map((n) => String(n).padStart(2, '0')).join(':');
      const i = Math.max(0, starts.findLastIndex((st) => st <= p * total + 1e-4));
      if (i !== current) {
        current = i;
        idx.textContent = String(i + 1).padStart(2, '0');
        label.textContent = SCENES[i].label;
      }
    }
  });

  // HUD / nav jumps: land in the calm middle of a chapter
  const go = (i) => {
    const time = i ? starts[i] + TR * 2 + 0.55 : 0;
    const y = (document.documentElement.scrollHeight - innerHeight) * (time / total);
    if (window.lenis) window.lenis.scrollTo(y, { duration: 1.6 }); else scrollTo(0, y);
  };
  document.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    go(Number(a.dataset.go));
  }));
  window.portfolio = { go, total: () => total, starts: () => starts };
}

function introCopy() {
  const el = document.querySelector('.copy[data-scene="intro"]');
  gsap.set(el, { autoAlpha: 1 });
  if (reducedMotion) return;
  gsap.from(el.querySelectorAll(WORDS), { yPercent: 110, stagger: 0.07, duration: 1.2, ease: 'power3.out', delay: 0.3 });
  gsap.from(el.querySelectorAll('.eyebrow,.lede,.scroll-cue'), { autoAlpha: 0, y: 16, stagger: 0.1, duration: 1, delay: 0.8 });
  gsap.from(camera.position, { z: 5, duration: 2.6, ease: 'power3.out' });
}

// ------------------------------------------------------------------ loop
const timer = new THREE.Timer();
const pointer = new THREE.Vector2();
addEventListener('pointermove', (e) => pointer.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5));
const heroScreen = new THREE.Vector3();
let bend = 0;
let activeRow = -1;
let rows = [];

function frame() {
  timer.update();
  if (document.hidden) return;
  const time = timer.getElapsed();
  const hero = rig.children.find((c) => c !== panel);
  if (hero && !reducedMotion) {
    hero.position.y = Math.sin(time * 0.7) * 0.04;
    hero.rotation.x += (pointer.y * 0.18 - hero.rotation.x) * 0.05;
    hero.rotation.y += (pointer.x * 0.24 - hero.rotation.y) * 0.05;
  }
  if (parts) {
    // blades swing around their pivots; the whole iris slowly turns
    parts.blades.forEach((b) => { b.rotation.z = pose.open * OPEN_ANGLE; });
    if (parts.iris) parts.iris.rotation.z = pose.spin * 0.25;
    if (parts.glass) parts.glass.visible = pose.glass > 0.5;
  }
  const u = panel.material.uniforms;
  panel.visible = pose.panel > 0.001;
  u.uOpacity.value = pose.panel;
  u.uZoom.value = pose.zoom;

  bend += (THREE.MathUtils.clamp(scrollVelocity / 2500, -1, 1) - bend) * 0.08;
  scrollVelocity *= 0.9;
  if (reel) {
    reel.group.position.copy(rig.position);
    reel.update(pose.turn, reducedMotion ? 0 : bend, pose.reel);
    const a = pose.reel > 0.5 ? reel.activeIndex(pose.turn) : -1;
    if (a !== activeRow) {
      rows[activeRow]?.classList.remove('is-active');
      rows[a]?.classList.add('is-active');
      activeRow = a;
    }
  }

  rig.getWorldPosition(heroScreen).project(camera);
  veil.uniforms.uCenter.value.set(
    THREE.MathUtils.clamp(heroScreen.x * 0.5 + 0.5, 0.1, 0.9),
    THREE.MathUtils.clamp(heroScreen.y * 0.5 + 0.5, 0.1, 0.9),
  );

  renderer.clear();
  if (composer) composer.render(); else renderer.render(scene, camera);
  preview.render(renderer);
  veil.render(renderer, time);
}

addEventListener('resize', () => {
  if (matchMedia('(max-width: 768px)').matches !== isSmall) { location.reload(); return; }
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
  veil.resize(innerWidth, innerHeight);
  preview.resize();
});

// ------------------------------------------------------------------ loader
const loaderEl = document.querySelector('[data-loader]');
const loaderCount = document.querySelector('[data-loader-count]');
const progress = {
  parts: { hero: 0, shots: 0 },
  set(k, v) { this.parts[k] = v; loaderCount.textContent = Math.round(((this.parts.hero + this.parts.shots) / 2) * 100); },
};

// ------------------------------------------------------------------ boot
async function boot() {
  const [hero] = await Promise.all([loadHero(), loadProjects()]);
  rig.add(hero);
  // Group the blades under one pivot so the whole iris can rotate as a ring.
  const iris = new THREE.Group();
  hero.add(iris);
  const blades = [];
  hero.traverse((o) => { if (o.name.startsWith('Hero_Blade_')) blades.push(o); });
  blades.forEach((b) => iris.attach(b));
  parts = { blades, iris };
  const glass = hero.getObjectByName('Hero_Glass');
  if (glass?.material) Object.assign(glass.material, { envMapIntensity: 0.18, roughness: 0, thickness: 0.25 });
  parts.glass = glass;

  fillFeatured();
  fillWork();
  rows = [...document.querySelectorAll('.work-row')];
  splitWords();

  reel = createReel(projects, textures, { radius: S(3.3, 2.6), width: S(2.1, 1.7) });
  scene.add(reel.group);

  // compile everything once so no shader builds mid-scroll
  panel.visible = true; reel.group.visible = true;
  renderer.compile(scene, camera);
  panel.visible = false; reel.group.visible = false;

  if (!reducedMotion) {
    const lenis = new Lenis({ lerp: 0.08 });
    window.lenis = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  gsap.ticker.add(frame);
  buildStory();
  introCopy();

  loaderCount.textContent = '100';
  gsap.to(loaderEl, { autoAlpha: 0, duration: 0.9, delay: 0.25, ease: 'power2.inOut', onComplete: () => loaderEl.remove() });
}

boot().catch((err) => {
  console.error(err);
  document.documentElement.classList.add('no-webgl');
});
