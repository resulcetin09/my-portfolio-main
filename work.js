import * as THREE from 'three';

// ------------------------------------------------------------------ reel
// Project cards on a ring around the lens. Scroll turns the ring (`turn` is a
// float card index); the card at the front is "active": full colour, larger.
// Scroll velocity (`bend`) curls the cards like film on a spool.

const cardVert = /* glsl */ `
  uniform float uBend;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float x = uv.x - 0.5;
    p.z -= x * x * (0.55 + uBend * 1.6);        // follow the ring's curve, curl with speed
    p.y += sin(uv.x * 3.14159) * uBend * 0.12;  // slight sag while moving
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const cardFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uActive;
  uniform float uOpacity;
  uniform float uAspect;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(uMap, vUv);
    float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    c.rgb = mix(vec3(g) * 0.5, c.rgb, 0.25 + 0.75 * uActive);   // inactive: dim, desaturated
    c.rgb *= (gl_FrontFacing ? 0.9 : 0.3);   // keep bright screenshots under the bloom threshold
    // rounded corners
    vec2 size = vec2(uAspect, 1.0);
    float r = 0.035;
    vec2 q = abs(vUv - 0.5) * size - (size * 0.5 - r);
    float d = length(max(q, 0.0)) - r;
    float a = 1.0 - smoothstep(0.0, 0.004, d);
    // thin light edge on the active card
    float edge = smoothstep(0.012, 0.0, abs(d + 0.004)) * uActive * 0.6;
    gl_FragColor = vec4(c.rgb + edge, a * uOpacity);
    #include <colorspace_fragment>
  }
`;

export function createReel(projects, textures, { radius = 3.3, width = 2.1 } = {}) {
  const group = new THREE.Group();
  const n = projects.length;
  const step = (Math.PI * 2) / n;
  const height = width / 2.08;
  const geo = new THREE.PlaneGeometry(width, height, 32, 8);
  const cards = projects.map((p, i) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: textures[i] }, uActive: { value: 0 }, uOpacity: { value: 1 },
        uBend: { value: 0 }, uAspect: { value: width / height },
      },
      vertexShader: cardVert, fragmentShader: cardFrag,
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const a = i * step;
    mesh.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
    mesh.rotation.y = a;
    mesh.renderOrder = 2;
    group.add(mesh);
    return mesh;
  });

  return {
    group, step, n,
    // opacity 0..1 for the whole reel; turn = float index of the front card
    update(turn, bend, opacity) {
      group.visible = opacity > 0.001;
      if (!group.visible) return;
      group.rotation.y = -turn * step;
      cards.forEach((card, i) => {
        let d = Math.abs(i - turn) % n;
        d = Math.min(d, n - d);                       // circular distance
        const active = Math.max(0, 1 - d);
        const u = card.material.uniforms;
        u.uActive.value = active;
        u.uBend.value = bend;
        u.uOpacity.value = opacity;
        card.scale.setScalar(1 + active * 0.14);
      });
    },
    activeIndex(turn) { return ((Math.round(turn) % n) + n) % n; },
  };
}

// A typographic card for projects without a screenshot.
export function titleCardTexture(project, { bg = '#0f1320', fg = '#f1ede6', accent = '#e8a25a' } = {}) {
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 615;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 1280, 615);
  grad.addColorStop(0, bg); grad.addColorStop(1, '#1b2236');
  g.fillStyle = grad; g.fillRect(0, 0, 1280, 615);
  g.strokeStyle = 'rgba(241,237,230,.12)';
  for (let x = 0; x < 1280; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 615); g.stroke(); }
  g.fillStyle = accent; g.font = '500 22px "IBM Plex Mono", monospace';
  g.fillText((project.tags || []).join('  ·  ').toUpperCase(), 80, 120);
  g.fillStyle = fg; g.font = '600 150px "Syne", sans-serif';
  g.fillText(project.title, 72, 360);
  g.fillStyle = 'rgba(241,237,230,.6)'; g.font = '400 30px "Manrope", sans-serif';
  g.fillText(project.tagline?.en ?? project.description ?? '', 80, 450);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------ hover preview
// A screenshot that follows the cursor over the work list, bending with the
// pointer's velocity and splitting RGB at the edges — drawn in its own
// orthographic pass on top of the film.

const prevVert = /* glsl */ `
  uniform vec2 uVel;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.x += sin(uv.y * 3.14159) * uVel.x * 0.0022;
    p.y += sin(uv.x * 3.14159) * uVel.y * 0.0022;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const prevFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uVel;
  uniform float uAlpha;
  uniform float uAspect;
  varying vec2 vUv;
  void main() {
    vec2 shift = uVel * 0.00045;
    float r = texture2D(uMap, vUv + shift).r;
    vec4 base = texture2D(uMap, vUv);
    float b = texture2D(uMap, vUv - shift).b;
    vec2 size = vec2(uAspect, 1.0);
    float rad = 0.03;
    vec2 q = abs(vUv - 0.5) * size - (size * 0.5 - rad);
    float a = 1.0 - smoothstep(0.0, 0.006, length(max(q, 0.0)) - rad);
    gl_FragColor = vec4(r, base.g, b, a * uAlpha);
    #include <colorspace_fragment>
  }
`;

export function createHoverPreview() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, innerWidth, 0, -innerHeight, -10, 10);
  const uniforms = { uMap: { value: null }, uVel: { value: new THREE.Vector2() }, uAlpha: { value: 0 }, uAspect: { value: 2.08 } };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1, 24, 24),
    new THREE.ShaderMaterial({ uniforms, vertexShader: prevVert, fragmentShader: prevFrag, transparent: true, depthTest: false }),
  );
  scene.add(mesh);
  const target = new THREE.Vector2(innerWidth / 2, innerHeight / 2);
  const pos = target.clone();
  const state = { scale: 0.85 };
  const width = () => Math.min(380, innerWidth * 0.28);

  return {
    uniforms, state,
    move(x, y) { target.set(x, y); },
    jump(x, y) { target.set(x, y); pos.set(x, y); },
    setTexture(tex) { uniforms.uMap.value = tex; },
    render(renderer) {
      if (uniforms.uAlpha.value <= 0.001 || !uniforms.uMap.value) return;
      const prev = pos.clone();
      pos.lerp(target, 0.12);
      const vel = pos.clone().sub(prev);
      uniforms.uVel.value.lerp(new THREE.Vector2(vel.x, -vel.y).multiplyScalar(8), 0.2);
      const w = width() * state.scale;
      // `pos` is the preview's left-centre anchor
      mesh.position.set(pos.x + w * 0.5, -pos.y, 0);
      mesh.scale.set(w, w / uniforms.uAspect.value, 1);
      mesh.rotation.z = THREE.MathUtils.clamp(-uniforms.uVel.value.x * 0.0015, -0.12, 0.12);
      renderer.render(scene, camera);
    },
    // compile the preview shader and upload a texture before anyone hovers
    warm(renderer, tex) {
      if (!tex) return;
      uniforms.uMap.value = tex;
      renderer.compile(scene, camera);
    },
    resize() {
      camera.right = innerWidth; camera.bottom = -innerHeight;
      camera.updateProjectionMatrix();
    },
  };
}
