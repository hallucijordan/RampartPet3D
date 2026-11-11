// Developer panel (only in developer mode: npm run dev in the browser, or RampartPet3D.exe --dev)
//  Three tabs: ① animation triggers (simulated, sim-tests.js) ② real-input recognition (real-checks.js) ③ parameters (params-tab.js)
//  This file is the shell: layout, event log, error collection, observation hooks, status bar, tools, simulated input, test runner; look tuning lives in look.js
import * as THREE from 'three'
import { clipName } from '../clips.js'
import { LINES } from '../lines.js'
import { clock } from '../clock.js'
import { sleep, until, el } from './util.js'
import { simGroups } from './sim-tests.js'
import { mountReal } from './real-checks.js'
import { mountParams } from './params-tab.js'
import { mountLookGui } from './look.js'
import { reset as resetMusic } from '../brain/music.js'

const PANEL_W = 430

export function mountDevPanel(ctx) {
  const { pet, stage, view, world, proc, fx, brain: b } = ctx
  const input = b.input
  document.getElementById('debug').style.display = 'none'

  // ---------- Layout ----------
  const css = document.createElement('style')
  css.textContent = `
  #dp { position: fixed; top: 0; right: 0; bottom: 0; width: ${PANEL_W}px; display: flex; flex-direction: column;
    background: #14171f; color: #d8dee9; font: 13px/1.45 "Segoe UI", "Microsoft YaHei UI", sans-serif; border-left: 1px solid #2a2f3b; z-index: 1000; user-select: text; }
  #dp * { box-sizing: border-box; }
  #dp .hd { padding: 10px 12px 8px; border-bottom: 1px solid #2a2f3b; }
  #dp .ttl { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
  #dp .ttl .err { margin-left: auto; font-weight: 600; font-size: 12px; padding: 1px 8px; border-radius: 10px; background: #243025; color: #8fd19e; cursor: pointer; }
  #dp .ttl .err.bad { background: #4a1f24; color: #ff9aa5; }
  #dp .stat { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 1px 8px; margin-top: 6px; font-size: 12px; }
  #dp .stat b { color: #7d8799; font-weight: 400; }
  #dp .stat span { color: #e8edf5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #dp .bar { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; align-items: center; }
  #dp button { font: inherit; font-size: 12px; padding: 3px 10px; border-radius: 5px; border: 1px solid #3a4152; background: #232836; color: #d8dee9; cursor: pointer; }
  #dp button:hover { background: #2d3446; }
  #dp button:disabled { opacity: .35; cursor: default; }
  #dp button.pri { background: #2f4f86; border-color: #3f64a8; color: #fff; }
  #dp label { font-size: 12px; color: #aab3c2; display: inline-flex; align-items: center; gap: 3px; cursor: pointer; }
  #dp select { font: inherit; font-size: 12px; background: #232836; color: #d8dee9; border: 1px solid #3a4152; border-radius: 5px; padding: 2px 4px; max-width: 100%; }
  #dp .body { flex: 1; overflow-y: auto; padding: 4px 0 20px; }
  #dp details { border-bottom: 1px solid #222734; }
  #dp summary { padding: 7px 12px; cursor: pointer; font-weight: 700; color: #b9c4d6; list-style: none; }
  #dp summary::before { content: "▸ "; color: #5d6679; }
  #dp details[open] > summary::before { content: "▾ "; }
  #dp summary .cnt { font-weight: 400; color: #6e788b; font-size: 12px; margin-left: 6px; }
  #dp .row { padding: 6px 12px 7px 20px; border-top: 1px solid #1c202b; }
  #dp .row .top { display: flex; align-items: center; gap: 6px; }
  #dp .row .nm { flex: 1; font-weight: 600; color: #e8edf5; }
  #dp .row .dot { width: 18px; text-align: center; font-weight: 700; }
  #dp .row .cond { color: #7d8799; font-size: 12px; margin-top: 1px; }
  #dp .row .res { font-size: 12px; margin-top: 3px; white-space: pre-wrap; display: none; }
  #dp .row.pass .res { display: block; color: #8fd19e; }
  #dp .row.fail .res { display: block; color: #ff9aa5; }
  #dp .row.run { background: #1b2233; }
  #dp .row.pass .dot { color: #8fd19e; } #dp .row.fail .dot { color: #ff6b7a; } #dp .row.run .dot { color: #ffd166; }
  #dp .tools { padding: 8px 12px; display: grid; gap: 7px; }
  #dp .tools .ln { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  #dp .tools .ln > b { width: 52px; color: #7d8799; font-weight: 400; font-size: 12px; }
  #dp .log { height: 210px; border-top: 1px solid #2a2f3b; display: flex; flex-direction: column; }
  #dp .log .lb { display: flex; gap: 6px; padding: 5px 12px; align-items: center; color: #7d8799; font-size: 12px; }
  #dp .log pre { flex: 1; margin: 0; padding: 2px 12px 8px; overflow-y: auto; font: 12px/1.45 Consolas, "Microsoft YaHei UI", monospace; white-space: pre-wrap; color: #b9c4d6; }
  #dp .log .e { color: #ff9aa5; } #dp .log .w { color: #ffd166; } #dp .log .a { color: #8ab4ff; } #dp .log .t { color: #c3a6ff; } #dp .log .ok { color: #8fd19e; }
  #dp .idlebox { margin-top: 8px; padding: 6px 8px; background: #1a1f2b; border-radius: 6px; font-size: 12px; display: grid; gap: 4px; }
  #dp .idlebox b { color: #ffd166; font-weight: 600; }
  #dp .idlebox .sub { color: #7d8799; }
  #dp .tmsg { color: #8fd19e; margin-left: 6px; font-size: 12px; }
  #dp .pbar { padding: 8px 12px; margin: 0; border-bottom: 1px solid #222734; }
  #dp .prow { display: grid; grid-template-columns: 1fr 64px 40px; gap: 2px 6px; align-items: center; padding: 4px 12px 4px 20px; border-top: 1px solid #1c202b; font-size: 12px; }
  #dp .prow .pl { color: #c9d2e0; }
  #dp .prow input[type=number] { width: 64px; background: #232836; color: #e8edf5; border: 1px solid #3a4152; border-radius: 4px; padding: 1px 4px; font: inherit; }
  #dp .prow input[type=checkbox] { justify-self: start; }
  #dp .prow .pu { color: #7d8799; }
  #dp .prow .pd { grid-column: 1 / -1; color: #7d8799; font-size: 11px; }
  #dp .prow .pd:empty { display: none; }
  #dp .prow.changed { background: #2a2614; }
  #dp .prow.changed .pl { color: #ffd166; }
  #dp .tabs { display: flex; gap: 4px; margin-top: 8px; }
  #dp .tabs button { flex: 1; padding: 5px 6px; }
  #dp .tabs button.on { background: #2f4f86; border-color: #3f64a8; color: #fff; }
  #dp .note { padding: 8px 12px; color: #aab3c2; font-size: 12px; background: #1a1f2b; border-bottom: 1px solid #222734; white-space: pre-wrap; }
  #dp .mon { display: grid; grid-template-columns: 64px 1fr; gap: 2px 8px; padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #222734; }
  #dp .mon b { color: #7d8799; font-weight: 400; }
  #dp .mon span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e8edf5; }
  #dp .meter { display: inline-block; width: 110px; height: 8px; background: #232836; border-radius: 4px; vertical-align: middle; overflow: hidden; margin-right: 6px; }
  #dp .meter i { display: block; height: 100%; background: #8fd19e; }
  #dp .gui .lil-gui.root { width: 100%; --width: 100%; }
  `
  document.head.appendChild(css)
  const panel = el('div'); panel.id = 'dp'
  document.body.appendChild(panel)
  // The area under the panel is not desktop: subtract the panel width from her range
  const fitWorld = () => {
    world.w = window.innerWidth - PANEL_W
    world.x = Math.min(world.w - 80, Math.max(80, world.x))
  }
  fitWorld(); world.x = world.w * 0.6
  window.addEventListener('resize', fitWorld)
  // Interactions with the panel must not count as poking / spinning her
  for (const t of ['pointerdown', 'wheel', 'dblclick']) panel.addEventListener(t, e => e.stopPropagation())

  // ---------- Header: status + master controls ----------
  const hd = el('div', 'hd')
  hd.innerHTML = `<div class="ttl">Rampart developer panel<span class="err" title="Click to show only errors">Errors 0</span></div>
    <div class="tabs"><button data-tab="sim" class="on" title="Animation triggers (simulated): dispatch simulated signals and check that event → animation is right">① Triggers (sim)</button>
      <button data-tab="real" title="Real-input recognition: do it for real and check that real action → event is recognized">② Real input</button>
      <button data-tab="params" title="Tune event parameters (params.js), saved to tuning.json">③ Parameters</button></div>
    <div class="stat"></div>
    <div class="idlebox">
      <div>Idle <b data-k="idle">0:00</b> <span class="sub">Only keys / clicks / wheel count, mouse moves do not; thresholds are in "③ Parameters"</span></div>
    </div>
    <div class="bar simbar">
      <button class="pri" data-k="all">▶ Run all self-tests</button><button data-k="stop" disabled>Stop</button>
      <button data-k="reset" title="End the current behavior, clear poke / typing / music / cooldown state, back to standing">Reset</button>
      <button data-k="report">Copy report</button>
      <label title="Random idle fidgets interrupt tests and observation; idle tests release them automatically"><input type="checkbox" data-k="hold" checked>Pause idle fidgets</label>
    </div>`
  panel.appendChild(hd)
  const statEl = hd.querySelector('.stat'), errEl = hd.querySelector('.err')
  const btn = (k) => hd.querySelector(`[data-k="${k}"]`)
  const body = el('div', 'body')
  panel.appendChild(body)
  const pages = { sim: el('div'), real: el('div'), params: el('div') }
  const { sim: simBody, real: realBody, params: paramsBody } = pages
  for (const p of Object.values(pages)) body.appendChild(p)
  const showTab = (name) => {
    for (const x of hd.querySelectorAll('[data-tab]')) x.classList.toggle('on', x.dataset.tab === name)
    for (const [k, p] of Object.entries(pages)) p.style.display = k === name ? '' : 'none'
    hd.querySelector('.simbar').style.display = name === 'sim' ? '' : 'none'
  }
  for (const t of hd.querySelectorAll('[data-tab]')) t.onclick = () => showTab(t.dataset.tab)
  showTab('sim')

  // ---------- Event log ----------
  const logBox = el('div', 'log')
  logBox.innerHTML = `<div class="lb">Event log<label style="margin-left:auto"><input type="checkbox" checked data-k="follow">Follow</label>
    <button data-k="onlyErr">Errors only</button><button data-k="clear">Clear</button></div><pre></pre>`
  panel.appendChild(logBox)
  const pre = logBox.querySelector('pre')
  const entries = []
  let onlyErr = false
  const t0 = performance.now()
  function log(kind, text) {
    const s = ((performance.now() - t0) / 1000).toFixed(1).padStart(6)
    entries.push({ kind, line: `${s}  ${text}` })
    if (entries.length > 400) entries.shift()
    if (onlyErr && kind !== 'e') return
    const d = el('div', kind); d.textContent = entries[entries.length - 1].line
    pre.appendChild(d)
    while (pre.childNodes.length > 400) pre.firstChild.remove()
    if (logBox.querySelector('[data-k="follow"]').checked) pre.scrollTop = pre.scrollHeight
  }
  const redrawLog = () => {
    pre.textContent = ''
    for (const e of entries) if (!onlyErr || e.kind === 'e') { const d = el('div', e.kind); d.textContent = e.line; pre.appendChild(d) }
    pre.scrollTop = pre.scrollHeight
  }
  logBox.querySelector('[data-k="clear"]').onclick = () => { entries.length = 0; redrawLog() }
  const toggleErr = () => { onlyErr = !onlyErr; logBox.querySelector('[data-k="onlyErr"]').textContent = onlyErr ? 'Show all' : 'Errors only'; redrawLog() }
  logBox.querySelector('[data-k="onlyErr"]').onclick = toggleErr
  errEl.onclick = toggleErr

  // ---------- Error collection ----------
  const errors = []
  function onError(text) {
    errors.push(text)
    if (obs) obs.errors.push(text)
    errEl.textContent = 'Errors ' + errors.length; errEl.classList.add('bad')
    log('e', '✖ ' + text)
  }
  window.addEventListener('error', e => onError(`${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`))
  window.addEventListener('unhandledrejection', e => onError('Unhandled promise: ' + (e.reason?.stack || e.reason)))
  const fmt = (a) => a.map(x => x instanceof Error ? (x.stack || x.message) : typeof x === 'object' ? (() => { try { return JSON.stringify(x) } catch { return String(x) } })() : String(x)).join(' ')
  const cErr = console.error.bind(console), cWarn = console.warn.bind(console)
  console.error = (...a) => { cErr(...a); onError(fmt(a)) }
  // The brain prints exceptions from behavior scripts with console.warn (brain.run); anything carrying an Error counts as an error
  console.warn = (...a) => { cWarn(...a); if (a.some(x => x instanceof Error)) onError(fmt(a)); else log('w', '⚠ ' + fmt(a)) }

  // ---------- Observation: wrap behaviors, lines, expressions and effects to record them ----------
  let obs = null           // observation record of the current test
  const newObs = () => ({ acts: new Set(), clips: new Set(), states: new Set(), bases: new Set(), levels: new Set(), lines: [], exprs: new Set(), fx: new Set(), errors: [], blocked: [], seq: [], music: false })
  const note = (field, v, text, kind) => {
    if (obs) { obs[field].add ? obs[field].add(v) : obs[field].push(v); if (text) obs.seq.push(text) }
    if (text) log(kind, text)
  }
  const run0 = b.run.bind(b)
  b.run = (name, prio, fn) => {
    const cur = b.act
    const ok = run0(name, prio, fn)
    if (!ok) { if (obs) obs.blocked.push(name); log('w', `Behavior ${name} did not start: current ${cur?.name} (priority ${cur?.prio}) is higher`) }
    return ok
  }
  const L = b.lines, say0 = L.say.bind(L)
  L.say = (cat, o) => {
    const ok = say0(cat, o)
    note('lines', { cat, ok }, ok ? `Line ${cat}: "${b.bubble.text}"` : `Line ${cat} (not said: chance / rate limit / muted)`, ok ? 't' : '')
    return ok
  }
  const E = proc.expr
  if (E) {
    const pulse0 = E.pulse.bind(E), set0 = E.set.bind(E)
    E.pulse = (name, w, ...r) => { note('exprs', name, `Emote ${name} ${(+w).toFixed(2)}`, ''); return pulse0(name, w, ...r) }
    E.set = (name, w, src) => { if (w > 0) note('exprs', name, ''); return set0(name, w, src) }
  }
  for (const [k, zh] of [['sparks', 'sparks'], ['puff', 'dust'], ['pop', 'bubble pop']]) {
    const f0 = fx[k].bind(fx)
    fx[k] = (...a) => { note('fx', k, `FX ${zh}`, ''); return f0(...a) }
  }
  const flash0 = b.flash
  b.flash = () => { note('fx', 'flash', 'FX photo flash', ''); flash0?.() }

  // Watch state changes every frame
  const last = {}
  const watch = (name, v, field, text, kind = 'a') => {
    if (last[name] === v) return
    last[name] = v
    if (obs && v != null) obs[field].add(v)
    if (text) log(kind, text)
  }
  const sim = { audio: null }
  let holdFidget = true, testFidgets = false
  function frame() {
    requestAnimationFrame(frame)
    const now = clock.now()
    if (sim.audio) input.audio = sim.audio(performance.now())
    if (holdFidget && !testFidgets) b.nextFidget = Math.max(b.nextFidget, now + 30e3)
    const act = b.act?.name || null
    watch('act', act, 'acts', act ? `Behavior ▶ ${act}` : 'Behavior ■ none (back to base pose)')
    const ck = pet.current?.key?.replace('#twin', '') || null
    watch('clip', ck, 'clips', ck ? `  Clip ${clipName(ck)}` : null, '')
    watch('state', b.state, 'states', `State ${b.state}`)
    watch('base', b.base, 'bases', `Base pose ${b.base}`)
    watch('level', b.typing.level, 'levels', `Typing tier ${b.typing.level}`, '')
    if (b.music.on !== last.music) { last.music = b.music.on; if (obs && b.music.on) obs.music = true; log('', `Music ${b.music.on ? 'started' : 'ended'}`) }
  }
  requestAnimationFrame(frame)

  setInterval(() => {
    const a = b.act
    const s = [
      ['State', `${b.state} / ${b.base}`], ['Behavior', a ? `${a.name} (${a.prio})` : '—'],
      ['Clip', clipName(pet.current?.key)], ['Gaze', b.attn.cur],
      ['Typing', `${b.typing.level} ${input.rate().toFixed(1)}/s`], ['Pokes', `${b.pokes}`],
      ['Mood', `mood ${b.mood.toFixed(2)} arousal ${b.arousal.toFixed(2)}`], ['Music', b.music.on ? 'listening' : '—'],
      ['Cursor', input.over ? 'on her' : '—'], ['FPS', `${b.fps}`],
    ]
    statEl.innerHTML = s.map(([k, v]) => `<b>${k}</b><span title="${v}">${v}</span>`).join('')
    const idle = input.idleMs(), { lieAt, sleepAt } = b.idleThresholds()
    const next = b.base === 'stand' ? `lies down in ${mmss(lieAt - idle)}` : b.base === 'lounge' ? `falls asleep in ${mmss(sleepAt - idle)}` : b.base === 'sleep' ? 'asleep' : 'welding (will not lie down)'
    btn('idle').textContent = `${mmss(idle)} · ${next}`
  }, 200)
  const mmss = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }

  // ---------- Simulated input ----------
  const bonePt = (name) => {
    const p = stage.project(pet.bones[name].getWorldPosition(new THREE.Vector3()))
    return { x: view.left + p.x, y: view.top + p.y }
  }
  const chest = () => bonePt('def_c_spineC'), head = () => bonePt('def_c_head')
  let held = false
  const fire = (type, p, o = {}) => {
    const Ctor = type.startsWith('pointer') ? PointerEvent : type === 'wheel' ? WheelEvent : MouseEvent
    window.dispatchEvent(new Ctor(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', buttons: held ? 1 : 0, ...o }))
  }
  const h = {
    chest, head, sleep,
    move(p) { fire('mousemove', p); fire('pointermove', p) },
    // Move the cursor onto her and wait for the per-pixel hit test to register it
    async onto(p = chest()) {
      h.move(p)
      if (!await until(() => input.over, 1.5)) throw new Error('Cursor moved onto her, but the per-pixel hit test did not register it')
    },
    async glide(to, sec) {
      const from = { ...input.mouse }, n = Math.max(1, Math.round(sec / 0.016))
      for (let i = 1; i <= n; i++) { h.move({ x: from.x + (to.x - from.x) * i / n, y: from.y + (to.y - from.y) * i / n }); await sleep(0.016) }
    },
    down(p) { held = true; fire('mousedown', p, { button: 0 }); fire('pointerdown', p, { button: 0 }) },
    up(p) { held = false; fire('pointerup', p, { button: 0 }); fire('mouseup', p, { button: 0 }) },
    async click(p) { await h.onto(p); p = p || chest(); h.down(p); await sleep(0.06); h.up(p) },
    async clicks(n, gap) { for (let i = 0; i < n; i++) { await h.click(chest()); await sleep(gap) } },
    key(code, o = {}) { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, ...o })) },
    async type(perSec, sec) {
      const keys = ['KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'KeyL', 'Space']
      for (let i = 0; i < perSec * sec; i++) { h.key(keys[i % keys.length]); await sleep(1 / perSec) }
    },
    async wheel(n, gap) { for (let i = 0; i < n; i++) { fire('wheel', chest(), { deltaY: 100 }); await sleep(gap) } },
    system(s) { input.simSystem(s) },
    forget() { held = false },     // case where the OS swallows the release event: only clear the "held" flag
    // Set the base pose (stand / weld / lounge / sleep), the same way the brain enters these states itself
    setBase(x) {
      b.endAct(); b.base = x
      if (x === 'weld') input.lastKey = clock.now()     // welding goes back to standing after 3 minutes without keys
      proc.face.base = x === 'sleep' ? 1 : 0
      b.fps = x === 'sleep' ? 20 : x === 'lounge' ? 30 : 60
      b.resumeBase(0.3)
    },
  }

  // Reset to "standing, nothing has happened"
  async function reset(wait = 0.6) {
    const now = clock.now()
    if (held) h.up(input.mouse)
    b.resetForTest()           // the brain's own state (each domain module's reset)
    input.keyTimes.length = 0; input.lastKey = -1e9; input.lastInput = now; input.audio = 0; input.system = {}
    sim.audio = null
    h.move({ x: world.w + 200, y: 80 })      // move the cursor onto the panel (off her)
    b.nextFidget = now + 30e3
    if (wait) await sleep(wait)
  }

  // ---------- Behavior table (sim-tests.js) ----------
  const G = simGroups({ b, input, world, h, chest, head, fire, sim, obs: () => obs })

  // ---------- Render rows ----------
  const rows = []
  for (const g of G) {
    const d = el('details'); d.open = true
    const sum = el('summary', '', `${g.name}<span class="cnt">${g.rows.length}</span>`)
    d.appendChild(sum)
    for (const t of g.rows) {
      const r = el('div', 'row')
      const canTest = !t.manual && !!t.expect && !!(t.sim || t.play)
      r.innerHTML = `<div class="top"><span class="dot">·</span><span class="nm"></span>
        <button data-a="play" ${t.play ? '' : 'disabled title="No direct entry point; use Simulate"'}>Play</button>
        <button data-a="sim" ${canTest ? '' : 'disabled'}>Simulate</button></div>
        <div class="cond"></div><div class="res"></div>`
      r.querySelector('.nm').textContent = t.name
      r.querySelector('.cond').textContent = `Trigger: ${t.cond}${t.want ? `\nExpected: ${t.want}` : ''}`
      r.querySelector('.cond').style.whiteSpace = 'pre-wrap'
      r.querySelector('[data-a="play"]').onclick = () => { log('ok', `[Play] ${t.name}`); try { t.play() } catch (e) { onError(`${t.name} play failed: ${e.stack || e}`) } }
      r.querySelector('[data-a="sim"]').onclick = () => runOne(t)
      t.el = r; t.canTest = canTest
      rows.push(t)
      d.appendChild(r)
    }
    simBody.appendChild(d)
  }

  // ---------- Tools ----------
  const tools = el('details'); tools.innerHTML = '<summary>Tools: clips / emotes / lines / FX / base pose</summary>'
  const tb = el('div', 'tools'); tools.appendChild(tb)
  simBody.insertBefore(tools, simBody.firstChild)
  const line = (label) => { const l = el('div', 'ln', `<b>${label}</b>`); tb.appendChild(l); return l }
  const mkBtn = (parent, text, fn) => { const x = el('button', '', text); x.onclick = () => { try { fn() } catch (e) { onError(e.stack || String(e)) } }; parent.appendChild(x); return x }
  // Clips: played directly, bypassing the brain (ends the current behavior first; idle fidgets are paused)
  {
    const l = line('Clip'), sel = el('select')
    const ids = [...pet.clipMeta.keys()].sort()
    sel.innerHTML = ids.map(id => `<option value="${id}">${clipName(id) === id.replace(/^[a-z]+__rampart_/, '') ? id : clipName(id) + '  ·  ' + id}</option>`).join('')
    sel.style.width = '100%'
    l.appendChild(sel)
    const l2 = line('')
    const speed = el('input'); speed.type = 'range'; speed.min = 0; speed.max = 2; speed.step = 0.05; speed.value = 1; speed.style.width = '90px'
    const sp = el('span', '', '1.00×')
    speed.oninput = () => { sp.textContent = (+speed.value).toFixed(2) + '×'; if (pet.current) pet.current.action.timeScale = +speed.value }
    mkBtn(l2, 'Loop', () => { b.endAct(); pet.play(sel.value, { fade: 0.3, loop: true, speed: +speed.value }) })
    mkBtn(l2, 'Once', () => { b.endAct(); pet.play(sel.value, { fade: 0.3, loop: false, speed: +speed.value, onDone: () => b.resumeBase() }) })
    l2.append(speed, sp)
  }
  { const l = line('Emote'); for (const n of ['happy', 'angry', 'sad', 'surprised', 'fearful']) mkBtn(l, n, () => E.pulse(n, 0.9, 1.2, 0.8)); mkBtn(l, 'blink', () => proc.face.blink()) }
  {
    const l = line('Lines'), sel = el('select')
    sel.innerHTML = Object.keys(LINES).map(k => `<option>${k}</option>`).join('')
    l.appendChild(sel)
    mkBtn(l, 'Say', () => { const t = L.pick(sel.value); b.bubble.say(t, { force: true }); log('t', `Line ${sel.value}: "${t}" (forced)`) })
    const mute = el('label', '', '<input type="checkbox">Mute bubble'); mute.firstChild.onchange = (e) => { b.bubble.muted = e.target.checked }
    // Speech bubbles are not released yet (SHOW in bubble.js); this is only for previewing them during development
    const show = el('label', '', '<input type="checkbox">Show bubble (unreleased)'); show.firstChild.checked = b.bubble.show
    show.firstChild.onchange = (e) => { b.bubble.show = e.target.checked }
    l.append(mute, show)
  }
  {
    const l = line('FX')
    mkBtn(l, 'Sparks', () => b.sparkFromSheila(12, 1.4))
    mkBtn(l, 'Dust', () => fx.puff(new THREE.Vector3(0, 0, 0), 10, 0.5))
    mkBtn(l, 'Bubble pop', () => { const o = pet.root.getObjectByName('bubblegum__bubblegumCore'); fx.pop(o ? o.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.6, 0.1)) })
    mkBtn(l, 'Photo flash', () => b.flash())
    mkBtn(l, 'Barrel spin', () => proc.sheila.poke(3))
  }
  {
    const l = line('Base')
    for (const [k, zh] of [['stand', 'Stand'], ['weld', 'Weld'], ['lounge', 'Lounge'], ['sleep', 'Sleep']]) mkBtn(l, zh, () => h.setBase(k))
    const tur = el('label', '', '<input type="checkbox" checked>Tripod repaired'); tur.firstChild.onchange = (e) => { b.turretOK = e.target.checked }
    l.appendChild(tur)
  }
  {
    const l = line('Skin'), q = new URLSearchParams(location.search)
    for (const [k, zh] of [['base', 'Standard'], ['hp', 'Heritage'], ['rebecca', 'Rebecca'], ['bear', 'Bear']]) {   // same set as the tray menu (electron/menu.js SKINS)
      const x = mkBtn(l, zh, () => { q.set('skin', k); location.search = q.toString() })   // changing skin needs a page reload
      if ((q.get('skin') || 'base') === k) x.classList.add('pri')
    }
  }
  // In-game style UI (src/ui/): open panels, demo rank-up, add XP / BOOM!, clear today's stats, switch language, toggle HUD / XP bar
  if (ctx.ui) {
    const ui = ctx.ui
    const l = line('UI')
    for (const [p, zh] of [['skins', 'Skins page'], ['size', 'Size page'], ['settings', 'Settings page']]) mkBtn(l, zh, () => ui.openPanel(p))
    const l2 = line('')
    const sel = el('select')
    sel.innerHTML = ['rookie', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'apex'].map(t => `<option value="${t}"${t === 'gold' ? ' selected' : ''}></option>`).join('')
    const names = () => { for (const o of sel.options) o.textContent = ui.t('rank.' + o.value) }
    names(); ui.on('lang', names)
    const short = el('label', '', '<input type="checkbox">Short (division)')
    l2.append(sel, short)
    // Master / Apex Predator have no divisions: short version is locked
    const noDiv = () => sel.value === 'master' || sel.value === 'apex'
    const syncShort = () => { short.firstChild.disabled = noDiv(); if (noDiv()) short.firstChild.checked = false }
    sel.onchange = syncShort; syncShort()
    mkBtn(l2, 'Demo rank-up', () => {
      const tier = sel.value, full = !short.firstChild.checked
      // Full version: from the previous tier (rankup steps back from `to`) up to IV of the chosen tier; short version: IV → III within the same tier
      const to = { tier, division: noDiv() ? 0 : full ? 4 : 3 }
      ui.parts.rankup.play({ from: full ? null : { tier, division: 4 }, to, full })
      log('ok', `Demo rank-up → ${ui.rank(to.tier, to.division).name} (${full ? 'full' : 'short'})`)
    })
    const l3 = line('')
    mkBtn(l3, '+100 XP', () => ui.progress.add('xp', 100))
    mkBtn(l3, '+1 BOOM', () => ui.stats.fake('boom'))
    mkBtn(l3, 'Reset daily stats', () => ui.stats.resetToday())
    const l4 = line('')
    for (const [k, t] of [['hud', 'Show HUD'], ['xpbar', 'Show XP bar']]) {
      const c = el('label', '', `<input type="checkbox">${t}`)
      c.firstChild.checked = ui.cfg[k]
      c.firstChild.onchange = (e) => ui.set({ [k]: e.target.checked })
      ui.on('config', () => { c.firstChild.checked = ui.cfg[k] })
      l4.appendChild(c)
    }
  }
  {
    const l = line('Look')
    const wrap = el('div', 'gui'); wrap.style.width = '100%'; l.appendChild(wrap)
    mountLookGui(wrap, ctx)
  }

  // ---------- Run tests ----------
  let running = false, stopFlag = false
  const results = new Map()
  const summarize = (o) => {
    const parts = []
    if (o.acts.size) parts.push('behavior ' + [...o.acts].join(' → '))
    if (o.clips.size) parts.push('clip ' + [...o.clips].map(clipName).join(' → '))
    if (o.states.size > 1) parts.push('state ' + [...o.states].join(' → '))
    if (o.bases.size > 1) parts.push('base pose ' + [...o.bases].join(' → '))
    if (o.levels.size > 1) parts.push('typing ' + [...o.levels].join(' → '))
    if (o.lines.length) parts.push('lines ' + o.lines.map(l => l.cat + (l.ok ? '' : ' (not said)')).join(', '))
    if (o.exprs.size) parts.push('emotes ' + [...o.exprs].join(', '))
    if (o.fx.size) parts.push('FX ' + [...o.fx].join(', '))
    if (o.blocked.length) parts.push('blocked ' + o.blocked.join(', '))
    if (o.errors.length) parts.push('errors ' + o.errors.length + ' (see event log)')
    return parts.join('\n') || 'nothing observed'
  }
  function setRow(t, cls, text) {
    t.el.classList.remove('pass', 'fail', 'run')
    if (cls) t.el.classList.add(cls)
    t.el.querySelector('.dot').textContent = cls === 'pass' ? '✓' : cls === 'fail' ? '✗' : cls === 'run' ? '…' : '·'
    t.el.querySelector('.res').textContent = text || ''
  }
  async function runOne(t, quiet = false) {
    if (running && !quiet) return
    const solo = !running
    if (solo) { running = true; busyUI(true) }
    setRow(t, 'run')
    t.el.scrollIntoView({ block: 'nearest' })
    log('ok', `[Simulate] ${t.name}`)
    let ok = false, why = ''
    try {
      input.simOnly = true
      await reset()
      testFidgets = !!t.fidgets
      const before = { patCount: b.pat.count, dizzy: b.spin.dizzyUntil, x: world.x }
      obs = newObs()
      obs.states.add(b.state); obs.bases.add(b.base)
      const cur = pet.current?.key; if (cur) obs.clips.add(cur.replace('#twin', ''))
      await (t.sim || t.play)(h)
      ok = await until(() => t.expect(obs, before), t.timeout ?? 3)
      if (ok && obs.errors.length) { ok = false; why = 'Behavior appeared, but errors occurred meanwhile\n' }
    } catch (e) {
      why = 'Simulation script error: ' + (e.message || e) + '\n'
    } finally {
      const o = obs; obs = null
      // After simulated music (sim.audio): zero the volume reading and reset music state (via the events module's own music reset, not by poking fields); otherwise "listening" lingers for a few seconds, and forever in the browser with no real audio
      const hadAudio = !!sim.audio || b.music?.on
      input.simOnly = false; testFidgets = false; sim.audio = null
      if (hadAudio) { input.audio = 0; resetMusic(b) }
      if (held) h.up(input.mouse)
      input.system = {}; b.quietApp = false
      const detail = why + (ok ? '' : `Expected: ${t.want}\nActual: `) + (o ? summarize(o) : '')
      results.set(t.id, { t, ok, detail })
      setRow(t, ok ? 'pass' : 'fail', detail)
      log(ok ? 'ok' : 'e', `${ok ? '✓ passed' : '✗ failed'}: ${t.name}`)
      if (solo) { running = false; busyUI(false) }
    }
    return ok
  }
  function busyUI(on) {
    btn('all').disabled = on; btn('stop').disabled = !on
    for (const x of simBody.querySelectorAll('.row button')) x.disabled = on || (x.dataset.a === 'sim' ? !rows.find(r => r.el.contains(x)).canTest : !rows.find(r => r.el.contains(x)).play)
  }
  btn('all').onclick = async () => {
    if (running) return
    running = true; stopFlag = false; busyUI(true)
    const list = rows.filter(t => t.canTest)
    for (const t of list) setRow(t, null)
    let pass = 0
    for (const t of list) { if (stopFlag) break; if (await runOne(t, true)) pass++ }
    await reset(0)
    running = false; busyUI(false)
    log(pass === list.length ? 'ok' : 'e', `Run all self-tests: ${pass} / ${list.length} passed${stopFlag ? ' (stopped early)' : ''}`)
  }
  btn('stop').onclick = () => { stopFlag = true; log('w', 'Stop received: stopping after the current item') }
  btn('reset').onclick = () => { if (!running) reset(0).then(() => log('ok', 'Reset done')) }
  btn('hold').onchange = (e) => { holdFidget = e.target.checked }
  btn('report').onclick = async () => {
    const lines = ['# Rampart developer panel report', `Time: ${new Date().toLocaleString()}`, '']
    const done = [...results.values()]
    lines.push(`Tests: ${done.filter(r => r.ok).length} / ${done.length} passed`, '')
    for (const r of done) lines.push(`- ${r.ok ? '✓' : '✗'} ${r.t.name}${r.ok ? '' : '\n  ' + r.detail.replace(/\n/g, '\n  ')}`)
    const real = [...realResults.values()]
    if (real.length) { lines.push('', `## Real-input recognition: ${real.filter(r => r.ok).length} / ${real.length} recognized`); for (const r of real) lines.push(`- ${r.ok ? '✓' : '✗'} ${r.name}: ${r.text}`) }
    lines.push('', `## Errors (${errors.length})`, ...errors.map(e => '- ' + e))
    const text = lines.join('\n')
    try { await navigator.clipboard.writeText(text); log('ok', 'Report copied to clipboard') } catch { log('w', 'Clipboard unavailable, report printed to the DevTools console (F12)'); console.log(text) }
  }
  // ---------- ② real-input recognition (real-checks.js), ③ parameters (params-tab.js) ----------
  const realResults = new Map()
  mountReal({ b, input, world, log, realBody, reset, onError, realResults })
  mountParams({ b, log, onError, body: paramsBody })
  log('ok', 'Developer panel ready: "Play" triggers directly, "Simulate" triggers under real conditions and judges automatically; F12 opens DevTools, Ctrl+R reloads')
}
