# Measured metrics + manual annotations (annotations.py) -> data/clips.json
# Usage: python build_catalog.py <metrics dir> <preview dir> [transitions_raw.json]
import json, os, sys, glob
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', '..', 'tools'))
import cfg
from annotations import ANN  # {action: dict(tier, role, posture?, notes, segments?, loop_range_s?, loopable?, ...)}

MET, PREV = sys.argv[1], sys.argv[2]
TRANS = json.load(open(sys.argv[3], encoding='utf-8')) if len(sys.argv) > 3 else None  # output of chain_poses.py
ANIMS = str(cfg.ANIMS_DIR)
PAIRS = json.load(open(os.path.join(ANIMS, 'prop_pairs.json'), encoding='utf-8'))['pairs']
BASES = ['lobby/rampart_menu_lobby_select_idle', 'lobby/rampart_s10e01_idle', 'move/rampart_idle_ua', 'move/rampart_crouch_ua',
         'emote/rampart_ground_emote_chillaxing_loop']


def transitions(a):
    """How to join the base poses: which base second best matches this clip's first frame, and which base second this clip's last frame best returns to (degrees)"""
    if not TRANS:
        return None
    out = {}
    for b in BASES:
        r = TRANS['bases'].get(b, {}).get(a)
        if r:
            out[b.split('/')[1]] = r
    return out or None
OUT = os.path.join(HERE, '..', 'clips.json')

M = {}
for f in glob.glob(os.path.join(MET, '*.json')):
    d = json.load(open(f, encoding='utf-8'))
    if 'error' not in d:
        M[d['action']] = d


def sig(d):  # jaw is a per-clip PCA, not comparable across clips, so left out
    s = d['series']
    return np.array(s['hipZ'] + s['headZ'] + s['wrist_over_head']), np.array(s['yaw_hip']), np.array(s['speed'])


def duplicates(a):  # other actions with (almost) identical data: #n of multi-part rseqs, the same motion shared by different weapons / lobby spots
    d = M[a]; h, y, v = sig(d); out = []
    for b, e in M.items():
        if b == a or e['frames'] != d['frames']:
            continue
        h2, y2, v2 = sig(e)
        if np.abs(h2 - h).max() < 0.02 and np.abs((y2 - y + 180) % 360 - 180).max() < 1.0 and np.abs(v2 - v).mean() < 2:
            out.append(b)
    return sorted(out)


def prev(cid):
    p = {k: os.path.join(PREV, cid + ext).replace('\\', '/') for k, ext in
         (('sheet', '.png'), ('mp4', '.mp4'), ('timeline', '_timeline.png'), ('head', '_head.png'))}
    return {k: v for k, v in p.items() if os.path.exists(v)}


TIER = {'S': 0, 'A': 1, 'B': 2, 'C': 3}
rows = []
for a, ann in ANN.items():
    d = M[a]
    seam, seam_max = d['loop_seam_deg']['mean'], d['loop_seam_deg']['max']
    loopable = ann.get('loopable', d['frames'] > 30 and seam < 2.5 and seam_max < 8)
    bl = d.get('best_loop') or {}
    loop_range = ann.get('loop_range_s')
    if loop_range is None and not loopable and bl and bl.get('seam_mean_deg', 99) < 2.5 and bl.get('seam_max_deg', 99) < 10:
        loop_range = bl['range_s']
    rr = d['root_range_m']
    rows.append(dict(
        action=a, clip_id=d['clip_id'], category=a.split('/')[0],
        duration_s=d['duration_s'], frames=d['frames'], fps=d['fps'], time_scale=round(d['fps'] / 30, 3),
        tier=ann['tier'], role=ann['role'], posture=ann.get('posture', d['posture']),
        loop_seam_deg=seam, loop_seam_max_deg=seam_max, loopable=bool(loopable),
        loop_range_s=loop_range, loop_range_seam_deg=(bl.get('seam_mean_deg') if loop_range == bl.get('range_s') else ann.get('loop_range_seam_deg')),
        root_travel_m=d['root_travel_m'], root_range_m=rr, hip_travel_m=d['hip_travel_m'], hip_range_m=d['hip_range_m'],
        root_motion=max(rr['x'], rr['y'], rr['z']) > 0.1,
        hip_start_m=d['hip_start_m'], facing_start_deg=d['facing_start_deg'], yaw_deg=d['yaw_deg'],
        bbox_m=d['bbox_m'] if max(abs(x - y) for x, y in zip(d['bbox_m']['min'] + d['bbox_m']['max'], d['body_bbox_m']['min'] + d['body_bbox_m']['max'])) <= 1
        else d['body_bbox_m'],  # clips where the Sheila on her back is hidden 4 m underground: leave it out
        face_anim=ann.get('face_anim', d['face_tr_range_mm'] > 3 or d['jaw_range_mm'] > 3),
        gum_chew=ann.get('gum_chew', bool(d['chew_ranges_s'])), chew_ranges_s=d['chew_ranges_s'],
        props=ann.get('props', d['props']), bubble_ranges_s=d['bubble_ranges_s'],
        prop_actions=[dict(model=p['model'], rig=p['rig'], action=p['action'], attach=p['attach'], time_scale=p.get('time_scale', 1.0))
                      for p in PAIRS.get(a, [])],
        segments=ann.get('segments', []), notes=ann['notes'], posture_detail=ann.get('posture_detail'),
        transitions=transitions(a) if ann['tier'] in 'SA' else None,
        issues=ann.get('issues', []), duplicates=duplicates(a),
        preview=prev(ann.get('preview', d['clip_id'])),
    ))
rows.sort(key=lambda r: (TIER[r['tier']], -ANN[r['action']].get('rank', 0), r['action']))
json.dump(rows, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(rows), 'clips ->', os.path.abspath(OUT))
for t in 'SABC':
    print(t, sum(r['tier'] == t for r in rows))
