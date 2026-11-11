// Brain · keyboard (DESIGN §5.1, refactored 2026-09-27): typing has only two interactions
//  normal typing: input -> take out Sheila -> fix Sheila facing away (loop, barrel spins with typing speed) -> typing stop for a while -> stow Sheila -> stand
//  burst: burst tier held for a while while fixing Sheila -> turn and slam -> ride and swing Sheila -> muzzle sparks -> BOOM! -> skydive -> stand (still typing: take out Sheila again)
//  clip blending, props, sparks and BOOM live in the motion module's typing rig pet.typing (src/typing.js); this only decides when to enter, exit, burst
//  asleep / lying, a key wakes her; that key does not count as typing, and after getting up a window (params.typing.wakeGrace) keeps typing from starting
import * as THREE from 'three'
import { clock } from '../clock.js'
import { PRIO } from './shared.js'

const TYPE_YAW = THREE.MathUtils.degToRad(18)   // typing / burst always face +18° (at -18° the tripod looks misplaced)
const SPIN_STOP = 2.5                            // how long after the typing stop the barrel stops (s); must be before stowing Sheila

export function init(b) {
  b.typing = { level: 'none', burstSince: 0, lastBurst: -1e9, graceUntil: 0 }
}
export const reset = init

export const methods = {
  onKey(e) {
    this.proc.turret?.key()
    this.arousal = Math.min(1, this.arousal + 0.015)
    // asleep / lying, the first key wakes her; also while lying down. This key does not count as typing
    if (this.act?.name === 'lieDown') { this.endAct(); this.base = 'lounge' }
    if (this.base === 'sleep' || this.base === 'lounge') { this.input.keyTimes.pop(); this.wake(false) }
  },

  // typing / burst in progress (poke, photo, dance do not interrupt it; only picking up does)
  isTyping() { return this.act?.name === 'typing' || this.act?.name === 'burst' },

  updateTyping() {
    const T = this.typing, Q = this.params.typing
    const now = clock.now()
    const r1 = this.input.rate(1000), r2 = this.input.rate(2000)
    const sinceKey = now - this.input.lastKey
    let level = 'none'
    if (r2 >= Q.burstRate) level = 'burst'
    else if (r1 >= Q.steadyRate || (T.level !== 'none' && sinceKey < Q.steadyHold * 1000)) level = 'steady'
    if (level === 'burst' && T.level !== 'burst') T.burstSince = now
    T.level = level
    const rig = this.pet.typing
    if (this.proc.turret) this.proc.turret.allow = this.act?.name === 'typing' && rig?.phase === 'loop' && sinceKey < Math.min(SPIN_STOP, Q.stowAfter - 0.2) * 1000
    if (this.isTyping()) { this.proc.yawTarget = TYPE_YAW; this.spin.yaw = 0 }
    // enter typing: standing, actively typing (steady tier rate, not the hold after the typing stop), past the wake window; only idle-class behaviors can be interrupted
    if (rig && r1 >= Q.steadyRate && now >= T.graceUntil && this.base === 'stand' && this.state === 'idle' && !rig.busy &&
      (!this.act || this.act.prio < PRIO.typing)) this.startTyping()
  },

  startTyping() {
    const T = this.typing, Q = this.params.typing, rig = this.pet.typing
    this.run('typing', PRIO.typing, async (g, tok) => {
      tok.cleanup.push(() => rig.cancel())
      this.proc.yawTarget = TYPE_YAW
      await g(rig.enter())
      for (;;) {
        await g(this.wait(0.1))
        const now = clock.now()
        if (T.level === 'burst' && now - T.burstSince > Q.revupAfter * 1000 && now - T.lastBurst > Q.revupCool * 1000 && rig.phase === 'loop') {
          tok.cleanup = []          // the rig is handed over to the burst, do not cancel
          this.startBurst()
          return
        }
        if (now - this.input.lastKey > Q.stowAfter * 1000) break
      }
      await g(rig.exit())
    })
  },

  startBurst() {
    const rig = this.pet.typing
    this.typing.lastBurst = clock.now()
    this.run('burst', PRIO.typing, async (g, tok) => {
      tok.cleanup.push(() => rig.cancel())
      this.lines.say('burst', { kind: 'auto', p: 0.5 })
      await g(rig.burst())      // returns the moment BOOM! hides her; the transition layer finishes on its own
      tok.cleanup = []
      this.dropIn()             // skydive back to the taskbar (same as the entrance, no greeting); still typing after landing: take out Sheila again
    })
  },

  // muzzle sparks from Sheila on her back (used on poke warn)
  sparkFromSheila(n = 6, speed = 1.2) {
    const b = this.pet.root.getObjectByName('def_c_barrel_base')
    if (!b) return
    const p = new THREE.Vector3(-0.5, 0, 0).applyMatrix4(b.matrixWorld)     // muzzle is at the local -X end
    const d = new THREE.Vector3(-1, 0, 0).transformDirection(b.matrixWorld)
    this.fx.sparks(p, d, n, speed)
  },
}
