# Finds the best loop sub-range inside a given time window (start/end pose and speed both match).
# Usage: blender -b <anims.blend> --python loop_window.py -- <in.json> <out.json>
# in.json: [{"action":..., "window_s":[a,b], "min_len_s":2.0}]; output is the same list in order, plus {loop_range_s, seam_mean_deg, seam_max_deg}
import bpy, json, sys
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
jobs = json.load(open(argv[0], encoding='utf-8'))
sc = bpy.context.scene
rig = bpy.data.objects['rig']
for o in bpy.data.objects:
    if o is not rig:
        o.hide_viewport = True
PB = rig.pose.bones
MAIN = ['def_c_hip', 'def_c_spineA', 'def_c_spineB', 'def_c_spineC', 'def_c_neckA', 'def_c_neckB', 'def_c_head'] + \
       [f'def_{s}_{b}' for s in 'lr' for b in ('clav', 'shoulder', 'elbow', 'wrist', 'thigh', 'knee', 'ankle', 'ball')]
out = []
for j in jobs:
    act = bpy.data.actions[j['action']]
    rig.animation_data.action = act
    if act.slots and rig.animation_data.action_slot is None:
        rig.animation_data.action_slot = act.slots[0]
    fps = j.get('fps', 30.0)
    s0 = int(act.frame_range[0])
    a, b = (int(round(t * fps)) + s0 for t in j['window_s'])
    Q = []
    for f in range(a, b + 1):
        sc.frame_set(f)
        Q.append([tuple((PB[n].parent.matrix.inverted() @ PB[n].matrix).to_quaternion()) for n in MAIN])
    Q = np.array(Q, dtype=np.float32)
    if 'sync_ref_s' in j:  # find all times in the window that "return to the reference pose" (local minima below a threshold), used as jump points in long idles
        r0 = int(round(j['sync_ref_s'] * fps)) + s0 - a
        d = np.degrees(2 * np.arccos(np.abs(np.einsum('bk,jbk->jb', Q[r0], Q)).clip(0, 1))).mean(-1)
        thr = j.get('sync_deg', 4.0)
        pts = [i for i in range(1, len(d) - 1) if d[i] <= d[i - 1] and d[i] <= d[i + 1] and d[i] < thr]
        keep = []
        for i in pts:  # within 0.5 s of each other, keep only the lowest
            if keep and i - keep[-1] < fps / 2:
                if d[i] < d[keep[-1]]:
                    keep[-1] = i
                continue
            keep.append(i)
        r = dict(j, sync_points=[[round((a + i - s0) / fps, 2), round(float(d[i]), 1)] for i in keep])
        out.append(r); print('S', r, flush=True)
        continue
    ang = np.degrees(2 * np.arccos(np.abs(np.einsum('ibk,jbk->ijb', Q, Q)).clip(0, 1)))
    Dm, Dx = ang.mean(-1), ang.max(-1)
    n, k, mn = len(Q), 3, int(j.get('min_len_s', 2.0) * fps)
    best = None
    for i in range(k, n - mn - k):
        for e in range(i + mn, n - k):
            c = (Dm[i, e] + Dm[i - k, e - k] + Dm[i + k, e + k]) / 3
            if best is None or c < best[0]:
                best = (c, i, e)
    c, i, e = best
    r = dict(j, loop_range_s=[round((a + i - s0) / fps, 2), round((a + e - s0) / fps, 2)],
             seam_mean_deg=round(float(Dm[i, e]), 2), seam_max_deg=round(float(Dx[i, e]), 2), cost=round(float(c), 2))
    out.append(r)
    print('L', r, flush=True)
json.dump(out, open(argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
