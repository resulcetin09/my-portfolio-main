"""
scroll-cinema — Blender hero-object template.

Run headless (no Blender window):
    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        --python blender_hero.py -- --out ./public/models/hero.glb --preview ./hero_preview.png

Copy this file into the project (e.g. tools/hero.py) and replace build_hero()
with the project's own geometry. Everything else (reset, materials, export,
preview render) is reusable plumbing.

Conventions the web side relies on:
  - The hero is one root object named "Hero"; parts are children with stable,
    meaningful names ("Hero_Wing_L", "Hero_Core") so JS can find and animate them.
  - Scale: hero fits roughly inside a 2-unit cube centred on the origin, so the
    default camera in the web template frames it without tweaking.
  - Materials are plain Principled BSDF — glTF only carries PBR values
    (base color, metallic, roughness, transmission, emission, IOR). Node tricks
    beyond that are lost on export; do those effects in shaders on the web side.
"""

import argparse
import math
import sys

import bmesh
import bpy
from mathutils import Vector


# ---------------------------------------------------------------- plumbing

def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True, help="output .glb path")
    p.add_argument("--preview", help="optional PNG preview render path")
    p.add_argument("--no-draco", action="store_true", help="skip Draco compression")
    return p.parse_args(argv)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    return scene


def pbr_material(name, color=(1, 1, 1), metallic=0.0, roughness=0.4,
                 transmission=0.0, ior=1.45, emission=None, emission_strength=0.0):
    """Principled BSDF with only glTF-exportable inputs."""
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:  # Blender < 5 creates materials without nodes
        mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["IOR"].default_value = ior
    bsdf.inputs["Transmission Weight"].default_value = transmission
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def mesh_object(name, bm, material=None, parent=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if smooth:
        for poly in me.polygons:
            poly.use_smooth = True
    if material:
        me.materials.append(material)
    if parent:
        obj.parent = parent
    return obj


def add_modifier(obj, kind, **props):
    mod = obj.modifiers.new(kind.title(), kind)
    for k, v in props.items():
        setattr(mod, k, v)
    return mod


def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def stats():
    tris = 0
    deps = bpy.context.evaluated_depsgraph_get()
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            me = obj.evaluated_get(deps).to_mesh()
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            obj.evaluated_get(deps).to_mesh_clear()
    return tris


def export_glb(path, draco=True):
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        export_apply=True,          # bake modifiers
        export_yup=True,
        export_materials="EXPORT",
        export_animations=True,
    )
    if draco:
        kwargs.update(
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=6,
            export_draco_position_quantization=14,
            export_draco_normal_quantization=10,
        )
    bpy.ops.export_scene.gltf(**kwargs)


def render_preview(path, target=(0, 0, 0)):
    """Quick look render so the agent can *see* the model (Read the PNG)."""
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (3.2, -3.6, 2.2)
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    for loc, energy in (((4, -4, 5), 800), ((-5, 2, 3), 300), ((0, 5, -2), 400)):
        ld = bpy.data.lights.new("PreviewLight", "AREA")
        ld.energy, ld.size = energy, 4
        lo = bpy.data.objects.new("PreviewLight", ld)
        lo.location = loc
        lo.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(lo)

    world = bpy.data.worlds.new("PreviewWorld")
    if world.node_tree is None:  # Blender < 5 creates worlds without nodes
        world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.02, 0.025, 1)
    scene.world = world

    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = 960, 720
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    # preview helpers must not leak into the export — caller exports first.


# ---------------------------------------------------------------- the hero
# A camera aperture: nine overlapping blades inside a lens barrel, behind a
# domed front element. It faces Blender -Y, which becomes three.js +Z (toward
# the camera). Each blade's object origin is its pivot, so the web side opens
# the iris by rotating Hero_Blade_NN around its local Z (three.js) axis.

N_BLADES = 9
OPEN_DEG = 55   # blade swing from closed to fully open (web side uses the same)
PIVOT_R = 1.0


def blade_outline(segments=48):
    """Crescent blade for blade 0 (pivot at +X), in Blender XZ coordinates."""
    pivot = Vector((PIVOT_R, 0.0))
    centre = Vector((0.32, 0.78))            # arc the spine sweeps around
    r = (pivot - centre).length
    a0 = math.atan2(pivot.y - centre.y, pivot.x - centre.x)
    sweep = math.radians(118)
    inner, outer = [], []
    for k in range(segments + 1):
        s = k / segments
        a = a0 - sweep * s
        p = centre + Vector((math.cos(a), math.sin(a))) * r
        n = (p - centre).normalized()             # outward from arc centre
        w = 0.06 + 0.44 * math.sin(math.pi * min(s * 1.08, 1.0)) ** 0.65
        outer.append(p + n * w * 0.5)
        inner.append(p - n * w * 0.5)
    return outer + inner[::-1]


def build_blade(idx, material, parent):
    ang = idx * math.tau / N_BLADES
    ca, sa = math.cos(ang), math.sin(ang)
    pivot = Vector((PIVOT_R * ca, PIVOT_R * sa))
    bm = bmesh.new()
    verts = []
    for q in blade_outline():
        g = Vector((q.x * ca - q.y * sa, q.x * sa + q.y * ca))   # rotate into place
        local = g - pivot
        verts.append(bm.verts.new((local.x, 0.0, local.y)))      # XZ plane
    bm.faces.new(verts)
    obj = mesh_object(f"Hero_Blade_{idx:02d}", bm, material, parent, smooth=False)
    obj.location = (pivot.x, idx * 0.007, pivot.y)                # stagger to avoid z-fighting
    add_modifier(obj, "SOLIDIFY", thickness=0.012, offset=0)
    add_modifier(obj, "BEVEL", width=0.004, segments=1)
    return obj


def lathe(name, profile, material, parent, steps=128):
    """Revolve an (x=radius, y=depth) profile around the Y axis."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0.0)) for x, y in profile]
    edges = [bm.edges.new((vs[i], vs[(i + 1) % len(vs)])) for i in range(len(vs))]
    bmesh.ops.spin(bm, geom=vs + edges, cent=(0, 0, 0), axis=(0, 1, 0),
                   angle=math.tau, steps=steps, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return mesh_object(name, bm, material, parent)


def build_hero():
    root = empty("Hero")
    blade_mat = pbr_material("Blade gunmetal", color=(0.045, 0.045, 0.05), metallic=1.0, roughness=0.28)
    barrel_mat = pbr_material("Barrel anodised", color=(0.018, 0.018, 0.02), metallic=0.7, roughness=0.42)
    accent_mat = pbr_material("Accent gold", color=(0.92, 0.62, 0.26), metallic=1.0, roughness=0.22,
                              emission=(1.0, 0.55, 0.2), emission_strength=0.6)
    glass_mat = pbr_material("Front element", color=(0.9, 0.95, 1.0), roughness=0.02,
                             transmission=1.0, ior=1.52)

    for i in range(N_BLADES):
        build_blade(i, blade_mat, root)

    lathe("Hero_Barrel", [(1.06, -0.08), (1.40, -0.08), (1.45, -0.02), (1.45, 0.42),
                          (1.36, 0.50), (1.06, 0.50)], barrel_mat, root)
    lathe("Hero_Grip", [(1.45, 0.08), (1.49, 0.10), (1.49, 0.30), (1.45, 0.32)], barrel_mat, root)

    bpy.ops.mesh.primitive_torus_add(major_radius=1.24, minor_radius=0.014,
                                     major_segments=128, minor_segments=8)
    accent = bpy.context.object
    accent.name = "Hero_Accent"
    accent.rotation_euler = (math.pi / 2, 0, 0)
    accent.location = (0, -0.09, 0)
    accent.data.materials.append(accent_mat)
    accent.parent = root
    for poly in accent.data.polygons:
        poly.use_smooth = True

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=24, radius=1.0)
    for v in bm.verts:
        v.co.x *= 1.1
        v.co.z *= 1.1
        v.co.y = v.co.y * 0.16 - 0.14
    mesh_object("Hero_Glass", bm, glass_mat, root)
    return root


# ---------------------------------------------------------------- main

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    open_amt = 0.0
    if "--open" in argv:
        open_amt = float(argv[argv.index("--open") + 1])
        del argv[argv.index("--open"):argv.index("--open") + 2]
        sys.argv = sys.argv[:sys.argv.index("--") + 1] + argv
    args = parse_args()
    reset_scene()
    build_hero()
    tris = stats()
    export_glb(args.out, draco=not args.no_draco)
    print(f"[scroll-cinema] exported {args.out} — {tris:,} triangles")
    if args.preview:
        # preview only: swing the blades open (not exported)
        for obj in bpy.data.objects:
            if obj.name.startswith("Hero_Blade_"):
                obj.rotation_euler.y = -open_amt * math.radians(OPEN_DEG)  # negative Y swings blades outward
            if obj.name == "Hero_Glass":   # EEVEE preview renders it milky; hide to see blades
                obj.hide_render = True
        render_preview(args.preview)
        print(f"[scroll-cinema] preview {args.preview}")


main()
