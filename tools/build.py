# Asset pipeline entry point (system Python 3.10+ with Pillow and numpy; the Blender path comes from assets.json)
#   python tools/build.py model [--skin base|hp|rebecca|bear] [--no-eyes] [--max 2048]
#   python tools/build.py props [--models rampart_bubblegum ...]
#   python tools/build.py clips --set m1|m2 [--only <clip_id,...>] [--jobs 3] [--force]
#   python tools/build.py pack            # only redo compression + index.json
#   python tools/build.py all             # model(base) + clips m2 + props + model(hp)
import argparse, json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import cfg, glbfix

NODE_BIN = cfg.REPO / 'app' / 'node_modules' / '.bin'
SCAN = cfg.WORK / 'scan'


def blender(blend, script, *args, log=None):
    cmd = [cfg.BLENDER, '-b', '--factory-startup', str(blend), '--python', str(cfg.TOOLS / script), '--', *map(str, args)]
    t = time.time()
    p = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    out = p.stdout + p.stderr
    if log:
        Path(log).parent.mkdir(parents=True, exist_ok=True)
        Path(log).write_text(out, encoding='utf-8')
    keep = [l for l in out.splitlines() if l.startswith(('EXPORTED', 'SCAN', 'CLIP', 'WARN', 'ERR', 'Traceback', 'NO TEX')) or 'Error' in l]
    print('\n'.join(keep[-40:]))
    if p.returncode != 0 or any(l.startswith('Traceback') for l in keep):
        raise SystemExit(f'Blender failed: {script} {args} ({time.time() - t:.0f}s), log {log}')
    return out


def textures(scan_json, tag, max_size, force=False):
    import tex
    res = tex.run(scan_json, max_size, force=force)
    p = cfg.WORK / f'tex_{tag}.json'
    cfg.save_json(p, res)
    return p


def cmd_model(a):
    skin = cfg.SKINS[a.skin]
    scan = SCAN / f'{a.skin}.json'
    blender(skin['blend'], 'bl_scan.py', scan, 'skin', log=cfg.WORK / 'logs' / f'scan_{a.skin}.log')
    tj = textures(scan, a.skin, a.max, a.force)
    out = cfg.APP_ASSETS / skin['out']
    blender(skin['blend'], 'bl_model.py', 'skin', tj, out, *([] if a.no_eyes else ['--eyes']),
            log=cfg.WORK / 'logs' / f'model_{a.skin}.log')
    glbfix.fix_tangents(out)
    # The runtime loads the version with textures downsized to 1024 by default (no visible difference at pet size, saves three quarters of the VRAM)
    small = out.with_name(out.stem + '_1k.glb')
    gltf_transform('resize', out, small, '--width', 1024, '--height', 1024)
    print('model', out, f'{out.stat().st_size / 1e6:.1f} MB;', small.name, f'{small.stat().st_size / 1e6:.1f} MB')


def cmd_props(a):
    scan = SCAN / 'props.json'
    if not scan.exists():
        blender(cfg.ANIMS_BLEND, 'bl_scan.py', scan, 'props', log=cfg.WORK / 'logs' / 'scan_props.log')
    models = a.models   # model names or variant short names (cfg.PROP_VARIANTS)
    if not models:  # default: the props used by the clips exported so far
        idx = cfg.load_json(cfg.APP_ASSETS / 'anims' / 'index.json', [])
        short2model = {cfg.prop_short(m): m for m in cfg.PROP_SHORT}
        models = sorted({p if p in cfg.PROP_VARIANTS else short2model[p] for e in idx for p in e['props']})
    base = {cfg.PROP_VARIANTS.get(x, (x,))[0] for x in models}
    s = cfg.load_json(scan)
    s['materials'] = {k: v for k, v in s['materials'].items()
                      if any(s['meshes'][m]['parent'] in {'rig_' + x for x in base} for m in v['meshes'])}
    sub = SCAN / 'props_sel.json'
    cfg.save_json(sub, s)
    tj = textures(sub, 'props', min(a.max, 2048), a.force)
    blender(cfg.ANIMS_BLEND, 'bl_model.py', 'prop', tj, cfg.APP_ASSETS / 'props', *models,
            log=cfg.WORK / 'logs' / 'props.log')
    for m in models:
        glbfix.fix_tangents(cfg.APP_ASSETS / 'props' / f'{m if m in cfg.PROP_VARIANTS else cfg.prop_short(m)}.glb')


# ---------------- Clips ----------------
M1 = ['lobby/rampart_menu_lobby_center_idle', 'emote/rampart_ground_emote_chillaxing_loop', 'skydive/rampart_freefall']
M2_CATS = {'lobby', 'emote', 'gladcard', 'skydive', 'move', 'misc', 'quest', 'droppod', 'execution'}
M2_KW = ('idle gum bubble welder weld wrench inspect taunt wave greet sit lie sleep yawn stretch look turn '
         'jump land fall flinch hit pain stumble').split()
MIN_PART_FRAMES = 4       # "#n" extra parts are only exported with at least this many frames


def select_actions(which):
    idx = cfg.load_json(cfg.ANIMS_DIR / 'index.json')
    if which == 'm1':
        return M1, []
    acts, skipped = [], []
    for e in idx:
        n, cat = e['name'], e['category']
        if not (cat in M2_CATS or any(k in n.lower() for k in M2_KW)):
            continue
        if not e.get('imported') or not e.get('actions'):
            skipped.append((f'{cat}/{n}', 'no character skeleton action (an animation of the prop / weapon / drop pod itself)')); continue
        if e['additive']:
            skipped.append((f'{cat}/{n}', 'additive action')); continue
        if cat == 'gladcard' and n.endswith('_light'):
            continue
        if cat in ('execution', 'misc') and ('victim_rampart' in n):
            skipped.append((f'{cat}/{n}', 'victim side of a finisher')); continue
        for i, act in enumerate(e['actions']):
            if i > 0 and e['frames'] < MIN_PART_FRAMES:
                continue
            acts.append(act)
    # Remove duplicate names (the index has rseqs with repeated names)
    seen, out = set(), []
    for a in acts:
        if a not in seen:
            seen.add(a); out.append(a)
    return out, skipped


def cmd_clips(a):
    acts, skipped = select_actions(a.set)
    if a.only:
        want = set(a.only.split(','))
        acts = [x for x in acts if cfg.clip_id(x) in want or x in want]
    meta_dir = cfg.RAW_CLIPS / 'meta'
    bl_skipped = {m['id']: m['skip'] for p in (cfg.RAW_CLIPS / 'skipped').glob('*.json') for m in cfg.load_json(p)}
    if not a.force:
        acts = [x for x in acts if not (meta_dir / f'{cfg.clip_id(x)}.json').exists() and cfg.clip_id(x) not in bl_skipped]
    print(f'{len(acts)} clips to export, {len(skipped)} skipped at selection, {len(bl_skipped)} already skipped in Blender')
    if acts:
        n = max(1, min(a.jobs, len(acts)))
        batches = [acts[i::n] for i in range(n)]

        def run(i):
            lst = cfg.WORK / 'logs' / f'clips_batch{i}.json'
            cfg.save_json(lst, batches[i])
            try:
                blender(cfg.SKINS['base']['blend'], 'bl_clips.py', lst, log=cfg.WORK / 'logs' / f'clips_batch{i}.log')
            except SystemExit as e:   # a crashed batch doesn't affect the other batches or packing; a rerun resumes the unfinished ones
                return str(e)
        with ThreadPoolExecutor(n) as ex:
            fails = [f for f in ex.map(run, range(n)) if f]
        for f in fails:
            print('batch failed (rerunning build.py clips will fill it in):', f)
    bl_skipped = {m['id']: m['skip'] for p in (cfg.RAW_CLIPS / 'skipped').glob('*.json') for m in cfg.load_json(p)}
    cfg.save_json(cfg.WORK / 'skipped_clips.json', {'selection': skipped, 'blender': bl_skipped})
    cmd_pack(a)


def gltf_transform(*args):
    exe = NODE_BIN / ('gltf-transform.cmd' if os.name == 'nt' else 'gltf-transform')
    p = subprocess.run([str(exe), *map(str, args)], capture_output=True, text=True, encoding='utf-8', errors='replace', shell=False)
    if p.returncode != 0:
        raise RuntimeError(p.stdout + p.stderr)


def cmd_pack(a):
    meta_dir = cfg.RAW_CLIPS / 'meta'
    out_dir = cfg.APP_ASSETS / 'anims'
    out_dir.mkdir(parents=True, exist_ok=True)
    metas = [cfg.load_json(p) for p in sorted(meta_dir.glob('*.json'))]
    only = set(a.only.split(',')) if getattr(a, 'only', None) else None

    def pack(m):
        src = cfg.RAW_CLIPS / f"{m['id']}.glb"
        dst = out_dir / f"{m['id']}.glb"
        force = getattr(a, 'force', False) and (only is None or m['id'] in only)   # with --only, only force-recompress those clips
        if dst.exists() and dst.stat().st_mtime > src.stat().st_mtime and not force:
            return
        tmp = cfg.RAW_CLIPS / 'tmp' / f"{m['id']}.glb"
        tmp.parent.mkdir(exist_ok=True)
        gltf_transform('resample', src, tmp, '--tolerance', '0.0001')
        gltf_transform('meshopt', tmp, dst, '--level', 'high')
        tmp.unlink()
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(pack, metas))
    index = []
    for m in metas:
        dst = out_dir / f"{m['id']}.glb"
        m.setdefault('dropped_props', [])
        m = dict(m, file=f"anims/{m['id']}.glb", bytes=dst.stat().st_size, raw_bytes=(cfg.RAW_CLIPS / f"{m['id']}.glb").stat().st_size)
        index.append(m)
    index.sort(key=lambda m: m['id'])
    cfg.save_json(out_dir / 'index.json', index)
    tot = sum(m['bytes'] for m in index); raw = sum(m['raw_bytes'] for m in index)
    print(f'index.json: {len(index)} clips, {tot / 1e6:.1f} MB compressed ({raw / 1e6:.1f} MB raw)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['model', 'props', 'clips', 'pack', 'all'])
    ap.add_argument('--skin', default='base', choices=list(cfg.SKINS))
    ap.add_argument('--no-eyes', action='store_true', help='leave out the cornea / eye-shadow shells (included by default, meshes eye_cornea / eye_shadow)')
    ap.add_argument('--max', type=int, default=2048, help='maximum texture edge length')
    ap.add_argument('--models', nargs='*')
    ap.add_argument('--set', default='m2', choices=['m1', 'm2'])
    ap.add_argument('--only')
    ap.add_argument('--jobs', type=int, default=3)
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    if a.cmd == 'model':
        cmd_model(a)
    elif a.cmd == 'props':
        cmd_props(a)
    elif a.cmd == 'clips':
        cmd_clips(a)
    elif a.cmd == 'pack':
        cmd_pack(a)
    else:
        a.skin = 'base'; cmd_model(a)
        a.set = 'm2'; cmd_clips(a)
        a.models = None; cmd_props(a)
        a.skin = 'hp'; cmd_model(a)


if __name__ == '__main__':
    main()
