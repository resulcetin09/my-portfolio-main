# my-portfolio

Resul Çetin's portfolio — itself a Scroll Cinema film. Scrolling plays one
continuous 3D shot through a camera lens: the iris opens into each chapter,
the featured project is seen *through* the lens, and the work index is a reel
of project cards turning around it.

Built with the `/scroll-cinema` skill: vanilla HTML/CSS/JS, Three.js r186,
GSAP 3.15 + ScrollTrigger, Lenis (with a speed-limited playhead so transitions are never skipped), and a hero modelled and animated in Blender via Python.

## Run

```sh
python3 -m http.server 5181   # from this folder, then open http://localhost:5181
```

Import maps and model loading need HTTP, not `file://`. `?lang=tr` / `?lang=en`
switches language (also remembered in localStorage).

## Chapters

| # | Scene | What happens |
|---|---|---|
| 01 | Opening | A closed lens in the dark; the camera rolls in |
| 02 | The method | The camera dives into the opening iris; the new world opens from inside the lens (clean iris) |
| 03 | About | Camera dives into the lens, flash — about me beside the lens (from the CV: role, focus areas, numbers; no personal contact data) |
| 04 | Selected work | No veil — the lens mechanically transforms into a film reel as the world turns to night; project cards turn around it. Hover a row for a bending RGB-split preview |
| 05 | Contact | The reel folds back into the lens on paper; the iris closes |

## Adding or editing projects

1. Edit `data/projects.config.json` — order, taglines (EN/TR), tags,
   screenshot path, and flags:
   - `"cinema": true` marks a project built with Scroll Cinema (● SC in the list)
   - `"featured": true` puts it in chapter 03, inside the lens
2. Put a screenshot in `shots/` (≈1280×615 JPG). Projects without one get a
   generated typographic card.
3. Refresh the merged data from GitHub:
   ```sh
   node scripts/sync-projects.mjs
   ```
   The site only reads `data/projects.json`, so visitors never hit GitHub's
   API rate limit.

## The hero: lens ↔ film reel

`tools/hero.py` builds a premium cine lens (9 blades, engraved name ring,
f-stop ring, knurled focus grip, bayonet mount, coated glass) that
mechanically transforms into a 35 mm film reel — one animation clip,
`LensToReel`, scrubbed by scroll in chapter 04 and played backwards in 05.
Storyboard and decisions: `docs/morph-storyboard.md`. Review frames and a
video are rendered on demand (see below), not kept in the repo.

```sh
./tools/build-hero.sh          # Blender → models/hero.glb (Meshopt, ~355 KB)
# review renders (not exported):
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python tools/hero.py -- \
  --out /tmp/x.glb --frames /tmp/frames [--front] | --video /tmp/morph.mp4
```

Every morphing part is generated for both states with the same vertex order
(shape key "Reel"); the blade→spoke mapping is chosen automatically for the
least vertex travel and 9-fold symmetry is asserted on every build. The page
needs `MeshoptDecoder` on its GLTFLoader (Draco can't compress morph targets).

## Files

```
index.html        layers: canvas → HUD viewfinder → chapter copy → loader
style.css         tokens (swapped per world), HUD, copy, work list, fallbacks
i18n.js           EN/TR copy and chapter labels
main.js           renderer, lens rig, scenes/timeline, loop, boot
work.js           project reel (ShaderMaterial cards) + hover preview pass
transitions.js    portal / liquid / flash / wipe veil (opens from the lens)
split-text.js     word masks for type reveals
data/             projects.config.json (curated) → projects.json (generated)
shots/            project screenshots
tools/hero.py     Blender lens generator
scripts/          sync-projects.mjs
```

Reduced motion, no-WebGL fallback (copy becomes a normal page) and keyboard
access to every link are built in.
