// Attention: scores a few targets for interest and decides where she looks (DESIGN.md §4.4)
//   cursor the cursor / viewer looking at you (camera) / work the window you are typing in / click a spot just clicked / glance random zone out / none let the animation's own gaze take over
// output goes to proc.look: mode, point, weight, headHalf
import * as THREE from 'three'
import { clock } from './clock.js'

export class Attention {
  constructor({ proc, input, world }) {
    this.proc = proc; this.input = input; this.world = world
    this.cur = 'none'
    this.since = 0            // when the current target started
    this.nextEval = 0
    this.viewerBoost = 0      // "look at you" bonus from events, decays over time
    this.click = null         // { x, y, t }
    this.glance = null        // { x, y, until }
    this.nextGlance = 4000
    this.lock = null          // { target, until }: forced by a behavior (picked up, sulking etc.)
    this.ignoreCursorUntil = 0
    this.arousal = 0
  }

  // for the behavior layer: force a target for a while
  force(target, ms) { this.lock = { target, until: clock.now() + ms }; this.switchTo(target) }
  lookAtViewer(boost = 0.7) { this.viewerBoost = Math.max(this.viewerBoost, boost) }
  onClick(x, y) { this.click = { x, y, t: clock.now() } }
  sulk(ms) { this.ignoreCursorUntil = clock.now() + ms }

  switchTo(t) {
    if (t === this.cur) return
    const big = (t === 'viewer' || this.cur === 'viewer' || t === 'click')
    this.cur = t
    this.since = clock.now()
    // big head turns blink along 60% of the time
    if (big && Math.random() < 0.6) this.proc.face?.blink()
  }

  workPoint() {
    const fg = this.input.system?.fg
    if (fg && fg.rect && !fg.isSelf && fg.rect.width > 200) {
      const r = fg.rect
      return { x: r.lx + r.width / 2, y: r.ly + r.height * 0.66 }
    }
    return { x: this.world.w * 0.45, y: this.world.h * 0.6 }
  }

  scores(now) {
    const inp = this.input
    const m = inp.mouse
    const sinceMove = now - inp.lastMouse
    const sinceKey = now - inp.lastKey
    const s = {}
    // cursor: the faster it moves, the more it catches the eye; fades with a 3 s time constant after it stops
    const habit = Math.exp(-Math.max(0, sinceMove - 400) / 3000)
    s.cursor = m.x > -1e3 ? (0.45 + Math.min(1, m.speed / 1500) * 0.5) * habit : 0
    if (inp.over) s.cursor = 1.2
    if (now < this.ignoreCursorUntil) s.cursor = 0
    // looking at you: bonus from events; gets bored after more than 2.5 s of continuous looking
    const dwellV = this.cur === 'viewer' ? (now - this.since) : 0
    s.viewer = (0.22 + this.viewerBoost) * (dwellV > 2500 ? Math.exp(-(dwellV - 2500) / 1500) : 1)
    // work area: while typing (cursor still), the gaze rests on the foreground window
    s.work = sinceKey < 2000 ? 0.75 * (sinceMove > 800 ? 1 : 0.4) : 0
    // click point
    s.click = this.click && now - this.click.t < 1200 ? 1.1 : 0
    // random zone out
    s.glance = this.glance && now < this.glance.until ? 0.5 : 0
    // the animation's own gaze
    s.none = 0.3
    return s
  }

  update(dt, arousal = 0) {
    const now = clock.now()
    this.arousal = arousal
    this.viewerBoost *= Math.exp(-dt / 2.5)
    const L = this.proc.look
    // eye / head speed follows arousal
    L.headHalf = 0.16 / (0.8 + 0.5 * arousal)

    if (now > this.nextGlance && this.cur !== 'glance') {
      const w = this.world
      this.glance = { x: w.x + (Math.random() - 0.5) * 900, y: w.y - 200 - Math.random() * 500, until: now + 800 + Math.random() * 1200 }
      this.nextGlance = now + 6000 + Math.random() * 12000
    }

    if (this.lock && now < this.lock.until) {
      this.switchTo(this.lock.target)
    } else if (now >= this.nextEval) {
      this.lock = null
      this.nextEval = now + 100
      const s = this.scores(now)
      let best = this.cur, bestS = s[this.cur] ?? 0
      for (const [k, v] of Object.entries(s)) if (v > bestS * 1.3 && v > (s[best] ?? 0)) { best = k; bestS = v }
      const strong = best === 'click' || (best === 'cursor' && this.input.over)
      if (best !== this.cur && (strong || now - this.since > 450)) this.switchTo(best)
    }
    this.apply(L)
  }

  apply(L) {
    const t = this.cur
    if (t === 'cursor') { L.mode = 'cursor'; L.weight = 1 }
    else if (t === 'viewer') { L.mode = 'camera'; L.weight = 0.9 }
    else if (t === 'none') { L.mode = 'none'; L.weight = 0 }
    else {
      const p = t === 'work' ? this.workPoint() : t === 'click' ? this.click : this.glance
      if (!p) { L.mode = 'none'; return }
      L.mode = 'point'
      L.weight = t === 'glance' ? 0.7 : 0.9
      this.proc.cursorWorld(p.x, p.y, L.point)
    }
  }
}
