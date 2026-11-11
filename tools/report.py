# Clip library overview: counts, sizes, loops, props, clips with large motion, skipped clips
# python report.py
import collections
import cfg

idx = cfg.load_json(cfg.APP_ASSETS / 'anims' / 'index.json', [])
sk = cfg.load_json(cfg.WORK / 'skipped_clips.json', {})
print(f"clips {len(idx)}, {sum(m['bytes'] for m in idx) / 1e6:.1f} MB compressed, {sum(m['raw_bytes'] for m in idx) / 1e6:.1f} MB raw, "
      f"total {sum(m['duration_s'] for m in idx) / 60:.1f} min")
print('by category', dict(collections.Counter(m['category'] for m in idx)))
print('loops', sum(m['loop'] for m in idx), 'static poses (2 frames)', sum(m['frames'] == 2 for m in idx), 'extra parts', sum(m['part'] > 0 for m in idx))
print('props', dict(collections.Counter(p for m in idx for p in m['props'])))
print('static props (no prop animation in the game)', sorted({d['name'] for m in idx for d in m['prop_detail'] if not d['animated']}))
far = [(m['id'], round((m['root_motion']['dx'] ** 2 + m['root_motion']['dz'] ** 2) ** .5, 2), m['root_motion']['dy'], m['root_motion']['yaw_deg'])
       for m in idx if (m['root_motion']['dx'] ** 2 + m['root_motion']['dz'] ** 2) ** .5 > 0.5 or abs(m['root_motion']['dy']) > 0.5]
print(f'clips with root motion > 0.5 m: {len(far)}', sorted(far, key=lambda x: -x[1])[:25])
hip = sorted([(m['id'], m['hip_max_travel_m']) for m in idx if m['hip_max_travel_m'] > 1.0], key=lambda x: -x[1])
print(f'clips whose hips travel > 1 m horizontally from the start: {len(hip)}', hip[:25])
print('largest 10 clips', sorted([(m['id'], m['bytes'] // 1000) for m in idx], key=lambda x: -x[1])[:10])
if sk:
    print('skipped at selection', collections.Counter(r for _, r in sk.get('selection', [])))
    print('skipped in Blender', collections.Counter(sk.get('blender', {}).values()))
    print('  additive actions:', [n for n, r in sk.get('selection', []) if 'additive' in r])
