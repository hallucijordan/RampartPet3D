# Renders the picked actions one by one into transparent PNG sequences (EEVEE, three-point lighting, fixed front 3/4 orthographic camera, framed on the whole clip's bounding box).
# Usage: blender -b <anims.blend> --python render_clips.py -- <render_list.json> <frames output root>
# render_list.json: [{action, clip_id, fps, bbox_m:{min,max}, facing_start_deg, out_fps, pairs:bool}]
# Each clip writes <root>/<clip_id>/f_NNNN.png + cam.json (ground projection point, actual frame numbers); clips that already have cam.json are skipped
import bpy, json, os, sys, math
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index('--') + 1:]
LIST, ROOT = argv[0], argv[1]
H = 320
clips = json.load(open(LIST, encoding='utf-8'))
bpy.context.preferences.edit.use_global_undo = False

sc = bpy.context.scene
rig = bpy.data.objects['rig']
_ns = {}
exec(bpy.data.texts['prop_pairs.py'].as_string(), _ns)   # prop visibility, attach points, prop actions (stored in the blend by the extraction step)
apply_pairs = _ns['apply_pairs']
bpy.app.handlers.depsgraph_update_post.clear()           # skip its auto sync; called manually below

# ---------- render settings ----------
r = sc.render
r.engine = 'BLENDER_EEVEE'
sc.eevee.taa_render_samples = 16
r.film_transparent = True
r.resolution_percentage = 100
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
w = sc.world or bpy.data.worlds.new('w'); sc.world = w
w.use_nodes = True
bg = w.node_tree.nodes.get('Background')
bg.inputs[0].default_value = (0.42, 0.43, 0.45, 1); bg.inputs[1].default_value = 0.6

cam_data = bpy.data.cameras.new('clip_cam'); cam_data.type = 'ORTHO'
cam = bpy.data.objects.new('clip_cam', cam_data); sc.collection.objects.link(cam); sc.camera = cam


def light(name, energy, size, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = size; ld.color = color
    ob = bpy.data.objects.new(name, ld); sc.collection.objects.link(ob)
    return ob


KEY = light('key', 900, 3.0, (1.0, 0.96, 0.9))
FILL = light('fill', 300, 4.0, (0.9, 0.95, 1.0))
RIM = light('rim', 700, 2.0, (1.0, 1.0, 1.0))
# for clips with large travel (walk/run) the camera and lights follow the root translation
PIVOT = bpy.data.objects.new('clip_pivot', None); sc.collection.objects.link(PIVOT)
FOLLOW = PIVOT.constraints.new('COPY_LOCATION'); FOLLOW.target = rig; FOLLOW.subtarget = 'jx_c_delta'; FOLLOW.use_z = False
for ob in (cam, KEY, FILL, RIM):
    ob.parent = PIVOT
# prop texture alpha is not a cutout mask (Sheila's tripod turns semi-transparent), so disconnect it for rendering
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.startswith('prop_'):
        for m in o.data.materials:
            for l in [l for l in m.node_tree.links if l.to_socket.name == 'Alpha']:
                m.node_tree.links.remove(l)


def aim(ob, pos, target, origin=Vector()):
    ob.location = pos - origin
    ob.rotation_euler = (target - pos).to_track_quat('-Z', 'Y').to_euler()


def place(c):
    bmin, bmax = Vector(c['bbox_m']['min']), Vector(c['bbox_m']['max'])
    wpos = lambda b: rig.matrix_world @ rig.pose.bones[b].matrix.translation
    root = wpos('jx_c_delta'); root.z = 0
    if c.get('head'):  # head close-up: centered between the eyes
        hp = (wpos('def_l_eyeball') + wpos('def_r_eyeball')) / 2
        bmin, bmax = hp + Vector((-0.2, -0.2, -0.24)), hp + Vector((0.2, 0.2, 0.2))
    if c.get('follow'):
        bmin, bmax = root + Vector((-0.9, -0.9, 0)), root + Vector((0.9, 0.9, 1.9))
    origin = root if c.get('follow') else Vector()
    FOLLOW.mute = not c.get('follow')
    m = c.get('margin', 0.3)
    bmin -= Vector((m, m, 0.05)); bmax += Vector((m, m, m))
    if not c.get('head'):
        bmin.z = min(bmin.z, -0.02)
    center = (bmin + bmax) / 2
    yaw = math.radians(c['facing_start_deg'] + 30)       # front 3/4: turned 30° toward her left
    el = math.radians(8)
    d = Vector((math.sin(yaw) * math.cos(el), -math.cos(yaw) * math.cos(el), math.sin(el)))
    aim(cam, center + d * 12, center, origin)
    R = cam.rotation_euler.to_matrix()   # matrix_world waits for a depsgraph update, so use the Euler angles directly
    right, up = R.col[0], R.col[1]
    corners = [Vector((x, y, z)) for x in (bmin.x, bmax.x) for y in (bmin.y, bmax.y) for z in (bmin.z, bmax.z)]
    xs = [(p - center).dot(right) for p in corners]; ys = [(p - center).dot(up) for p in corners]
    wv, hv = max(xs) - min(xs), max(ys) - min(ys)
    aspect = min(max(wv / hv, 0.7), 1.8)
    r.resolution_y = H; r.resolution_x = int(round(H * aspect / 2)) * 2
    cam_data.ortho_scale = max(wv, hv * aspect) if aspect >= 1 else max(hv, wv / aspect)
    cam_data.shift_x = ((max(xs) + min(xs)) / 2) / cam_data.ortho_scale
    cam_data.shift_y = ((max(ys) + min(ys)) / 2) / cam_data.ortho_scale
    cam_data.clip_end = 40
    for ob, az, elv, dist in ((KEY, -50, 40, 6), (FILL, 55, 10, 6), (RIM, 160, 45, 6)):
        a = yaw + math.radians(az); e = math.radians(elv)
        aim(ob, center + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist, center, origin)


for c in clips:
    out = os.path.join(ROOT, c['clip_id'])
    if os.path.exists(os.path.join(out, 'cam.json')):
        continue
    os.makedirs(out, exist_ok=True)
    act = bpy.data.actions[c['action']]
    rig.animation_data.action = act
    if act.slots and rig.animation_data.action_slot is None:
        rig.animation_data.action_slot = act.slots[0]
    apply_pairs(act.name if c.get('pairs', True) else None)
    sc.frame_set(int(act.frame_range[0]))
    place(c)
    s, e = (int(round(v)) for v in act.frame_range)
    step = max(1, int(round(c['fps'] / c['out_fps'])))
    frames = list(range(s, e + 1, step)) if e > s else [s]
    if c.get('max_frames') and len(frames) > c['max_frames']:
        k = len(frames) / c['max_frames']; frames = [frames[int(i * k)] for i in range(c['max_frames'])]
    sc.frame_start, sc.frame_end = s, max(e, s + 1)
    for f in frames:
        sc.frame_set(f)
        r.filepath = os.path.join(out, f'f_{f:04d}.png')
        bpy.ops.render.render(write_still=True)
    sc.frame_set(s)
    if c.get('follow'):  # the ground projection point follows the root; use the root position at the start frame
        c['hip_start_m'] = list(rig.matrix_world @ rig.pose.bones['jx_c_delta'].matrix.translation)
    g = world_to_camera_view(sc, cam, Vector((c['hip_start_m'][0], c['hip_start_m'][1], 0)))
    json.dump(dict(frames=frames, fps=c['fps'], start=s, ground_px=[g.x * r.resolution_x, (1 - g.y) * r.resolution_y],
                   res=[r.resolution_x, r.resolution_y]), open(os.path.join(out, 'cam.json'), 'w'))
    print('R', c['clip_id'], len(frames), flush=True)
print('DONE')
