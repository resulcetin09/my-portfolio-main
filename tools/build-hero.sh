#!/bin/sh
# Build models/hero.glb: Blender generates the lens ↔ reel model + "LensToReel"
# clip, then gltf-transform compresses it with Meshopt (Draco doesn't compress
# morph targets; Meshopt does — ~350 KB vs ~800 KB). The page must register
# MeshoptDecoder on its GLTFLoader.
set -e
cd "$(dirname "$0")/.."
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
"$BLENDER" -b --factory-startup --python tools/hero.py -- --out models/hero.raw.glb --no-draco
npx -y @gltf-transform/cli@4.5.0 optimize models/hero.raw.glb models/hero.glb \
  --compress meshopt --simplify false --instance false --join false --flatten false --palette false
rm models/hero.raw.glb
ls -la models/hero.glb
