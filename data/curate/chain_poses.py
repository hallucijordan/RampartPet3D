# Can two clips be joined directly: compares the last frame of A with the first frame of B (independent of facing), and finds the best enter / exit times inside the base pose loops.
# Usage: blender -b <anims.blend> --python chain_poses.py -- <actions.json> <output json>
# actions.json: {"clips": [action...], "bases": [action...]} (bases are loopable idle base poses, compared frame by frame)
# distance = mean local rotation difference of 22 core bones (excluding hip facing) in degrees + hip height difference (cm) / 2; facing difference and horizontal hip offset are listed separately and can be compensated at render time
import bpy, json, sys, math
import numpy as np
from mathutils import Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
cfg = json.load(open(argv[0], encoding='utf-8'))
sc = bpy.context.scene
rig = bpy.data.objects['rig']
for o in bpy.data.objects:
    if o is not rig:
        o.hide_viewport = True
PB = rig.pose.bones
MW = rig.matrix_world
R3 = MW.to_3x3().normalized()
BONES = ['def_c_spineA', 'def_c_spineB', 'def_c_spineC', 'def_c_neckA', 'def_c_neckB', 'def_c_head'] + \
        [f'def_{s}_{b}' for s in 'lr' for b in ('clav', 'shoulder', 'elbow', 'wrist', 'thigh', 'knee', 'ankle', 'ball')]


def pose():
    lt, rt = (MW @ PB['def_l_thigh'].matrix).translation, (MW @ PB['def_r_thigh'].matrix).translation
    left = lt - rt
    yaw = math.atan2(left.y, left.x)  # angle of the left direction; facing = this - 90°
    qh = (R3 @ PB['def_c_hip'].matrix.to_3x3()).to_quaternion()
    q = [Quaternion((0, 0, 1), -yaw) @ qh] + [(PB[b].parent.matrix.inverted() @ PB[b].matrix).to_quaternion() for b in BONES]
    hip = (MW @ PB['def_c_hip'].matrix).translation
    return np.array([tuple(x) for x in q]), float(hip.z), math.degrees(yaw), (hip.x, hip.y)


def sample(name, frames=None):
    act = bpy.data.actions[name]
    rig.animation_data.action = act
    if act.slots and rig.animation_data.action_slot is None:
        rig.animation_data.action_slot = act.slots[0]
    s, e = (int(round(v)) for v in act.frame_range)
    out = []
    for f in (frames if frames is not None else range(s, e + 1)):
        sc.frame_set(f)
        out.append(pose())
    return out, s, e


def dist(a, b):
    qa, ha = a[0], a[1]; qb, hb = b[0], b[1]
    ang = np.degrees(2 * np.arccos(np.abs((qa * qb).sum(-1)).clip(0, 1)))
    return float(ang.mean() + abs(ha - hb) * 100 / 2)


ends = {}
for a in cfg['clips']:
    act = bpy.data.actions[a]
    s, e = (int(round(v)) for v in act.frame_range)
    p, _, _ = sample(a, [s, e])
    ends[a] = p
names = cfg['clips']
M = [[round(dist(ends[a][1], ends[b][0]), 1) for b in names] for a in names]
facing = [[round(((ends[b][0][2] - ends[a][1][2] + 180) % 360) - 180, 1) for b in names] for a in names]

bases = {}
for b in cfg['bases']:
    seq, s, e = sample(b)
    fps = 30.0
    res = {}
    for a in names:
        if a == b:
            continue
        din = [dist(x, ends[a][0]) for x in seq]    # base frame i -> clip first frame
        dout = [dist(ends[a][1], x) for x in seq]   # clip last frame -> base frame i
        i, j = int(np.argmin(din)), int(np.argmin(dout))
        res[a] = dict(enter_at_s=round(i / fps, 2), enter_deg=round(din[i], 1), exit_to_s=round(j / fps, 2), exit_deg=round(dout[j], 1))
    bases[b] = res
    print('BASE', b, flush=True)
json.dump(dict(clips=names, end_to_start_deg=M, facing_delta_deg=facing, bases=bases,
               note='end_to_start_deg[i][j] = pose difference from the last frame of clip i to the first frame of clip j (degrees; <6 can mostly hard-cut, <15 use a 0.3 s crossfade); '
                    'facing_delta_deg is the start facing of j minus the end facing of i; rotate the root to compensate at render time'),
          open(argv[1], 'w', encoding='utf-8'), ensure_ascii=False)
print('DONE')
