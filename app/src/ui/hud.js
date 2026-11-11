// HUD at her feet (modeled on the match HUD in the top-right corner): pinned in the HUD band below the floor, follows her horizontally
//
//   Row 1: [squad icon 2:14 (time together today, no label: a label felt awkward)]  [burger button (light plate, outline turns Rampart orange while the panel is open)]
//   Row 2: [skull BOOM! count / handshake head pats + pokes]  [damage icon keystrokes]
//   Both rows right-align on one slant: row 2 is shifted left by slant × (row height + gap) / row height, so the right edges form one slanted line
//
// Factory: createHud(ui) → { el, update(dt, f), rects(), refresh(), menuRect(), shown }
//   shown        still visible (on, or turned off but not fully faded): index.js's ui.band uses it to decide when the floor drops back to the taskbar
//   menuRect()   window rect of the burger button { x, y, w, h } (the panel opens from here; clicking it doesn't count as "clicking outside the panel")
// Takes from ui:
//   ui.f (smoothed x sx, raw feet x / y, ground / floor, state / base, ppm, worldW, snap), ui.LAYOUT (row height, gap, slant, stroke)
//   ui.stats.today + ui.stats.on('change'), ui.t('hud.*'), ui.cfg.hud, ui.on('panel'), ui.togglePanel()
//
// Layout (all whole pixels: block widths and content positions land on whole pixels so icons and text stay sharp)
//   · Text: numbers .ui-t-s (cap height 8, 6 above and below in a 20 px row), weight 500, width 100% -- like the source: numbers take about 0.4–0.48 of the plate height, narrow and light (earlier ones were too big and bold);
//     color --ui-fg-hi (soft off-white, not harsh), cap height is even so it centers exactly
//   · Icon box height 14 (ink ≈ 12, 1.2x the numbers, matching the mockup / source), even height in a 20 px row leaves exactly 3 above and below, centered by box, no extra offset
//   · 12 px padding left and right inside a block: at half height of the parallelogram that's 8.5 px from the slant (about 7 px from the stroke's inner edge), same proportion as the source
//   · Gaps between blocks and between rows are both 3 px; divider slashes are parallel to the blocks' slanted sides
// Numbers: tabular digits, each number inside a fixed-width box (width from digit count, whole pixels); when the digit count changes the box width eases (180 ms, ease-out) and the block stretches with it, the new number fades from faint to solid (no clipping, no frame ever reads as a different number)
// States: picked up / airborne → rows drop to 80% (no landing guide line or label: not needed), held for 0.2 s after landing;
//       asleep → whole thing drops to 45%; HUD toggle → fades in / out, in two steps with her floor change: off = fade first (≈ 130 ms) then the floor drops (ui.band checks shown),
//       on = floor rises first, she stands on the new floor, then it fades in (her shoes never pass through it mid-fade)
// Per frame only: springs / approaches, set transform and opacity (only when values change); sizes are computed and cached when content changes, no layout reads

import './hud.css'
import { el, setText, hmm, kfmt, snap, softClamp, place, fade, approach } from './util.js'
import { bluntPlate } from './geom.js'
import { icon } from './assets.js'

// White icon (tinted via mask): height h, width rounded (element box lands on whole pixels)
const ic = (name, h, cls) => icon(name, h, null, cls, true)
// Fixed-width box around a number
const nw = (cls, key) => `<span class="nw ${cls}" data-k="${key}"><span class="ui-tx v-${key} ui-t-s ui-num"></span></span>`

// Number text: plain digits, k beyond 5 digits (123k); time together as H:MM
const num = (n) => n < 1e5 ? String(Math.max(0, Math.floor(n))) : kfmt(n)

export function createHud(ui) {
  const L = ui.LAYOUT
  const H = L.hudRow, S = L.hudSlant, GAP = L.hudGap
  const SHIFT = Math.round(S * (H + GAP) / H)          // row 2 left shift (right edge on the same slant)
  const TOTAL_H = 2 * H + GAP

  const root = el('div', 'ui-hud')
  root.style.setProperty('--hud-skew', `${(-Math.atan(S / H) * 180 / Math.PI).toFixed(2)}deg`)   // divider slashes parallel to the blocks' slanted sides
  root.innerHTML = `
    <div class="rows" data-mouse>
      <div class="hr r1">
        <div class="pl ui-plate dots b-tg">${ic('hud_squad', 14, 'i-squad')}${nw('', 'time')}</div>
        <div class="pl ui-plate menu"><i class="burger"></i></div>
      </div>
      <div class="hr r2" style="right: ${SHIFT}px">
        <div class="pl ui-plate dots b-bt">${ic('hud_kills', 14, 'i-kills')}${nw('', 'booms')}<i class="sep"></i>${ic('hud_assist', 14, 'i-assist')}${nw('', 'touches')}</div>
        <div class="pl ui-plate dots b-k">${ic('hud_damage', 14, 'i-keys')}${nw('', 'keys')}</div>
      </div>
    </div>`
  const $ = (s) => root.querySelector(s)
  const rows = $('.rows'), r2 = $('.r2'), menu = $('.menu')
  const blk = { tg: $('.b-tg'), menu, bt: $('.b-bt'), k: $('.b-k') }
  const icons = { booms: $('.i-kills'), touches: $('.i-assist'), keys: $('.i-keys'), time: $('.i-squad') }
  // Per value: outer box (fixed width), text, its block, current text, current width
  const V = {}
  for (const w of root.querySelectorAll('.nw')) V[w.dataset.k] = { box: w, t: w.firstElementChild, s: '', w: -1 }
  V.time.blk = 'tg'; V.booms.blk = V.touches.blk = 'bt'; V.keys.blk = 'k'

  // Shape: every block uses the same geometry (height 20, offset 7, stroke 1.5); the burger's stroke thickens to 2 while open (whole pixels, so the orange edge stays sharp)
  for (const p of root.querySelectorAll('.pl')) bluntPlate(p, { h: H, s: S }, L.hudStroke)

  // Presses on the HUD don't reach the brain (not a poke). pointerup is not blocked
  // Pressing a block other than the burger = clicking outside the panel: close the panel ourselves (dev mode's "click outside to close" listens to window presses, which are blocked here; the overlay uses the global mouse, closing twice is harmless)
  for (const t of ['pointerdown', 'mousedown', 'wheel', 'dblclick', 'contextmenu']) rows.addEventListener(t, e => { e.stopPropagation(); if (t === 'contextmenu') e.preventDefault() })
  rows.addEventListener('pointerdown', e => { if (!menu.contains(e.target)) ui.closePanel() })
  // Burger: open / close the panel
  menu.addEventListener('click', () => ui.togglePanel())
  ui.on('panel', ({ open }) => {
    if (menu.classList.contains('open') === open) return
    menu.classList.toggle('open', open)
    bluntPlate(menu, { h: H, s: S }, open ? 2 : L.hudStroke)
  })

  // Display state: vis fades with the toggle, dim darkens when asleep / airborne; off = already display: none; while inst > 0 number box widths skip the transition
  let vis = ui.cfg.hud ? 1 : 0, dim = 1, wasAir = false, off = false, inst = 2, settle = 0, dprAt = 0

  // ---------- Sizes (only computed when content changes) ----------
  // adv: advance of digit glyphs (tabular digits + letter spacing), measured once on refresh; block width = fixed part of the block (padding, icons, gaps) + each number box width
  const adv = { d: 0, ':': 0, '.': 0, k: 0, M: 0 }, LS = { num: 0 }
  const fixed = { tg: 0, menu: 0, bt: 0, k: 0 }
  const size = { w: 0, r1: 0, r2: 0, menu: 0 }
  const probe = el('span', 'ui-tx ui-t-s ui-num probe')
  const probeP = root.appendChild(el('span', 'ui-tx ui-t-s ui-num pn probe'))
  // Keystrokes: tabular digits, computed from digit count (changes on every key, no layout reads); the other three use proportional digits (a "1" doesn't leave half a cell empty), they change rarely, so measure directly
  // The letter spacing after the last glyph isn't counted (when right-aligned the ink sits flush with the box's right edge)
  const textW = (k, s) => {
    if (off) return 0
    if (k !== 'keys') { probeP.textContent = s; return Math.ceil(probeP.getBoundingClientRect().width - LS.num) }
    let w = 0
    for (const c of s) w += (c >= '0' && c <= '9') ? adv.d : (adv[c] ?? adv.d)
    return Math.ceil(w - LS.num)
  }
  function measure() {
    root.appendChild(probe)
    const m = (s) => { probe.textContent = s.repeat(10); return probe.getBoundingClientRect().width / 10 }
    adv.d = m('0'); for (const c of [':', '.', 'k', 'M']) adv[c] = m(c)
    LS.num = parseFloat(getComputedStyle(probe).letterSpacing) || 0
    probe.remove()
    // Fixed part = block width - current widths of the number boxes in it (both read at the same moment, so it holds mid-transition too)
    for (const k in fixed) {
      let w = blk[k].getBoundingClientRect().width
      for (const v of Object.values(V)) if (v.blk === k) w -= v.box.getBoundingClientRect().width
      fixed[k] = Math.round(w)
    }
  }
  function layout() {
    const bw = (k) => fixed[k] + Object.values(V).reduce((a, v) => a + (v.blk === k ? Math.max(0, v.w) : 0), 0)
    size.menu = fixed.menu
    size.r1 = bw('tg') + GAP + size.menu
    size.r2 = bw('bt') + GAP + bw('k')
    size.w = Math.max(size.r1, size.r2 + SHIFT)
  }
  // Write one value: only touch the DOM when the text changed; set the box width when the width changed (CSS transition); brighten slightly on increase
  function put(k, s, w) {
    const v = V[k]
    if (v.s === s) return false
    v.s = s
    setText(v.t, s)
    // More digits: while the box width is still transitioning the new number pokes slightly past the box's left edge, so it fades from faint to solid (160 ms) and never half-reads as another number
    if (w > v.w && v.w > 0 && !root.classList.contains('inst') && ui.el.classList.contains('ready'))
      v.t.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: 160, easing: 'cubic-bezier(.2, .9, .2, 1)' })
    if (w !== v.w) { v.w = w; v.box.style.width = `${w}px` }
    return true
  }

  // ---------- Feedback on number changes: a restrained brightening ----------
  // Number: from a brighter white back to normal (high-frequency typing only brightens a little, BOOM! / head pat / full minute more noticeably); the icon brightens too, BOOM!'s skull with a touch of Rampart orange
  const FLASH = {
    keys: { c: '#f3f4f5', glow: 'rgba(255, 255, 255, 0)', ms: 260 },
    time: { c: '#ffffff', glow: 'rgba(255, 255, 255, .35)', ms: 900 },
    touches: { c: '#ffffff', glow: 'rgba(255, 255, 255, .45)', ms: 700, ic: '#ffffff' },
    booms: { c: '#ffffff', glow: 'rgba(245, 162, 58, .55)', ms: 1100, ic: 'var(--ui-rampart)' },
  }
  const anim = {}
  function flash(k) {
    const F = FLASH[k]
    if (!F || !root.isConnected || !ui.el.classList.contains('ready')) return
    anim[k]?.cancel(); anim[k + 'i']?.cancel()
    const ease = 'cubic-bezier(.2, .6, .3, 1)'
    anim[k] = V[k].t.animate([{ color: F.c, textShadow: `0 0 6px ${F.glow}, 0 1px 1px rgba(0, 0, 0, .38)`, offset: 0 }], { duration: F.ms, easing: ease })
    if (F.ic) anim[k + 'i'] = icons[k].animate([{ backgroundColor: F.ic, offset: 0 }], { duration: F.ms * 1.2, easing: ease })
  }

  function fill(flashKey) {
    const s = ui.stats.today
    const vals = { time: hmm(s.togetherMs), booms: num(s.booms), touches: num(s.touches), keys: num(s.keys) }
    let changed = false
    for (const k in vals) {
      const was = V[k].s
      if (vals[k] === was) continue                     // unchanged values aren't measured (textW reads layout); refresh clears s first, so everything is re-measured
      if (put(k, vals[k], textW(k, vals[k]))) {
        changed = true
        // Only brighten when this item actually increased (resets, demos, refreshes don't flash)
        if (flashKey && (flashKey === k || (flashKey === 'togetherMs' && k === 'time')) && was !== '') flash(k)
      }
    }
    if (changed) layout()
  }
  ui.stats.on('change', ({ key, delta }) => fill(delta > 0 ? key : null))

  // ---------- Per frame ----------
  const pos = { x: NaN, y: NaN }, rowsA = { a: NaN }, rootA = { a: NaN }
  const out = [], R1 = { x: 0, y: 0, w: 0, h: 0 }, R2 = { x: 0, y: 0, w: 0, h: 0 }

  function update(dt, f) {
    // Toggle: fade in / out, display: none only once fully faded (fades in from 0 when turned back on)
    // Just turned on while she's still sliding to the new floor (standing, > 3 px from the floor): don't show yet
    const on = ui.cfg.hud && !(vis < 0.01 && !f.air && Math.abs(f.y - f.floor) > 3 && !f.snap)
    vis = f.snap ? +on : approach(vis, +on, on ? 0.08 : 0.045, dt)
    if (!on && vis < 0.01) { if (!off) { off = true; root.classList.add('off'); wasAir = false } return }
    if (off) { off = false; root.classList.remove('off'); api.refresh() }   // sizes can't be measured while off, re-measure on the frame it turns on
    // Row 2's offset (23 px) snapped to device pixels: at 125% / 150% scaling 23 × dpr isn't an integer, and row 2's baseline would round the opposite way from row 1's
    if (devicePixelRatio !== dprAt) { dprAt = devicePixelRatio; r2.style.top = `${snap(H + GAP)}px` }
    // Demo / just mounted: number box widths skip the transition and go straight to size (restored after two frames)
    if (f.snap) inst = 2
    if (inst > 0) { root.classList.add('inst'); if (--inst === 0) root.classList.remove('inst') }

    // Position: right edge a little right of her body (near Sheila's muzzle), eases in softly at the edges of the movement area (same as the XP bar: decelerates, no hard stop)
    const X = snap(softClamp(f.sx + 0.62 * f.ppm, L.edge + size.w, f.worldW - L.edge, 20))
    const Y = snap(f.ground - L.hudBottom - TOTAL_H)
    place(root, X, Y, pos)

    // Dimming: asleep 45%, picked up / airborne 80%
    //  Also 80% for 0.2 s right after landing: for those few frames the front foot isn't back yet and pokes into the HUD (the root cause is the landing pose, this only softens the overlap)
    const air = f.air && !f.gone
    if (wasAir && !air && !f.snap) settle = 0.2
    wasAir = air
    if (settle > 0) settle -= dt
    const tgt = f.base === 'sleep' ? 0.45 : f.air || settle > 0 ? 0.8 : 1
    dim = f.snap ? tgt : approach(dim, tgt, tgt < dim && f.base === 'sleep' ? 0.6 : 0.15, dt)
    fade(rows, dim, rowsA)
    fade(root, vis, rootA)
  }

  const api = {
    el: root,
    update,
    get shown() { return !off && vis > 0.05 },
    rects() {
      out.length = 0
      if (!ui.cfg.hud || off || isNaN(pos.x)) return out
      R1.x = pos.x - size.r1; R1.y = pos.y; R1.w = size.r1; R1.h = H
      R2.x = pos.x - SHIFT - size.r2; R2.y = pos.y + H + GAP; R2.w = size.r2; R2.h = H
      out.push(R1, R2)
      return out
    },
    refresh() {
      if (off) return                                   // can't measure while display: none (all widths are 0), update calls this again on the frame it turns on
      // Re-lay out all text: widths go straight to size this round, no transition
      root.classList.add('inst'); inst = 2
      measure()
      // Glyph widths may have changed (fonts just arrived): recompute all number boxes
      for (const k of ['time', 'booms', 'touches', 'keys']) V[k].s = ''
      fill(null)
      layout()
    },
    // New object (only called on click / panel open; the panel may keep it as its open anchor)
    menuRect() {
      return { x: pos.x - size.menu, y: pos.y, w: size.menu, h: H }
    },
  }
  return api
}
