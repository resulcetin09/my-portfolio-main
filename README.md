# my-portfolio

Resul Çetin's portfolio — itself a Scroll Cinema film. Scrolling plays one
continuous 3D shot through a camera lens: the iris opens into each chapter,
the featured project is seen *through* the lens, and the work index is a reel
of project cards turning around it.

Built with the `/scroll-cinema` skill: vanilla HTML/CSS/JS, Three.js r186,
GSAP 3.15 + ScrollTrigger, Lenis, and a hero modelled in Blender via Python.

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
| 02 | The method | Portal out of the iris into paper; lens side-on, iris opens |
| 03 | Featured | Camera dives into the lens, flash — the featured project inside it |
| 04 | Selected work | Liquid night; project cards on a reel around the lens. Scroll turns the reel, hover a row for a bending RGB-split preview |
| 05 | Contact | Paper again; the iris closes |

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

## The lens model

`tools/hero.py` builds the aperture (9 blades, barrel, gold accent ring,
glass front element) and exports `models/hero.glb` (~15k triangles, Draco).
Each blade's origin is its pivot; the page opens the iris by rotating blades
around Z by up to `OPEN_DEG`.

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python tools/hero.py -- --out models/hero.glb --preview /tmp/lens.png --open 0.5
```

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
