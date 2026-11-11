// Brain · idle: idle director (picks idle fidgets by idle-time tier), lie down / fall asleep / wake up, nap, wander (DESIGN §4.5, §5.3, §5.4)
//  idle = time since the last key / click / wheel; moving the cursor does not count
import * as THREE from 'three'
import { clock } from '../clock.js'
import { C, idOf } from '../clips.js'
import { PRIO, pickOne, gamma3 } from './shared.js'

export function init(b) {
  b.nextFidget = 8000
  b.walk = null
}
export function reset(b) {
  b.walk = null
}

export const methods = {
  updateIdle() {
    const now = clock.now()
    // idle = time since the last key / click / wheel; moving the cursor does not count (system idle is reset by mouse moves, so it is not used)
    const idle = this.input.idleMs()
    const { lieAt, sleepAt } = this.idleThresholds()
    if (this.base === 'stand' && this.state === 'idle' && idle > lieAt && !this.busy && !this.pinned) this.lieDown()
    if (this.base === 'lounge' && idle > sleepAt && !this.busy) this.sleep()
    // while asleep, a key / click / wheel wakes her; clicks on her go to poke (poked awake)
    if (this.base === 'sleep' && idle < 300 && !this.input.over && !this.busy) this.wake(false)

    if (this.busy || this.state !== 'idle' || now < this.nextFidget) return
    if (this.music.on && !this.music.otherTurn) return    // while music plays its beats schedule moves (music.js); only "other move" turns are picked here
    this.music.otherTurn = false
    const sinceKey = now - this.input.lastKey
    const I = this.params.idle, Pl = this.params.pool
    const tier = idle < I.tier1 * 1000 ? 0 : idle < I.tier2 * 1000 ? 1 : 2
    this.nextFidget = now + gamma3([I.gap0, I.gap1, I.gap2][tier] * 1000)
    if (this.base !== 'stand') return
    if (sinceKey < I.typingBudget * 1000) {            // motion budget: you are typing, small fidgets only
      if (Math.random() < I.typingBubble) this.fidget(C.bubble)
      return
    }
    const cool = (id, s) => now - (this.lastPlayed[id] ?? -1e12) > s * 1000
    const key = (spec) => typeof spec === 'string' ? spec : `${spec.id}@${spec.from}`
    const opts = C.fidgets.map(([spec, w]) => [spec, cool(key(spec), Pl.fidgetCool) ? w : 0])
    opts.push([C.gunrev, cool(C.gunrev, Pl.gunrevCool) && this.turretOK ? Pl.gunrevW : 0], ['stance', cool('stance', Pl.stanceCool) ? Pl.stanceW : 0])
    if (tier >= 1) opts.push([C.weld, cool(key(C.weld), Pl.weldCool) && this.turretOK ? Pl.weldW : 0], [C.yoga, cool(C.yoga, Pl.yogaCool) ? Pl.yogaW : 0], [C.stretch, cool(key(C.stretch), Pl.stretchCool) ? Pl.stretchW : 0])
    if (tier >= 2) for (const b of C.bored) opts.push([b, cool(key(b), Pl.boredCool) ? Pl.boredW : 0])
    if (tier >= 2 && !this.pinned) opts.push(['nap', cool('nap', Pl.napCool) ? Pl.napW : 0])
    if (tier >= 1 && !this.pinned) opts.push(['wander', cool('wander', Pl.wanderCool) ? Pl.wanderW : 0])
    if (tier >= 1 && Math.random() < I.idleLine) this.lines.say('idle', { kind: 'auto' })
    const valid = opts.filter(([sp, w]) => w > 0 && (sp === 'stance' || sp === 'nap' || sp === 'wander' || this.has(sp)))
    let r = Math.random() * valid.reduce((a, [, w]) => a + w, 0)
    for (const [sp, w] of valid) { if ((r -= w) <= 0) { this.lastPlayed[key(sp)] = now; this.fidget(sp); break } }
  },

  // idle thresholds for lie down / fall asleep (ms): the "sleep after" setting x minutes lies down, 2x falls asleep; halved from 0 to 5 am if enabled
  idleThresholds() {
    const k = this.params.idle.lateHalve && new Date().getHours() < 5 ? 0.5 : 1
    return { lieAt: this.sleepAfter * 60e3 * k, sleepAt: this.sleepAfter * 2 * 60e3 * k }
  },

  fidget(spec) {
    if (spec === 'wander') { this.wander(); return }
    if (spec === 'nap') {
      // lie down for a while, then get up (real long idle goes to lie / sleep via updateIdle)
      this.lastPlayed.nap = clock.now()
      this.lieDown()
      const I = this.params.idle
      this.later(I.napMin + Math.random() * (I.napMax - I.napMin), () => { if (this.base === 'lounge' && !this.busy && this.input.idleMs() < this.idleThresholds().lieAt) this.getUp() })
      return
    }
    if (spec === 'stance') {
      const alt = C.stances.filter(x => this.has(x))
      if (!alt.length) return
      this.lastPlayed.stance = clock.now()
      this.run('stance', PRIO.ambient, async (g, tok) => {
        tok.cleanup.push(() => { this.stance = null })
        try {
          this.stance = pickOne(alt)
          this.loop(this.stance, { fade: 0.5, loopFade: 0.5 })
          const I = this.params.idle
          await g(this.wait(I.stanceMin + Math.random() * (I.stanceMax - I.stanceMin)))
        } finally { this.stance = null }   // clear it even when another behavior interrupts, or the base pose stays crouched
      })
      return
    }
    if (spec === C.yoga) {
      this.run('yoga', PRIO.ambient, async (g) => {
        await g(this.once(C.yoga, { fade: 0.4, exitFade: 0.3 }))
        if (this.has(C.yogaLoop)) { this.loop(C.yogaLoop, { fade: 0.3 }); await g(this.wait(8 + Math.random() * 10)) }
      })
      return
    }
    const hubLike = /center_idle|select_idle/.test(idOf(spec))
    this.run('fidget', PRIO.ambient, async (g) => {
      await g(this.once(spec, { fade: hubLike ? 0.3 : 0.4, exitFade: hubLike ? 0.3 : 0.4 }))
    })
  },

  // ---------- lie / sleep / wake ----------
  lieDown() {
    if (this.base !== 'stand' || this.state !== 'idle' || !this.has(C.lounge)) return
    this.run('lieDown', PRIO.ambient, async (g) => {
      this.faceYaw('lounge')
      if (this.has(C.lieDown)) await g(this.once(C.lieDown, { fade: 0.4, exitFade: 0.5 }))
      this.base = 'lounge'
      this.fps = 30
      this.lines.say('lounge', { kind: 'auto', p: 0.5 })
    })
  },

  sleep() {
    this.base = 'sleep'
    this.proc.face.base = 1
    this.fps = 20
    if (!this.busy) this.resumeBase(1.0)
  },

  wake(poked) {
    if (this.base !== 'sleep' && this.base !== 'lounge') return
    const wasAsleep = this.base === 'sleep'
    this.proc.face.base = 0
    this.fps = 60
    if (wasAsleep) {
      const b = this.pet.root.getObjectByName('bubblegum__bubblegumCore')
      if (b) this.fx.pop(b.getWorldPosition(new THREE.Vector3()))
      this.proc.expr.pulse('surprised', 0.95, 0.6, 1)
    }
    this.getUp(wasAsleep ? (poked ? 'wake_poke' : 'wake') : null)
  },

  getUp(line) {
    this.run('getUp', PRIO.event, async (g) => {
      this.base = 'stand'
      this.faceYaw('stand')
      this.proc.face.base = 0
      this.fps = 60
      if (this.has(C.getUp)) await g(this.once(C.getUp, { fade: 0.35, exitFade: 0.3 }))
      this.typing.graceUntil = clock.now() + this.params.typing.wakeGrace * 1000   // stand a moment after getting up; take out Sheila only if typing continues
      this.attn.force('viewer', 1500)
      if (line) this.lines.say(line)
    })
  },

  // ---------- wander: sneak crouched to another spot on the taskbar ----------
  wander(targetX) {
    if (!this.has(C.sneak)) return
    const w = this.world
    this.lastPlayed.wander = clock.now()
    let tx = targetX ?? w.w * (0.35 + Math.random() * 0.55)
    if (Math.abs(tx - w.x) < 200) tx = w.x + (w.x > w.w * 0.6 ? -1 : 1) * (250 + Math.random() * 200)
    tx = Math.max(90, Math.min(w.w - 90, tx))
    const dir = Math.sign(tx - w.x)
    const rate = 0.35
    this.run('wander', PRIO.ambient, async (g) => {
      this.proc.yawTarget = dir < 0 ? 0 : Math.PI          // the clip walks toward -X: left is yaw 0, right turns 180°
      this.loop(C.sneak, { fade: 0.35, speed: rate })
      await g(this.wait(0.35))
      this.walk = { tx, dir, v: 4.12 * rate * this.view.ppm }
      await g(new Promise(res => { this.walk.done = res }))
      this.walk = null
      window.petAPI?.setConfig({ petX: Math.round(w.x) })
      this.attn.lookAtViewer(0.6)
    })
  },
  updateWalk(dt) {
    const W = this.walk
    if (!W) return
    if (this.act?.name !== 'wander') { this.walk = null; return }
    const step = W.v * dt
    if (Math.abs(W.tx - this.world.x) <= step) { this.world.x = W.tx; W.done?.(); W.done = null; return }
    this.world.x += W.dir * step
  },
}
