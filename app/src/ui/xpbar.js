// XP bar above her head: rank badge + rank name (rank color) + LV + thin progress bar + "3.1k / 5.0k XP"
//   Look per mockup v5: carbon backing at about 60% opacity, fading left and right (linear-gradient mask), no border; 240 wide (widened to fit a long rank name, even)
//   Progress bar: both ends slanted (same direction as the HUD parallelograms at her feet), rank color → light gradient anchored to the track, a bright leading edge + a small glow
//     Gaining XP: a semi-transparent "preview" segment jumps to the new value first, the solid bar catches up (critically damped spring, no overshoot)
//     Level up: solid bar fills → white flash → grows from 0 to the new progress; LV switches at the flash
//     While not visible (she's in BOOM! / airborne / asleep) it doesn't move, and grows in front of you once it's back
//   Position: horizontally follows f.headX (stable head-top x), vertically 10 px above f.headY (stable head-top height); coordinates snapped to device pixels
//   States: lying = drops to the lying head top, 60% opacity; asleep = hidden; picked up / airborne / lie-down transition / burst BOOM! (hidden from mounting Sheila on: she jumps up to where the bar is) fade out,
//         after returning it waits for the land / get-up action to finish, then fades in over 0.3 s (rising 5 px),
//         already in its final position when it appears; fades to 0 while the settings panel is open (the panel header already shows rank / LV / XP, no duplicate side by side)
//   Horizontal: centered on f.headX, eases in softly near the edges of the movement area (C1 continuous, no hard stop)
//   Rank-up: during playback the rankup timeline takes over (see RK in rankup.js): fill, white flash → badge handed to the rank-up animation, bar fades out → fades back, badge lands, bar grows from 0
//
// Factory: createXpbar(ui) → { el, update(dt, f), rects(), refresh(), layout(), ready }
//   layout()      { cx bar center x, top, bottom, bx / by badge center } (window coords, same object reused; NaN when off): the rank-up animation's anchor
//   ready         XP bar displayed normally (not fading out / waiting to land): a queued rank-up waits for this
//   showing       ready and fully faded in: index.js's head-top tracking follows fast until then
//   rects()       the XP bar doesn't take the mouse, always an empty array

import './xpbar.css'
import { el, tx, setText, kfmt, snap, clamp, softClamp, approach, spring, place, fade, q } from './util.js'
import { RK, BADGE_K, badgeSize, rankText, PLATE, plateText } from './rankup.js'

const MIN_W = 240, H = 54
const PAD_L = 8, BADGE = 42, GAP_B = 10, PAD_R = 22      // left padding / badge / badge to text / right padding
const ABOVE = 10                                          // bar bottom to head top
const SOFT = 28                                           // soft edge distance (softClamp in util.js)
const POP_KINDS = { boom: 1, touch: 1, xp: 1 }            // XP from these sources floats a "+40 XP" (typing and time together are too frequent, no float)

const ease = {
  out: (u) => 1 - (1 - u) ** 3,
  inOut: (u) => u < .5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2,
  in: (u) => u * u,
}
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1)
// Badge pop + brighten + light sweep (short rank-up timeline, t seconds; white flash at RK.fill): { pop scale, bright brightness, shine sweep progress (<0 / >1 = hidden) }
const fx = { pop: 1, bright: 1, shine: -1 }
function badgeFx(t) {
  const u = seg(t, .4, .8)
  fx.pop = u <= 0 || u >= 1 ? 1 : u < .3 ? 1 + .16 * ease.out(u / .3) : u < .65 ? 1.16 - .19 * ease.inOut((u - .3) / .35) : .97 + .03 * ease.inOut((u - .65) / .35)
  fx.bright = 1 + .9 * Math.max(0, 1 - Math.abs(t - .46) / .25)
  fx.shine = t < .42 ? -1 : seg(t, .42, .86)
  if (fx.shine >= 1) fx.shine = 2
  return fx
}

export function createXpbar(ui) {
  const root = el('div', 'ui-xp')
  root.innerHTML = `<div class="skin ui-carbon"></div><div class="tint"></div>
    <div class="bd"><div class="bi"><img alt=""><b class="pn"></b></div><i class="sh"></i></div>
    <div class="col">
      <div class="top"><span class="name"><span class="tn"></span><span class="rn"></span></span><span class="lv"><i></i><b></b></span></div>
      <div class="bar"><div class="trk"><i class="gh"></i><div class="fl"><b></b></div><i class="fs"></i></div><i class="hd"></i><i class="fg"></i></div>
      <div class="num"><b></b><span></span><i></i></div>
    </div>
    <span class="pop"></span>`
  const $ = (s) => root.querySelector(s)
  const E = {
    bd: $('.bd'), bi: $('.bd .bi'), img: $('.bd img'), pn: $('.bd .pn'), sh: $('.bd .sh'), name: $('.name'), tn: $('.tn'), rn: $('.rn'), lvL: $('.lv i'), lvN: $('.lv b'),
    gh: $('.gh'), fl: $('.fl'), flIn: $('.fl b'), fs: $('.fs'), hd: $('.hd'), fg: $('.fg'),
    cur: $('.num b'), next: $('.num span'), unit: $('.num i'), pop: $('.pop'), col: $('.col'), lv: $('.lv'),
  }
  const P = ui.progress

  // ---------- Display state (separate from progress data: during animations it shows the "catching up" value) ----------
  const disp = { lv: P.level, s: { x: P.frac, v: 0 } }
  let shownTier = '', shownDiv = -1, shownLv = -1, shownNum = ''
  let prevNext = P.next                    // the previous level's "needed for this level": shows "5.0k / 5.0k" while catching up after a level up
  let W = MIN_W, TW = MIN_W - PAD_L - BADGE - GAP_B - PAD_R
  let measure = true, jump = true
  let vis = 1, hold = 0, holdT = 0, waitT = 0, dimK = 1, pnK = 1   // visibility (0..1), waiting after return (total time waited, time waited since land / get-up finished), lying semi-transparency, fade-out while the panel is open
  let clk = 0, flashAt = -9, bumpAt = -9   // this part's clock (seconds): white flash, LV brighten
  let celeb = false, celebAt = -9          // feedback added after an interrupted rank-up (picked up / burst): white flash + badge pop once visible again (same curve as the short version)
  let rkTok = null, rkStart = 0, rkLv = 0  // rank-up takeover: progress and LV at the start
  let popN = 0, popAnim = null
  let rankLv = -1, rankR = null
  const pos = { x: NaN, y: NaN, a: 1 }, out = []
  const L = { cx: NaN, top: NaN, bottom: NaN, bx: NaN, by: NaN }
  // Compared before writing styles every frame (only written when values change)
  const last = { fx: NaN, gx: NaN, hx: NaN, ha: NaN, fs: NaN, fg: NaN, bs: NaN, bb: NaN, sh: NaN, bo: NaN, nf: NaN, lb: NaN }

  // ---------- Text ----------
  function paintRank(tier, division) {
    if (tier === shownTier && division === shownDiv) return
    const R = ui.rank(tier, division)
    if (tier !== shownTier) {
      const [w, h] = badgeSize(tier, BADGE_K)
      E.bi.style.width = E.sh.style.width = w + 'px'; E.bi.style.height = E.sh.style.height = h + 'px'
      // Text on the badge plate (same position and text as the big rank-up badge): the box is cropped to cap height, so translate -50% centers the ink
      E.pn.style.top = (PLATE[tier] * h).toFixed(2) + 'px'
      E.pn.classList.toggle('num', !R.division)
      if (E.img.getAttribute('src') !== R.badge) E.img.src = R.badge     // don't reset the same image (it would decode again and flash)
      E.bd.style.setProperty('--src', `url("${R.badge}")`)
      root.style.setProperty('--rank', R.color)
      root.style.setProperty('--rank-hi', rankText(R.color))
    }
    shownTier = tier; shownDiv = division
    setText(E.pn, plateText(R, shownLv))
    tx(E.tn, R.tierName)
    setText(E.rn, R.roman)
    measure = true
  }
  function paintLv(lv) {
    if (lv === shownLv) return
    shownLv = lv
    setText(E.lvN, lv)
    if (!shownDiv) setText(E.pn, lv)       // Master / Apex Predator: the plate shows the level
    measure = true
  }
  // Numbers: compare values first, only build strings when they changed (no allocation when called every frame)
  //  full = show the previous level's full bar (catching up after a level up); k = show by bar progress (during a rank-up the numbers grow with the bar: up to full during the fill phase, from 0 to current in the finish phase)
  const numAt = { a: NaN, b: NaN }
  function paintNum(full, k = 1) {
    const a = Math.floor((full ? prevNext : P.cur) * k), b = full ? prevNext : P.next
    if (a === numAt.a && b === numAt.b && shownNum) return
    numAt.a = a; numAt.b = b; shownNum = 'y'
    setText(E.cur, kfmt(a)); setText(E.next, '/ ' + kfmt(b))
  }
  function paintStatic() {
    setText(E.lvL, ui.t('xp.lv'))
    setText(E.unit, ui.t('xp.unit'))
    shownTier = ''; shownLv = -1; shownNum = ''
  }

  // Data changed: before a level up remember the previous level's requirement (shown full while catching up); "+40 XP" accumulates until it can be seen, then floats
  let known = { lv: P.level, next: P.next }
  ui.progress.on('xp', ({ gain, kind }) => {
    if (P.level !== known.lv) { if (P.level > known.lv) prevNext = known.next; known = { lv: P.level, next: P.next } }
    if (kind === 'set') jump = true
    else if (gain > 0 && POP_KINDS[kind]) popN += gain
  })

  function flash() { flashAt = clk; bumpAt = clk }

  function showPop() {
    const n = Math.round(popN); popN = 0
    if (!n) return
    setText(E.pop, `+${n} ${ui.t('xp.unit')}`)
    popAnim?.cancel()
    popAnim = E.pop.animate([
      { opacity: 0, translate: '0 5px', easing: 'cubic-bezier(.2, .9, .2, 1)' },
      { opacity: 1, translate: '0 0', offset: .22 },
      { opacity: 1, translate: '0 -1px', offset: .7, easing: 'cubic-bezier(.4, 0, .2, 1)' },
      { opacity: 0, translate: '0 -5px' },
    ], { duration: 1300 })
  }

  // The bar's three pieces: solid bar (outer translate reveals how much, inner reverse translate keeps the gradient anchored to the track), preview, leading-edge glow
  function drawBar(x, ghost, glow) {
    x = clamp(x, 0, 1); ghost = clamp(Math.max(ghost, x), 0, 1)
    const fx = Math.round((x - 1) * TW * 100) / 100
    if (fx !== last.fx) { last.fx = fx; E.fl.style.transform = `translate3d(${fx}px, 0, 0)`; E.flIn.style.transform = `translate3d(${-fx}px, 0, 0)` }
    const gx = Math.round((ghost - 1) * TW * 100) / 100
    if (gx !== last.gx) { last.gx = gx; E.gh.style.transform = `translate3d(${gx}px, 0, 0)` }
    const hx = Math.round(x * TW * 100) / 100
    if (hx !== last.hx) { last.hx = hx; E.hd.style.transform = `translate3d(${hx}px, 0, 0)` }
    // Leading-edge glow: suppressed at both ends (0 and full); brighter while growing
    const ha = q(x <= 0.004 || x >= 0.996 ? 0 : clamp(Math.min(x, 1 - x) * 40, 0, 1) * (0.4 + 0.6 * glow), 100)
    if (ha !== last.ha) { last.ha = ha; E.hd.style.opacity = ha }
  }
  // White flash (a white layer in the track + a soft glow around the bar); dtF = seconds since the flash
  function drawFlash(dtF) {
    const a = dtF < 0 ? 0 : dtF < .06 ? dtF / .06 : Math.max(0, 1 - (dtF - .06) / .5) ** 2
    const v = q(a)
    if (v !== last.fs) { last.fs = v; E.fs.style.opacity = v; E.fg.style.opacity = q(v * .8) }
  }
  // Badge: pop (scale) + brighten + light sweep (background-position of sh); k = 0..1 progress, <0 = still
  function drawBadge(pop, bright, shine, opacity) {
    const bs = q(pop), bb = q(bright, 100)
    if (bs !== last.bs || bb !== last.bb) {
      last.bs = bs; last.bb = bb
      E.bi.style.transform = bs === 1 ? '' : `scale(${bs})`
      E.bi.style.filter = bb === 1 ? '' : `brightness(${bb}) drop-shadow(0 0 5px var(--rank-glow))`
    }
    const sh = q(shine)
    if (sh !== last.sh) { last.sh = sh; E.sh.style.opacity = sh < 0 || sh > 1 ? 0 : 1; E.sh.style.backgroundPosition = `${95 - 90 * clamp(sh, 0, 1)}% 0` }
    const bo = q(opacity)
    if (bo !== last.bo) { last.bo = bo; E.bd.style.opacity = bo >= 1 ? '' : bo }
  }
  // Name brighten (the moment the short version switches division)
  function drawName(k) {
    const v = q(k, 100)
    if (v === last.nf) return
    last.nf = v
    E.name.style.filter = v <= 0 ? '' : `brightness(${1 + v * .9}) drop-shadow(0 0 ${(v * 6).toFixed(1)}px var(--rank-glow))`
  }

  const api = {
    el: root,
    ready: false,
    showing: false,
    update(dt, f) {
      const on = ui.cfg.xpbar
      root.classList.toggle('off', !on)
      if (!on) { pos.x = pos.y = NaN; L.cx = L.top = L.bottom = L.bx = L.by = NaN; api.ready = api.showing = false; return }
      clk += dt
      // Measure only when content changed (no layout reads per frame): widen if the rank name is too long (even)
      if (measure) {
        measure = false
        const need = E.name.offsetWidth + E.lv.offsetWidth + 16
        W = Math.max(MIN_W, Math.ceil((PAD_L + BADGE + GAP_B + need + PAD_R) / 2) * 2)
        root.style.width = W + 'px'
        TW = W - PAD_L - BADGE - GAP_B - PAD_R
        last.fx = last.gx = last.hx = NaN
      }

      // ---------- Visibility: fade out when asleep / airborne / lie-down transition / burst BOOM!; after returning wait for land / get-up to finish (at most 2.5 s), then fade in over 0.3 s; 60% when lying ----------
      //  Lying down: during the action she kicks her legs up to the bar's height, and the bar shouldn't wait at the standing head top either -- hide first, fade in at the lying head top once she's settled (base = lounge) (symmetric with getting up)
      //  Burst: hidden from mounting Sheila (phase = burst) on, her ponytail would poke the bar on the jump; the comic layer covers everything right after anyway
      const away = f.base === 'sleep' || f.air || f.burst || f.gone || f.act === 'lieDown'
      const settling = f.act === 'land' || f.act === 'getUp'
      //  After the action ends also wait for the head to stop and the head-top position to catch up (f.headSettled, at most another 0.8 s): once faded in it no longer slides in plain view
      if (away) { hold = 0.3; holdT = waitT = 0 }
      else if (hold > 0) {
        holdT += dt
        if (!settling) waitT += dt
        if ((!settling && (f.headSettled || waitT > 0.8)) || holdT > 2.5) hold = Math.max(0, hold - dt)
      }
      const want = away || hold > 0 ? 0 : 1
      vis = f.snap ? want : approach(vis, want, want > vis ? .12 : .05, dt)
      dimK = f.snap ? (f.base === 'lounge' ? .6 : 1) : approach(dimK, f.base === 'lounge' ? .6 : 1, .25, dt)
      pnK = f.snap ? +!f.panelOpen : approach(pnK, +!f.panelOpen, .06, dt)
      api.ready = !away && hold === 0 && !f.panelOpen     // while the panel is open a rank-up queues and plays after it closes
      api.showing = api.ready && vis > .95                 // fully shown (while fading in, index.js's head-top tracking still follows fast)

      // ---------- Rank-up takeover ----------
      const rk = ui.parts.rankup
      const rkOn = rk.playing
      let x, ghost, glow = 0, rv = 1, dy = 0
      let pop = 1, bright = 1, shine = -1, bop = 1, nameK = 0
      if (rkOn) {
        const t = rk.t, full = rk.full
        if (rkTok !== rk.to) {    // Just started: remember the starting point (old progress still catching up, or the current progress in a demo); the rank-up itself is the feedback for this gain, so the pending "+XP" float is dropped
          rkTok = rk.to
          popN = 0
          rkStart = disp.lv < P.level ? disp.s.x : Math.min(disp.s.x, .97)
          rkLv = disp.lv < P.level ? disp.lv : P.level - 1
        }
        const swapT = full ? RK.xpGone : RK.swap
        const R = t < swapT ? rk.from : rk.to
        paintRank(R.tier, R.division)
        paintLv(t < RK.fill ? Math.max(1, rkLv) : P.level)
        // Bar: fills (ease-in-out) → white flash → back to zero, then grows from 0 to current; numbers and bar share one progress
        const growAt = full ? RK.land : RK.swap + .03, growLen = full ? RK.full - RK.land : .6
        const grow = ease.out(seg(t, growAt, growAt + growLen))
        paintNum(t < swapT, t < RK.fill ? rkStart + (1 - rkStart) * ease.inOut(t / RK.fill) : t < swapT ? 1 : grow)
        if (t < RK.fill) x = rkStart + (1 - rkStart) * ease.inOut(t / RK.fill)
        else if (t < (full ? RK.xpGone : RK.swap)) x = 1
        else x = P.frac * grow
        ghost = t < RK.fill ? 1 : x
        glow = t < RK.fill ? 1 : 0
        drawFlash(t - RK.fill)
        if (t >= RK.fill) bumpAt = clk - (t - RK.fill)
        if (full) {
          // The old badge is handed to the rank-up animation at lift, the new badge lands back at land; the bar fades out and back in between
          rv = t < RK.xpOut ? 1 : t < RK.xpIn ? 1 - ease.in(seg(t, RK.xpOut, RK.xpGone)) : ease.out(seg(t, RK.xpIn, RK.xpShown))
          dy = t < RK.xpIn ? Math.round(ease.in(seg(t, RK.xpOut, RK.xpGone)) * 4) : Math.round((1 - ease.out(seg(t, RK.xpIn, RK.xpShown))) * 5)
          bop = t >= RK.lift && t < RK.land ? 0 : 1
          // Landing: continues from the size / brightness it flew back with (1, 1.25) -- first swells (to 1.12x and 2x brightness in 80 ms), then falls back; an impulse, not a step
          if (t >= RK.land) {
            const u = t - RK.land
            const k = u < .08 ? ease.out(u / .08) : (1 - seg(u, .08, .45)) ** 2
            pop = 1 + .12 * k
            bright = u < .08 ? 1.25 + .75 * k : 1 + 1 * k
          }
        } else {
          // Short version: badge pops (1 → 1.16 → 0.97 → 1) + light sweep; name brightens at the division switch
          ;({ pop, bright, shine } = badgeFx(t))
          nameK = t < RK.swap ? 0 : Math.max(0, 1 - (t - RK.swap) / .45)
        }
        disp.lv = P.level; disp.s.x = x; disp.s.v = 0
        jump = false
      } else if (rk.queued && !f.snap) {
        // Rank-up queued (she's airborne / in the burst / XP bar not fully back): freeze the display instead of growing into the new rank; on return the rank-up animation plays it from the start
        rkTok = null
        const q0 = rk.queued.from
        paintRank(q0.tier, q0.division)
        paintLv(Math.max(1, disp.lv < P.level ? disp.lv : P.level - 1))     // same as the LV when the rank-up starts (see rkLv above)
        x = disp.s.x; ghost = Math.max(x, last.ghost || 0)
        drawFlash(clk - flashAt)
      } else {
        rkTok = null
        // ---------- Normal: spring toward the target; doesn't move while not visible ----------
        if (jump || f.snap) { jump = false; disp.lv = P.level; disp.s.x = P.frac; disp.s.v = 0 }
        else if (disp.lv > P.level) { disp.lv = P.level; disp.s.x = P.frac; disp.s.v = 0 }   // XP was reset
        else if (vis > .6) {
          if (disp.lv < P.level) {
            spring(disp.s, 1.06, 10, dt)
            if (disp.s.x >= 1) { disp.lv++; disp.s.x = 0; disp.s.v = 0; flash(); if (disp.lv < P.level) prevNext = P.next }
          } else spring(disp.s, P.frac, 8, dt)
          if (popN && vis > .95) showPop()
        }
        const behind = disp.lv < P.level
        if (disp.lv !== rankLv) { rankLv = disp.lv; rankR = P.rankAt(disp.lv) }     // only recompute the rank when the level changed (no per-frame allocation)
        paintRank(rankR.tier, rankR.division)
        paintLv(disp.lv)
        paintNum(behind)
        x = disp.s.x
        ghost = behind ? 1 : P.frac
        glow = clamp(Math.abs(disp.s.v) * 4, 0, 1)
        // Feedback for an interrupted rank-up: play it once visible (same curve as the short version, starting from the white flash)
        if (celeb && vis > .6) { celeb = false; celebAt = clk; flash() }
        if (clk - celebAt < 1) { ({ pop, bright, shine } = badgeFx(clk - celebAt + RK.fill)); nameK = Math.max(0, 1 - (clk - celebAt) / .6) }
        drawFlash(clk - flashAt)
      }
      last.ghost = ghost
      drawBar(x, ghost, glow)
      drawBadge(pop, bright, shine, bop)
      drawName(nameK)
      // LV number: from white back to the usual off-white on level up (0.6 s)
      const lb = clamp(1 - (clk - bumpAt) / .6, 0, 1)
      if (lb !== last.lb) { last.lb = lb; E.lvN.style.color = lb <= 0 ? '' : `color-mix(in srgb, #fff ${Math.round(lb * 100)}%, var(--ui-fg))` }

      // ---------- Position, opacity ----------
      const a = vis * dimK * rv * pnK
      fade(root, a, pos)
      const lift = Math.round((1 - vis) * 5) + dy
      const x0 = snap(softClamp(f.headX - W / 2, ui.LAYOUT.edge, f.worldW - ui.LAYOUT.edge - W, SOFT))
      const y0 = snap(f.headY - ABOVE - H)
      place(root, x0, y0 + lift, pos)
      L.cx = x0 + W / 2; L.top = y0; L.bottom = y0 + H; L.bx = x0 + PAD_L + BADGE / 2; L.by = y0 + lift + H / 2   // badge center at the actually drawn position (including the fade-in rise), so the rank-up landing handover doesn't jump
    },
    rects() { return out },
    refresh() { paintStatic(); measure = true },
    celebrate() { celeb = true },
    layout() { return L },
  }
  paintStatic()
  return api
}
