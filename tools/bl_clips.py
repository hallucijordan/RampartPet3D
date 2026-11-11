# Blender: apply the actions in anims.blend to the base-skin rig and export each as an animation-only glb (plus the skeleton animation of paired props)
# Usage: blender -b rampart_base.blend --python bl_clips.py -- <actions.json>
# Output: cfg.RAW_CLIPS/<clip_id>.glb and cfg.RAW_CLIPS/meta/<clip_id>.json
#
# Coordinate conventions (see README):
#   the anims.blend skeleton is as in the game: Y up, inches, root bone jx_c_delta has an identity rest pose and stands up via the +90°X root rotation in the actions;
#   the base-skin blend's skeleton is already converted to Z up, meters (rest pose = RotX(90°) × scale, raised by 1 cm).
#   So: location curves × 0.0254; the root bone's basis is left-multiplied by inv(base-skin root rest matrix), other bones' bases are usable as is.
import bpy, sys, os, math, time
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from bpy_extras import anim_utils
sys.path.insert(0, os.path.dirname(__file__))
import cfg

WANT = cfg.load_json(sys.argv[sys.argv.index('--') + 1])
PP = cfg.load_json(cfg.ANIMS_DIR / 'prop_pairs.json')
PAIRS, ATTACH = PP['pairs'], PP['attach_bones']
os.makedirs(cfg.RAW_CLIPS / 'meta', exist_ok=True)
bpy.context.preferences.edit.use_global_undo = False
sc = bpy.context.scene
sc.render.fps, sc.render.fps_base = cfg.FPS, 1.0
ROOT = 'jx_c_delta'

rig = bpy.data.objects['rig']
for o in list(bpy.data.objects):
    if o.type == 'MESH':
        bpy.data.objects.remove(o)


# ---------- Union skeleton: add the bones only the HP skin has (ribbons), so the same clip files also drive rampart_hp.glb ----------
def add_hp_bones():
    with bpy.data.libraries.load(str(cfg.SKINS['hp']['blend']), link=False) as (src, dst):
        dst.objects = ['rig']
    hp = next(o for o in bpy.data.objects if o.name.startswith('rig.') and o.type == 'ARMATURE')
    extra = [b for b in hp.data.bones if b.name not in rig.data.bones]
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    for b in extra:  # bones are in hierarchy order, parents created first; keep the rest transform relative to the parent identical to HP
        m = eb[b.parent.name].matrix @ b.parent.matrix_local.inverted() @ b.matrix_local
        e = eb.new(b.name)
        e.head = (0, 0, 0); e.tail = (0, b.length, 0); e.matrix = m
        e.parent = eb[b.parent.name]
    bpy.ops.object.mode_set(mode='OBJECT')
    arm_data = hp.data
    bpy.data.objects.remove(hp); bpy.data.armatures.remove(arm_data)
    return [b.name for b in extra]


HP_EXTRA = add_hp_bones()
C_ROOT = rig.data.bones[ROOT].matrix_local.inverted()      # anims root bone rest = identity (verified)
RIG_BONES = set(rig.data.bones.keys())
# Facial bones = all descendants of def_c_neckB except the head bone, ponytail and ribbons
FACE = {b.name for c in rig.data.bones['def_c_neckB'].children
        if not c.name.startswith(('def_c_head', 'def_c_ponytail', 'def_c_upperRibbon', 'def_c_lowerRibbon'))
        for b in [c] + list(c.children_recursive)}


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)


# ---------- Reading actions: sampled points / keyframes -> numpy (fr are frame numbers in the source action, may be fractional) ----------
def read_action(act, fr):
    cb = anim_utils.action_get_channelbag_for_slot(act, act.slots[0])
    bones = {}
    for fc in cb.fcurves:
        dp = fc.data_path
        if not dp.startswith('pose.bones["'):
            continue
        bone, prop = dp.split('"')[1], dp.rsplit('.', 1)[1]
        if prop not in ('location', 'rotation_quaternion', 'scale'):
            continue
        n = len(fc.sampled_points)
        if n:
            co = np.empty(n * 2, np.float32); fc.sampled_points.foreach_get('co', co); co = co.reshape(-1, 2)
            v = np.interp(fr, co[:, 0], co[:, 1])
        elif len(fc.keyframe_points) > 1:
            v = np.array([fc.evaluate(f) for f in fr])
        else:
            v = np.full(len(fr), fc.evaluate(fr[0]))
        d = bones.setdefault(bone, {})
        d.setdefault(prop, {})[fc.array_index] = v
    out = {}
    for bone, d in bones.items():
        n = len(fr)
        loc = np.stack([d.get('location', {}).get(i, np.zeros(n)) for i in range(3)], 1)
        q = np.stack([d.get('rotation_quaternion', {}).get(i, np.full(n, 1.0 if i == 0 else 0.0)) for i in range(4)], 1)
        sc_ = np.stack([d.get('scale', {}).get(i, np.ones(n)) for i in range(3)], 1) if 'scale' in d else None
        out[bone] = [loc * cfg.INCH, q, sc_]
    return out


def fix_root(ch):
    loc, q, _ = ch
    for i in range(len(loc)):
        m = C_ROOT @ Matrix.LocRotScale(Vector(loc[i]), Quaternion(q[i]), None)
        l2, q2, _ = m.decompose()
        loc[i] = l2; q[i] = q2


def continuity(q):
    for i in range(1, len(q)):
        if np.dot(q[i], q[i - 1]) < 0:
            q[i] = -q[i]


def loop_test(ch):
    """Do the ends meet: last->first change <= 2.5x the neighboring-frame change (or within 1.5° / 1 cm) -> loop
    (import dropped the final frame identical to the first, so looping clips need it back). Body only: lips chewing gum often don't loop along, camera bones don't count either"""
    rot_gap = rot_step = pos_gap = pos_step = 0.0
    ang = lambda a, b: 2 * math.acos(min(1.0, abs(float(np.dot(a, b)))))
    for b, (loc, q, _) in ch.items():
        if b in FACE or b.startswith('jx_c_'):
            continue
        if len(q) < 3:
            return False, 0.0
        rot_gap = max(rot_gap, ang(q[-1], q[0])); rot_step = max(rot_step, ang(q[-1], q[-2]))
        pos_gap = max(pos_gap, float(np.abs(loc[-1] - loc[0]).max())); pos_step = max(pos_step, float(np.abs(loc[-1] - loc[-2]).max()))
    ok = rot_gap <= max(2.5 * rot_step, math.radians(1.5)) and pos_gap <= max(2.5 * pos_step, 0.01)
    return ok, rot_gap


TRIMMED = set()   # actions whose bad last frame was removed (written to the metadata as trimmed_last)


def bad_last_frame(ch):
    """Is the last frame bad: for a body bone (not the jx_c_ root chain or the face) the last step is more than 3x the largest earlier step, and rotates > 30° or moves > 10 cm.
    The action library restored the last frames lost during extraction; in some clips the last frame is a transition jumping to another pose (real loops have a smooth last step, so they aren't misjudged)"""
    ang = lambda a, b: 2 * math.degrees(math.acos(min(1.0, abs(float(np.dot(a, b))))))
    for b, (loc, q, _) in ch.items():
        if b in FACE or b.startswith('jx_c_') or len(q) < 6:
            continue
        rs = [ang(q[i], q[i + 1]) for i in range(len(q) - 1)]
        if rs[-1] > 30 and rs[-1] > 3 * max(rs[:-1]):
            return True
        ps = np.linalg.norm(np.diff(loc, axis=0), axis=1)
        if ps[-1] > 0.10 and ps[-1] > 3 * ps[:-1].max():
            return True
    return False


def write_action(name, ch, prefix='', obj=None):
    """ch: bone name -> [loc, quat, scale|None]; obj: the object's own (loc, quat, scale) track"""
    act = bpy.data.actions.new(name)
    slot = act.slots.new('OBJECT', 'rig')
    cb = anim_utils.action_ensure_channelbag_for_slot(act, slot)
    items = [(f'pose.bones["{prefix}{b}"].', prefix + b, v) for b, v in ch.items()]
    if obj is not None:
        items.append(('', 'object', obj))
    for path, group, (loc, q, scl) in items:
        n = len(loc)
        fr = np.arange(n, dtype=np.float32)
        for prop, arr in (('location', loc), ('rotation_quaternion', q), ('scale', scl)):
            if arr is None:
                continue
            for i in range(arr.shape[1]):
                fc = cb.fcurves.new(path + prop, index=i, group_name=group)
                fc.keyframe_points.add(n)
                fc.keyframe_points.foreach_set('co', np.column_stack([fr, arr[:, i].astype(np.float32)]).ravel())
                fc.update()
    return act, slot


def prep_char(act_name):
    """Character action: locations to meters, root correction, single-frame poses padded to two frames. Returns (ch, frame count, loops, end gap)
    (the old HP action library lacked the last frame of every clip and looping clips got the first frame appended here; the base-skin library is fixed at the source, so no padding, or the seam would repeat a frame)"""
    src = bpy.data.actions[act_name]
    s, e = (int(round(v)) for v in src.frame_range)
    ch = read_action(src, np.arange(s, e + 1, dtype=np.float64))
    ch = {b: v for b, v in ch.items() if b in RIG_BONES}
    if ROOT in ch:
        fix_root(ch[ROOT])
    for v in ch.values():
        continuity(v[1])
    if bad_last_frame(ch):
        # The last frame is a transition to another pose (e.g. the "get up" clip jumps back to its first pose, left arm / right ankle turn 35-82° in one frame, and the ends match so it was taken for a loop): drop it, then test the loop
        for v in ch.values():
            v[0] = v[0][:-1]; v[1] = v[1][:-1]
            if v[2] is not None:
                v[2] = v[2][:-1]
        e -= 1
        TRIMMED.add(act_name)
    loop, gap = loop_test(ch)
    if e == s:   # single-frame static pose: add a copy of the same frame (duration 1/30 s)
        for v in ch.values():
            v[0] = np.vstack([v[0], v[0][[-1]]]); v[1] = np.vstack([v[1], v[1][[-1]]])
            if v[2] is not None:
                v[2] = np.vstack([v[2], v[2][[-1]]])
    n = len(next(iter(ch.values()))[0])
    return ch, n, loop, gap


def prep_prop(act_name, n, ts, loop, bones_ok, prefix, model='', start=0):
    """Resample a prop action on the character's timeline: prop frame = (character frame − start) ÷ time_scale, holding the first frame before start and the last frame past the end;
    when looping, unstretched and starting at 0, the last frame returns to the first"""
    src = bpy.data.actions[act_name]
    s = src.frame_range[0]
    fr = s + np.maximum(np.arange(n, dtype=np.float64) - start, 0) / ts
    if loop and abs(ts - 1) < 1e-6 and not start:
        fr[-1] = s
    ch = read_action(src, fr)
    ch = {b: v for b, v in ch.items() if prefix + b in bones_ok}
    if model in ROOT_STD_PROPS:
        # The root chain jx_c_origin∘jx_c_start of lobby prop actions carries a static scene offset (gunrev: jx_c_start moves −128 inches + 180° about Y,
        # dropping the prop 3.25 m behind her; in weld / select_idle the two bones' offsets cancel out). In the game prop and character align on jx_c_ref,
        # so a static root chain is always normalized: origin = +90°X (Y up -> Z up), start = identity
        for b, q0 in (('jx_c_origin', (math.sqrt(0.5), math.sqrt(0.5), 0, 0)), ('jx_c_start', (1, 0, 0, 0))):
            if b in ch and np.ptp(ch[b][0], 0).max() < 1e-4 and np.ptp(ch[b][1], 0).max() < 1e-4:
                ch[b][0][:] = 0; ch[b][1][:] = q0
    for v in ch.values():
        continuity(v[1])
    return ch


# ---------- Prop skeletons ----------
PROPS = {}   # short name -> armature object (each variant of a model has its own skeleton with a different bone prefix)
PROP_LOCAL = Matrix.Rotation(math.radians(-90), 4, 'X')   # local rotation of the prop armature object relative to the attach bone
# Prop actions broken at extraction: the tripod action of the heirloom idle is a placeholder (gun bones all at the origin, root chain rotated 120°), so it is left out
# (the "only 1 frame" of the heirloom wrench wrench/rampartwrench_gladcard_animated_heirloom[_idle] is correct: the wrench model carries a copy of the character skeleton
#  and the game follows the character's ja_c_propGun via bone merging. Exported normally; at runtime character.js fixProps places it by bone merging)
BROKEN_PROP_ACTIONS = {'turret/prop_rampart_turret_gladcard_animated_heirloom_idle'}
ROOT_STD_PROPS = {'rampart_turret_lobby'}   # normalize the static root chain offset (see prep_prop)
# Tripod check (see tripod_mode): foot-end bones, foot-end height at rest
TRIPOD = 'turret_lobby'
TRIPOD_FEET = ('def_l_leg_end', 'def_r_leg_end', 'def_c_leg_bot_end')
TRIPOD_REST_FOOT = 0.0635


def get_prop(model, short=None):
    short = short or cfg.prop_short(model)
    if short in PROPS:
        return PROPS[short]
    before = set(bpy.data.objects)
    with bpy.data.libraries.load(str(cfg.ANIMS_BLEND), link=False) as (src, dst):
        dst.objects = ['rig_' + model]
    arm = bpy.data.objects['rig_' + model]
    for o in set(bpy.data.objects) - before - {arm}:     # the HP rig etc. pulled in by Child Of constraints
        d = o.data
        bpy.data.objects.remove(o)
        if d and d.users == 0 and isinstance(d, bpy.types.Armature):
            bpy.data.armatures.remove(d)
    sc.collection.objects.link(arm)
    for c in list(arm.constraints):
        arm.constraints.remove(c)
    arm.animation_data_clear()
    arm.matrix_world = Matrix.Identity(4)
    arm.data.transform(Matrix.Scale(cfg.INCH, 4))
    for b in arm.data.bones:
        b.name = f'{short}__{b.name}'
    arm.name = f'{short}__rig'
    arm.rotation_mode = 'QUATERNION'
    PROPS[short] = arm
    return arm


def tripod_mode(arm, n):
    """Does the tripod turret_lobby stand correctly in this clip. Returns ('lift', meters) / ('gun_only', 0) / (None, 0)
    - lift: all three feet stay at the same height and don't move (standing firmly on flat ground), but that ground isn't at y=0 (the scene floor of the
      static banner poses fireaway / sittinggun is around −0.2 m) -> raise character and props together until the tripod is on the floor
    - gun_only: the foot ends go more than 8 cm below the floor and it isn't flat ground as above (in lobby / revup she carries Sheila, the tripod is rigidly attached
      to the gun body with no animation of its own, and the game doesn't show the tripod then) -> switch to the gun-only prop variant turret_gun"""
    fr = sorted(set(range(0, n, 2)) | {n - 1})
    arm.hide_viewport = False; arm.hide_set(False)   # prop armatures appended from anims.blend are hidden in the viewport by default, and hidden objects aren't evaluated
    P = np.zeros((len(fr), len(TRIPOD_FEET), 3))
    for i, f in enumerate(fr):
        sc.frame_set(f)
        for k, b in enumerate(TRIPOD_FEET):
            P[i, k] = arm.matrix_world @ arm.pose.bones[f'{TRIPOD}__{b}'].head
    z = P[:, :, 2]
    print(f'TRIPOD feet z min {z.min():.3f} max {z.max():.3f} spread {(z.max(1) - z.min(1)).max():.3f} move {np.abs(P - P[0]).max():.3f}', flush=True)
    flat = (z.max(1) - z.min(1)).max() < 0.03 and np.abs(P - P[0]).max() < 0.02
    if flat and abs(TRIPOD_REST_FOOT - z.mean()) > 0.05:
        return 'lift', float(TRIPOD_REST_FOOT - z.mean())
    if z.min() < -0.08:
        return 'gun_only', 0.0
    return None, 0.0


def lift_all(act, props_acts, h):
    """Raise the whole clip (character root bone + all prop object tracks) vertically by h meters"""
    v = rig.matrix_world.to_3x3().inverted() @ Vector((0, 0, h))            # lift in armature space
    dl = (C_ROOT @ Matrix.Translation(v) @ C_ROOT.inverted()).to_translation()   # converted to root-bone pose space
    cb = anim_utils.action_get_channelbag_for_slot(act, act.slots[0])
    for fc in cb.fcurves:
        if fc.data_path == f'pose.bones["{ROOT}"].location':
            for kp in fc.keyframe_points:
                kp.co.y += dl[fc.array_index]
            fc.update()
    for pa in props_acts:
        cb = anim_utils.action_get_channelbag_for_slot(pa, pa.slots[0])
        for fc in cb.fcurves:
            if fc.data_path == 'location' and fc.array_index == 2:
                for kp in fc.keyframe_points:
                    kp.co.y += h
                fc.update()


def load_actions(names):
    have = set(bpy.data.actions.keys())
    need = [n for n in dict.fromkeys(names) if n not in have]   # de-duplicate: appending the same action twice in one load crashes Blender
    if need:
        with bpy.data.libraries.load(str(cfg.ANIMS_BLEND), link=False) as (src, dst):
            avail = set(src.actions)
            dst.actions = [n for n in need if n in avail]


def mat_track(ms):
    loc = np.array([m.to_translation() for m in ms]); q = np.array([m.to_quaternion() for m in ms])
    scl = np.array([m.to_scale() for m in ms])
    continuity(q)
    return [loc, q, scl]


def export_clip(name):
    t0 = time.time()
    cid = cfg.clip_id(name)
    pairs = [p for p in PAIRS.get(name, []) if p.get('model') and p.get('action') not in BROKEN_PROP_ACTIONS]
    dropped = [cfg.prop_short(p['model']) for p in PAIRS.get(name, []) if p.get('action') in BROKEN_PROP_ACTIONS]
    load_actions([name] + [p['action'] for p in pairs if p.get('action')])
    if name not in bpy.data.actions:
        return {'id': cid, 'skip': 'action not found'}
    src = bpy.data.actions[name]
    cb = anim_utils.action_get_channelbag_for_slot(src, src.slots[0])
    if not any(fc.data_path.startswith('pose.bones["def_c_hip"]') for fc in cb.fcurves):
        return {'id': cid, 'skip': 'does not drive the character skeleton (an animation of the prop / weapon itself)'}
    ch, n, loop, gap = prep_char(name)
    act, slot = write_action('x_' + name, ch)
    reset_pose(rig)
    rig.animation_data_create(); rig.animation_data.action = act; rig.animation_data.action_slot = slot
    for arm in PROPS.values():
        arm.animation_data_clear(); arm.hide_render = True; reset_pose(arm)
    sc.frame_start, sc.frame_end = 0, n - 1
    # Evaluate per frame: world matrices of the attach bones (prop object tracks), root bone, hip bone
    att = {ATTACH[p['attach']] for p in pairs}
    frames = range(n) if att else sorted(set(range(0, n, 5)) | {n - 1})
    mats = {b: [] for b in att}
    root_s, hip_s = [], []
    for f in frames:
        sc.frame_set(f)
        for b in att:
            mats[b].append(rig.matrix_world @ rig.pose.bones[b].matrix @ PROP_LOCAL)
        root_s.append(rig.matrix_world @ rig.pose.bones[ROOT].matrix)
        hip_s.append(rig.matrix_world @ rig.pose.bones['def_c_hip'].matrix)
    # Props: object track = attach bone × local -90° about X ('transform' in prop_pairs.json from the extraction step), bone actions resampled on the character's timeline
    used, detail, tmp = [], [], [act]
    for p in pairs:
        arm = get_prop(p['model'])
        short = cfg.prop_short(p['model'])
        ts = p.get('time_scale', 1.0)
        # Character frames where the prop appears / disappears (AE_CL_CREATE_PROP / DESTROY_PROP events in the RSEQ, written to prop_pairs by the extraction step); hidden outside that range at runtime
        f0, f1 = p.get('start_frame', 0), p.get('end_frame')
        bch = {}
        if p.get('action') and p['action'] in bpy.data.actions:
            bch = prep_prop(p['action'], n, ts, loop, set(arm.data.bones.keys()), short + '__', p['model'], f0)
        else:
            # No prop action in the game (a weapon held still in the hand): rotate the root bone +90°X like the weapon idle (wturret/w_idle), otherwise it lies flat
            q90 = np.tile([math.sqrt(0.5), math.sqrt(0.5), 0, 0], (n, 1))
            bch = {b.name[len(short) + 2:]: [np.zeros((n, 3)), q90.copy(), None] for b in arm.data.bones if b.parent is None}
        otr = mat_track(mats[ATTACH[p['attach']]])
        pa, pslot = write_action('x_' + short, bch, short + '__', obj=otr)
        ad = arm.animation_data_create(); ad.action = pa; ad.action_slot = pslot
        arm.hide_render = False
        used.append(arm); tmp.append(pa)
        detail.append({'name': short, 'model': p['model'], 'attach': ATTACH[p['attach']], 'time_scale': ts,
                       'animated': bool(p.get('action') and p['action'] in bpy.data.actions)})
        if f0 or f1 is not None:
            detail[-1]['show_s'] = [round(f0 / cfg.FPS, 4), round(f1 / cfg.FPS, 4) if f1 is not None else None]
        if short == TRIPOD:
            mode, h = tripod_mode(arm, n)
            if mode == 'lift':
                lift_all(act, tmp[1:], h)   # character root bone + the prop object tracks written so far
                for m_ in [m_ for b in att for m_ in mats[b]] + root_s + hip_s:   # later props and the metadata use the raised attach points
                    m_[2][3] += h
                detail[-1]['lift_m'] = round(h, 3)
            elif mode == 'gun_only':
                # Same bone action, switched to the variant with only the gun body meshes (bone prefix turret_gun__, prop glb see cfg.PROP_VARIANTS)
                arm.animation_data_clear(); arm.hide_render = True
                g = get_prop(p['model'], 'turret_gun')
                pa, pslot = write_action('x_turret_gun', bch, 'turret_gun__', obj=otr)
                ad = g.animation_data_create(); ad.action = pa; ad.action_slot = pslot
                g.hide_render = False
                used[-1] = g; tmp.append(pa)
                detail[-1]['name'] = 'turret_gun'
    # Export
    bpy.ops.object.select_all(action='DESELECT')
    for o in [rig] + used:
        o.hide_set(False); o.hide_viewport = False; o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = str(cfg.RAW_CLIPS / f'{cid}.glb')
    sc.name = cid
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_animations=True, export_animation_mode='SCENE', export_anim_scene_split_object=False,
        export_force_sampling=True, export_frame_range=True, export_frame_step=1,
        export_optimize_animation_size=False, export_optimize_animation_keep_anim_armature=True,
        export_optimize_animation_keep_anim_object=True, export_bake_animation=False,
        export_anim_slide_to_zero=True, export_reset_pose_bones=True, export_rest_position_armature=True,
        export_skins=False, export_materials='NONE', export_def_bones=False, export_leaf_bone=False,
        export_morph=False, export_cameras=False, export_lights=False, export_extras=False)
    # Root motion, hip trajectory (glTF coordinates: x, z, -y)
    to_gl = lambda v: [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]
    r0, r1, h0, h1 = root_s[0], root_s[-1], hip_s[0], hip_s[-1]
    d = r1.translation - r0.translation
    rel = r1.to_3x3() @ r0.to_3x3().transposed()
    yaw = math.degrees(math.atan2(rel[1][0], rel[0][0]))
    hip_far = max(math.hypot(h.translation.x - h0.translation.x, h.translation.y - h0.translation.y) for h in hip_s)
    for arm in used:
        arm.hide_render = True; arm.animation_data_clear()
    rig.animation_data.action = None
    for x in tmp:
        bpy.data.actions.remove(x)
    idx = INDEX.get(name.split('#')[0], {})
    meta = {
        'id': cid, 'action': name, 'category': name.split('/')[0],
        'frames': n, 'fps': cfg.FPS, 'duration_s': round((n - 1) / cfg.FPS, 4),
        'loop': bool(loop), 'loop_gap_deg': round(math.degrees(gap), 2), 'trimmed_last': name in TRIMMED,
        'props': [x['name'] for x in detail], 'prop_detail': detail, 'dropped_props': dropped,
        'hide': ['sheila'] if any('turret' in x['model'] for x in detail) else [],
        'root_motion': {'dx': to_gl(d)[0], 'dy': to_gl(d)[1], 'dz': to_gl(d)[2], 'yaw_deg': round(yaw, 2)},
        'hip_start': to_gl(h0.translation), 'hip_end': to_gl(h1.translation), 'hip_max_travel_m': round(hip_far, 3),
        'bones_animated': len(ch), 'additive': bool(idx.get('additive', False)),
        'src_frames': idx.get('frames'), 'part': int(name.split('#')[1]) if '#' in name else 0,
    }
    cfg.save_json(cfg.RAW_CLIPS / 'meta' / f'{cid}.json', meta)
    print(f'CLIP {cid} frames={n} loop={loop} props={meta["props"]} {time.time() - t0:.1f}s', flush=True)
    return meta


INDEX = {f"{e['category']}/{e['name']}": e for e in cfg.load_json(cfg.ANIMS_DIR / 'index.json')}
MIN_PART_FRAMES = 4
PROP_ACTS = {p['action'] for v in PAIRS.values() for p in v if p.get('action')}
skips = []
CHUNK = 20   # source actions are appended from anims.blend in batches and deleted after use, to keep memory down
for c0 in range(0, len(WANT), CHUNK):
    chunk = WANT[c0:c0 + CHUNK]
    load_actions(chunk + [p['action'] for nm in chunk for p in PAIRS.get(nm, []) if p.get('action')])
    for nm in chunk:
        try:
            a_ = bpy.data.actions.get(nm)
            if a_ is not None and '#' in nm and a_.frame_range[1] - a_.frame_range[0] + 1 < MIN_PART_FRAMES:
                m = {'id': cfg.clip_id(nm), 'skip': 'extra part has only one or two frames (a blend-space sample pose)'}
            else:
                m = export_clip(nm)
            if 'skip' in m:
                skips.append(m); print('WARN skip', nm, m['skip'], flush=True)
        except Exception as ex:
            import traceback
            for line in traceback.format_exc().splitlines():
                print('ERR  ', line.replace('Traceback', 'TB'), flush=True)
            print('ERR', nm, repr(ex), flush=True)
    # Delete the used character source actions; prop actions stay (they are small and shared by many clips, and deleting then re-appending the same ID crashes Blender)
    for a in [a for a in bpy.data.actions if not a.name.startswith('x_') and a.name not in PROP_ACTS]:
        bpy.data.actions.remove(a)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for x in [x for x in blk if x.users == 0]:
            blk.remove(x)
if skips:
    cfg.save_json(cfg.RAW_CLIPS / 'skipped' / f'{os.getpid()}.json', skips)
print('DONE', len(WANT))
