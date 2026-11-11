// Behavior brain: idle director + interruptible behavior scripts + internal state (DESIGN.md §4, §5)
//  Each behavior is an async script (await clip end / wait); a higher-priority behavior cancels it
//  This is the core scheduler; domain behaviors live in this folder: typing (keyboard) mouse (mouse) idle (idle / sleep) music (music) system (foreground app / time)
//  Each domain module exports init(b) (initial state), reset(b) (test reset), methods (methods mixed into Brain)
import * as THREE from 'three'
import { clock } from '../clock.js'
import { Attention } from '../attention.js'
import { Lines } from '../lines.js'
import { C, idOf } from '../clips.js'
import { CANCEL, gamma3 } from './shared.js'
import { defaults } from '../params.js'
import * as typing from './typing.js'
import * as mouse from './mouse.js'
import * as idle from './idle.js'
import * as music from './music.js'
import * as system from './system.js'

const MODULES = [typing, mouse, idle, music, system]

export class Brain {
  constructor(ctx) {
    Object.assign(this, ctx)
    this.params = defaults()     // event parameters (params.js; tuning.json overrides are merged in by main.js)
    this.lines = new Lines(this.bubble, this.params)
    this.attn = new Attention({ proc: this.proc, input: this.input, world: this.world })
    this.state = 'idle'          // idle | held | air (for outside readers)
    this.vel = { x: 0, y: 0 }
    this.act = null              // current behavior { name, prio, tok }
    this.timers = []
    this.fps = 60
    // internal state
    this.energy = 0.8; this.arousal = 0.1; this.mood = 0.2
    this.base = 'stand'          // stand | weld | lounge | sleep
    this.stance = null           // temporary standing base pose (crouch etc.)
    this.lastPlayed = {}         // clip id -> last play time
    this.turretOK = true         // tripod prop is fixed (turretfix); gun rev / welding available
    this.pinned = false          // the UI wants her to stay put (GUI settings panel open): no wander, no lie down, no nap
    this.sleepAfter = 5          // "sleep after" setting (config.sleepAfter, min): lie down after this much idle, fall asleep after twice that
    for (const m of MODULES) m.init(this)
  }

  // ---------- infrastructure ----------
  wait(sec) { return new Promise(res => this.timers.push({ at: clock.now() + sec * 1000, res })) }
  later(sec, fn) { this.wait(sec).then(fn) }
  has(spec) { return this.pet.has(idOf(spec)) }
  once(spec, opts = {}) {
    return new Promise((res, rej) => {
      if (!this.has(spec)) return res(false)
      this.lastPlayed[idOf(spec)] = clock.now()
      this.pet.play(spec, { fade: 0.3, ...opts, loop: false, onDone: () => res(true) }).then(a => { if (!a) res(false) }, rej)
    })
  }
  loop(spec, opts = {}) {
    if (!this.has(spec)) return false
    this.lastPlayed[idOf(spec)] = clock.now()
    this.pet.play(spec, { fade: 0.35, ...opts, loop: true }).catch(e => console.warn(e))
    return true
  }

  // start a behavior; does nothing if its priority is lower than the current one
  run(name, prio, fn) {
    if (this.act && this.act.prio > prio) return false
    if (this.act) this.cancelTok(this.act.tok)
    const tok = { cancelled: false, cleanup: [] }
    this.act = { name, prio, tok }
    const guard = async (p) => { const r = await p; if (tok.cancelled) throw CANCEL; return r }
    fn(guard, tok).catch(e => { if (e !== CANCEL) console.warn(name, e) }).finally(() => {
      if (this.act?.tok === tok) { this.act = null; this.resumeBase() }
    })
    return true
  }
  get busy() { return !!this.act }
  // facing: standing turns slightly toward screen center, lying turns sideways (head toward screen center)
  faceYaw(kind = this.base) {
    const toLeft = this.world.x > this.world.w / 2
    this.proc.yawTarget = (kind === 'lounge' || kind === 'sleep') ? (toLeft ? 1.3 : -1.3) : (toLeft ? -0.32 : 0.32)
  }
  // end the given behavior (does not resume the base loop; the caller takes over)
  endAct(name) { if (this.act && (!name || this.act.name === name)) { this.cancelTok(this.act.tok); this.act = null } }
  // cancel a behavior: run its registered cleanup now (do not wait for its pending await to wake)
  cancelTok(tok) { tok.cancelled = true; for (const f of tok.cleanup || []) f(); tok.cleanup = [] }

  // resume the loop of the current base state
  resumeBase(fade = 0.4) {
    this.faceYaw()
    if (this.base === 'lounge' || this.base === 'sleep') {
      this.loop(C.lounge, { fade, loopFade: 0.6, speed: this.base === 'sleep' ? 0.5 : 1 })
    } else if (this.base === 'weld') {
      this.loop(C.weldLoop, { fade, loopFade: 0.8 })
    } else {
      this.loop(this.stance || C.hub, { fade, loopFade: this.stance ? 0.5 : 0 })
    }
    this.nextFidget = clock.now() + gamma3(this.params.idle.resumeGap * 1000)
  }

  // ---------- start ----------
  async start(clip) {
    this.proc.input = this.input
    const inp = this.input
    inp.on('pdown', e => this.onDown(e))
    inp.on('pmove', e => this.onPMove(e))
    inp.on('pup', e => this.onUp(e))
    inp.on('key', e => this.onKey(e))
    inp.on('click', e => this.onGlobalClick(e))
    inp.on('dblclick', () => this.onDouble())
    inp.on('system', e => this.onSystem(e))
    inp.on('wheel', e => this.onWheel(e))
    const cfg = await window.petAPI?.getConfig?.()
    this.applyConfig(cfg)
    window.petAPI?.onConfig?.(c => this.applyConfig(c))
    for (const s of [C.hub, C.grab, C.hang, C.fall, C.gunrev, C.getUp, C.landHeavy, C.landLight, C.taunt, C.lieDown, C.lounge, ...C.flips, ...C.fidgets.map(f => f[0])])
      if (this.has(s)) this.pet.getClip(s).catch(() => {})
    await this.proc.expr?.load?.()
    this.pet.typing?.init?.({ proc: this.proc, fx: this.fx, stage: this.stage, world: this.world, view: this.view })   // typing rig (motion module)
    if (clip) { this.loop(clip, { fade: 0 }); this.fixed = true; return }
    this.loop(C.hub, { fade: 0 })
    const q = new URLSearchParams(location.search)
    if ((!this.input.dev && !q.get('capture')) || q.get('entrance')) this.entrance()
  }

  // settings (config.json, written by the GUI settings panel): only sleepAfter is read for now
  applyConfig(c) { const x = Number(c?.sleepAfter); this.sleepAfter = x > 0 ? x : 5 }

  // entrance: skydive + greet by time of day after landing
  entrance() { this.dropIn(); this.air.greet = true }

  // skydive animation: fall from above the screen onto the taskbar (used for entrance, leaving Apex, and after the burst BOOM!)
  dropIn() {
    this.endAct()
    this.base = 'stand'; this.proc.face.base = 0; this.fps = 60; this.faceYaw('stand')
    this.world.y = -250
    this.state = 'air'
    this.vel = { x: 0, y: 300 }
    this.air = { t: 0, entrance: true }
    this.loop(this.has(C.fall) ? C.fall : C.held, { fade: 0 })
  }

  async greet() {
    const cfg = await window.petAPI?.getConfig?.()
    if (cfg && !cfg.firstRunDone) {
      window.petAPI.setConfig({ firstRunDone: true })
      this.lines.say('greet_first')
      return
    }
    const h = new Date().getHours()
    const cat = h < 5 ? 'greet_late' : h < 11 ? 'greet_morning' : h < 14 ? 'greet_noon' : h < 18 ? 'greet_afternoon' : 'greet_evening'
    this.lines.say(cat)
  }

  // developer panel test reset: end the current behavior, back to "standing, nothing happened" (mood and params untouched)
  resetForTest() {
    this.endAct()
    this.state = 'idle'; this.base = 'stand'; this.stance = null; this.turretOK = true
    this.vel = { x: 0, y: 0 }; this.air = null; this.world.y = this.world.floor
    this.proc.face.base = 0; this.fps = 60
    this.lastPlayed = {}
    for (const m of MODULES) m.reset(this)
    Object.assign(this.lines, { lastReply: -1e9, lastAuto: -1e9, autoTimes: [], quiet: false })
    if (this.proc.expr) { this.proc.expr.target = {}; this.proc.expr.pulses = [] }
    this.attn.lock = null; this.attn.click = null
    this.bubble.hide()
    this.resumeBase(0.25)
  }

  // ---------- per frame ----------
  update(dt) {
    const now = clock.now()
    const due = this.timers.filter(t => now >= t.at)
    this.timers = this.timers.filter(t => now < t.at)
    for (const t of due) t.res()
    this.arousal *= Math.exp(-dt / 15)
    this.mood += (0.2 - this.mood) * (dt / 600)
    if (this.pokes && now - this.pokeDecay > this.params.poke.pokeDecay * 1000) { this.pokes--; this.pokeDecay = now }

    if (this.state === 'air') this.updateAir(dt)
    this.updateWalk(dt)
    if (this.state === 'held') {
      this.updateHeld()
      // pendulum: body tilts against horizontal velocity
      const s = this.samples, a = s[0], b = s[s.length - 1]
      const vx = s.length > 1 ? (b.x - a.x) / Math.max(16, b.t - a.t) * 1000 : 0
      this.proc.tiltTarget = THREE.MathUtils.clamp(-vx / 2500, -0.6, 0.6)
    } else if (this.state === 'air') {
      this.proc.tiltTarget = THREE.MathUtils.clamp(this.vel.x / 4000, -0.5, 0.5)
    } else this.proc.tiltTarget = 0
    if (this.fixed) return
    this.lines.quiet = !!this.quietApp          // watching video / in a meeting: no unprompted lines
    this.updateTyping()
    this.updateHover()
    this.updatePat(dt)
    this.updateSpin(dt)
    this.updateClock()
    this.updateMusic(dt)
    this.updateIdle()
    this.attn.update(dt, this.arousal)
    if (this.state !== 'idle') this.proc.look.weight = Math.min(this.proc.look.weight, 0.7)
    if (this.isTyping()) this.proc.look.weight = Math.min(this.proc.look.weight, 0.35)   // facing away fixing Sheila: gaze follows the cursor only a little, no neck twist
    if (this.base === 'sleep') this.proc.look.weight = 0      // asleep: no gaze target
    this.proc.sleepBubble = this.base === 'sleep' ? 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(now / 1000 * Math.PI * 2 / 6.6)) : null
  }
}

for (const m of MODULES) Object.assign(Brain.prototype, m.methods)
