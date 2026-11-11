// In-game UI (③ GUI) entry: the #ui layer, fonts, image variables, config / stats / XP, drives the four parts
//   hud.js     HUD at her feet (time together today + burger button / BOOM! · head pats & pokes / keystrokes)
//   xpbar.js   XP bar above her head (rank badge + level + progress)
//   rankup.js  rank-up animation
//   panel.js   settings panel (skins / size / settings)
//
// Usage from main.js:
//   const ui = await mountUI({ pet, stage, proc, brain, view, world, fx, THREE, clock, input, hooks: { setSize } })
//   every frame ui.update(dt); floor world.floor = taskbar top - ui.band; hit testing merges ui.wantsMouse(x, y) (right-clicking her doesn't open the panel, it only opens from the HUD burger)
//
// Part factory convention (same for all four): createXxx(ui) → {
//   el,               root element (has .ui-part, index mounts it into #ui)
//   update(dt, f),    every frame; f is this frame's snapshot (see frame() below), read-only. Per frame only read numbers, run springs, set transforms; no layout reads, no allocations
//   rects(),          array of rects that take the mouse [{ x, y, w, h }] (window CSS pixels), empty array when not needed (reuse the same array)
//   refresh(),        copy / config / data changed: re-lay out text, re-measure sizes (called after display toggles and demos)
//   …each part's extra methods (hud.menuRect(), xpbar.layout(), rankup.play(), panel.open() / close(), see the top of each file)
// }

import './base.css'
import { version } from '../../package.json'
import { createStore } from './store.js'
import { createI18n, allText, LANGS } from './i18n.js'
import { applyImageVars, imgUrl, imgVar } from './assets.js'
import { createStats } from './stats.js'
import { createProgress, tierColor, levelOf } from './progress.js'
import { LAYOUT, ROMAN, el, spring, approach, emitter } from './util.js'
import { createHud } from './hud.js'
import { createXpbar } from './xpbar.js'
import { createRankup } from './rankup.js'
import { createPanel } from './panel.js'

// Saira (Google Fonts latin / latin-ext slices, variable weight + width)
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'

// Fonts: Saira is added via FontFace, MiSans VF by injecting its own sliced stylesheet (font URLs are relative to that css, correct in dev and packaged)
// Show the UI once every glyph the current language needs has arrived (wait at most 2.5 s; on failure use system fonts, no error)
//  Returns { ready, done }: ready = waits at most 2.5 s (shows with fallback fonts first), done = glyphs really arrived (if after the timeout, the UI must re-measure with the real glyph widths)
let misansLink = null
function loadFonts(lang) {
  const u = (p) => new URL(p, document.baseURI).href
  if (!misansLink) {
    for (const [file, range] of [['saira-latin-wdth-normal', LATIN], ['saira-latin-ext-wdth-normal', LATIN_EXT]]) {
      document.fonts.add(new FontFace('Saira', `url("${u(`./ui/fonts/saira/${file}.woff2`)}") format("woff2")`,
        { weight: '100 900', stretch: '50% 125%', unicodeRange: range, display: 'block' }))
    }
    misansLink = el('link'); misansLink.rel = 'stylesheet'; misansLink.href = u('./ui/fonts/misans/MiSansVF.min.css')
    misansLink.ready = new Promise(r => { misansLink.onload = r; misansLink.onerror = r })
    document.head.appendChild(misansLink)
  }
  const text = allText(lang)
  const load = misansLink.ready.then(() => Promise.all([
    document.fonts.load('500 12px Saira', 'ABC0123'),
    document.fonts.load('500 12px "MiSans VF"', text),
    document.fonts.load('650 12px "MiSans VF"', text),
  ]))
  const done = load.catch(() => {})
  return { ready: Promise.race([done, new Promise(r => setTimeout(r, 2500))]), done }
}

export async function mountUI(ctx) {
  const { pet, brain, world, view, stage, input, THREE, hooks = {} } = ctx
  const api = window.petAPI || null
  const env = { overlay: !!api && !api.dev, dev: !api || !!api.dev }

  // ---------- Config ----------
  const store = createStore()
  await store.load()
  const i18n = createI18n(store.get('lang'))
  document.documentElement.lang = i18n.lang
  const cfg = {
    get lang() { return i18n.lang },
    get hud() { return store.get('hud', true) !== false },
    get xpbar() { return store.get('xpbar', true) !== false },
    get size() { return store.get('size', 'm') },
    get skin() { return new URLSearchParams(location.search).get('skin') || store.get('skin', 'base') },
    get openAtLogin() { return !!store.get('openAtLogin', false) },
    get hideOnFullscreen() { return store.get('hideOnFullscreen', true) !== false },
    get visible() { return store.get('visible', true) !== false },
    // Nap after (minutes): idle this long she lies down, 2x she falls asleep (④'s brain reads the same config key); only 3 / 5 / 10 / 20 are accepted, anything else means the default 5
    // Look (rendering is done by the look session, stage.js reads it once at startup): URL ?style= wins (dev / debugging), otherwise config key look, default 'fix' (Original)
    get look() { const q = new URLSearchParams(location.search).get('style'); const v = q || store.get('look', 'fix'); return v === 'sticker' ? 'sticker' : 'fix' },
    get sleepAfter() { const v = +store.get('sleepAfter', 5); return [3, 5, 10, 20].includes(v) ? v : 5 },
  }

  // ---------- Root layer ----------
  const root = el('div'); root.id = 'ui'
  document.body.appendChild(root)
  // Image load failure (badges and other <img>): hide it, no Chromium broken-image icon and grey box; restore once a loadable image is set (error / load don't bubble, use capture)
  root.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden' }, true)
  root.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.style.visibility = '' }, true)
  applyImageVars()
  const fonts = loadFonts(i18n.lang)

  const ev = emitter()
  const stats = createStats({ brain, pet, input, store })
  const progress = createProgress({ store, brain })
  stats.on('key', ({ n }) => progress.add('keys', n))
  stats.on('boom', ({ n }) => progress.add('boom', n))
  stats.on('touch', ({ n }) => progress.add('touch', n))
  stats.on('minute', () => progress.add('minutes', 1))

  // ---------- Per-frame snapshot f (one shared by all parts, computed once per frame by index; object reused, no allocation) ----------
  const f = {
    x: world.x, y: world.y,     // her feet (CSS pixels, window coords): raw values, change every frame
    sx: world.x,                // smoothed x (critically damped + velocity feed-forward, lags only slightly when walking; stays put when picked up / airborne): HUD and XP bar follow it
    floor: world.floor,         // the floor she stands on (= taskbar top - band)
    ground: world.floor,        // taskbar top (bottom edge of the HUD band)
    band: 0,                    // current HUD band height (0 with the HUD off; includes the front foot's perspective sink, see ui.band)
    headY: 0,                   // stable head-top height (window y): slow low-pass of the head top when standing, eases down to the lying head top when lying; doesn't follow the head bone every frame
    headX: world.x,             // stable head-top horizontal position (= sx + low-passed head offset from feet): in the lounge chair her head is to one side of her feet, so the XP bar is more accurate following this than sx
    headRawY: 0,                // this frame's head-top projection (per frame, jittery; usable e.g. as a rank-up effect origin)
    headSettled: true,          // headX / headY within 3 px of target (the XP bar waits for this when returning, so it doesn't slide after fading in)
    base: 'stand',              // brain.base: 'stand' | 'weld' | 'lounge' | 'sleep'
    act: null,                  // brain.act?.name (current action name, null = idle)
    air: false,                 // state !== 'idle' (held / falling): HUD shows the landing spot, XP bar fades out
    burst: false,               // pet.typing.phase is burst or boom (the whole burst BOOM!: riding Sheila → comic layer)
    gone: false,                // she's hidden after BOOM! (waiting to drop back in)
    ppm: view.ppm,              // pixels per meter (size s / m / l = 150 / 180 / 220)
    worldW: world.w,            // the width she can move in (dev mode subtracts the 430 px developer panel on the right): clamp horizontally to this, not innerWidth
    vw: innerWidth, vh: innerHeight,     // window size (updated on resize, not read per frame)
    panelOpen: false,           // panel open or still closing (only counts as closed once the close animation ends: the XP bar waits for it, instead of showing through a half-transparent panel)
    snap: false,                // this frame all springs jump straight to target (for demo screenshots)
  }

  // Head-top height (meters): one tracked value each for standing / lying. Sampled only when idle with no action (lie-down and get-up transitions don't count)
  // Standing: rises fast (0.35 s), falls slowly (3 s) → effectively "the max of the last few seconds", so looking down or bending doesn't drag the XP bar down
  const HEAD_TOP = 0.16                      // head bone to top of head (including the bun)
  const WALK_DROP = 0.42                     // when strolling crouched the head is this much lower than standing (measured 0.47–0.64 m, take the lower bound: the bar stays close but never covers her head)
  const WALK_LEAN = 0.25                     // when strolling the head is this far ahead of the feet (meters, measured ≈ 0.25 m at S / M / L): while walking follow this constant horizontally, not the head bone
  const head = { stand: 1.82, lounge: 1.25, sx: 0, lx: -0.3, low: 0, walk: 0, walkT: 0, lean: 0, rest: 0, quickT: 0, pvx: NaN, hv: 0, px: { x: 0, v: 0 }, dx: { x: 0, v: 0 }, init: false }
  const V = new THREE.Vector3(), V0 = new THREE.Vector3()
  const hb = pet.bones?.def_c_head
  // Projection (meters → canvas CSS pixels): stage.project allocates a new object each call; this runs every frame, so compute here and reuse V0
  const projY = (x, y) => { V0.set(x, y, 0).project(stage.camera); return (-V0.y * 0.5 + 0.5) * stage.cssH }
  const projX = (x, y) => { V0.set(x, y, 0).project(stage.camera); return (V0.x * 0.5 + 0.5) * stage.cssW }
  // Smoothed floor: when the HUD is toggled she slides to the new floor (main.js followFloor, critically damped spring ω = 10); the XP bar slides along on the same spring
  const fl = { x: world.floor, v: 0 }
  function trackHead(dt) {
    const b = brain.base, act = brain.act?.name
    let raw = null
    if (hb) {
      hb.getWorldPosition(V); raw = V.y + HEAD_TOP
      // Head horizontal speed (m/s, low-passed): after landing / getting up the head is still settling, the XP bar waits for it to stop before fading in
      if (dt > 0 && head.pvx === head.pvx) head.hv = approach(head.hv, Math.abs(V.x - head.pvx) / dt, 0.1, dt)
      head.pvx = V.x
    }
    // Transitions where we don't follow the head: lying down (bar already faded, appears at the lying pose once she's settled), burst riding Sheila (bar faded; the head top shoots up on the jump and would take seconds to come back down)
    const frozen = act === 'lieDown' || f.burst
    // Strolling: the whole stroll (including the 0.35 s crouch at the start) and 1 s after stopping count as "walking": follow fast horizontally, so the bar doesn't trail behind or drift by itself after stopping
    if (act === 'wander' && head.walkT <= 0) head.rest = head.sx      // remember the standing head position when starting: go straight back to it after stopping
    head.walkT = act === 'wander' ? 1 : Math.max(0, head.walkT - dt)
    const walking = head.walkT > 0 || Math.abs(vx.x) > 30
    // XP bar hidden or fading in (lying down / getting up / waiting after landing / panel open…): follow fast, so it's already in its final spot when fully shown instead of sliding over in plain view
    const unseen = cfg.xpbar && !ui.parts.xpbar.showing
    // Drawing / stowing the gun (typing starts, stops), landing, getting up: the head shifts 0.2–0.3 m; follow fast during this and for 1.2 s after, settling within 1–2 s instead of creeping for seconds
    head.quickT = pet.typing?.phase === 'draw' || pet.typing?.phase === 'stow' || act === 'land' || act === 'getUp' ? 1.2 : Math.max(0, head.quickT - dt)
    const quick = head.quickT > 0
    // Head horizontal offset from feet: small sways followed slowly (1.5 s, no jitter); walking fast (0.4 s); large in-place leans 0.8 s
    const hxTau = unseen ? 0.12 : walking ? 0.22 : quick ? 0.35 : Math.abs(V.x - head.sx) > 0.12 ? 0.8 : 1.5
    // Strolling: horizontal target = fixed lean (sign from walking direction, same easing in and out), not the per-frame swaying head bone;
    //  for 1 s after stopping (walkT) the target is the standing head position from before the stroll: on stopping the head lurches forward (≈ 0.2 m) and back, the bar ignores the lurch and eases all the way back
    const dir = Math.sign(vx.x) || Math.sign(head.lean)
    head.lean = approach(head.lean, act === 'wander' ? WALK_LEAN * dir : 0, 0.18, dt)
    // Vertical: while strolling use the fixed crouch height (a constant, not following the head per frame: no sink-then-jump), same easing in and out (≈ 0.5 s)
    head.walk = approach(head.walk, act === 'wander' ? WALK_DROP : 0, 0.22, dt)
    if (raw != null && brain.state === 'idle' && !act && !pet.typing?.busy) {
      head.low = 0
      if (b === 'stand' || b === 'weld') { head.stand = approach(head.stand, raw, raw > head.stand ? 0.35 : 3, dt); head.sx = approach(head.sx, head.walkT > 0 ? head.rest : V.x, hxTau, dt) }
      else { const k = unseen ? 0.12 : 0.8; head.lounge = approach(head.lounge, raw, k, dt); head.lx = approach(head.lx, V.x, k, dt) }
    } else if (raw != null && brain.state === 'idle' && (b === 'stand' || b === 'weld') && !frozen) {
      // During an action: still follow the head horizontally (when walking follow the fixed lean, bar stays above her head, not behind)
      head.sx = approach(head.sx, act === 'wander' ? head.lean : head.walkT > 0 ? head.rest : V.x, hxTau, dt)
      // Vertical: for in-place actions (back turned fixing Sheila…) only follow down slowly (1.2 s) once the head has been low for over 0.8 s, so a bend or nod doesn't move it; coming back up is still fast
      //  While walking (crouched stroll, see head.walk) and during land / get-up transitions don't follow down: on stopping / standing up the XP bar won't sink and then shoot up
      const still = !walking && act !== 'land' && act !== 'getUp'
      head.low = still && raw < head.stand - 0.12 ? head.low + dt : 0
      if (head.low > 0.8 || raw > head.stand) head.stand = approach(head.stand, raw, raw > head.stand ? 0.35 : 1.2, dt)
    }
    const lying = b === 'lounge' || b === 'sleep'
    // Meters → window coords: relative to the floor (not world.y: doesn't move on the landing bounce or while held). The spring only handles "how high the head top is above the floor", the floor itself (fl) is added directly:
    //  when the HUD toggles she slides to the new floor, and the XP bar slides at the same rate instead of lagging behind
    const hx = lying ? head.lx : head.sx, hy = lying ? head.lounge : head.stand - head.walk
    const ty = projY(hx, hy) - view.footY, tx = projX(hx, hy) - view.footX
    if (!head.init || f.snap) { head.px.x = ty; head.px.v = 0; head.dx.x = tx; head.dx.v = 0; head.init = true }
    f.headY = fl.x + spring(head.px, ty, unseen ? 14 : 5, dt)
    f.headX = f.sx + spring(head.dx, tx, unseen ? 14 : walking ? 11 : quick ? 8 : 5, dt)
    // Head-top position has caught up and the head has stopped (the XP bar waits for this before fading in: once shown it doesn't slide in plain view)
    f.headSettled = Math.abs(tx - head.dx.x) < 3 && Math.abs(ty - head.px.x) < 3 && head.hv * view.ppm < 25
    if (raw != null) f.headRawY = world.y - (view.footY - projY(0, raw))
    // Never cover the head: when on the ground the stable height is never below the current head top (if she looks up faster than the low-pass, push straight up so the XP bar never covers her face); not during the burst (bar hidden, pushing up would take seconds to come back down)
    if (raw != null && brain.state === 'idle' && !frozen && f.headY > f.headRawY + 4) { f.headY = f.headRawY + 4; head.px.x = f.headY - fl.x; if (head.px.v > 0) head.px.v = 0 }
  }

  // Horizontal follow: critically damped spring ω = 9 + 60% velocity feed-forward (at constant speed a spring lags 2v/ω; feed-forward recovers most of it, leaving a slight lag without stepping jitter)
  // Picked up / airborne: target stays where she was picked up (HUD stays on the ground, only the landing marker follows her), slides over after landing
  const SX_W = 9
  const sx = { x: world.x, v: 0 }, vx = { x: 0, px: world.x }
  let sxT = world.x, prevAct = null
  addEventListener('resize', () => { f.vw = innerWidth; f.vh = innerHeight })

  function frame(dt) {
    f.x = world.x; f.y = world.y
    f.band = ui.band
    f.floor = world.floor; f.ground = world.floor + f.band
    f.base = brain.base; f.act = brain.act?.name || null
    f.air = brain.state !== 'idle'
    const ph = pet.typing?.phase || 'none'
    f.burst = ph === 'burst' || ph === 'boom'; f.gone = !!pet.typing?.hiddenModel
    // Stroll just ended: zero the velocity feed-forward, align the smoothed x target and velocity to her feet (feed-forward and spring inertia no longer overshoot; it catches up the last dozen px from rest)
    const stopped = prevAct === 'wander' && f.act !== 'wander'
    // She starts strolling while the panel is open (the panel is fixed, she'd walk behind it and carry the burger button away): close the panel as usual
    //  (the real fix is the brain not picking a stroll while the panel is open, see the handoff notes; this is the fallback)
    if (f.act === 'wander' && prevAct !== 'wander' && panelOpen) closePanel()
    prevAct = f.act
    // Size changed: the character switches in one frame, so the UI snaps in one frame too (all springs aligned to the new position)
    if (f.ppm !== view.ppm) { f.ppm = view.ppm; f.snap = true }
    f.worldW = world.w
    f.panelOpen = panelOpen || ui.parts.panel.shown
    // Her horizontal speed on the ground (low-passed); airborne / being flung doesn't count
    const air = f.air && !f.gone
    if (dt > 0) vx.x = air || f.snap || stopped ? 0 : approach(vx.x, (world.x - vx.px) / dt, 0.12, dt)
    vx.px = world.x
    if (!air) sxT = world.x + vx.x * 0.6 * 2 / SX_W
    if (stopped) sx.v = 0
    if (f.snap) { sx.x = sxT = world.x; sx.v = 0; fl.x = world.floor; fl.v = 0 }
    f.sx = spring(sx, sxT, SX_W, dt)
    // Floor: when standing, same spring as main.js followFloor; if the floor changes while held / airborne (she naturally lands on the new floor) align directly
    if (brain.state === 'idle') spring(fl, world.floor, 10, dt); else { fl.x = world.floor; fl.v = 0 }
    trackHead(dt)
  }

  function applySize(s) {
    store.set({ size: s })
    if (env.dev) hooks.setSize?.(s)
  }

  // ---------- Panel open / close ----------
  let panelOpen = false
  const inRect = (r, x, y) => r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
  function openPanel(page) {
    const P = ui.parts.panel
    const anchor = cfg.hud ? ui.parts.hud.menuRect() : { x: f.sx, y: f.floor - 8, w: 0, h: 0 }
    P.open(page, anchor)
    // brain.pinned (④'s contract): while the panel is open she doesn't stroll, doze, or lie down on idle (the panel is fixed; walking off would put her under it)
    if (!panelOpen) { panelOpen = true; brain.pinned = true; ev.emit('panel', { open: true, page: P.page }) }
  }
  function closePanel() {
    if (!panelOpen) return
    panelOpen = false
    brain.pinned = false
    ui.parts.panel.close()
    ev.emit('panel', { open: false })
  }
  // Click anywhere outside the panel to close (global mouse: in the overlay it's uiohook's down event, in dev mode the window mousedown; the panel and HUD block their own mousedown)
  //  In dev mode the developer panel on the right doesn't count as "outside" (clicking a demo button there shouldn't close the UI panel first)
  input.on('click', (e) => {
    if (!panelOpen || (e.type && e.type !== 'down')) return
    const x = e.lx, y = e.ly
    if (env.dev && x >= world.w) return
    if (ui.parts.panel.rects().some(r => inRect(r, x, y)) || inRect(ui.parts.hud.menuRect(), x, y)) return
    closePanel()
  })
  // Esc closes: overlay / developer window go through the global keyboard hook, the browser through page keydown
  input.on('key', (e) => { if (e.cls === 'esc') closePanel() })
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel() })

  // ---------- ui object ----------
  const ui = {
    el: root, env, ctx, cfg, store, stats, progress, f, version, LAYOUT,
    parts: {},
    get lang() { return i18n.lang },
    t: (k, v) => i18n.t(k, v),
    // Current HUD band height: 0 with the HUD off (she stands back on the taskbar)
    //  The camera looks slightly down, so the front foot's contact point projects about 0.1 m × ppm below the foot reference (S 15 / M 17 / L 23 px): that's included in the band and the floor goes up a bit more,
    //  leaving ≥ 3 px between the soles / contact shadow and the HUD's first row (otherwise the front foot gets covered by the HUD plate)
    //  When the HUD is turned off, the floor only drops once it has faded (her shoes don't pass through a half-transparent HUD)
    get band() { return cfg.hud || ui.parts.hud?.shown ? LAYOUT.band + Math.ceil(LAYOUT.footSink * view.ppm) + 3 : 0 },
    on: ev.on,
    img: imgUrl,
    imgVar: (n) => `var(${imgVar(n)})`,
    // Rank info: ui.rank() is the current rank; ui.rank('gold', 4) a given rank
    //  → { tier, division, roman: 'IV', tierName: 'GOLD', name: 'GOLD IV', color: '#d0b583', badge: url, icon: url }
    rank(tier = progress.tier, division = progress.division) {
      const tierName = i18n.t('rank.' + tier), roman = ROMAN[division] || ''
      return { tier, division, roman, tierName, name: roman ? `${tierName} ${roman}` : tierName, color: tierColor(tier), badge: imgUrl('rank_' + tier), icon: imgUrl(`rank_${tier}_icon`) }
    },

    update(dt) {
      frame(dt)
      stats.update(dt, f)
      for (const k in ui.parts) ui.parts[k].update(dt, f)
      f.snap = false
    },
    // Cursor is over UI that takes the mouse (HUD, open panel): main.js merges this into hit testing, and the overlay stops passing clicks through
    wantsMouse(x, y) {
      if (!root.classList.contains('ready')) return false
      for (const k in ui.parts) for (const r of ui.parts[k].rects()) if (inRect(r, x, y)) return true
      return false
    },
    refresh() { for (const k in ui.parts) ui.parts[k].refresh() },

    openPanel, closePanel,
    togglePanel(page) { panelOpen ? closePanel() : openPanel(page) },

    // ---------- Settings (the panel and the developer panel both go through here) ----------
    setLang(l, { save = true } = {}) {
      if (!LANGS.includes(l) || l === i18n.lang) return
      i18n.set(l)
      document.documentElement.lang = l
      if (save) store.set({ lang: l })     // the main process rebuilds the tray menu in the new language when it gets this
      loadFonts(l).done.then(() => ui.refresh())     // re-measure with the real glyph widths once the new language's glyphs arrive
      ui.refresh()
      ev.emit('lang', l)
    },
    // patch may contain: hud / xpbar / size / skin / openAtLogin / hideOnFullscreen / visible / sleepAfter / look / lang
    set(patch) {
      if (patch.lang) { ui.setLang(patch.lang); patch = { ...patch }; delete patch.lang }
      if (!Object.keys(patch).length) return
      if (patch.skin) return ui.setSkin(patch.skin)
      if (patch.look) return ui.setLook(patch.look)
      seenCfg = snapCfg({ ...store.all, ...patch })     // our own write: when it's pushed back (in the browser store.set calls back immediately) don't refresh again
      if (patch.size) applySize(patch.size)
      const rest = { ...patch }; delete rest.size
      if (Object.keys(rest).length) store.set(rest)
      ui.refresh()
      ev.emit('config', patch)
    },
    // Size: the overlay writes config (main.js onConfig changes ppm); dev mode calls main.js's hook directly. No UI re-layout needed (the panel syncs its selection when ppm changes)
    setSize(s) {
      seenCfg = snapCfg({ ...store.all, size: s })
      applySize(s)
      ev.emit('config', { size: s })
    },
    // Changing the look also reloads the page (stage.js only reads it at startup): the overlay writes config key look then reloads; dev mode changes the URL param style (URL wins over config)
    async setLook(v) {
      if (v !== 'fix' && v !== 'sticker') return
      await store.flush()
      await store.set({ look: v })
      if (env.dev) {
        const q = new URLSearchParams(location.search); q.set('style', v)
        location.search = q.toString()
      } else location.reload()
    },
    // Changing skin reloads the page: the overlay writes config then reloads (same as the tray); dev mode changes the URL param (same as the developer panel)
    async setSkin(s) {
      await store.flush()
      if (env.dev) {
        const q = new URLSearchParams(location.search); q.set('skin', s)
        location.search = q.toString()
      } else {
        await store.set({ skin: s })
        location.reload()
      }
    },
    // Overlay: the main process hides the window, the tray's "Show" restores it. The developer window / browser have no tray, so a hidden pet can't come back: do nothing (the panel button is locked too)
    hidePet() { if (!env.overlay) return; closePanel(); store.set({ visible: false }) },
    async quit() { await store.flush(); api?.quit() },

    // ---------- Demo entry (for screenshots / review, deterministic, nothing persisted) ----------
    // ⚠ After one demo call, stats / XP are no longer persisted for the rest of the session (store.frozen); reload the page to restore
    // ui.demo({ lang: 'en', stats: { keys, booms, touches, togetherMs }, level: 23, frac: .62 | xp: 12345 | tier: 'gold', division: 4,
    //           hud: true, xpbar: true, x: 900, panel: 'skins' | 'size' | 'settings' | null,
    //           rankup: 'gold' | null, rankupDivision: 4, rankupFrom: { tier, division }, rankupAt: 1.2 })
    // Returns a Promise: resolves after two frames (layout and springs settled)
    async demo(o = {}) {
      store.frozen = true
      if (o.lang) ui.setLang(o.lang, { save: false })
      if (o.hud != null || o.xpbar != null) {
        const all = store.all
        if (o.hud != null) all.hud = !!o.hud
        if (o.xpbar != null) all.xpbar = !!o.xpbar
      }
      if (o.stats) stats.set(o.stats)
      if (o.xp != null) progress.set({ xp: o.xp })
      else if (o.level != null) progress.set({ level: o.level, frac: o.frac ?? 0.62 })
      else if (o.tier) progress.set({ level: levelOf(o.tier, o.division ?? 4) + 1, frac: o.frac ?? 0.62 })
      if (o.x != null) world.x = o.x
      if (o.lang) await loadFonts(o.lang).ready
      ui.refresh()
      // First snap the snapshot (smoothed x, head top) to the new position, so panel / rank-up are placed from the settled coordinates
      f.snap = true
      frame(0)
      for (const k in ui.parts) ui.parts[k].update(0, f)     // place the HUD at its new position first (the panel opens from the burger button's position)
      f.snap = true
      if ('panel' in o) o.panel ? openPanel(o.panel) : closePanel()
      if (o.rankup) {
        const to = { tier: o.rankup, division: o.rankupDivision ?? (o.rankup === 'master' || o.rankup === 'apex' ? 0 : 4) }
        ui.parts.rankup.play({ from: o.rankupFrom || null, to, full: o.rankupFull ?? true, at: o.rankupAt })
      } else if ('rankup' in o) ui.parts.rankup.stop()     // rankup: null: clear the previous frozen rank-up
      f.snap = true
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    },
  }

  // ---------- Parts ----------
  ui.parts.xpbar = createXpbar(ui)
  ui.parts.hud = createHud(ui)
  ui.parts.rankup = createRankup(ui)
  ui.parts.panel = createPanel(ui)
  for (const k in ui.parts) { ui.parts[k].el.classList.add('ui-part'); root.appendChild(ui.parts[k].el) }

  // Rank changed: play the rank-up, full version for a tier, short version for a division (if the window is hidden for fullscreen, rankup queues it and plays on return)
  progress.on('tier', ({ from, to }) => ui.parts.rankup.play({ from, to, full: true }))
  progress.on('division', ({ from, to }) => ui.parts.rankup.play({ from, to, full: false }))
  // Window hidden mid-play (fullscreen): update stops but the animation would run to the end unseen -- clear it and requeue, replay from the start when the window returns
  input.on('system', (s) => { if (s?.hidden) ui.parts.rankup.requeue() })
  // "Hide pet" from the tray / panel (the main process hides the window directly, not via system.hidden): requeue as well
  document.addEventListener('visibilitychange', () => { if (document.hidden) ui.parts.rankup.requeue() })

  // Config changed elsewhere (tray menu changed size, or another writer): follow a supported language; only refresh when a settings key changed
  //  (an unsupported saved lang such as 'zh' from older versions is ignored, so it can't swallow the refresh below)
  //  (in the overlay every data write uiStats / uiProgress also gets the whole config pushed back by the main process; those don't need a re-measure)
  const SET_KEYS = ['hud', 'xpbar', 'size', 'skin', 'visible', 'hideOnFullscreen', 'openAtLogin', 'sleepAfter', 'look']
  const snapCfg = (c) => SET_KEYS.map(k => c[k]).join('|')
  let seenCfg = snapCfg(store.all)
  store.onChange((c) => {
    if (c.lang && LANGS.includes(c.lang) && c.lang !== i18n.lang) { ui.setLang(c.lang, { save: false }); return }
    const s = snapCfg(c)
    if (s !== seenCfg) { seenCfg = s; ui.refresh() }
  })

  frame(0)
  f.snap = true
  // Fonts arrived: show the UI, the fade-in plays only this once (.boot is removed after it plays; parts returning from display: none don't replay it)
  //  Glyphs that take over 2.5 s (autostart at login when the disk is busiest): show with sizes measured on fallback fonts first, then re-measure once with the real glyph widths (on-time fonts are measured once)
  let late = false
  fonts.ready.then(() => { late = true; ui.refresh(); requestAnimationFrame(() => { root.classList.add('ready', 'boot'); setTimeout(() => root.classList.remove('boot'), 400) }) })
  fonts.done.then(() => { if (late) ui.refresh() })
  return ui
}
