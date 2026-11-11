# Blender: re-import the exported glb into an empty scene, pose it from a clip file and render with EEVEE three-point lighting, to check materials / normals / hair cut-outs / pose / prop placement
# Usage: blender -b --factory-startup --python bl_verify.py -- <out_dir> <model.glb> <clip_id|-> <s,s,...> [--close] [--yaw deg] [--tag name]
# Binding matches three.js: by node name. Each bone gets COPY_TRANSFORMS to the same-named node in the clip file (plus a correction for the bone orientation applied on import)
import bpy, sys, os, json, struct, math
from mathutils import Matrix, Vector, Quaternion
sys.path.insert(0, os.path.dirname(__file__))
import cfg

a = sys.argv[sys.argv.index('--') + 1:]
OUT, MODEL, CLIP, TIMES = a[0], a[1], a[2], [float(x) for x in a[3].split(',')]
CLOSE = '--close' in a
YAW = float(a[a.index('--yaw') + 1]) if '--yaw' in a else 0.0
TAG = a[a.index('--tag') + 1] if '--tag' in a else (CLIP if CLIP != '-' else 'rest')
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
sc.render.fps, sc.render.fps_base = cfg.FPS, 1.0
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)

C = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))   # Blender -> glTF coordinates


def glb_json(p):
    b = open(p, 'rb').read()
    n = struct.unpack_from('<I', b, 12)[0]
    return json.loads(b[20:20 + n])


def rest_world(p):
    """Rest world matrix of every node in the glb (converted back to Blender coordinates), by name"""
    g = glb_json(p)
    nodes = g['nodes']
    parent = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
    local = []
    for n in nodes:
        t = Vector(n.get('translation', (0, 0, 0))); r = n.get('rotation', (0, 0, 0, 1)); s = Vector(n.get('scale', (1, 1, 1)))
        local.append(Matrix.LocRotScale(t, Quaternion((r[3], r[0], r[1], r[2])), s))
    memo = {}

    def world(i):
        if i not in memo:
            memo[i] = (world(parent[i]) @ local[i]) if i in parent else local[i]
        return memo[i]
    return {n.get('name'): C.inverted() @ world(i) @ C for i, n in enumerate(nodes)}


def do_import(path, prefix=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    if prefix:
        for o in new:
            o.name = prefix + o.name
    return new


# ---------- Clip (hierarchy of empties) ----------
meta = {}
if CLIP != '-':
    idx = {m['id']: m for m in cfg.load_json(cfg.APP_ASSETS / 'anims' / 'index.json')}
    meta = idx.get(CLIP) or cfg.load_json(cfg.RAW_CLIPS / 'meta' / f'{CLIP}.json')
    do_import(str(cfg.RAW_CLIPS / f'{CLIP}.glb'), 'A:')   # Blender's importer doesn't support meshopt, so use the same clip before compression

# ---------- Model and props ----------
models = [(MODEL, rest_world(MODEL))]
for p in meta.get('props', []):
    pp = str(cfg.APP_ASSETS / 'props' / f'{p}.glb')
    models.append((pp, rest_world(pp)))
arms = []
for path, rw in models:
    new = do_import(path)
    for o in new:
        if o.type == 'ARMATURE':
            arms.append((o, rw))
        if o.type == 'MESH' and o.name in meta.get('hide', []):
            o.hide_render = True
bpy.context.view_layer.update()


def follow(owner_matrix, node_name, rw, bone=None, arm=None):
    tgt = bpy.data.objects.get('A:' + node_name)
    if tgt is None:
        print('WARN node missing from the clip', node_name); return
    corr = rw[node_name].inverted() @ owner_matrix
    e = bpy.data.objects.new('C:' + node_name, None)
    sc.collection.objects.link(e)
    e.parent = tgt; e.matrix_parent_inverse = Matrix.Identity(4); e.matrix_basis = corr
    if bone:
        c = arm.pose.bones[bone].constraints.new('COPY_TRANSFORMS')
    else:
        c = arm.constraints.new('COPY_TRANSFORMS')
    c.target = e


if CLIP != '-':
    for arm, rw in arms:
        follow(arm.matrix_world.copy(), arm.name.split('.')[0], rw, arm=arm)
        for b in arm.data.bones:
            follow(arm.matrix_world @ b.matrix_local, b.name, rw, bone=b.name, arm=arm)

# ---------- Numeric check: world position of the head bone at frame 0 ----------
sc.frame_set(0)
rig = next(o for o, _ in arms if o.name == 'rig')
head = rig.matrix_world @ rig.pose.bones['def_c_head'].head
nose = rig.matrix_world @ rig.pose.bones['def_c_noseTip' if 'def_c_noseTip' in rig.pose.bones else 'def_c_noseMid'].head
print('CHECK head_blender', tuple(round(x, 3) for x in head), 'nose', tuple(round(x, 3) for x in nose))
for arm, _ in arms[1:]:
    for b in arm.pose.bones[:3]:
        print('CHECK prop', b.name, tuple(round(x, 3) for x in arm.matrix_world @ b.head))

# ---------- Lights, camera ----------
face = Vector((nose.x - head.x, nose.y - head.y, 0)).normalized()
face.rotate(Quaternion((0, 0, 1), math.radians(YAW)))
world = bpy.data.worlds.new('w'); sc.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.18, 0.19, 0.21, 1); bg.inputs[1].default_value = 0.35


def light(name, energy, pos, size, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = size; ld.color = color
    o = bpy.data.objects.new(name, ld); sc.collection.objects.link(o)
    o.location = pos
    o.rotation_euler = (Vector((0, 0, 1.2)) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()


side = Vector((-face.y, face.x, 0))
light('key', 600, tuple(face * 2.5 + side * 2.0 + Vector((0, 0, 2.8))), 1.5, (1, 0.96, 0.9))
light('fill', 180, tuple(face * 2.5 - side * 2.5 + Vector((0, 0, 1.4))), 2.5, (0.85, 0.9, 1))
light('rim', 700, tuple(-face * 2.5 - side * 0.8 + Vector((0, 0, 2.6))), 1.2)
cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam


def place_camera():
    '''Re-aim for every render time: full body aims at the hips, close-up at the head (along the current facing)'''
    hd = rig.matrix_world @ rig.pose.bones['def_c_head'].head
    hips = rig.matrix_world @ rig.pose.bones['def_c_hip'].head
    if CLOSE:
        ns = rig.matrix_world @ rig.pose.bones['def_c_noseTip' if 'def_c_noseTip' in rig.pose.bones else 'def_c_noseMid'].head
        fd = Vector((ns.x - hd.x, ns.y - hd.y, 0)).normalized()
        fd.rotate(Quaternion((0, 0, 1), math.radians(YAW)))
        cam_d.lens = 85
        look = hd + Vector((0, 0, 0.04)); cam.location = look + fd * 1.1 + Vector((0, 0, 0.05))
    else:
        cam_d.lens = 50
        look = Vector((hips.x, hips.y, 0.95)); cam.location = look + face * 4.6 + Vector((0, 0, 0.25))
    cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()


r = sc.render
try:
    r.engine = 'BLENDER_EEVEE'
except TypeError:
    r.engine = 'BLENDER_EEVEE_NEXT'
r.resolution_x, r.resolution_y = (900, 900) if CLOSE else (900, 1200)
r.film_transparent = False
sc.view_settings.view_transform = 'AgX'
for t in TIMES:
    f = int(round(t * cfg.FPS))
    sc.frame_set(f)
    place_camera()
    r.filepath = os.path.join(OUT, f'{TAG}_{"close" if CLOSE else "full"}_{t:g}s.png')
    bpy.ops.render.render(write_still=True)
    print('RENDER', r.filepath, flush=True)
