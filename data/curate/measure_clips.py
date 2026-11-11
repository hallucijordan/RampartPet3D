# Measures every character action in rampart_hp_anims.blend, for picking clips.
# Usage: blender -b <anims.blend> --python measure_clips.py -- <output dir> [name substring filter]
# Output: <output dir>/<clip_id>.json (summary metrics + 30 fps per-frame curves); existing files are skipped
# Units: meters, degrees, seconds; facing yaw is 0 when "facing -Y (straight at the front camera)", counterclockwise (seen from above) is positive
import bpy, json, os, sys, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
ONLY = argv[1] if len(argv) > 1 else None
os.makedirs(OUT, exist_ok=True)
bpy.context.preferences.edit.use_global_undo = False

ANIMS = os.path.dirname(bpy.data.filepath)
INDEX = {e['name']: e for e in json.load(open(os.path.join(ANIMS, 'index.json'), encoding='utf-8'))}
PAIRS = json.load(open(os.path.join(ANIMS, 'prop_pairs.json'), encoding='utf-8'))['pairs']

sc = bpy.context.scene
rig = bpy.data.objects['rig']
for o in bpy.data.objects:          # evaluate only the main rig, much faster
    if o is not rig:
        o.hide_viewport = True
PB = rig.pose.bones
MW = rig.matrix_world.copy()

MAIN = ['def_c_hip', 'def_c_spineA', 'def_c_spineB', 'def_c_spineC', 'def_c_neckA', 'def_c_neckB', 'def_c_head'] + \
       [f'def_{s}_{b}' for s in 'lr' for b in ('clav', 'shoulder', 'elbow', 'wrist', 'thigh', 'knee', 'ankle', 'ball')]
KEYPTS = ['jx_c_delta', 'def_c_hip', 'def_c_spineC', 'def_c_neckA', 'def_c_head', 'def_c_turret', 'def_c_barrel_base'] + \
         [f'def_{s}_{b}' for s in 'lr' for b in ('clav', 'shoulder', 'elbow', 'wrist', 'finMidC', 'thigh', 'knee', 'ankle', 'ball', 'eyeball')]
FACE_KEYS = ('lip', 'eyelid', 'forehead', 'cheek', 'jaw', 'mouth', 'nasolab', 'nose', 'nostril', 'chin', 'tongue',
             'eyesack', 'masseter', 'teeth')
FACE = [b.name for b in PB if any(k in b.name for k in FACE_KEYS)]
LIMBS = [('def_l_shoulder', 'def_l_elbow'), ('def_l_elbow', 'def_l_wrist'), ('def_r_shoulder', 'def_r_elbow'),
         ('def_r_elbow', 'def_r_wrist'), ('def_l_thigh', 'def_l_knee'), ('def_l_knee', 'def_l_ankle'),
         ('def_r_thigh', 'def_r_knee'), ('def_r_knee', 'def_r_ankle')]
REST_LEN = {a + b: (rig.data.bones[a].head_local - rig.data.bones[b].head_local).length * 0.0254 for a, b in LIMBS}


def clip_id(name):
    return name.replace('/', '__').replace('#', '_p')


def yaw_of(left):  # left: the body's left direction (world XY) -> facing angle
    fx, fy = left.y, -left.x
    return math.degrees(math.atan2(fx, -fy))


def gum_series(act_name, frames):
    """Paired bubble gum prop: scale of bubblegumCore times scale of def_c_base = bubble size"""
    for e in PAIRS.get(act_name, []):
        if e['rig'] != 'rig_rampart_bubblegum' or not e.get('action'):
            continue
        ga = bpy.data.actions.get(e['action'])
        if ga is None:
            return None
        fcs = [fc for L in ga.layers for s in L.strips for cb in s.channelbags for fc in cb.fcurves]
        sc_fc = {(fc.data_path.split('"')[1], fc.array_index): fc for fc in fcs if fc.data_path.endswith('scale')}
        ts = e.get('time_scale', 1.0) or 1.0
        out = []
        for f in frames:
            v = 1.0
            for bone in ('def_c_base', 'bubblegumCore'):
                s = [sc_fc[(bone, i)].evaluate(f / ts) if (bone, i) in sc_fc else 1.0 for i in range(3)]
                v *= sum(s) / 3
            out.append(v)
        return out
    return None


def chew_analysis(x, fps):
    """Finds a 1-4 Hz rhythm in the jaw open/close curve (chewing gum). Returns (chew_ranges_s, mean frequency)"""
    n = len(x)
    win, step = int(3 * fps), int(0.5 * fps)
    if n < win:
        return [], None
    hits, rates = [], []
    for s in range(0, n - win + 1, step):
        w = np.asarray(x[s:s + win]); w = w - np.convolve(w, np.ones(15) / 15, mode='same') if len(w) > 30 else w - w.mean()
        w = w[8:-8]
        amp = w.std()
        if amp < 0.25:  # millimeters
            continue
        ac = np.correlate(w, w, mode='full')[len(w) - 1:]
        ac = ac / (ac[0] + 1e-9)
        lo, hi = int(0.25 * fps), int(1.0 * fps)
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.35:
            hits.append((s, s + win)); rates.append(fps / k)
    ranges = []
    for a, b in hits:
        if ranges and a <= ranges[-1][1]:
            ranges[-1][1] = b
        else:
            ranges.append([a, b])
    return [[round(a / fps, 2), round(b / fps, 2)] for a, b in ranges], (round(float(np.median(rates)), 2) if rates else None)


def ranges_above(vals, thr, fps, min_len=3):
    out, start = [], None
    for i, v in enumerate(list(vals) + [-1e9]):
        if v > thr and start is None:
            start = i
        elif v <= thr and start is not None:
            if i - start >= min_len:
                out.append([round(start / fps, 2), round((i - 1) / fps, 2)])
            start = None
    return out


def quat_dist(Q):  # Q: (N,B,4) -> pairwise mean/max angle difference (degrees)
    d = np.abs(np.einsum('ibk,jbk->ijb', Q, Q)).clip(0, 1)
    ang = np.degrees(2 * np.arccos(d))
    return ang.mean(-1), ang.max(-1)


def measure(act):
    e = INDEX.get(act.name.split('/', 1)[1].split('#')[0], {})
    fps = e.get('fps') or 30.0
    if not (15 <= fps <= 40):
        fps = 30.0  # the 3 fps of walk/run in the index is a playback rate computed from travel; ignore it
    s, en = (int(round(v)) for v in act.frame_range)
    frames = list(range(s, en + 1))
    rig.animation_data.action = act
    if act.slots and rig.animation_data.action_slot is None:
        rig.animation_data.action_slot = act.slots[0]
    P = {b: [] for b in KEYPTS}; Q = []; FQ = []; FT = []; chin = []; lens = []
    for f in frames:
        sc.frame_set(f)
        M = {b: MW @ PB[b].matrix for b in set(KEYPTS)}
        for b in KEYPTS:
            P[b].append(tuple(M[b].translation))
        Q.append([tuple((PB[b].parent.matrix.inverted() @ PB[b].matrix).to_quaternion()) for b in MAIN])
        loc = []
        for b in FACE:
            m = PB[b].parent.matrix.inverted() @ PB[b].matrix
            loc.append((tuple(m.to_quaternion()), tuple(m.translation * 0.0254)))
        FQ.append([l[0] for l in loc]); FT.append([l[1] for l in loc])
        h = PB['def_c_head'].matrix.inverted() @ PB['def_c_chin'].matrix
        chin.append(tuple(h.translation * 0.0254 * 1000))  # millimeters, head space
        lens.append([((MW @ PB[a].matrix).translation - (MW @ PB[b].matrix).translation).length / REST_LEN[a + b] - 1 for a, b in LIMBS])
    N = len(frames)
    P = {b: np.array(v) for b, v in P.items()}
    Q = np.array(Q); Q *= np.sign(np.einsum('nbk,bk->nb', Q, Q[0]))[..., None]  # unify signs
    FQ = np.array(FQ); FT = np.array(FT); chin = np.array(chin)

    # seam: first frame vs last frame
    if N > 1:
        d = np.degrees(2 * np.arccos(np.abs((Q[0] * Q[-1]).sum(-1)).clip(0, 1)))
        seam_mean, seam_max = float(d.mean()), float(d.max())
        hip_rel = P['def_c_hip'] - P['jx_c_delta']
        seam_hip_cm = float(np.linalg.norm(hip_rel[0] - hip_rel[-1]) * 100)
    else:
        seam_mean = seam_max = seam_hip_cm = 0.0

    # best loop sub-range (downsampled to 10 Hz; length at least max(1.2 s, 30%))
    loop = None
    if N >= 45:
        stp = 3 if N > 400 else 1
        idx = np.arange(0, N, stp); Qs = Q[idx]
        Dm, Dx = quat_dist(Qs)
        n = len(idx); k = max(1, int(0.1 * fps / stp))
        minlen = max(int(1.2 * fps / stp), int(0.3 * n))
        best = None
        for i in range(k, n - minlen):
            for j in range(i + minlen, n - k):
                c = (Dm[i, j] + Dm[i - k, j - k] + Dm[i + k, j + k]) / 3 if j + k < n else Dm[i, j]
                if best is None or c < best[0]:
                    best = (c, i, j)
        if best:
            c, i, j = best
            loop = dict(range_s=[round(idx[i] / fps, 2), round(idx[j] / fps, 2)], seam_mean_deg=round(float(Dm[i, j]), 2),
                        seam_max_deg=round(float(Dx[i, j]), 2), cost=round(float(c), 2))

    # root travel, facing
    root, hip = P['jx_c_delta'], P['def_c_hip']
    yaw_hip = np.array([yaw_of(Vector(P['def_l_thigh'][i] - P['def_r_thigh'][i])) for i in range(N)])
    yaw_chest = np.array([yaw_of(Vector(P['def_l_clav'][i] - P['def_r_clav'][i])) for i in range(N)])
    yaw_head = np.array([yaw_of(Vector(P['def_l_eyeball'][i] - P['def_r_eyeball'][i])) for i in range(N)])
    uw = np.degrees(np.unwrap(np.radians(yaw_hip)))
    head_rel = (yaw_head - yaw_chest + 180) % 360 - 180

    # bounding box (bone points + head top estimated at 0.2 m)
    head_up = P['def_c_head'] - P['def_c_neckA']
    head_up /= np.linalg.norm(head_up, axis=1, keepdims=True) + 1e-9
    pts = np.concatenate([P[b] for b in KEYPTS if b != 'jx_c_delta'] + [P['def_c_head'] + head_up * 0.2])
    body_pts = np.concatenate([P[b] for b in KEYPTS if b not in ('jx_c_delta', 'def_c_turret', 'def_c_barrel_base')] + [P['def_c_head'] + head_up * 0.2])

    # posture classification
    hipZ, headZ = hip[:, 2], P['def_c_head'][:, 2]
    footZ = np.minimum(P['def_l_ball'][:, 2], P['def_r_ball'][:, 2])
    torso_up = (P['def_c_neckA'][:, 2] - hipZ) / (np.linalg.norm(P['def_c_neckA'] - hip, axis=1) + 1e-9)
    lab = []
    for i in range(N):
        if footZ[i] > 0.3 and hipZ[i] > 0.6:
            lab.append('airborne')
        elif headZ[i] < 0.75 and torso_up[i] < 0.6:
            lab.append('lying')
        elif hipZ[i] < 0.5 and torso_up[i] > 0.5:
            lab.append('sitting')
        elif hipZ[i] < 0.8:
            lab.append('crouching')
        else:
            lab.append('standing')
    cnt = {k: lab.count(k) / N for k in set(lab)}
    posture = max(cnt, key=cnt.get)

    # facial animation
    ref_q = FQ[0]
    face_rot = np.degrees(2 * np.arccos(np.abs(np.einsum('nbk,bk->nb', FQ, ref_q)).clip(0, 1)))  # (N,B)
    face_tr = np.linalg.norm(FT - FT[0], axis=-1) * 1000  # millimeters
    face_rot_range = float(face_rot.max()) if N > 1 else 0.0
    face_tr_range = float(face_tr.max()) if N > 1 else 0.0
    face_act = (np.abs(np.diff(face_tr, axis=0)).mean(-1) * fps).tolist() if N > 1 else []
    # jaw: chin displacement in head space, projected on the principal direction
    jaw = np.zeros(N)
    if N > 2:
        c = chin - chin.mean(0)
        u = np.linalg.svd(c, full_matrices=False)[2][0]
        jaw = c @ u
        if np.corrcoef(jaw, chin[:, 1])[0, 1] < 0:  # unify sign: roughly "mouth open is positive", the later curve analysis decides
            jaw = -jaw
    chew_ranges, chew_hz = chew_analysis(jaw, fps)
    eyelids = [i for i, b in enumerate(FACE) if 'eyelidUpper' in b and 'Furrow' not in b]
    lid = face_tr[:, eyelids].mean(-1) if eyelids else np.zeros(N)
    blinks = ranges_above(lid, max(0.8, float(np.percentile(lid, 50)) + 0.8), fps, min_len=2) if N > 5 else []

    gum = gum_series(act.name, frames)
    bubble = []
    if gum:
        g = np.array(gum)
        base = float(np.percentile(g, 10))
        bubble = ranges_above(g, base + 0.15 * (g.max() - base) if g.max() - base > 0.05 else 1e9, fps)

    act_speed = np.concatenate([[0], np.degrees(2 * np.arccos(np.abs((Q[1:] * Q[:-1]).sum(-1)).clip(0, 1))).mean(-1) * fps]) if N > 1 else np.zeros(1)
    wrist_over_head = np.maximum(P['def_l_wrist'][:, 2], P['def_r_wrist'][:, 2]) - headZ
    lens = np.array(lens)

    r2 = lambda v: [round(float(x), 3) for x in v]
    return dict(
        action=act.name, clip_id=clip_id(act.name), frames=N, fps=fps,
        duration_s=round((N - 1) / fps, 3), index_duration_s=e.get('duration_s'), index_frames=e.get('frames'),
        additive=e.get('additive'), loop_seam_deg=dict(mean=round(seam_mean, 2), max=round(seam_max, 2)),
        seam_hip_cm=round(seam_hip_cm, 2), best_loop=loop,
        root_travel_m=dict(zip('xyz', r2(root[-1] - root[0]))),
        root_range_m=dict(zip('xyz', r2(root.max(0) - root.min(0)))),
        hip_travel_m=dict(zip('xyz', r2(hip[-1] - hip[0]))),
        hip_range_m=dict(zip('xyz', r2(hip.max(0) - hip.min(0)))),
        hip_start_m=r2(hip[0]),
        facing_start_deg=round(float(yaw_hip[0]), 1), yaw_deg=round(float(uw[-1] - uw[0]), 1),
        yaw_range_deg=round(float(uw.max() - uw.min()), 1),
        bbox_m=dict(min=r2(pts.min(0)), max=r2(pts.max(0))),
        body_bbox_m=dict(min=r2(body_pts.min(0)), max=r2(body_pts.max(0))),
        posture=posture, posture_mix={k: round(v, 2) for k, v in sorted(cnt.items(), key=lambda x: -x[1])},
        face_rot_range_deg=round(face_rot_range, 2), face_tr_range_mm=round(face_tr_range, 2),
        jaw_range_mm=round(float(jaw.max() - jaw.min()), 2), chew_ranges_s=chew_ranges, chew_hz=chew_hz,
        blink_ranges_s=blinks, bubble_ranges_s=bubble, bubble_max=round(float(max(gum)), 3) if gum else None,
        limb_stretch_pct=round(float(np.abs(lens).max() * 100), 2),
        mean_speed_dps=round(float(act_speed.mean()), 2),
        wrist_over_head_s=round(float((wrist_over_head > 0).sum() / fps), 2),
        props=[p['model'] for p in PAIRS.get(act.name, [])],
        series=dict(  # per-frame curves, for segmenting
            speed=r2(act_speed), hipZ=r2(hipZ), headZ=r2(headZ), footZ=r2(footZ), yaw_hip=r2(yaw_hip),
            head_rel_yaw=r2(head_rel), jaw=r2(jaw), eyelid=r2(lid), face_act=r2(face_act),
            wrist_over_head=r2(wrist_over_head), gum=r2(gum) if gum else None,
            rootX=r2(root[:, 0]), rootY=r2(root[:, 1]), rootZ=r2(root[:, 2]))
    )


def fcurve_bones(a):
    return {fc.data_path.split('"')[1] for L in a.layers for s in L.strips for cb in s.channelbags for fc in cb.fcurves if '"' in fc.data_path}


todo = []
for a in bpy.data.actions:
    cat = a.name.split('/')[0]
    if cat == 'aim' or a.name.endswith('_light') or (ONLY and ONLY not in a.name):
        continue
    if os.path.exists(os.path.join(OUT, clip_id(a.name) + '.json')):
        continue
    nb = len(fcurve_bones(a))
    if nb < 150:  # prop rigs, first-person arms (70 bones), empty actions
        continue
    todo.append(a)
print('TODO', len(todo), flush=True)
for i, a in enumerate(todo):
    try:
        m = measure(a)
    except Exception as ex:  # one failed clip does not stop the others
        m = dict(action=a.name, clip_id=clip_id(a.name), error=repr(ex))
    json.dump(m, open(os.path.join(OUT, clip_id(a.name) + '.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print('M', i, a.name, m.get('frames'), m.get('error', ''), flush=True)
print('DONE')
