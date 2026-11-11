# candidates.txt + measured metrics -> render_list.json (for render_clips.py)
# Usage: python make_render_list.py <metrics dir> <output json>
import json, os, sys
MET, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
todo = []
for line in open(os.path.join(HERE, 'candidates.txt'), encoding='utf-8'):
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    act, *flags = line.split('|')
    cid = act.replace('/', '__').replace('#', '_p')
    m = json.load(open(os.path.join(MET, cid + '.json'), encoding='utf-8'))
    dur = m['duration_s']
    bb = m['bbox_m']
    if max(abs(a - b) for a, b in zip(bb['min'] + bb['max'], m['body_bbox_m']['min'] + m['body_bbox_m']['max'])) > 1:
        bb = m['body_bbox_m']  # the game "hides" the Sheila on her back 4 m underground (when swapped for a hand-held Sheila prop); leave it out of framing
    c = dict(action=act, clip_id=cid, fps=m['fps'], bbox_m=bb, facing_start_deg=m['facing_start_deg'],
             hip_start_m=m['hip_start_m'], out_fps=10 if dur <= 20 else 5, pairs='#' not in act)
    rr = m['root_range_m']
    if max(rr['x'], rr['y']) > 0.6:  # large root travel: camera follows
        c['follow'] = True
    if 'wrench' in act and 'melee/' in act:
        c['pairs'] = True
    todo.append(c)
    if 'head' in flags:  # head close-up: bounding box covers only the head
        todo.append(dict(c, clip_id=cid + '_head', head=True, margin=0.0))  # the bounding box is computed from the head bone in Blender
json.dump(todo, open(OUT, 'w', encoding='utf-8'), indent=0)
print(len(todo), 'clips')
