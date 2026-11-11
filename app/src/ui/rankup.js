// Rank-up animation: launched from the XP bar's badge, returns to the XP bar when done
//   Full version (tier change): charge → burst → hold → return, main body 3.3 s (+0.3 s settle afterglow)
//     0.00 XP bar fills, 0.36 white flash → 0.42 old badge rises off the XP bar (white ring spreads) → 0.72 charge (brightens, shrinks slightly, ring contracts, spotlight behind)
//     → 1.00 burst: new badge swapped in during the white flash (drops in at 1.3x with overshoot) + rank-colored starburst rays (slow rotation) + shock ring + sparks
//     → banner (carbon, frameless, fading at both ends) "RANK UP" + rank name with letter spacing opening up, division numeral stamped on the badge plate, one light sweep
//     → hold: rank name fully opaque for about 1 s (1.64 → 2.62)
//     → 2.80 badge shrinks back into the XP bar (cubic-bezier(.6,0,.3,1)) → 3.30 lands, progress bar grows from 0
//   Ring radii (charge ring, old badge's white ring, shock ring, white flash) all stay smaller than the distance from the composition center to her eyes (≈ 184 px), so they never sweep across her face;
//   the lower half of the starburst fades out toward her, so no rank-colored light is left on her hairline
//   Short version (division IV → III, 1.5 s): right on the XP bar: fills, white flash → badge pops + light sweep + small shock ring + sparks, name switches to the new division,
//     a small "DIVISION UP" banner floats above
//   Web Animations API: all animations share one timeline (offset = seconds / total length); passing at jumps everything to that moment and pauses (for screenshots / review, deterministic)
//   Light effects are white images used as masks, fill = brightened rank color, mix-blend-mode: screen; never blocks the mouse (pointer-events: none, rects() always empty)
//
// Factory: createRankup(ui) → { el, update(dt, f), rects(), refresh(), play(opts), stop(), requeue(), playing, queued, full, from, to, t }
//   play({ from: { tier, division } | null, to: { tier, division }, full = true, at })
//     omitted from (or same as to) = one division before to; at: seconds, if given jump to that moment and pause
//     While she's in BOOM! / airborne / asleep it doesn't play right away: it queues and plays when the XP bar is back (except demos that pass at)
//   stop(): clear immediately (used when a demo switches away)
//   playing / full / from / to / t (current seconds): the XP bar uses these to hand over its progress bar, badge and opacity (see xpbar.js)
//   queued: a rank-up is waiting in the queue (the XP bar freezes its display meanwhile instead of growing into the new rank by itself)
// Takes from ui: ui.parts.xpbar.layout() (badge center, bar top / bottom), ui.rank(tier, division), ui.t('rankup.title' | 'rankup.division'), ui.f

import './rankup.css'
import { el, tx, setText, snap, clamp, place } from './util.js'
import { IMG_SIZE } from './assets.js'

// Timeline (seconds). The XP bar (xpbar.js) aligns its handover moments to this table too
export const RK = {
  full: 3.6,          // full version total length (main body up to land, then the settle afterglow)
  short: 1.5,         // short version total length
  fill: .36,          // XP bar fills → white flash
  lift: .42,          // old badge leaves the XP bar (XP bar hides its own badge)
  xpOut: .5,          // XP bar fades out …
  xpGone: .76,        // … fully gone here (name and LV switch to the new rank)
  burst: 1.0,         // burst: swap in the new badge
  back: 2.8,          // badge starts shrinking back (before this is the hold: rank name fully opaque for about 1 s)
  xpIn: 3.1,          // XP bar fades back in (only once the badge is nearly there, so it doesn't overlap the big badge flying back over the text) …
  xpShown: 3.34,      // … fully shown here (progress bar at 0)
  land: 3.3,          // badge lands back on the XP bar (XP bar reveals the new badge, progress bar starts growing)
  swap: .52,          // short version: name switches to the new division
}
export const BADGE_K = 42 / 336     // XP bar badge: image pixels → screen pixels (based on the Gold badge width 336, same ratio for every rank so the rings match in size)
const EMB_K = 152 / 336             // big rank-up badge
const TIERS = ['rookie', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'apex']
// Badge plate center (fraction of the full image height, measured): the game writes the division numeral here. The Master / Apex Predator plates are wider and flatter; the game writes the placement there, here we write the level
//  The XP bar's small badge (xpbar.js) uses the same table and text: on landing the text on the big and small badge matches, and normally it isn't an empty black plate either
export const PLATE = { rookie: .827, bronze: .828, silver: .824, gold: .826, platinum: .826, diamond: .793, master: .857, apex: .85 }
export const plateText = (R, lv) => R.division ? R.roman : lv > 0 ? String(lv) : ''

export function badgeSize(tier, k) {
  const [w, h] = IMG_SIZE['rank_' + tier] || [336, 336]
  return [+(w * k).toFixed(2), +(h * k).toFixed(2)]
}
// One division back: Gold IV → Silver I, Gold III → Gold IV, Master → Diamond I, Apex Predator → Master
export function prevRank(to) {
  if (to.division && to.division < 4) return { tier: to.tier, division: to.division + 1 }
  const i = TIERS.indexOf(to.tier)
  if (i <= 0) return { ...to }
  const tier = TIERS[i - 1]
  return { tier, division: tier === 'master' ? 0 : 1 }
}

// Rank color → brightened / semi-transparent (colors written directly in WAAPI keyframes, no var())
const rgb = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
const mix = (c, w, a = 1) => `rgba(${rgb(c).map(v => Math.round(v + (255 - v) * w)).join(', ')}, ${a})`
// Lightness of the rank color (OKLab L, 0..1): dark ranks like Bronze and Master need more brightening for their names to read as clearly as Gold and Platinum
function lightness(c) {
  const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 })
  const l = Math.cbrt(.4122 * r + .5363 * g + .0514 * b), m = Math.cbrt(.2119 * r + .6807 * g + .1074 * b), s = Math.cbrt(.0883 * r + .2817 * g + .6300 * b)
  return .2105 * l + .7936 * m - .0041 * s
}
// Rank color for text (the same one in three places: XP bar rank name, rank-up banner, panel header): brightened toward OKLab L ≈ 0.84, the same level as the LV number (--ui-fg-hi)
//  Saturated rank colors (Platinum, Diamond, Master, Apex Predator) mix in at most 30% white, more turns the red and purple pink; greyish ones (Rookie, Bronze, Silver, Gold) can go to 45%, otherwise they're the darkest line in the bar
export function rankText(c) {
  const L = lightness(c), [r, g, b] = rgb(c), sat = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, r, g, b)
  return mix(c, clamp((.84 - L) / (1 - L), .12, sat > .5 ? .3 : .45))
}

// Keyframes: [[seconds, { props }, easing for next segment?], …] → WAAPI keyframes (offset = seconds / total length)
//  Missing props carry over from the previous frame (missing in the first frame = first later value), 0 / 1 are added at both ends automatically, so it "holds" before and after instead of reverting to the style value
const EO = 'cubic-bezier(.2, .9, .2, 1)'      // entrance
const EIO = 'cubic-bezier(.6, 0, .3, 1)'      // return / movement
const EI = 'cubic-bezier(.55, 0, .9, .4)'     // charge (accelerating inward)
const ES = 'cubic-bezier(.4, 0, .2, 1)'       // general
function frames(list, dur) {
  const keys = new Set()
  for (const [, p] of list) for (const k in p) keys.add(k)
  const out = list.map(([t, p, e]) => ({ offset: clamp(t / dur, 0, 1), ...p, easing: e || 'linear' }))
  for (const k of keys) {
    let v = out.find(o => o[k] !== undefined)[k]
    for (const o of out) { if (o[k] === undefined) o[k] = v; else v = o[k] }
  }
  if (out[0].offset > 0) out.unshift({ ...out[0], offset: 0, easing: 'linear' })
  if (out[out.length - 1].offset < 1) out.push({ ...out[out.length - 1], offset: 1 })
  return out
}

const SPARKS = 14

export function createRankup(ui) {
  const root = el('div', 'ui-rk')
  root.innerHTML = `
    <i class="fx shade"></i><i class="fx glow"></i><i class="fx rays rays0"></i><i class="fx rays"></i><i class="fx rays2"></i><i class="fx conv"></i><i class="fx shock"></i><i class="fx halo"></i>
    <div class="sparks">${'<i class="spk"></i>'.repeat(SPARKS)}</div>
    <div class="emb old"><i class="fx lring"></i><img alt=""></div>
    <div class="emb new"><img alt=""><i class="sh"></i><b class="pn"></b></div>
    <i class="fx star"></i><i class="fx flash"></i><i class="fx ping"></i>
    <div class="banner"><div class="bg"><div class="skin ui-carbon"></div></div><span class="sub"></span><span class="nm"><span class="tn"></span><span class="rn"></span></span></div>
    <div class="tag"><div class="bg"><div class="skin ui-carbon"></div></div><span class="tg"></span></div>`
  const $ = (s) => root.querySelector(s)
  const E = {
    shade: $('.shade'), glow: $('.glow'), rays0: $('.rays0'), rays: $('.rays:not(.rays0)'), rays2: $('.rays2'), conv: $('.conv'), shock: $('.shock'), halo: $('.halo'),
    old: $('.old'), oldImg: $('.old img'), lring: $('.lring'), neu: $('.new'), newImg: $('.new img'), sh: $('.new .sh'), pn: $('.pn'),
    star: $('.star'), flash: $('.flash'), ping: $('.ping'),
    banner: $('.banner'), bbg: $('.banner .bg'), sub: $('.sub'), nm: $('.nm'), tn: $('.tn'), rn: $('.rn'),
    tag: $('.tag'), tbg: $('.tag .bg'), tg: $('.tg'),
    sparks: [...root.querySelectorAll('.spk')],
  }

  let anims = [], clock = null, cur = null, pending = null, fadeA = null
  const at = { x: NaN, y: NaN }
  // Composition offset: full = composition center above the XP bar; short = origin at the XP bar badge center
  const geo = { up: 0, bx: 0, by: 0 }
  const out = []

  // Text + rank color (also called on refresh)
  function paint() {
    if (!cur) return
    const R = ui.rank(cur.to.tier, cur.to.division)
    root.style.setProperty('--rank', R.color)
    root.style.setProperty('--rank-hi', rankText(R.color))
    root.style.setProperty('--rank-lite', mix(R.color, .4))
    setText(E.sub, ui.t('rankup.title')); E.sub.classList.toggle('cjk', /[^\x00-\x7f]/.test(E.sub.textContent))
    tx(E.tn, R.tierName)
    setText(E.rn, R.roman)
    E.nm.classList.toggle('cjk', E.tn.classList.contains('cjk'))
    setText(E.pn, plateText(R, ui.progress.level))
    E.pn.classList.toggle('num', !R.division)
    setText(E.tg, ui.t('rankup.division')); E.tg.classList.toggle('cjk', /[^\x00-\x7f]/.test(E.tg.textContent))
  }
  // Badge image + size (image scaled at its original ratio, plate numeral placed at the measured position)
  function setEmb(box, img, tier) {
    const [w, h] = badgeSize(tier, EMB_K)
    box.style.width = w + 'px'; box.style.height = h + 'px'
    box.style.marginLeft = -w / 2 + 'px'; box.style.marginTop = -h / 2 + 'px'
    const url = ui.img('rank_' + tier)
    if (img.getAttribute('src') !== url) img.src = url
    box.style.setProperty('--src', `url("${url}")`)
    if (box === E.neu) E.pn.style.top = PLATE[tier] * 100 + '%'
    return [w, h]
  }

  // Current anchor: the XP bar's layout when it's on, otherwise above her head
  function anchor(f) {
    const L = ui.parts.xpbar.layout()
    if (Number.isFinite(L.cx)) return L
    const y = f.headY - 12
    tmpL.cx = f.headX; tmpL.bx = f.headX; tmpL.by = y - 20; tmpL.top = y - 40; tmpL.bottom = y
    return tmpL
  }
  const tmpL = { cx: 0, bx: 0, by: 0, top: 0, bottom: 0 }

  function end() {
    for (const a of anims) a.cancel()
    fadeA?.cancel(); fadeA = null
    anims = []; clock = null
    root.classList.remove('on', 'short')
    api.playing = false
    cur = null
  }

  function start(atSec) {
    for (const a of anims) a.cancel()
    clock?.cancel()
    fadeA?.cancel(); fadeA = null
    const f = ui.f, full = cur.full, dur = full ? RK.full : RK.short, D = dur * 1000
    paint()
    root.classList.add('on'); root.classList.toggle('short', !full)
    api.playing = true
    const L = anchor(f)
    const A = []
    const go = (e, list, extra) => { const a = e.animate(frames(list, dur), { duration: D, fill: 'both', ...extra }); A.push(a); return a }

    if (full) {
      const [, ohNew] = setEmb(E.neu, E.newImg, cur.to.tier)
      setEmb(E.old, E.oldImg, cur.from.tier)
      // Composition: banner bottom ≈ XP bar bottom, badge above the banner
      const bannerTop = Math.round(ohNew / 2 + 2)
      E.banner.style.top = bannerTop + 'px'
      geo.up = bannerTop + 60
      // Badge offset from the composition center (XP bar badge center - composition center)
      const c = center(L, f)
      geo.bx = L.bx - c.x; geo.by = L.by - c.y
      const B = `${geo.bx}px ${geo.by}px`, s0 = BADGE_K / EMB_K
      const glowC = mix(cur.to.color, .15, .75), oldC = mix(ui.rank(cur.from.tier).color, .3, .8)

      // —— Old badge: rises from the XP bar (entrance easing) → charge (brightens, shrinks slightly) → disappears on burst
      go(E.old, [[0, { translate: B, scale: s0, opacity: 0 }], [RK.lift, { opacity: 0 }], [RK.lift, { opacity: 1 }, EO],
        [.9, { translate: '0px -5px', scale: .8 }, EI], [RK.burst, { translate: '0px 0px', scale: .74, opacity: 1 }], [RK.burst, { opacity: 0 }]])
      go(E.oldImg, [[0, { filter: `brightness(1) drop-shadow(0 0 3px ${oldC})` }], [.72, {}, EI], [RK.burst, { filter: 'brightness(2.6) drop-shadow(0 0 18px rgba(255, 255, 255, .9))' }]])
      // (white ring max 1.5x, charge ring starts at 1.3x: radii stay within the distance from the composition center to her forehead, never reaching her face)
      go(E.lring, [[RK.lift, { opacity: 0, scale: .8 }], [RK.lift + .04, { opacity: .9, scale: .95 }, EO], [.95, { opacity: 0, scale: 1.5 }]])
      // —— Charge: ring contracts from outside in, reaching the badge exactly at the burst
      go(E.conv, [[.7, { opacity: 0, scale: 1.3 }, ES], [.8, { opacity: .5 }, EI], [RK.burst, { opacity: .95, scale: .5 }], [RK.burst + .03, { opacity: 0 }]])
      // —— Burst: white flash + starburst + shock ring + sparks
      go(E.flash, [[.95, { opacity: 0, scale: .35 }, EO], [1.03, { opacity: 1, scale: 1 }, ES], [1.55, { opacity: 0, scale: 1.4 }]])
      go(E.star, [[.98, { opacity: 0, scale: .3, rotate: '-8deg' }, EO], [1.06, { opacity: 1, scale: 1 }, ES], [1.7, { opacity: 0, scale: 1.3, rotate: '14deg' }]])
      go(E.shock, [[RK.burst, { opacity: 0, scale: .5 }], [RK.burst, { opacity: 1 }, EO], [1.6, { opacity: 0, scale: 1.35 }]])
      // Halo: after the burst it tightens into a thin ring hugging the badge (edging the badge like the mockup), breathing slightly during the hold
      const B0 = RK.back
      go(E.halo, [[1.02, { opacity: 0, scale: 1.25 }, EO], [1.34, { opacity: .8, scale: 1 }, ES], [1.75, { opacity: .6, scale: 1.01 }, ES], [B0, { opacity: .75, scale: 1 }, EI], [B0 + .16, { opacity: 0, scale: .8 }]])
      E.sparks.forEach((s, i) => {
        const a = (i / SPARKS) * Math.PI * 2 + ((i * 37) % 11) / 11 * .45, r = 105 + ((i * 53) % 7) * 11, d = .55 + ((i * 29) % 5) * .07
        const x = Math.cos(a) * r, y = Math.sin(a) * r * .82
        go(s, [[RK.burst, { opacity: 0, translate: `${x * .3}px ${y * .3}px`, scale: 1 }], [RK.burst + .02, { opacity: 1 }, 'cubic-bezier(.1, .7, .3, 1)'],
          [RK.burst + d, { opacity: 0, translate: `${x}px ${y}px`, scale: .3 }]])
      })
      // —— Light: rank-colored starburst + a brighter inner layer, two layers slowly counter-rotating; glow breathing
      //    Under the starburst sits a same-shaped normal-blend starburst (rank color, ≈ 35%): screen barely shows color on blue / light desktops, the underlay makes the rank color readable
      go(E.glow, [[.7, { opacity: 0, scale: .3 }, EI], [.98, { opacity: .4, scale: .42 }, EO], [1.25, { opacity: .9, scale: 1 }, ES], [1.7, { opacity: .7, scale: .97 }, ES], [B0 - .15, { opacity: .8, scale: 1 }, EI], [B0 + .25, { opacity: 0, scale: .6 }]])
      const rayK = [[RK.burst, { opacity: 0, scale: .3 }, EO], [1.42, { opacity: .85, scale: 1 }, ES], [B0 - .15, { opacity: .7, scale: 1.04 }, EI], [B0 + .2, { opacity: 0, scale: .7 }]]
      go(E.rays, rayK)
      go(E.rays0, rayK.map(([t, p, e]) => [t, { ...p, opacity: +(p.opacity * .42).toFixed(3) }, e]))
      // Below that a very faint dark shadow (normal blend): invisible on dark desktops, on light desktops it darkens behind the rays so the screen-blended rays have contrast instead of a white haze
      go(E.shade, [[.9, { opacity: 0, scale: .6 }, EO], [1.3, { opacity: 1, scale: 1 }], [B0 - .15, {}, EI], [B0 + .25, { opacity: 0, scale: .8 }]])
      go(E.rays2, [[RK.burst, { opacity: 0, scale: .4 }, EO], [1.35, { opacity: .6, scale: 1 }, ES], [B0 - .2, { opacity: .45, scale: 1.02 }, EI], [B0 + .1, { opacity: 0, scale: .6 }]])
      // The starburst image rotates on ::before, the outer layer doesn't: its "fade downward" mask always faces her
      for (const e of [E.rays, E.rays0]) go(e, [[RK.burst, { rotate: '0deg' }], [B0 + .2, { rotate: '44deg' }]], { pseudoElement: '::before' })
      go(E.rays2, [[RK.burst, { rotate: '0deg' }], [B0 + .1, { rotate: '-34deg' }]])
      // —— New badge: drops in white-hot at 1.3x, overshoots once then settles; breathes very slowly during the hold; then shrinks back into the XP bar
      go(E.neu, [[0, { translate: '0px 0px', scale: 1.32, opacity: 0 }], [RK.burst, {}], [RK.burst, { opacity: 1 }, EO], [1.22, { scale: .95 }, ES], [1.4, { scale: 1.015 }, ES],
        [1.56, { scale: 1 }, ES], [RK.back, { scale: 1.02, translate: '0px 0px' }, EIO], [RK.land, { translate: B, scale: s0, opacity: 1 }], [RK.land, { opacity: 0 }]])
      go(E.newImg, [[RK.burst, { filter: 'brightness(3.2) drop-shadow(0 0 26px rgba(255, 255, 255, 1))' }, EO], [1.45, { filter: `brightness(1) drop-shadow(0 0 14px ${glowC})` }],
        [RK.back, {}, ES], [RK.land, { filter: `brightness(1.25) drop-shadow(0 0 5px ${glowC})` }]])
      go(E.sh, [[1.58, { opacity: 0, backgroundPosition: '95% 0' }], [1.6, { opacity: 1 }, ES], [2.02, { backgroundPosition: '5% 0' }], [2.04, { opacity: 0 }]])
      go(E.pn, [[1.24, { opacity: 0, scale: 1.9 }, EO], [1.46, { opacity: 1, scale: 1 }], [RK.back, {}, ES], [RK.back + .22, { opacity: 0 }]])
      // —— Banner: backing unfolds from the middle outward; subtitle and rank name letter spacing opens up (text-indent in sync, text stays centered)
      go(E.bbg, [[1.04, { opacity: 0, scale: '0 1' }, EO], [1.36, { opacity: 1, scale: '1 1' }], [B0 - .12, {}, EIO], [B0 + .14, { opacity: 0, scale: '0 1' }]])
      go(E.sub, [[1.1, { opacity: 0, letterSpacing: '1px', textIndent: '1px' }, EO], [1.52, { opacity: 1, letterSpacing: '6px', textIndent: '6px' }], [B0 - .2, {}, EI], [B0 - .04, { opacity: 0, letterSpacing: '2px', textIndent: '2px' }]])
      go(E.nm, [[1.16, { opacity: 0, letterSpacing: '-2px', textIndent: '-2px', translate: '0px 3px' }, EO], [1.64, { opacity: 1, letterSpacing: '4px', textIndent: '4px', translate: '0px 0px' }],
        [B0 - .18, {}, EI], [B0, { opacity: 0, letterSpacing: '1px', textIndent: '1px' }]])
      go(E.nm, [[1.62, { backgroundPosition: '95% 0' }, ES], [2.06, { backgroundPosition: '5% 0' }]])
      // —— Landing: a thin ring of light at the XP bar badge
      go(E.ping, [[RK.land - .02, { opacity: 0, scale: .5, translate: B }], [RK.land + .02, { opacity: .9 }, EO], [RK.full, { opacity: 0, scale: 1.5 }]])
    } else {
      // Short version: origin = XP bar badge center; small banner right above the XP bar
      geo.bx = 0; geo.by = 0
      const tx0 = L.cx - L.bx, ty0 = L.top - L.by - 13
      const T = (dy) => `${tx0}px ${ty0 + dy}px`
      go(E.flash, [[.38, { opacity: 0, scale: .12 }, EO], [.44, { opacity: .85, scale: .26 }, ES], [.85, { opacity: 0, scale: .42 }]])
      go(E.star, [[.4, { opacity: 0, scale: .12, rotate: '-6deg' }, EO], [.47, { opacity: .95, scale: .32 }, ES], [.9, { opacity: 0, scale: .42, rotate: '12deg' }]])
      go(E.shock, [[.4, { opacity: 0, scale: .2 }], [.4, { opacity: .95 }, EO], [1.0, { opacity: 0, scale: .62 }]])
      E.sparks.forEach((s, i) => {
        if (i >= 10) { go(s, [[0, { opacity: 0 }]]); return }
        const a = (i / 10) * Math.PI * 2 + .3, r = 36 + ((i * 53) % 5) * 7, d = .45 + ((i * 29) % 4) * .06
        const x = Math.cos(a) * r, y = Math.sin(a) * r
        go(s, [[.42, { opacity: 0, translate: `${x * .35}px ${y * .35}px`, scale: .7 }], [.44, { opacity: 1 }, 'cubic-bezier(.1, .7, .3, 1)'], [.42 + d, { opacity: 0, translate: `${x}px ${y}px`, scale: .25 }]])
      })
      go(E.tag, [[.46, { opacity: 0, translate: T(5) }, EO], [.78, { opacity: 1, translate: T(0) }], [1.18, {}, EIO], [RK.short, { opacity: 0, translate: T(-4) }]])
      go(E.tbg, [[.46, { scale: '.2 1' }, EO], [.8, { scale: '1 1' }]])
      go(E.tg, [[.46, { letterSpacing: '0px', textIndent: '0px' }, EO], [.95, { letterSpacing: '3px', textIndent: '3px' }]])
    }

    anims = A
    clock = new Animation(new KeyframeEffect(null, null, { duration: D, fill: 'both' }), document.timeline)
    clock.onfinish = () => { if (clock && clock.playState === 'finished') end() }
    clock.play()
    if (atSec != null) for (const a of [...A, clock]) { a.pause(); a.currentTime = Math.min(atSec, dur) * 1000 }
    api.update(0, f)
  }

  // Composition center: full version = straight above the XP bar center (banner bottom on the XP bar bottom), pulled inward when it doesn't fit
  const cpos = { x: 0, y: 0 }
  function center(L, f) {
    const E0 = ui.LAYOUT.edge
    cpos.x = clamp(L.cx, E0 + 200, f.worldW - E0 - 200)
    cpos.y = Math.max(190, L.bottom - geo.up)
    return cpos
  }
  // Can it play: the window isn't hidden (fullscreen auto-hide and tray "Hide" both count; while hidden update doesn't run and ui.f is stuck on the last frame before hiding, so ask directly),
  //  and the XP bar is back (or the XP bar is off and she's standing steady)
  function calm(f) {
    if (ui.ctx.input.system?.hidden || document.hidden) return false
    if (ui.cfg.xpbar) return ui.parts.xpbar.showing      // start only once the XP bar is fully shown (fill and white flash should play while clearly visible)
    return !(f.air || f.burst || f.gone || f.base === 'sleep')
  }

  const api = {
    el: root,
    playing: false,
    get queued() { return pending },
    get full() { return !!cur?.full },
    get from() { return cur?.from },
    get to() { return cur?.to },
    get t() { return clock ? (clock.currentTime || 0) / 1000 : 0 },
    update(dt, f) {
      if (pending && !api.playing && calm(f)) { cur = pending; pending = null; start(null); return }
      if (!api.playing) return
      // Picked up / flung / burst / asleep mid-play: if the new badge hasn't been swapped in yet, requeue (replay from the start on return); if it has, fade out in 120 ms to finish,
      //  and when the XP bar returns it adds a white flash + badge pop (the rank change still gets feedback). Frozen demos are left alone
      if (clock.playState !== 'paused' && (f.air || f.burst || f.gone || f.base === 'sleep')) {
        if (api.t < (cur.full ? RK.burst : RK.swap)) { api.requeue(); return }
        if (!fadeA) {
          const bonus = api.t < (cur.full ? RK.land : RK.short * .6)
          fadeA = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' })
          fadeA.onfinish = () => { end(); if (bonus) ui.parts.xpbar.celebrate() }
        }
        return      // don't follow the anchor while fading out (the XP bar is already hidden, its anchor would fly along with her)
      }
      // Follow the XP bar (so the effect stays with her when she moves)
      const L = anchor(f)
      let x, y
      if (cur.full) { const c = center(L, f); x = c.x; y = c.y }
      else { x = L.bx; y = L.by }
      place(root, snap(x), snap(y), at)
    },
    rects() { return out },
    refresh() { paint() },
    play({ from = null, to, full = true, at: atSec } = {}) {
      if (!to) return
      if (!from || (from.tier === to.tier && from.division === to.division)) from = prevRank(to)
      const R = ui.rank(to.tier, to.division)
      const next = { from: { ...from, color: ui.rank(from.tier, from.division).color }, to: { ...to, color: R.color }, full }
      if (atSec == null && !calm(ui.f)) { if (api.playing) end(); pending = next; return }
      pending = null
      cur = next
      start(atSec)
    },
    stop() { pending = null; if (api.playing) end() },
    // Window hidden mid-play: clear the current run and put it back in the queue (frozen demos are left alone)
    requeue() { if (!api.playing || clock?.playState === 'paused') return; const c = cur; end(); pending = c },
  }
  return api
}
