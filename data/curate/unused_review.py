# Unused clip list + timelines: cross-checks the clip table (app/src/clips.js), the catalog (clips.json), the export index, the asset library index and the per-frame curves (metrics)
# Output: data/UNUSED.md (text list), <work>/clips/_unused_review.html (with thumbnails and timelines, for visual review)
# Usage (from the repo root): python data/curate/unused_review.py
import json, os, re, subprocess, collections, html, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PET = os.path.normpath(os.path.join(HERE, '..', '..'))
APP = os.path.join(PET, 'app')
sys.path.insert(0, os.path.join(PET, 'tools'))
import cfg
CLIPS = (cfg.WORK / 'clips').as_posix()
METRICS = CLIPS + '/metrics'
LIB = (cfg.ANIMS_DIR / 'index.json').as_posix()
OUT_MD = os.path.join(PET, 'data', 'UNUSED.md')
OUT_HTML = CLIPS + '/_unused_review.html'

load = lambda p: json.load(open(p, encoding='utf-8'))
exp = load(os.path.join(APP, 'assets', 'anims', 'index.json'))
expd = {x['id']: x for x in exp}
cat = load(os.path.join(PET, 'data', 'clips.json'))
catd = {c['clip_id']: c for c in cat}
lib = load(LIB)

# ---------- clip table: slot -> clip + range ----------
js = r"""import('./src/clips.js').then(({C}) => { const out = []
  const add = (slot, s) => out.push(typeof s === 'string' ? { slot, id: s } : { slot, id: s.id, from: s.from, to: s.to })
  for (const [k, v] of Object.entries(C)) {
    if (k === 'fidgets') v.forEach(f => add('fidgets (' + f[3] + ')', f[0]))
    else if (Array.isArray(v)) v.forEach((s, i) => add(k + '[' + i + ']', s)); else add(k, v) }
  console.log(JSON.stringify(out)) })"""
slots = json.loads(subprocess.run(['node', '-e', js], cwd=APP, capture_output=True, text=True, encoding='utf-8').stdout)
src = {}
for root, _, fs in os.walk(os.path.join(APP, 'src')):
    for f in fs:
        if f.endswith('.js'): src[os.path.join(root, f)] = open(os.path.join(root, f), encoding='utf-8').read()
refs = set()
for p, s in src.items():
    if not p.endswith('clips.js'): refs |= set(re.findall(r'\bC\.(\w+)', s))
dead = {s['slot'] for s in slots if re.match(r'\w+', s['slot']).group() not in refs}
live = [s for s in slots if s['slot'] not in dead]
dead_of = {s['id']: s['slot'] for s in slots if s['slot'] in dead}

used = {}      # id -> [(start s, end s, slot)]
for s in live:
    d = expd[s['id']]['duration_s']
    used.setdefault(s['id'], []).append((s.get('from', 0) / 30, min(d, s['to'] / 30) if 'to' in s else d, s['slot']))
# photo and expression ids are assembled in code (prune_dist has its own list); expressions only overlay the face bones, not counted as full-clip playback
for n in ['wink', 'peace', 'lookingup', 'bigsheila', 'fireaway', 'sittinggun', 'gunjump']:
    i = 'gladcard__rampart_gladcard_static_' + n
    if i in expd: used.setdefault(i, [(0, expd[i]['duration_s'], 'photos')])
for e in ['neutral', 'happy', 'angry', 'sad', 'surprised', 'fearful']:
    for sd in 'lr':
        i = f'quest__rampart_quest_{e}_{sd}'
        if i in expd: used.setdefault(i, [(0, expd[i]['duration_s'], 'expression overlay')])


# ---------- per-frame curves -> timeline ----------
def metrics(cid):
    p = f'{METRICS}/{cid}.json'
    return load(p) if os.path.exists(p) else None

def ranges(flags, fps=30, minlen=0.25, gap=0.2):
    out, a = [], None
    for i, f in enumerate(list(flags) + [False]):
        if f and a is None: a = i
        if not f and a is not None: out.append([a / fps, i / fps]); a = None
    merged = []
    for r in out:
        if merged and r[0] - merged[-1][1] <= gap: merged[-1][1] = r[1]
        else: merged.append(r)
    return [r for r in merged if r[1] - r[0] >= minlen]

def posture(m, i):
    s = m['series']
    if s['footZ'][i] > 0.25: return 'air'
    h = s['headZ'][i]
    return 'stand' if h > 1.45 else 'crouch' if h > 1.0 else 'low'

def timeline(cid):
    """Timeline of one clip: rows of [(start, end)], plus root travel"""
    m = metrics(cid)
    if not m: return None
    s, n = m['series'], len(m['series']['speed'])
    rows = {
        'quiet': ranges([v < 40 for v in s['speed']], minlen=1.0),
        'crouch': ranges([posture(m, i) == 'crouch' for i in range(n)]),
        'low': ranges([posture(m, i) == 'low' for i in range(n)]),
        'air': ranges([posture(m, i) == 'air' for i in range(n)]),
        'arms': ranges([v > 0 for v in s['wrist_over_head']], minlen=0.15),
        'bubble': [list(r) for r in (m.get('bubble_ranges_s') or [])],
        'chew': [list(r) for r in (m.get('chew_ranges_s') or [])],
    }
    root = max((((s['rootX'][i] - s['rootX'][0]) ** 2 + (s['rootY'][i] - s['rootY'][0]) ** 2) ** 0.5 for i in range(n)), default=0)
    return {'n': n, 'dur': n / 30, 'rows': rows, 'root': root, 'speed': s['speed'], 'headZ': s['headZ'], 'footZ': s['footZ']}

ROWNAME = {'quiet': 'quiet', 'crouch': 'crouch/bend', 'low': 'sit/lie/prone', 'air': 'airborne', 'arms': 'hands over head', 'bubble': 'bubble', 'chew': 'chew/talk'}
fmt = lambda r: f'{r[0]:.1f}–{r[1]:.1f}'

def tl_text(t, c=None):
    if not t: return '(no per-frame data)'
    parts = []
    for seg in (c or {}).get('segments') or []:
        parts.append(f"{seg['name']} {fmt(seg['range_s'])}")
    if c and c.get('loop_range_s'): parts.append('loopable ' + fmt(c['loop_range_s']))
    for k in ['crouch', 'low', 'air', 'arms', 'bubble', 'chew', 'quiet']:
        rs = t['rows'][k]
        if rs and not (len(rs) == 1 and rs[0][1] - rs[0][0] > t['dur'] - 0.2 and k != 'quiet'):
            parts.append(ROWNAME[k] + ' ' + ', '.join(fmt(r) for r in rs[:4]) + ('…' if len(rs) > 4 else ''))
        elif rs: parts.append(ROWNAME[k] + ' throughout')
    if t['root'] > 0.3: parts.append(f"root travel {t['root']:.1f} m")
    return '; '.join(parts) or '—'


# ---------- classification ----------
cat_unused = [c for c in cat if c['clip_id'] not in used]
partial = []
for i, rs in used.items():
    d = expd[i]['duration_s']
    cov = sorted((a, b) for a, b, _ in rs)
    merged = []
    for a, b in cov:
        if merged and a <= merged[-1][1] + 0.05: merged[-1][1] = max(merged[-1][1], b)
        else: merged.append([a, b])
    gaps, t0 = [], 0
    for a, b in merged:
        if a - t0 > 0.5: gaps.append([t0, a])
        t0 = max(t0, b)
    if d - t0 > 0.5: gaps.append([t0, d])
    if gaps: partial.append((i, rs, gaps))

rest = [x for x in exp if x['id'] not in catd and x['id'] not in used]
fam = collections.defaultdict(list)
for x in rest: fam[re.sub(r'_p\d+$', '', x['id'])].append(x)
def fam_note(k):
    if k in catd or k in used: return 'blend-space variant of a cataloged / used clip'
    n = k.split('__', 1)[1]
    for w, why in [('pistol', 'empty-handed pistol grip'), ('rifle', 'empty-handed rifle grip'), ('_ads', 'aiming'), ('mobilehmg', 'holding Sheila'), ('_turret', 'holding Sheila'),
                   ('wrench', 'wrench grip'), ('karambit', 'knife grip'), ('land', 'landing variant'), ('jump', 'jump'), ('walk', 'walk'), ('run', 'run'), ('sprint', 'sprint'),
                   ('slide', 'slide'), ('zipline', 'zipline'), ('freefall', 'freefall'), ('climb', 'climb'), ('mantle', 'mantle')]:
        if w in n: return why
    return ''

not_exported_actions = collections.Counter()
lib_actions = set()
for l in lib:
    for a in l.get('actions') or []: lib_actions.add(a.replace('/', '__').replace('#', '_p'))
for a in lib_actions - set(expd): not_exported_actions[a.split('__')[0]] += 1
not_imported = collections.defaultdict(list)
for l in lib:
    if not l['imported']: not_imported[l['category']].append(l['name'])
WHY_LIB = {'aim': "aim additive layers (including other legends'), distorted when played alone", 'sheila': 'aim / direction variants holding Sheila, pilot_rampart_turret_* on the 70-bone generic skeleton, upper-body layers',
           'move': 'blend-space variants (_pN) of gun idles / crouches and fire additive layers', 'gladcard': 'banner lights (_light) and multi-part copies (_pN)', 'gum': "the bubble gum prop's own actions (paired automatically with character clips)",
           'wall': 'locomotion holding the shield wall, body same as move/*_ua', 'execution': 'the victim side of finishers and segment copies', 'melee': 'other legends (ragold big sword)', 'lobby': 'camera animations and copies',
           'misc': 'single-frame face hair additive layer', 'heirloom': 'heirloom first person (ptpov arm skeleton), unusable in third person', 'droppod': "the drop pod's own actions", 'other_legend': 'other legends'}

# ---------- UNUSED.md ----------
L = []
w = L.append
w('# Unused clips (generated, do not edit by hand)')
w('')
w('Regenerate with `python data/curate/unused_review.py`. Visual version (thumbnails + timelines + videos): `<work>/clips/_unused_review.html`')
w('')
w(f'- Asset library: {len(lib)} rseqs ({sum(1 for l in lib if l["imported"])} imported into the blend, {len(lib_actions)} actions); exported to app/assets/anims: {len(exp)} clips; catalog clips.json: {len(cat)} clips')
w(f'- Actually played by the app: {len(used)} clips ({len(live)} slot entries in the clip table + ids assembled for photos / expressions)')
w(f'- Unused: in the clip table but never played by the brain {len(dead)} entries, only partly used {len(partial)} clips, unused in the catalog {len(cat_unused)} clips, '
  f'exported but not cataloged {len(rest)} clips ({len(fam)} families), not exported {sum(not_exported_actions.values())} actions')
w('')
w('**Reading the timelines**: times are in seconds (30 fps). "quiet" = body angular speed < 40°/s for more than 1 s (good for freezes / loops); "crouch/bend" and "sit/lie/prone" are by head height (standing is about 1.68 m, '
  '1.0–1.45 m counts as crouch, < 1.0 m as low); "airborne" = feet more than 25 cm off the ground; "hands over head" = a wrist above the head; "bubble" = the bubble actually inflates; "chew/talk" = a 1–4 Hz jaw rhythm (cannot tell chewing from voice lines); '
  '"root travel" is the farthest horizontal distance from the start over the clip (stripped on playback). Segment names come from the manual segments.')
w('')
w('## 1. In the clip table, but never played by the brain')
w('')
w('| Slot | Clip | Range s | Notes |')
w('|---|---|---|---|')
for s in slots:
    if s['slot'] in dead:
        r = f"{s['from']/30:.1f}–{s['to']/30:.1f}" if 'from' in s else 'whole'
        w(f"| `{s['slot']}` | `{s['id']}` | {r} | {(catd.get(s['id']) or {}).get('notes', '')[:60]} |")
w('')
w('These entries are only registered in clips.js (still packed into the exe); neither the brain nor the tests use them. Either wire them into a behavior or remove the slot.')
w('')
w('## 2. Used, but only partly (the unused ranges may still hold good material)')
w('')
w('| Clip | Duration s | Used ranges (slot) | Unused ranges | Timeline |')
w('|---|---|---|---|---|')
for i, rs, gaps in sorted(partial, key=lambda x: -sum(b - a for a, b in x[2])):
    u = '; '.join(f"{a:.1f}–{b:.1f} ({sl})" for a, b, sl in sorted(rs))
    w(f"| `{i}` | {expd[i]['duration_s']:.1f} | {u} | {', '.join(fmt(g) for g in gaps)} | {tl_text(timeline(i), catd.get(i))} |")
w('')
w('## 3. Unused in the catalog (clips.json)')
w('')
for tier in 'SABC':
    rows = [c for c in cat_unused if c['tier'] == tier]
    if not rows: continue
    w(f'### Grade {tier} ({len(rows)} clips)')
    w('')
    w('| Clip | Duration s | Posture | Props | What it looks like | Timeline |')
    w('|---|---|---|---|---|---|')
    for c in rows:
        w(f"| `{c['clip_id']}` | {c['duration_s']:.1f} | {c.get('posture') or ''} | {','.join(c.get('props') or []) or '—'} | "
          f"{('[clip table slot ' + dead_of[c['clip_id']] + ': registered but never played] ') if c['clip_id'] in dead_of else ''}{(c.get('notes') or '').replace('|', '/')} | {tl_text(timeline(c['clip_id']), c)} |")
    w('')
w('## 4. Exported but not cataloged (no rendered preview, only per-frame curves)')
w('')
w('`_pN` are direction / aim variants in a blend space; each family is one row, and the timeline is from its first clip.')
w('')
for k in sorted({f.split('__')[0] for f in fam}):
    ks = sorted(f for f in fam if f.startswith(k + '__'))
    w(f'### {k} ({len(ks)} families, {sum(len(fam[f]) for f in ks)} clips)')
    w('')
    w('| Family | Clips | Duration s | Props | Type | Timeline |')
    w('|---|---|---|---|---|---|')
    for f in ks:
        xs = sorted(fam[f], key=lambda x: x['id'])
        w(f"| `{f}` | {len(xs)} | {xs[0]['duration_s']:.1f} | {','.join(xs[0].get('props') or []) or '—'} | {fam_note(f)} | {tl_text(timeline(xs[0]['id']))} |")
    w('')
w('## 5. Not exported (in the asset library, not in app/assets/anims)')
w('')
w('| Category | Actions | Why not exported |')
w('|---|---|---|')
for k, n in not_exported_actions.most_common():
    w(f'| {k} | {n} | {WHY_LIB.get(k, "")} |')
w('')
w('rseqs not imported into the blend: ' + ', '.join(f'{k} {len(v)}' for k, v in sorted(not_imported.items(), key=lambda x: -len(x[1]))) +
  '. To use one of them, export it with `build.py clips --only <id>` (first make sure it is in the blend).')
open(OUT_MD, 'w', encoding='utf-8', newline='\n').write('\n'.join(L) + '\n')


# ---------- visual HTML version ----------
def svg(t, dur, used_rs=None, segs=None, loop=None, compact=False):
    """Timeline: a column of row labels on the left (HTML text), stretched SVG color bars on the right, second ticks below"""
    if not t: return '<div class="nodata">no per-frame data</div>'
    rows = ['speed', 'pose', 'arms', 'bubble', 'chew']
    lab = {'speed': 'motion', 'pose': 'posture', 'arms': 'arms up', 'bubble': 'bubble', 'chew': 'chew/talk'}
    rh = 10 if compact else 15
    W, H = 1000, rh * len(rows)
    X = lambda s: s / max(dur, 1e-6) * W
    P = lambda s: f'{min(100, s / max(dur, 1e-6) * 100):.2f}%'
    o = [f'<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" style="height:{H}px">']
    for r in range(len(rows)): o.append(f'<rect x="0" y="{r * rh}" width="{W}" height="{rh - 1}" class="bg"/>')
    n = t['n']; step = max(1, n // 250)
    cw = X(step / 30) + 0.6
    for r, key in enumerate(rows):
        y = r * rh
        if key == 'speed':
            for i in range(0, n, step):
                v = min(1, max(t['speed'][i:i + step]) / 300)
                if v > 0.04: o.append(f'<rect x="{X(i / 30):.1f}" y="{y}" width="{cw:.1f}" height="{rh - 1}" class="spd" fill-opacity="{v:.2f}"/>')
        elif key == 'pose':
            for i in range(0, n, step):
                p = 'air' if t['footZ'][i] > 0.25 else 'stand' if t['headZ'][i] > 1.45 else 'crouch' if t['headZ'][i] > 1.0 else 'low'
                if p != 'stand': o.append(f'<rect x="{X(i / 30):.1f}" y="{y}" width="{cw:.1f}" height="{rh - 1}" class="p-{p}"/>')
        else:
            for a, b in t['rows'][key]:
                o.append(f'<rect x="{X(a):.1f}" y="{y}" width="{max(1.5, X(b) - X(a)):.1f}" height="{rh - 1}" class="r-{key}"/>')
    for a, b, _ in used_rs or []: o.append(f'<rect x="{X(a):.1f}" y="0" width="{max(1, X(b) - X(a)):.1f}" height="{H}" class="used"/>')
    o.append('</svg>')
    top = ''
    if not compact and (segs or loop):
        top = '<div class="segs">' + ''.join(f'<span style="left:{P(sg["range_s"][0])};width:calc({P(sg["range_s"][1] - sg["range_s"][0])} - 1px)" title="{html.escape(sg["name"])} {fmt(sg["range_s"])}">{html.escape(sg["name"])}</span>' for sg in segs or []) +               (f'<i class="loopbar" style="left:{P(loop[0])};width:{P(loop[1] - loop[0])}" title="loopable {fmt(loop)}"></i>' if loop else '') + '</div>'
    every = 1 if dur <= 12 else 5 if dur <= 60 else 10
    ticks, s = [], 0
    while s <= dur + 1e-6: ticks.append(f'<span style="left:{P(s)}">{s:g}</span>'); s += every
    labs = ''.join(f'<span style="height:{rh}px">{lab[k]}</span>' for k in rows)
    return (f'<div class="tl{" compact" if compact else ""}"><div class="labs">{"<span class=sp></span>" if top else ""}{labs}</div>'
            f'<div class="plot">{top}{"".join(o)}<div class="ticks">{"".join(ticks)}</div></div></div>')

esc = html.escape
H = []
h = H.append
cards = lambda: None
def card(cid, title, meta, desc, t, dur, used_rs=None, c=None, extra=''):
    pv = (c or {}).get('preview') or {}
    sheet = os.path.basename(pv['sheet']) if pv.get('sheet') else None
    media = ''
    if sheet: media += f'<a href="{esc(sheet)}" target="_blank"><img loading="lazy" src="{esc(sheet)}" alt="thumbnail"></a>'
    links = []
    if pv.get('mp4'): links.append(f'<button class="play" data-src="{esc(os.path.basename(pv["mp4"]))}">Play video</button>')
    if pv.get('timeline'): links.append(f'<a href="{esc(os.path.basename(pv["timeline"]))}" target="_blank">1 frame / s</a>')
    if pv.get('head'): links.append(f'<a href="{esc(os.path.basename(pv["head"]))}" target="_blank">Face close-up</a>')
    return (f'<article class="card" data-q="{esc(cid + " " + title + " " + desc).lower()}"><header><h3>{esc(title)}</h3><code>{esc(cid)}</code></header>'
            f'<p class="meta">{meta}</p><p class="desc">{esc(desc)}</p>{extra}'
            f'{svg(t, dur, used_rs, (c or {}).get("segments"), (c or {}).get("loop_range_s"))}'
            f'<p class="tltext">{esc(tl_text(t, c))}</p>'
            f'<div class="media">{media}</div><div class="links">{" ".join(links)}</div></article>')
badge = lambda tier: f'<span class="tier t{tier}">{tier}</span>'

h('<section><h2 id="dead">1. In the clip table, but never played by the brain (' + str(len(dead)) + ')</h2><p class="note">Only registered in clips.js (still packed into the exe); neither the brain nor the tests use them. Either wire them into a behavior or remove the slot.</p><div class="grid">')
for s in slots:
    if s['slot'] not in dead: continue
    i = s['id']; c = catd.get(i); t = timeline(i); d = expd[i]['duration_s']
    rs = [(s['from'] / 30, s['to'] / 30, s['slot'])] if 'from' in s else [(0, d, s['slot'])]
    h(card(i, f"slot {s['slot']}", f"{badge(c['tier']) if c else ''} {d:.1f} s · used range {fmt(rs[0][:2])}", (c or {}).get('notes', ''), t, d, rs, c))
h('</div></section>')

h(f'<section><h2 id="partial">2. Used, but only partly ({len(partial)})</h2><p class="note">The blue background marks the ranges in use; everything else is unused.</p><div class="grid">')
for i, rs, gaps in sorted(partial, key=lambda x: -sum(b - a for a, b in x[2])):
    c = catd.get(i); t = timeline(i); d = expd[i]['duration_s']
    uses = '; '.join(f"{a:.1f}–{b:.1f} {sl}" for a, b, sl in sorted(rs))
    h(card(i, i.split('__', 1)[1], f"{badge(c['tier']) if c else ''} {d:.1f} s · unused ranges {', '.join(fmt(g) for g in gaps)}", (c or {}).get('notes', ''), t, d, rs, c,
           f'<p class="uses">Used: {esc(uses)}</p>'))
h('</div></section>')

h(f'<section><h2 id="catalog">3. Unused in the catalog ({len(cat_unused)})</h2><p class="note">All have thumbnails and videos. Sorted by grade, then by recommendation within a grade.</p>')
for tier in 'SABC':
    rows = [c for c in cat_unused if c['tier'] == tier]
    if not rows: continue
    h(f'<h3 class="tierh">{badge(tier)} Grade {tier} ({len(rows)})</h3><div class="grid">')
    for c in rows:
        meta = f"{badge(tier)} {c['duration_s']:.1f} s · {c.get('posture') or ''} · {c.get('role') or ''}" + (f" · props {','.join(c['props'])}" if c.get('props') else '') + \
               (' · root motion' if c.get('root_motion') else '') + (f" · loopable {fmt(c['loop_range_s'])}" if c.get('loop_range_s') else ' · loops whole' if c.get('loopable') else '')
        desc = (('[clip table slot ' + dead_of[c['clip_id']] + ': registered but never played] ') if c['clip_id'] in dead_of else '') + (c.get('notes') or '') + ('  ⚠ ' + '; '.join(c['issues']) if c.get('issues') else '')
        h(card(c['clip_id'], c['clip_id'].split('__', 1)[1], meta, desc, timeline(c['clip_id']), c['duration_s'], None, c))
    h('</div>')
h('</section>')

h(f'<section><h2 id="rest">4. Exported but not cataloged ({len(rest)} clips, {len(fam)} families)</h2><p class="note">No rendered preview, only per-frame timelines. _pN are blend-space variants; each family is one row, with the timeline from its first clip. '
  'To look at one, open the app in a browser with <code>?clip=&lt;id&gt;</code> to play it on a loop, or render thumbnails for it.</p>')
for k in sorted({f.split('__')[0] for f in fam}):
    ks = sorted(f for f in fam if f.startswith(k + '__'))
    h(f'<details><summary>{esc(k)} ({len(ks)} families, {sum(len(fam[f]) for f in ks)} clips)</summary><table class="fam"><thead><tr><th>Family</th><th>Clips</th><th>Duration</th><th>Type</th><th>Timeline</th></tr></thead><tbody>')
    for f in ks:
        xs = sorted(fam[f], key=lambda x: x['id']); t = timeline(xs[0]['id'])
        h(f'<tr data-q="{esc(f.lower())}"><td><code>{esc(f.split("__", 1)[1])}</code>{"<br><small>props " + esc(",".join(xs[0]["props"])) + "</small>" if xs[0].get("props") else ""}</td>'
          f'<td>{len(xs)}</td><td>{xs[0]["duration_s"]:.1f}</td><td>{esc(fam_note(f))}</td><td class="tlc">{svg(t, t["dur"] if t else xs[0]["duration_s"], compact=True)}'
          f'<small>{esc(tl_text(t))}</small></td></tr>')
    h('</tbody></table></details>')
h('</section>')

h('<section><h2 id="lib">5. Not exported</h2><table class="fam"><thead><tr><th>Category</th><th>Actions</th><th>Why not exported</th></tr></thead><tbody>')
for k, n in not_exported_actions.most_common(): h(f'<tr><td>{esc(k)}</td><td>{n}</td><td>{esc(WHY_LIB.get(k, ""))}</td></tr>')
h('</tbody></table><p class="note">rseqs not imported into the blend: ' + ', '.join(f'{esc(k)} {len(v)}' for k, v in sorted(not_imported.items(), key=lambda x: -len(x[1]))) + '</p>')
for k, v in sorted(not_imported.items(), key=lambda x: -len(x[1])):
    h(f'<details><summary>{esc(k)} ({len(v)})</summary><p class="names">{" ".join("<code>" + esc(x) + "</code>" for x in sorted(v))}</p></details>')
h('</section>')

page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unused clips</title><style>
:root{{--bg:#f6f5f2;--card:#fff;--ink:#1f1f1c;--mut:#6b6a64;--line:#dddbd4;--bgrow:#eeede8;--spd:#c2410c;--crouch:#d49a1a;--low:#8b5a2b;--air:#2f7fd1;
--arms:#7c3aed;--bubble:#db2777;--chew:#0f766e;--used:rgba(37,99,235,.13);--seg:#e7e5de;--loop:#16a34a}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#161615;--card:#20201e;--ink:#ecebe6;--mut:#a09e96;--line:#34332f;--bgrow:#2a2926;--spd:#fb923c;
--crouch:#eab308;--low:#c08457;--air:#60a5fa;--arms:#a78bfa;--bubble:#f472b6;--chew:#2dd4bf;--used:rgba(96,165,250,.18);--seg:#34332f;--loop:#4ade80}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif}}
.top{{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}}
.top h1{{font-size:17px;margin:0}}.top nav a{{color:var(--mut);margin-right:10px;text-decoration:none}}.top input{{flex:1;min-width:180px;max-width:320px;padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)}}
main{{padding:0 16px 40px;max-width:1500px;margin:auto;overflow-wrap:anywhere}}h2{{font-size:18px;margin:28px 0 4px}}.note{{color:var(--mut);margin:0 0 12px}}
.legend{{display:flex;flex-wrap:wrap;gap:4px 14px;color:var(--mut);font-size:12.5px;padding:10px 0 0}}.legend i{{display:inline-block;width:12px;height:10px;margin-right:4px;vertical-align:-1px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr));gap:12px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;min-width:0}}.card header{{display:flex;flex-wrap:wrap;gap:2px 10px;align-items:baseline}}
.card h3{{font-size:15px;margin:0}}code{{font-size:12px;color:var(--mut);word-break:break-all}}.meta{{margin:4px 0;color:var(--mut);font-size:12.5px}}.desc{{margin:4px 0 8px}}
.uses{{margin:0 0 6px;font-size:12.5px}}.tltext{{font-size:12.5px;color:var(--mut);margin:4px 0 8px}}
.tier{{display:inline-block;border-radius:4px;padding:0 6px;font-weight:600;font-size:12px;color:#fff}}.tS{{background:#b91c1c}}.tA{{background:#c2410c}}.tB{{background:#4d7c0f}}.tC{{background:#57534e}}
.tierh{{margin:18px 0 8px;font-size:15px}}.media img{{width:100%;border-radius:6px;display:block;background:var(--bgrow)}}.media video{{width:100%;border-radius:6px;margin-top:6px}}
.links{{margin-top:6px;display:flex;gap:12px;align-items:center}}.links a{{color:var(--air)}}.play{{border:1px solid var(--line);background:var(--bgrow);color:var(--ink);border-radius:6px;padding:3px 10px;cursor:pointer}}
.tl{{display:grid;grid-template-columns:auto 1fr;gap:0 6px;margin:4px 0}}.labs{{display:flex;flex-direction:column;font-size:11px;color:var(--mut);text-align:right;white-space:nowrap}}.labs span{{line-height:1;display:flex;align-items:center;justify-content:flex-end}}.labs .sp{{height:16px}}.compact .labs{{display:none}}.compact{{grid-template-columns:1fr}}.plot{{position:relative;min-width:0}}.plot svg{{width:100%;display:block}}.bg{{fill:var(--bgrow)}}.spd{{fill:var(--spd)}}.p-crouch{{fill:var(--crouch)}}.p-low{{fill:var(--low)}}.p-air{{fill:var(--air)}}.r-arms{{fill:var(--arms)}}.r-bubble{{fill:var(--bubble)}}.r-chew{{fill:var(--chew)}}.used{{fill:var(--used)}}.segs{{position:relative;height:16px}}.segs span{{position:absolute;top:1px;height:13px;background:var(--seg);font-size:10px;line-height:13px;padding:0 3px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border-radius:2px}}.loopbar{{position:absolute;bottom:0;height:2px;background:var(--loop)}}.ticks{{position:relative;height:14px;font-size:10px;color:var(--mut)}}.ticks span{{position:absolute;top:1px;transform:translateX(-50%)}}.ticks span:first-child{{transform:none}}details{{background:var(--card);border:1px solid var(--line);border-radius:10px;margin:8px 0;padding:6px 12px}}summary{{cursor:pointer;font-weight:600}}
table.fam{{width:100%;border-collapse:collapse;margin:8px 0;table-layout:fixed}}.fam td,.fam th{{border-top:1px solid var(--line);padding:6px;vertical-align:top;text-align:left}}.fam th{{color:var(--mut);font-weight:500}}
.fam th:nth-child(1){{width:26%}}.fam th:nth-child(2){{width:5%}}.fam th:nth-child(3){{width:7%}}.fam th:nth-child(4){{width:11%}}.tlc{{min-width:0}}.tlc small{{color:var(--mut);display:block}}.names code{{display:inline-block;margin:2px 6px 2px 0}}.nodata{{color:var(--mut);font-size:12px}}
.hide{{display:none!important}}@media (max-width:700px){{.fam td:nth-child(2),.fam th:nth-child(2),.fam td:nth-child(4),.fam th:nth-child(4){{display:none}}}}
</style></head><body><div class="top"><h1>Unused clips</h1><nav><a href="#dead">1 Unplayed slots</a><a href="#partial">2 Partly used</a><a href="#catalog">3 Catalog</a><a href="#rest">4 Not cataloged</a><a href="#lib">5 Not exported</a></nav>
<input id="q" type="search" placeholder="Search clip name / description"></div><main>
<p class="note" style="margin-top:12px">Asset library {len(lib)} rseqs · exported {len(exp)} clips · catalog {len(cat)} clips · played by the app {len(used)} clips. Timeline rows:</p>
<div class="legend"><span><i style="background:var(--spd)"></i>motion (darker = bigger)</span><span><i style="background:var(--crouch)"></i>crouch/bend</span><span><i style="background:var(--low)"></i>sit/lie/prone</span>
<span><i style="background:var(--air)"></i>airborne</span><span><i style="background:var(--arms)"></i>hands over head</span><span><i style="background:var(--bubble)"></i>bubble inflated</span><span><i style="background:var(--chew)"></i>chewing/talking</span>
<span><i style="background:var(--used);outline:1px solid var(--air)"></i>range in use</span><span><i style="background:var(--loop)"></i>loop range</span><span><i style="background:var(--seg)"></i>manual segments</span></div>
{"".join(H)}</main><script>
document.addEventListener('click',e=>{{const b=e.target.closest('.play');if(!b)return;const v=document.createElement('video');v.src=b.dataset.src;v.controls=true;v.autoplay=true;v.loop=true;b.closest('.card').querySelector('.media').append(v);b.remove()}})
const q=document.getElementById('q');q.addEventListener('input',()=>{{const s=q.value.trim().toLowerCase();document.querySelectorAll('[data-q]').forEach(el=>el.classList.toggle('hide',!!s&&!el.dataset.q.includes(s)));
if(s)document.querySelectorAll('details').forEach(d=>d.open=!!d.querySelector('[data-q]:not(.hide)'))}})
</script></body></html>'''
open(OUT_HTML, 'w', encoding='utf-8').write(page)
print('unplayed slots', len(dead), 'partly used', len(partial), 'unused in catalog', len(cat_unused), 'not cataloged', len(rest), '/', len(fam), 'families')
print(OUT_MD); print(OUT_HTML)
