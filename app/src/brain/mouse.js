// Brain · mouse: pick up / throw / fall and land, poke (hit, taunt, warn), double-click photo, desktop click, head pat, wheel spin, hover (DESIGN §5.2)
import * as THREE from 'three'
import { clock } from '../clock.js'
import { C } from '../clips.js'
import { PRIO, pickOne } from './shared.js'

export function init(b) {
  b.dragging = false
  b.pokes = 0; b.pokeDecay = 0
  b.pokeCount = 0              // total pokes, only increases (UI stats; pokes is capped and decays)
  b.pokeGen = 0                // a single-click poke takes effect after 0.45 s; a double-click / new click in between voids it
  b.warnTimes = []             // times a poke reached "warn": at most two full escalations per 10 min
  b.sulking = false
  b.landings = 0
  b.pat = { rev: [], lastDir: 0, active: 0, count: 0, said: 0 }
  b.spin = { yaw: 0, total: 0, dizzyUntil: 0 }
  b.hover = { since: 0, said: -1e9 }
}
export function reset(b) {
  b.dragging = false; b.grab = null; b.hand = null
  b.pokes = 0; b.warnTimes = []; b.sulking = false
  b.pokeGen++                  // not reset to zero: pending delayed pokes must be voided
  Object.assign(b.pat, { rev: [], lastDir: 0, active: 0 })
  b.spin = { yaw: 0, total: 0, dizzyUntil: 0 }
  b.hover = { since: 0, said: -1e9 }
}

export const methods = {
  // ---------- pick up, throw ----------
  async onDown(e) {
    if (!this.input.over || this.state === 'air') return
    if (!this.input.dev && await this.stage.alphaAt(e.clientX - this.view.left, e.clientY - this.view.top) <= 0.5) return
    this.grab = { x: e.clientX, y: e.clientY, dx: this.world.x - e.clientX, dy: this.world.y - e.clientY, t: clock.now(), moved: 0 }
    this.cursor = { x: e.clientX, y: e.clientY }
    this.samples = [{ x: e.clientX, y: e.clientY, t: clock.now() }]
    this.dragging = true   // keep the mouse captured while held (shell requirement)
  },

  onPMove(e) {
    if (!this.dragging || !this.grab) return
    if (e.buttons !== undefined && !(e.buttons & 1)) return this.onUp(e)
    const g = this.grab
    g.moved = Math.max(g.moved, Math.hypot(e.clientX - g.x, e.clientY - g.y))
    this.samples.push({ x: e.clientX, y: e.clientY, t: clock.now() })
    if (this.samples.length > 6) this.samples.shift()
    this.cursor = { x: e.clientX, y: e.clientY }
    if (g.moved > this.params.poke.pickupPx && this.state !== 'held') this.pickUp()
  },

  onUp(e) {
    if (!this.dragging) return
    this.dragging = false
    if (this.state !== 'held') {
      this.recoil(e)
      const gen = ++this.pokeGen
      this.later(this.params.poke.pokeDelay, () => { if (gen === this.pokeGen) this.poke(e) })
      return
    }
    const s = this.samples, a = s[0], b = s[s.length - 1]
    const dt = Math.max(16, b.t - a.t) / 1000
    this.vel.x = THREE.MathUtils.clamp((b.x - a.x) / dt, -3000, 3000)
    this.vel.y = THREE.MathUtils.clamp((b.y - a.y) / dt, -3000, 3000)
    this.endAct('held')
    this.state = 'air'
    this.air = { t: 0, flipped: false }
    this.loop(this.has(C.fall) ? C.fall : C.held, { fade: 0.25 })
    this.proc.expr.clearAll('held')
    this.proc.expr.set('fearful', 0.35, 'air')
    this.mood -= 0.05
  },

  pickUp() {
    this.state = 'held'
    this.base = 'stand'
    this.proc.face.base = 0
    this.fps = 60
    this.hand = null
    this.faceYaw('stand')
    this.pat.rev = []
    this.run('held', PRIO.held, async (g) => {
      this.proc.expr.pulse('surprised', 0.9, 0.5, 1.2)
      this.attn.force('viewer', 1200)
      this.lines.say('held', { p: 0.4 })
      if (this.has(C.grab)) {
        await g(this.pet.getClip(C.grab))
        this.pet.play(C.grab, { fade: 0.12, loop: false, onDone: () => this.loop(C.hang, { fade: 0.3, loopFade: 0.3 }) })
      } else this.loop(C.held, { fade: 0.15 })
      await g(this.wait(4))
      this.proc.expr.set('sad', 0.25, 'held')   // held for long: resigned
      this.lines.say('held_long', { p: 0.6 })
      await g(this.wait(6))
      this.proc.expr.set('angry', 0.2, 'held')
      await g(new Promise(() => {}))     // stay held until release (the landing behavior takes over)
    })
  },

  // while held, the raised hand follows the cursor (body hangs below the hand and swings)
  updateHeld() {
    const B = this.pet.bones
    if (!this.hand) {
      // find the hand raised higher
      const l = B.def_l_wrist.getWorldPosition(new THREE.Vector3()), r = B.def_r_wrist.getWorldPosition(new THREE.Vector3())
      const c = this.pet.current
      if (c?.key?.includes('ziplineidle') && c.action.time > 0.2) this.hand = l.y > r.y ? B.def_l_wrist : B.def_r_wrist
    }
    const m = this.cursor
    if (!m) return
    if (this.hand) {
      const hp = this.stage.project(this.hand.getWorldPosition(new THREE.Vector3()))
      const hx = this.view.left + hp.x, hy = this.view.top + hp.y - 6
      this.world.x += (m.x - hx) * 0.35
      this.world.y = Math.min(this.world.floor, this.world.y + (m.y - hy) * 0.35)
    } else {
      this.world.x = m.x + this.grab.dx
      this.world.y = Math.min(this.world.floor, m.y + this.grab.dy)
    }
  },

  // ---------- fall / land ----------
  updateAir(dt) {
    const w = this.world, a = this.air, Q = this.params.poke
    a.t += dt
    this.vel.y += Q.gravity * dt
    this.vel.x *= Math.exp(-0.3 * dt)
    w.x += this.vel.x * dt
    w.y += this.vel.y * dt
    const margin = 70
    if (w.x < margin) { w.x = margin; this.vel.x = Math.abs(this.vel.x) * 0.4 }
    if (w.x > w.w - margin) { w.x = w.w - margin; this.vel.x = -Math.abs(this.vel.x) * 0.4 }
    if (w.y < -400) { w.y = -400; this.vel.y = Math.max(0, this.vel.y) }
    // flying fast: flip
    if (!a.flipped && !a.entrance && a.t > 0.2 && Math.hypot(this.vel.x, this.vel.y) > Q.flipSpeed) {
      a.flipped = true
      const f = C.flips.filter(x => this.has(x))
      if (f.length && Math.random() < Q.flipChance) { this.pet.play(pickOne(f), { fade: 0.15, loop: false }); this.attn.force('none', 3000) }
    }
    if (w.y >= w.floor) { w.y = w.floor; this.land(this.vel.y, a.entrance, a.greet) }
  },

  land(impact, entrance = false, greet = false) {
    this.state = 'idle'
    this.proc.expr.clearAll('air'); this.proc.expr.clearAll('held')
    this.pat.rev = []; this.pat.lastDir = 0                          // swinging while held is not a head pat
    if (!entrance) window.petAPI?.setConfig({ petX: Math.round(this.world.x) })   // remember the landing spot
    this.landings++
    const heavy = impact > this.params.poke.heavyImpact || entrance
    this.fx.puff(new THREE.Vector3(0, 0, 0), heavy ? 10 : 6, heavy ? 0.5 : 0.3)
    this.proc.bounce.bob.impulse(heavy ? 2.4 : 1.2)
    this.arousal = Math.min(1, this.arousal + 0.4)
    this.run('land', PRIO.event, async (g) => {
      await g(this.once(heavy ? C.landHeavy : C.landLight, { fade: 0.08, exitFade: 0.25 }))
      this.base = 'stand'
      if (heavy && this.has(C.getUp)) await g(this.once(C.getUp, { fade: 0.25, exitFade: 0.3 }))
      this.attn.force('viewer', 1500)
      if (greet) this.greet()
      else if (!entrance) this.lines.say(this.landings % 3 === 0 ? 'land_third' : heavy ? 'land_hard' : 'land', { p: 0.5 })
      this.proc.expr.pulse('happy', 0.4, 1, 1)
    })
  },

  // ---------- poke ----------
  // instant body reaction to a click (physical hit: jerk away from the click); double-click clicks get it too; no mood effect
  recoil(e) {
    const head = this.pet.bones.def_c_head.getWorldPosition(new THREE.Vector3())
    const hy = this.view.top + this.stage.project(head).y
    const onHead = e.clientY < hy + 25
    const side = e.clientX < this.world.x ? 1 : -1
    this.proc.bounce.nod.impulse(onHead ? -2.2 : -0.8)
    this.proc.bounce.bob.impulse(-1.0)
    this.proc.bounce.twist.impulse(side * 1.6)
    this.proc.face.blink()
  },

  poke(e) {
    const now = clock.now(), Q = this.params.poke
    if (this.state !== 'idle') return
    this.pokes = Math.min(8, this.pokes + 1)
    this.pokeCount++
    this.pokeDecay = now
    this.arousal = Math.min(1, this.arousal + 0.25)
    this.mood -= 0.08
    this.proc.expr.pulse('surprised', 0.8, 0.25, 0.3)
    this.later(0.25, () => this.proc.expr.pulse('angry', 0.45, 0.8, 1.2))
    this.attn.force('viewer', 1600)
    const c = this.pokes
    this.warnTimes = this.warnTimes.filter(t => now - t < 600e3)
    const capped = this.warnTimes.length >= Q.warnCap   // full escalation at most twice per 10 min (default), after that only the hit reaction
    if (this.base === 'sleep') { this.wake(true); return }
    if (this.base === 'lounge') { this.getUp(); return }
    if (c === 1) this.lines.say('poke1', { p: 0.5 })
    else if (c < Q.tauntFrom) this.lines.say('poke', { p: 0.8 })
    else if (c < Q.warnFrom && (!this.act || this.act.prio < PRIO.typing) && !capped) {   // taunt only interrupts idle-class behaviors
      this.run('taunt', PRIO.direct, async (g) => {
        this.lines.say('poke', { p: 0.6 })
        await g(this.once(C.taunt, { fade: 0.25 }))
      })
    } else if (c >= Q.warnFrom && !this.sulking && !this.isTyping() && !capped) {
      this.sulking = true
      this.warnTimes.push(now)
      this.run('warn', PRIO.direct, async (g, tok) => { tok.cleanup.push(() => { this.sulking = false; this.stance = null }); try {
        this.lines.say('poke_warn')
        this.attn.sulk(10000)
        this.proc.sheila.poke(3)
        this.sparkFromSheila(10, 1.4)
        await g(this.once(this.turretOK ? C.gunrev : C.taunt, { fade: 0.2 }))
        this.stance = C.stances.find(x => this.has(x)) || null
        this.resumeBase(0.4)
        await g(this.wait(Q.sulkTime))
        this.lines.say('poke_forgive')
        this.proc.expr.pulse('happy', 0.6, 1, 1)
        this.pokes = 0
      } finally { this.sulking = false; this.stance = null } })
    }
  },

  // click elsewhere on the desktop: look over half the time
  onGlobalClick(e) {
    if (e.type !== 'down' || e.button !== 1 || this.input.over) return
    const Q = this.params.poke
    if (Math.hypot(e.lx - this.world.x, e.ly - this.world.y) < Q.clickRange && Math.random() < Q.clickChance) this.attn.onClick(e.lx, e.ly)
  },

  // double-click: photo pose
  onDouble() {
    this.pokeGen++          // the two clicks of a double-click are not pokes
    if (!this.input.over || this.state !== 'idle' || this.base !== 'stand' || this.isTyping()) return
    const list = C.photos.filter(x => this.has(x) && (this.turretOK || !(this.pet.clipMeta.get(x).props || []).includes('turret_lobby')))
    if (!list.length) return
    this.run('photo', PRIO.direct, async (g) => {
      if (!this.photoBag?.length) this.photoBag = list.slice().sort(() => Math.random() - 0.5)
      const id = this.photoBag.pop()
      const clip = await g(this.pet.getClip(id))
      // turn to face the camera (a slight angle looks better)
      this.proc.yawTarget = -(clip.userData.facing || 0) + (this.world.x > this.world.w / 2 ? -0.15 : 0.15)
      this.loop(id, { fade: 0.12 })
      this.proc.expr.pulse('happy', 0.7, 2.5, 0.8)
      this.attn.force('viewer', 3000)
      this.flash?.()
      this.lines.say('photo', { p: 0.3 })
      await g(this.wait(this.params.poke.photoHold))
    })
  },

  // ---------- head pat: cursor moves left and right over the head (no click) ----------
  updatePat(dt) {
    const now = clock.now(), P = this.pat, m = this.input.mouse, Q = this.params.touch
    const head = this.pet.bones.def_c_head.getWorldPosition(new THREE.Vector3())
    const hp = this.stage.project(head)
    const hx = this.view.left + hp.x, hy = this.view.top + hp.y
    const onHead = Math.abs(m.x - hx) < 60 && m.y > hy - 70 && m.y < hy + 30 && now - m.t < 150
    if (onHead && this.state === 'idle' && !this.dragging && Math.abs(m.vx) > Q.patSpeed) {
      const dir = Math.sign(m.vx)
      if (dir !== P.lastDir) { P.rev.push(now); P.lastDir = dir }
    }
    P.rev = P.rev.filter(t => now - t < Q.patWindow * 1000)
    if (P.rev.length >= Q.patTurns && this.state === 'idle' && this.base === 'stand') {
      if (!P.active) {
        P.active = now; P.count++
        this.proc.expr.set('happy', 0.7)
        this.proc.face.base = 0.75                // squint
        this.attn.lookAtViewer(0.9)
        const first = !this.pettedToday || this.pettedToday !== new Date().toDateString()
        this.pettedToday = new Date().toDateString()
        this.lines.say(first ? 'pet_first' : 'pet_more', { p: first ? 1 : 0.4 })
      }
      P.last = now
      this.proc.bounce.twist.impulse(-P.lastDir * 0.25 * dt * 60 * 0.1)   // head rubs toward the pat direction
      if (now - P.active > Q.patLong * 1000 && now - P.said > 20000) { P.said = now; this.lines.say('pet_long', { p: 0.8 }); this.proc.bounce.nod.impulse(-1.2) }
    } else if (P.active && now - (P.last || 0) > 700) {
      P.active = 0
      this.proc.expr.clear('happy'); this.proc.expr.pulse('happy', 0.5, 1.5, 1)
      if (this.base === 'stand') this.proc.face.base = 0
      this.mood = Math.min(1, this.mood + 0.15)
    }
  },

  // ---------- wheel: spin her like a figurine; too much makes her dizzy ----------
  onWheel(e) {
    if (!this.input.over || this.state !== 'idle' || this.base !== 'stand' || this.isTyping()) return
    const Q = this.params.touch
    const d = Math.sign(e.rotation || e.deltaY || 0) * Q.spinStep
    this.spin.yaw += d; this.spin.total += Math.abs(d)
    this.spin.last = clock.now()
    if (this.spin.total > Math.PI * 2 * Q.dizzyTurns && clock.now() > this.spin.dizzyUntil) {
      this.spin.dizzyUntil = clock.now() + Q.dizzyTime * 1000; this.spin.total = 0
      this.proc.expr.pulse('sad', 0.5, 2.5, 1)
      this.lines.say('dizzy', { p: 1 })
    }
  },
  updateSpin(dt) {
    const S = this.spin, now = clock.now()
    if (now - (S.last || 0) > 2500) S.yaw *= Math.exp(-dt * 1.5)          // after stopping, slowly turn back
    if (now < S.dizzyUntil) {                                              // dizzy: head circles
      const k = (S.dizzyUntil - now) / (this.params.touch.dizzyTime * 1000)
      this.proc.bounce.nod.x = Math.sin(now / 160) * 0.12 * k
      this.proc.bounce.twist.x = Math.cos(now / 160) * 0.15 * k
    }
    if (S.total > 0) S.total = Math.max(0, S.total - dt * 1.2)
    this.proc.yawExtra = S.yaw
  },

  // ---------- hover ----------
  updateHover() {
    const now = clock.now(), Q = this.params.touch
    if (this.input.over && this.state === 'idle') {
      if (!this.hover.since) this.hover.since = now
      const t = now - this.hover.since
      if (t > Q.hoverLook * 1000 && !this.hover.looked) { this.hover.looked = true; this.attn.lookAtViewer(0.9); this.proc.expr.pulse('happy', 0.5, 1.5, 1) }
      if (t > Q.hoverSay * 1000 && now - this.hover.said > Q.hoverCool * 1000) { this.hover.said = now; this.lines.say('hover') }
    } else { this.hover.since = 0; this.hover.looked = false }
  },
}
