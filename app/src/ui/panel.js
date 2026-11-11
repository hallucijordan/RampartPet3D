// Settings panel (opened by the HUD's burger button; right-clicking her does not open it): v3 style -- carbon backing + thin b084 frame (hatched corner tag top-left, small crosses) + Rampart-orange gradient header + stepped divider, 440 wide
//   Header: orange diamond outline holding the line-art face; title "RAMPART"; on the right the current rank's small badge + rank name + LV · XP
//   Tabs: Skins / Size / Settings, current page in bright text + line_dashed underline; "✕ Close" on the right
//   Skins page: "Owned" section header (white chamfered count plate + rule attached to its bottom) + list (b057 row frame, selected = b106 tinted red, equipped = red check) + info card on the right
//           Row size is fixed, 5 rows per screen, the rest scroll (one wheel notch = one row, smooth; square-ended scrollbar on the right like the game, draggable); rows 5–7 are placeholders (locked, grey text + lock)
//           Info card: name + rarity + preview image (real model render, assets/ui/skins/<id>.png); the arrow on the rarity-colored left strip points at the selected row (hidden when it scrolls out of view)
//           Click a row to preview, click "Equip" / double-click a row = change skin (needs a reload)
//   Size page: S / M / L cards (same row frame), line-art face drawn at the pixels-per-meter ratio, feet aligned on one line, applies instantly; selected = red frame + red check top-right (same icon and size as the skin rows)
//   Settings page: Display (HUD / XP bar / hide in fullscreen) + System (launch at startup / hide pet · quit); square toggles; quit needs two clicks
//           Last row of Display, "Look": Original / Apex Sticker two-way segmented button, writes config key look ('fix' | 'sticker'); changing it reloads the page (same as changing skin)
//           First row of System, "Nap after": 3 / 5 / 10 / 20 minute segmented button, writes config key sleepAfter (minutes; idle this long she lies down, 2x she falls asleep, read by ④)
//           Launch at startup and hide pet only work in the desktop app (overlay): the developer window / browser have no tray, so a hidden pet can't come back; quit is meaningless in a browser, also locked
//   Footer: context hint on the left (describes whatever is hovered, otherwise the app name), version on the right
//
// Factory: createPanel(ui) → { el, update(dt, f), rects(), refresh(), open(page, anchor), close(), page, shown }
//   open(page?, anchor)   page: 'skins' | 'size' | 'settings' (omitted = stay on the last page); anchor = window rect of the burger button { x, y, w, h }
//                         Opens from the burger button's side (to her right, just above the button, if it fits; otherwise the side with more room), never covers her, bottom edge above the HUD;
//                         positioned only from her body extent (constants), so the same spot opens the same way every time; stays put while open, doesn't follow her
//   close()               only plays the close animation; open state is owned by index.js (callers always use ui.closePanel() / ui.togglePanel())
//                         Open / close animations can interrupt each other: the new one continues from the current opacity and position (duration scaled by what's left), no jump frame
//   shown                 visible (open or still closing): the XP bar waits for the panel to finish closing before fading back
//   rects()               reports the panel rect while open (the overlay takes the mouse there)
// The three pages share one grid cell, panel height = tallest page, so switching pages doesn't jump and tabs don't move under the cursor
// Close triggers (wired in index.js): click ✕, click the burger again, click anywhere outside the panel (global mouse), Esc
// pointerdown / mousedown / wheel / dblclick / contextmenu inside the panel all stopPropagation, so the brain never reads them as a poke (pointerup is not blocked)

import './panel.css'
import { el, tx, setText, kfmt, snap, clamp } from './util.js'
import { icon } from './assets.js'
import { chamferPlate } from './geom.js'
import { rankText } from './rankup.js'

const PAGES = ['skins', 'size', 'settings']
const SKINS = [
  { id: 'base', rarity: 'common' },
  { id: 'hp', rarity: 'legendary' },
  { id: 'rebecca', rarity: 'collab', tag: true },
  { id: 'bear', rarity: 'epic' },
  // Placeholder rows: show off scrolling, to be replaced by new skins (any id starting with soon counts as locked)
  { id: 'soon5', rarity: 'locked', soon: true },
  { id: 'soon6', rarity: 'locked', soon: true },
  { id: 'soon7', rarity: 'locked', soon: true },
]
const OWNED = SKINS.filter(s => !s.soon)
const ROW = 48, ROW_GAP = 6, VISIBLE = 5       // fixed row size; 5 rows per screen
const PPM = { s: 150, m: 180, l: 220 }         // matches SIZES in main.js (only used to tell the current size and scale the faces)
const FACE = { s: 84, m: 100, l: 124 }        // line-art face height in the size cards: ≈ 150 : 180 : 220 (even numbers, whole pixels)
const TOGGLES = ['hud', 'xpbar', 'hideOnFullscreen']
const SLEEP = [3, 5, 10, 20]                  // "Nap after" minute choices (config key sleepAfter, default 5)

// ✕: two 1.5 px diagonals (SVG, crisp at any scale)
const X_SVG = '<svg class="xi" viewBox="0 0 8 8" width="8" height="8" aria-hidden="true"><path d="M.75.75 7.25 7.25M7.25.75.75 7.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>'

export function createPanel(ui) {
  const T = ui.t
  const sh = (cls, plate = false) => `<div class="sh ${cls}"><span class="ui-tx lab"></span>${plate ? '<span class="cnt"><span class="ui-tx"></span></span>' : ''}</div>`

  const root = el('div', 'ui-panel ui-f9')
  root.dataset.mouse = ''
  root.innerHTML = `<div class="skin ui-carbon"><i class="glow"></i></div>
    <header class="hd">
      <div class="dia"><i class="ui-ic o"></i><i class="ui-ic face"></i></div>
      <div class="ttl"><span class="ui-tx name"></span><span class="ui-tx tag"></span></div>
      <div class="who"><div class="who-t"><span class="ui-tx rk"></span><span class="ui-tx lvl"></span></div><img class="rk-ic" alt=""></div>
    </header>
    <nav class="tabs">${PAGES.map(p => `<button class="tab" data-page="${p}"><span class="ui-tx ui-t-m"></span></button>`).join('')}
      <button class="x">${X_SVG}<span class="ui-tx ui-t-s"></span></button></nav>
    <div class="bd">
      <section data-page="skins">
        <div class="list">
          ${sh('owned', true)}
          <div class="lv"><div class="lc">
          ${SKINS.map(s => `<button class="row ui-f9${s.soon ? ' soon' : ''}" data-skin="${s.id}" data-hint="${s.soon ? 'skins.soon.hint' : 'skins.dblclick'}" style="--rc: ${s.soon ? 'var(--ui-fg-4)' : `var(--ui-${s.rarity})`}">
            ${icon('ic_star', 14, 'var(--rc)', 'star')}<span class="ui-tx ui-t-m nm"></span>${s.tag ? '<span class="ui-tx ui-t-s tg"></span>' : ''}
            ${s.soon ? icon('ic_lock', 12, 'var(--ui-fg-4)', 'lk') : icon('ic_check', 12, 'var(--ui-red)', 'ck')}</button>`).join('')}
          </div><div class="sb"><i class="th"></i></div></div>
        </div>
        <div class="card">
          <div class="pv"><i class="halo"></i><img class="pi" alt=""><img class="pi" alt=""><i class="sil"></i>${icon('ic_lock', 18, 'rgba(255, 255, 255, .28)', 'slk')}</div>
          <i class="bar"></i><i class="tri"></i><i class="hatch"></i>
          <span class="ui-tx c-nm"></span>
          <span class="ui-tx c-rr"></span>
          <button class="eq ui-plate">${icon('ic_check', 8, null, 'eqk')}<span class="ui-tx ui-t-s"></span></button>
        </div>
      </section>
      <section data-page="size">
        ${sh('sz-h', true)}
        <div class="cards">${['s', 'm', 'l'].map(k => `<button class="sz ui-f9" data-size="${k}" data-hint="size.hint">
          <span class="fig">${Object.values(FACE).filter(h => h >= FACE[k]).map(h => `<i class="gl${h === FACE[k] ? ' own' : ''}" style="bottom: ${h + 1}px"></i>`).join('')}${icon('legend_face', FACE[k], null, 'face')}</span>
          <span class="lb"><span class="ui-tx ui-t-l let">${k.toUpperCase()}</span><span class="ui-tx ui-t-s nm"></span></span>
          ${icon('ic_check', 12, 'var(--ui-red)', 'cc')}</button>`).join('')}</div>
      </section>
      <section data-page="settings">
        ${sh('g-display')}
        <div class="grp">${TOGGLES.map(k => optRow(k)).join('')}
          <div class="opt look" data-hint="set.look.hint"><span class="ui-tx ui-t-m lab"></span>
            <span class="seg">${['fix', 'sticker'].map(v => `<button data-look="${v}"><span class="ui-tx ui-t-s"></span></button>`).join('')}</span></div></div>
        ${sh('g-system')}
        <div class="grp">
          <div class="opt nap" data-hint="set.sleepAfter.hint"><span class="ui-tx ui-t-m lab"></span>
            <span class="seg">${SLEEP.map(m => `<button data-sleep="${m}"><span class="ui-tx ui-t-s"></span></button>`).join('')}</span></div>
          ${optRow('openAtLogin')}
          <div class="acts">
            <button class="act hide ui-plate" data-hint="set.hidePet.hint"><span class="ui-tx ui-t-s"></span></button>
            <button class="act quit ui-plate" data-hint="set.quit.hint"><span class="ui-tx ui-t-s"></span></button>
          </div>
        </div>
      </section>
    </div>
    <footer class="ft"><span class="ui-tx hint"></span><span class="ui-tx ver"></span></footer>`
  function optRow(k) {
    const hint = { hud: 'set.hud.hint', xpbar: 'set.xpbar.hint', hideOnFullscreen: 'set.hideFullscreen.hint', openAtLogin: 'set.autostart.hint' }[k]
    return `<button class="opt tog" data-key="${k}" data-hint="${hint}" role="switch"><span class="ui-tx ui-t-m lab"></span>
      ${k === 'openAtLogin' ? icon('ic_lock', 10, 'var(--ui-fg-3)', 'lock') : ''}<span class="ui-tx ui-t-s st"></span><i class="sw"><i></i></i></button>`
  }

  const $ = (s) => root.querySelector(s)
  const $$ = (s) => root.querySelectorAll(s)
  const rows = [...$$('.row')], cards = [...$$('.sz')], tabs = [...$$('.tab')], opts = [...$$('.opt.tog')], sections = [...$$('.bd > section')]
  const card = $('.card'), list = $('.list'), eq = $('.eq'), quitB = $('.quit'), hintEl = $('.hint')

  // Button shape: two-layer plate with a 45° chamfer bottom-right (stroke ring + fill tucked under the stroke, so the fill never leaks past it)
  for (const b of [eq, ...$$('.act')]) chamferPlate(b, { br: 7 }, 1)
  // Clean masks: the white lines in the b084 source carry a black halo; used as a mask directly it gets tinted line-colored (the line becomes a 2.5 px soft edge);
  //   here alpha is recomputed from luminance (black halo → transparent) and 1 px is padded all round so the 2 px line lands on whole pixels at 0.5x. b106 only gets the padding
  cleanMask('frame_b084', '--pn-b084'); cleanMask('frame_b106', '--pn-b106')
  async function cleanMask(name, v) {
    try {
      const im = new Image(); im.src = ui.img(name); await im.decode()
      const w = im.naturalWidth + 2, h = im.naturalHeight + 2
      const c = el('canvas'); c.width = w; c.height = h
      const g = c.getContext('2d', { willReadFrequently: true })
      g.drawImage(im, 1, 1)
      const d = g.getImageData(0, 0, w, h), p = d.data
      for (let i = 0; i < p.length; i += 4) {
        p[i + 3] = Math.round(p[i + 3] * (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255)
        p[i] = p[i + 1] = p[i + 2] = 255
      }
      g.putImageData(d, 0, 0)
      root.style.setProperty(v, `url("${c.toDataURL()}")`)
    } catch { /* no canvas: use the source image (line slightly soft), no error */ }
  }

  // ---------- Events: presses inside the panel don't reach the brain / don't count as clicking outside ----------
  // mousedown also preventDefault: clicked buttons don't keep focus (in dev mode Space / Enter won't re-trigger the last clicked button)
  for (const t of ['pointerdown', 'mousedown', 'wheel', 'dblclick', 'contextmenu']) root.addEventListener(t, e => { e.stopPropagation(); if (t === 'contextmenu' || t === 'mousedown') e.preventDefault() })
  for (const b of tabs) b.addEventListener('click', () => show(b.dataset.page, true))
  $('.x').addEventListener('click', () => ui.closePanel())

  // Skins: click a row to preview, click Equip / double-click a row to change skin
  let sel = null, busy = false
  const skinOf = (id) => SKINS.find(s => s.id === id)
  for (const r of rows) {
    r.addEventListener('click', () => { if (sel === r.dataset.skin) return; sel = r.dataset.skin; syncSkins(); reveal(sel) })
    r.addEventListener('dblclick', () => equip(r.dataset.skin))
  }
  eq.addEventListener('click', () => equip(sel))
  function equip(id) {
    if (busy || !id || id === ui.cfg.skin || skinOf(id)?.soon) return
    busy = true; sel = id
    syncSkins()
    ui.setSkin(id)
  }
  // Size: applies instantly. In the overlay ppm only changes once the main process pushes the config back, so show the clicked size first
  let pendSize = null
  for (const c of cards) c.addEventListener('click', () => { pendSize = c.dataset.size; ui.setSize(pendSize); syncSize() })
  // Toggles
  for (const o of opts) o.addEventListener('click', () => {
    const k = o.dataset.key
    if (k === 'openAtLogin' && !ui.env.overlay) return
    ui.set({ [k]: !ui.cfg[k] })
    syncSettings()
  })
  for (const b of $$('.seg [data-sleep]')) b.addEventListener('click', () => { ui.set({ sleepAfter: +b.dataset.sleep }); syncSettings() })
  for (const b of $$('.seg [data-look]')) b.addEventListener('click', () => { if (b.dataset.look !== ui.cfg.look) ui.set({ look: b.dataset.look }) })
  const hideB = $('.hide')
  const canHide = () => ui.env.overlay, canQuit = () => !!window.petAPI
  hideB.addEventListener('click', () => { if (canHide()) ui.hidePet() })
  // Quit: one click turns it into "Confirm" (red), a second click within 3 s quits
  let armT = 0
  quitB.addEventListener('click', () => {
    if (!canQuit()) return
    if (quitB.classList.contains('arm')) { ui.quit(); return }
    quitB.classList.add('arm'); quitB.dataset.hint = 'set.quit.confirm.hint'
    tx(quitB.firstChild, T('set.quit.confirm')); setHint('set.quit.confirm.hint')
    clearTimeout(armT); armT = setTimeout(disarm, 3000)
  })
  function disarm() {
    clearTimeout(armT)
    quitB.classList.remove('arm'); quitB.dataset.hint = 'set.quit.hint'
    tx(quitB.firstChild, T('set.quit'))
    if (hintKey === 'set.quit.confirm.hint') setHint(null)
  }

  // Footer context hint: describes whatever is hovered
  let hintKey = null
  function setHint(k) {
    hintKey = k
    const lock = (!ui.env.overlay && (k === 'set.autostart.hint' || k === 'set.hidePet.hint')) || (k === 'set.quit.hint' && !canQuit())
    const s = lock ? T('set.desktopOnly') : T(k || 'panel.hint')
    tx(hintEl, s)
    hintEl.classList.toggle('ctx', !!k)
  }
  root.addEventListener('pointerover', (e) => { const h = e.target.closest?.('[data-hint]'); if (h && h.dataset.hint !== hintKey) setHint(h.dataset.hint) })
  root.addEventListener('pointerleave', () => setHint(null))
  for (const s of $$('.bd .grp, .bd .list, .bd .cards')) s.addEventListener('pointerleave', () => setHint(null))

  // ---------- State sync (called on refresh / after actions; not every frame) ----------
  function curSize() {
    const k = Object.keys(PPM).find(k => PPM[k] === ui.f.ppm)
    return pendSize || k || ui.cfg.size
  }
  function syncSkins() {
    const on = ui.cfg.skin
    if (!SKINS.some(s => s.id === sel)) sel = on
    for (const r of rows) {
      const id = r.dataset.skin
      r.classList.toggle('sel', id === sel)
      r.classList.toggle('on', id === on)
      r.setAttribute('aria-pressed', id === sel)
    }
    const s = skinOf(sel)
    card.style.setProperty('--rc', s.soon ? 'var(--ui-fg-4)' : `var(--ui-${s.rarity})`)
    card.classList.toggle('soon', !!s.soon)
    tx($('.c-nm'), T(s.soon ? 'skin.soon' : 'skin.' + s.id))
    tx($('.c-rr'), T(s.soon ? 'skins.locked' : 'rarity.' + s.rarity))
    const done = sel === on
    eq.classList.toggle('done', (done || !!s.soon) && !busy)
    eq.classList.toggle('busy', busy)
    tx(eq.lastChild, T(busy ? 'skins.reload' : s.soon ? 'skins.locked' : done ? 'skins.equipped' : 'skins.equip'))
    preview(s)
    placeTri()
  }
  // The info card's arrow points at the selected row: the row's offsetTop is relative to the scroll viewport .lv; subtract the scroll, then convert to the card's frame (unaffected by the open animation's scale)
  //  Hide the arrow when the row scrolls out of view (its center is outside)
  const tri = $('.tri')
  function placeTri() {
    const r = rows.find(r => r.dataset.skin === sel)
    if (!r) return
    const c = r.offsetTop - sc.y + ROW / 2
    tri.classList.toggle('off', c < 6 || c > VIEW_H - 6)
    card.style.setProperty('--tri', `${Math.round(c + lv.offsetTop + list.offsetTop - card.offsetTop)}px`)
  }

  // ---------- Preview image: two imgs cross-fade (on a change the new image slides in 8 px from the right, the old one fades out) ----------
  const pis = [...$$('.pi')], skinUrl = (id) => new URL(`./ui/skins/${id}.png`, document.baseURI).href
  root.style.setProperty('--ui-skin-soon', `url("${skinUrl('soon')}")`)
  let pvCur = 0, pvId = null, pvGen = 0, preloaded = false
  function preview(s) {
    const id = s.soon ? null : s.id
    if (id === pvId) return
    const first = !pis[pvCur].getAttribute('src')
    pvId = id
    const gen = ++pvGen, old = pis[pvCur]
    const fadeOut = () => old.animate([{ opacity: +getComputedStyle(old).opacity }, { opacity: 0 }], { duration: 140, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' })
    if (!id) { fadeOut(); return }
    const nx = first ? old : pis[pvCur ^ 1]
    nx.src = skinUrl(id)
    nx.decode().catch(() => {}).then(() => {
      if (gen !== pvGen) return
      if (!first) { fadeOut(); pvCur ^= 1 }
      nx.animate([{ opacity: 0, translate: '8px 0' }, { opacity: 1, translate: '0 0' }],
        { duration: first ? 1 : 220, delay: first ? 0 : 40, easing: 'cubic-bezier(.2,.9,.2,1)', fill: 'forwards' })
    })
  }

  // ---------- List scrolling: fixed row size, 5 per screen; one wheel notch = one row (smooth approach), square-ended scrollbar on the right is draggable, clicking the track pages ----------
  const lv = $('.lv'), lc = $('.lc'), sb = $('.sb'), th = $('.th')
  const STEP = ROW + ROW_GAP
  const VIEW_H = VISIBLE * ROW + (VISIBLE - 1) * ROW_GAP       // matches .lv height in panel.css: exactly 5 rows
  const MAX = Math.max(0, SKINS.length * STEP - ROW_GAP - VIEW_H)
  const TH_H = MAX ? Math.max(24, Math.round(VIEW_H * VIEW_H / (VIEW_H + MAX))) : VIEW_H
  th.style.height = `${TH_H}px`
  sb.classList.toggle('none', !MAX)
  const sc = { y: 0, to: 0, drawn: NaN, drag: null }
  function scrollTo(y, now = false) { sc.to = clamp(Math.round(y), 0, MAX); if (now) sc.y = sc.to; paintScroll() }
  function paintScroll() {
    const y = Math.round(sc.y)
    if (y === sc.drawn) return
    sc.drawn = y
    lc.style.transform = `translate3d(0, ${-y}px, 0)`
    th.style.transform = `translate3d(0, ${MAX ? Math.round((VIEW_H - TH_H) * y / MAX) : 0}px, 0)`
    lv.classList.toggle('up', y > 0); lv.classList.toggle('dn', y < MAX)
    placeTri()
  }
  // Scroll the selected row into view if it isn't (by the fewest rows)
  function reveal(id) {
    const i = SKINS.findIndex(s => s.id === id)
    if (i < 0) return
    const top = i * STEP, bot = top + ROW
    if (top < sc.to) scrollTo(top)
    else if (bot > sc.to + VIEW_H) scrollTo(bot - VIEW_H)
  }
  lv.addEventListener('wheel', (e) => {
    if (!MAX) return
    e.preventDefault()
    const n = Math.sign(e.deltaY)
    if (n) scrollTo((Math.round(sc.to / STEP) + n) * STEP)
  }, { passive: false })
  th.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation()
    sc.drag = { y0: e.clientY, s0: sc.y }
    sb.classList.add('drag')
    th.setPointerCapture(e.pointerId)
  })
  th.addEventListener('pointermove', (e) => { if (sc.drag) scrollTo(sc.drag.s0 + (e.clientY - sc.drag.y0) * MAX / (VIEW_H - TH_H), true) })
  const endDrag = () => { if (!sc.drag) return; sc.drag = null; sb.classList.remove('drag'); scrollTo(Math.round(sc.to / STEP) * STEP) }
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) th.addEventListener(t, endDrag)
  sb.addEventListener('pointerdown', (e) => {
    if (e.target === th) return
    const thTop = sb.getBoundingClientRect().top + (MAX ? (VIEW_H - TH_H) * sc.to / MAX : 0)
    scrollTo((Math.round(sc.to / STEP) + (e.clientY < thTop ? -(VISIBLE - 1) : VISIBLE - 1)) * STEP)
  })
  function syncSize() {
    const k = curSize()
    for (const c of cards) { c.classList.toggle('sel', c.dataset.size === k); c.setAttribute('aria-pressed', c.dataset.size === k) }
    tx($('.sz-h .cnt .ui-tx'), T('size.' + k + '.name'))
  }
  function syncSettings() {
    for (const o of opts) {
      const k = o.dataset.key, lock = k === 'openAtLogin' && !ui.env.overlay
      const v = !lock && !!ui.cfg[k]
      o.classList.toggle('on', v); o.classList.toggle('locked', lock)
      o.setAttribute('aria-checked', v)
      tx(o.querySelector('.st'), T(v ? 'set.on' : 'set.off'))
    }
    for (const b of $$('.seg [data-sleep]')) b.classList.toggle('on', +b.dataset.sleep === ui.cfg.sleepAfter)
    for (const b of $$('.seg [data-look]')) b.classList.toggle('on', b.dataset.look === ui.cfg.look)
    hideB.classList.toggle('locked', !canHide()); quitB.classList.toggle('locked', !canQuit())
  }

  // ---------- Page switching: three pages stacked in one cell, only visibility changes (panel size stays) ----------
  let page = 'skins', isOpen = false, anim = null, shown = false
  function show(p, fx = false) {
    if (!PAGES.includes(p)) return
    const prev = page
    page = p
    for (const b of tabs) { b.classList.toggle('on', b.dataset.page === p); b.setAttribute('aria-selected', b.dataset.page === p) }
    for (const s of sections) s.classList.toggle('on', s.dataset.page === p)
    if (fx && prev !== p && isOpen) {
      const dir = PAGES.indexOf(p) > PAGES.indexOf(prev) ? 1 : -1
      sections.find(s => s.dataset.page === p).animate([{ opacity: 0, translate: `${dir * 6}px 0` }, { opacity: 1, translate: '0 0' }], { duration: 180, easing: 'cubic-bezier(.2,.9,.2,1)' })
    }
    if (p !== 'settings') disarm()
  }

  // Current opacity and transform (when an animation is interrupted, the new one continues from here); only read at the moment of open / close
  function now() {
    const cs = getComputedStyle(root)
    return { opacity: +cs.opacity, transform: cs.transform === 'none' ? `translate3d(${pos.x}px, ${pos.y}px, 0)` : cs.transform }
  }

  // ---------- Position: fixed while open, bottom edge pinned ----------
  const pos = { x: 0, y: 0 }, size = { w: 0, h: 0 }, out = [], rect = { x: 0, y: 0, w: 0, h: 0 }
  let bottom = 0, vw = 0, vh = 0, worldW = 0, lastPpm = 0
  function relayout() {
    const E = ui.LAYOUT.edge, f = ui.f
    size.w = root.offsetWidth; size.h = root.offsetHeight
    vw = f.vw; vh = f.vh; worldW = f.worldW
    pos.x = snap(clamp(pos.x, E, Math.max(E, f.worldW - E - size.w)))
    pos.y = snap(clamp(bottom - size.h, E, Math.max(E, f.vh - E - size.h)))
    root.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`
  }
  // Close to her but never covering her (she + Sheila span roughly x - 0.42 m to x + 0.72 m); uses only these constants, never measures parts that move (the XP bar is faded out while open)
  // The burger button is on her right: open to the right if it fits (panel's bottom-left corner just above the button), otherwise on the side with more room
  const GAP = 16
  const body = (f) => { const x = isFinite(f.x) ? f.x : f.sx; return [x - 0.42 * f.ppm, x + 0.72 * f.ppm] }   // uses her actual current position (the smoothed one lags half a beat)
  function place(anchor) {
    const f = ui.f, E = ui.LAYOUT.edge
    size.w = root.offsetWidth
    const a = anchor && isFinite(anchor.x) ? anchor : { x: f.sx, y: f.floor - 8, w: 0, h: 0 }
    const [bodyL, bodyR] = body(f)
    const roomL = bodyL - GAP - E, roomR = f.worldW - E - (bodyR + GAP)
    const toLeft = roomR < size.w && roomL >= roomR
    pos.x = toLeft ? bodyL - GAP - size.w : bodyR + GAP
    bottom = a.y - 10
    root.style.transformOrigin = toLeft ? '100% 100%' : '0 100%'
    root.dataset.side = toLeft ? 'l' : 'r'
    relayout()
  }
  // Current open anchor (for re-placing when the window size changes): the burger button when the HUD is on, otherwise at her feet
  const anchorNow = () => ui.cfg.hud ? ui.parts.hud.menuRect() : null
  // Size changed while open: only move sideways if her body grew into the panel (160 ms, no vertical move); shrinking doesn't move it (stable position)
  function nudge() {
    const [bodyL, bodyR] = body(ui.f), x0 = pos.x
    if (root.dataset.side === 'l') pos.x = Math.min(pos.x, bodyL - GAP - size.w)
    else pos.x = Math.max(pos.x, bodyR + GAP)
    if (pos.x === x0) return
    const from = `translate3d(${x0}px, ${pos.y}px, 0)`
    relayout()
    if (pos.x !== x0) root.animate([{ transform: from }, { transform: root.style.transform }], { duration: 160, easing: 'cubic-bezier(.2,.9,.2,1)' })
  }

  // Header rank / LV / XP: written once on open, and kept up to date while open whenever XP changes (tx / setText only touch the DOM when the text changes)
  const rkEl = $('.rk'), lvlEl = $('.lvl'), rkIc = $('.rk-ic')
  function paintHead() {
    const R = ui.rank(), P = ui.progress
    tx(rkEl, R.name)
    setText(lvlEl, T('xp.full', { lv: P.level, cur: kfmt(P.cur), next: kfmt(P.next) }))
    if (rkIc.getAttribute('src') !== R.icon) rkIc.src = R.icon
    root.style.setProperty('--rank', R.color)
    root.style.setProperty('--rank-hi', rankText(R.color))     // rank name: same color as the XP bar and the rank-up banner
  }
  ui.progress.on('xp', () => { if (isOpen) paintHead() })

  const api = {
    el: root,
    get page() { return page },
    get shown() { return shown },
    update(dt, f) {
      if (!isOpen) return
      // List scrolling: exponential approach (~90 ms to settle, about the game's speed for one wheel notch); follows the pointer directly while dragging
      if (sc.y !== sc.to) {
        sc.y += (sc.to - sc.y) * (1 - Math.exp(-dt * 22))
        if (Math.abs(sc.to - sc.y) < 0.4) sc.y = sc.to
        paintScroll()
      }
      // Size changed (card clicked, or changed from the tray): once ppm arrives, sync the selection frame again; step aside if she grew into the panel
      if (f.ppm !== lastPpm) { lastPpm = f.ppm; pendSize = null; syncSize(); nudge() }
      // Window / work area changed (other monitor, taskbar auto-hide, developer panel toggled): floor and HUD moved, re-place from the current anchor
      if (f.vw !== vw || f.vh !== vh || f.worldW !== worldW) place(anchorNow())
    },
    rects() {
      out.length = 0
      if (!isOpen) return out
      rect.x = pos.x; rect.y = pos.y; rect.w = size.w; rect.h = size.h
      out.push(rect)
      return out
    },
    refresh() {
      tx($('.name'), T('app.name'))
      setText($('.tag'), T('app.tag'))
      paintHead()
      for (const b of tabs) tx(b.firstChild, T('panel.tab.' + b.dataset.page))
      tx($('.x .ui-tx'), T('panel.close'))
      setText($('.ver'), T('panel.version', { v: ui.version }))
      // Skins page
      tx($('.owned .lab'), T('skins.owned'))
      tx($('.owned .cnt .ui-tx'), T('skins.count', { n: OWNED.length, m: SKINS.length }))
      for (const r of rows) {
        tx(r.querySelector('.nm'), T(skinOf(r.dataset.skin).soon ? 'skin.soon' : 'skin.' + r.dataset.skin))
        const tg = r.querySelector('.tg'); if (tg) tx(tg, T('rarity.collab'))
      }
      // Size page
      tx($('.sz-h .lab'), T('size.title'))
      for (const c of cards) tx(c.querySelector('.nm'), T(`size.${c.dataset.size}.name`))
      // Settings page
      tx($('.g-display .lab'), T('set.display'))
      tx($('.g-system .lab'), T('set.system'))
      const LAB = { hud: 'set.hud', xpbar: 'set.xpbar', hideOnFullscreen: 'set.hideFullscreen', openAtLogin: 'set.autostart' }
      for (const o of opts) tx(o.querySelector('.lab'), T(LAB[o.dataset.key]))
      tx($('.nap .lab'), T('set.sleepAfter'))
      tx($('.look .lab'), T('set.look'))
      for (const b of $$('.seg [data-look]')) tx(b.firstChild, T('set.look.' + b.dataset.look))
      for (const b of $$('.seg [data-sleep]')) tx(b.firstChild, T('set.minutes', { n: b.dataset.sleep }))
      tx($('.hide .ui-tx'), T('set.hidePet'))
      if (!quitB.classList.contains('arm')) tx(quitB.firstChild, T('set.quit'))
      else tx(quitB.firstChild, T('set.quit.confirm'))
      setHint(hintKey)
      show(page)
      syncSize(); syncSettings()
      if (root.classList.contains('on')) syncSkins()
      if (isOpen) relayout()
    },
    open(p, anchor) {
      if (isOpen) { if (p) show(p, true); return }
      // Reopened while half closed: continue opening from how it looks now (position not recomputed, no flash)
      const back = shown ? now() : null
      root.classList.add('on'); shown = true
      if (p) show(p)
      sel = ui.cfg.skin; busy = false; hintKey = null; pendSize = null; disarm()
      if (!preloaded) { preloaded = true; for (const s of OWNED) { const im = new Image(); im.src = skinUrl(s.id) } }
      api.refresh()
      reveal(sel); sc.y = sc.to; paintScroll()
      isOpen = true
      lastPpm = ui.f.ppm
      if (!back) place(anchor)
      anim?.cancel()
      const dx = root.dataset.side === 'l' ? 10 : -10
      anim = root.animate([
        back || { opacity: 0, transform: `translate3d(${pos.x + dx}px, ${pos.y + 6}px, 0) scale(.985)` },
        { opacity: 1, transform: `translate3d(${pos.x}px, ${pos.y}px, 0) scale(1)` },
      ], { duration: back ? Math.max(60, 200 * (1 - back.opacity)) : 200, easing: 'cubic-bezier(.2,.9,.2,1)' })
      // Contents float up in sequence (header → tabs → body → footer, 35 ms apart), under 0.3 s in total
      if (!back) [...$$('.hd, .tabs, .bd, .ft')].forEach((e, i) => e.animate([{ opacity: 0, translate: '0 4px' }, { opacity: 1, translate: '0 0' }],
        { duration: 220, delay: 20 + i * 35, easing: 'cubic-bezier(.2,.9,.2,1)', fill: 'backwards' }))
    },
    close() {
      if (!isOpen) return
      isOpen = false
      disarm()
      const cur = now()      // closed while half open: close from the current opacity / position
      anim?.cancel()
      const dx = root.dataset.side === 'l' ? 6 : -6
      anim = root.animate([
        cur,
        { opacity: 0, transform: `translate3d(${pos.x + dx}px, ${pos.y + 4}px, 0) scale(.99)` },
      ], { duration: Math.max(40, 140 * cur.opacity), easing: 'cubic-bezier(.6,0,.3,1)' })
      anim.onfinish = () => { if (!isOpen) { root.classList.remove('on'); shown = false } }
    },
  }
  return api
}
