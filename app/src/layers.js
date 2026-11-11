// Small additive layers: spring impulses (nod, upper-body bob, shoulder shake), Sheila barrel spin
import * as THREE from 'three'
import { clock } from './clock.js'

// Second-order spring: x is the offset (radians), impulse adds velocity
export class Kick {
  constructor(omega = 18, zeta = 0.45) { this.w = omega; this.z = zeta; this.x = 0; this.v = 0 }
  impulse(a) { this.v += a }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n
    for (let i = 0; i < n; i++) {
      this.v += (-this.w * this.w * this.x - 2 * this.z * this.w * this.v) * h
      this.x += this.v * h
    }
    return this.x
  }
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion()
const _ax = new THREE.Vector3()

// Rotate a bone about a character-space axis (rotating with the root), on top of the current pose
export function rotateAboutRootAxis(bone, root, axisLocal, angle) {
  if (!angle) return
  root.getWorldQuaternion(_q)
  _ax.copy(axisLocal).applyQuaternion(_q)
  _q.setFromAxisAngle(_ax, angle)
  bone.parent.getWorldQuaternion(_q2)
  bone.getWorldQuaternion(_q3)
  _q3.premultiply(_q)
  bone.quaternion.copy(_q2.invert().multiply(_q3))
  bone.updateMatrixWorld(true)
}

// Per-key nod / upper-body bob / alternating left-right shoulder shake; amplitude scales with key interval: small and smooth when typing fast
export class KeyBounce {
  constructor(pet) {
    this.pet = pet
    const B = pet.bones
    this.head = B.def_c_head; this.neck = B.def_c_neckB; this.chest = B.def_c_spineC
    this.clavL = B.def_l_clav; this.clavR = B.def_r_clav
    this.nod = new Kick(20, 0.42)
    this.bob = new Kick(16, 0.5)
    this.shL = new Kick(22, 0.5)
    this.shR = new Kick(22, 0.5)
    this.twist = new Kick(12, 0.35)     // upper body twists a bit when hit
    this.side = 1
    this.last = 0
    this.gain = 1
  }
  key(kind) {
    const now = clock.now()
    const gap = now - this.last
    this.last = now
    const k = THREE.MathUtils.clamp(gap / 250, 0.35, 1) * this.gain
    const big = kind === 'enter' ? 2.2 : 1
    // impulse unit: rad/s, peak about v / w
    this.nod.impulse(0.65 * k * big * (0.8 + Math.random() * 0.4))
    this.bob.impulse(0.3 * k * big)
    this.side = -this.side
    ;(this.side > 0 ? this.shL : this.shR).impulse(0.5 * k)
  }
  apply(dt, root) {
    const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1)
    const n = this.nod.step(dt), b = this.bob.step(dt)
    const l = this.shL.step(dt), r = this.shR.step(dt), tw = this.twist.step(dt)
    const Y = new THREE.Vector3(0, 1, 0)
    if (this.chest) rotateAboutRootAxis(this.chest, root, X, b)
    if (this.chest && tw) rotateAboutRootAxis(this.chest, root, Y, tw * 0.6)
    if (this.head && tw) rotateAboutRootAxis(this.head, root, Y, tw * 0.5)
    if (this.neck) rotateAboutRootAxis(this.neck, root, X, n * 0.4)
    if (this.head) rotateAboutRootAxis(this.head, root, X, n * 0.6)
    if (this.clavL) rotateAboutRootAxis(this.clavL, root, Z, l)
    if (this.clavR) rotateAboutRootAxis(this.clavR, root, Z, -r)
  }
  get bones() { return [this.head, this.neck, this.chest, this.clavL, this.clavR].filter(Boolean) }
}

// Barrel of the tripod Sheila (while fixing Sheila during typing): first spreads into four barrels, then spins with typing speed
//  - spread 0.4 s: the four barrels move along local Z, retract −3 cm -> shoot out to 15 cm -> settle at 9 cm, twisting 45° in the second half, direction by diagonal: top left, bottom right about −Z, top right, bottom left about +Z
//    (twisting all one way makes them pair up into V shapes instead of spreading); spinning starts only after spreading, keys pressed meanwhile are saved and applied at once afterwards
//  - spin: base about local Z (X for the one on her back); per-key ratchet 90° (spring w 45, z 0.62) + flywheel = keys per second × 0.35 turns (max 12), τ 0.8 s after typing stops
//  - close: spinning no longer allowed (allow false, or 2.5 s without typing) -> brake τ 0.2 s -> angle snapped to a whole 90° -> 0.3 s twist back and retract
// Interface: the brain writes allow every frame and calls key() in onKey; mode is read by tests: 'closed' | 'opening' | 'open' | 'braking' | 'closing'
export class TurretSpin {
  constructor(pet) {
    this.pet = pet
    this.allow = false
    this.reset()
  }
  reset() { this.s = { t: 0, d: 0, mode: 'closed', keys: [], idle: 99, ratchet: 0, ratchetV: 0, target: 0, pending: 0, fly: 0, flyV: 0 }; this.nKeys = 0 }
  key(n = 1) { this.nKeys += n }
  get mode() { return this.s.mode }
  get rps() { return this.s.flyV / (Math.PI * 2) }
  _bones() {
    const tp = this.pet.props.turret_lobby
    if (!tp) return null
    if (this._tp !== tp) {
      const P = 'turret_lobby__'
      this._tp = tp
      this.base = tp.getObjectByName(P + 'def_c_barrel_base')
      this.kids = ['def_l_top_barrel', 'def_r_top_barrel', 'def_l_bot_barrel', 'def_r_bot_barrel'].map(n => tp.getObjectByName(P + n))
    }
    return this.base && this.kids.every(Boolean) ? tp : null
  }
  update(dt) {
    const tp = this._bones(), st = this.s, nKeys = this.nKeys
    this.nKeys = 0
    st.t += dt
    for (let i = 0; i < nKeys; i++) st.keys.push(st.t)
    st.idle = nKeys ? 0 : st.idle + dt
    st.keys = st.keys.filter(k => st.t - k < 1)
    const rate = st.keys.length, want = this.allow && st.idle < 2.5 && !!tp?.visible
    const Q = Math.PI / 2
    // states: closed -> opening -> open -> braking (brake and snap) -> closing -> closed
    if (want && (st.mode === 'closed' || st.mode === 'closing')) st.mode = 'opening'
    if (!want && (st.mode === 'open' || st.mode === 'opening')) st.mode = 'braking'
    if (want && st.mode === 'braking') st.mode = 'open'
    if (st.mode === 'opening') { st.d = Math.min(1, st.d + dt / 0.4); if (st.d >= 1) st.mode = 'open' }
    if (st.mode === 'closing') { st.d = Math.max(0, st.d - dt / 0.3); if (st.d <= 0) st.mode = 'closed' }
    const ready = st.mode === 'open'
    if (nKeys) { if (ready) st.target += nKeys * Q; else if (want) st.pending += nKeys }
    if (ready && st.pending) { st.target += st.pending * Q; st.pending = 0 }
    if (!want) st.pending = 0
    // flywheel: speeds up with typing only after spreading; decays quickly while braking
    const wantFly = Math.min(rate * 0.35, 12) * Math.PI * 2
    if (ready && rate > 3 && wantFly > st.flyV) st.flyV += (wantFly - st.flyV) * Math.min(1, dt * 3)
    else st.flyV *= Math.exp(-dt / (st.mode === 'braking' ? 0.2 : 0.8))
    st.fly += st.flyV * dt
    // braking: once the flywheel has nearly stopped, snap the total angle to the nearest whole 90°, then start closing
    if (st.mode === 'braking' && st.flyV < 1.5) {
      st.target = Math.round((st.ratchet + st.fly) / Q) * Q - st.fly; st.flyV = 0
      if (Math.abs(st.ratchet - st.target) < 0.02 && Math.abs(st.ratchetV) < 0.3) st.mode = 'closing'
    }
    // ratchet: underdamped spring follows the target (about 8% overshoot)
    const w = 45, z = 0.62, n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n
    for (let i = 0; i < n; i++) { st.ratchetV += (-w * w * (st.ratchet - st.target) - 2 * z * w * st.ratchetV) * h; st.ratchet += st.ratchetV * h }
    if (!tp) return
    // write bones: the mixer doesn't write bones on frames where values don't change, so remember "the value the animation gave" and update it only when the bone isn't what we wrote last frame (same as SheilaSpin)
    const bones = [this.base, ...this.kids]
    for (const b of bones) {
      const u = b.userData
      if (!u.spinQ || !b.quaternion.equals(u.spinQ)) (u.baseQ ||= new THREE.Quaternion()).copy(b.quaternion)
      if (!u.spinP || !b.position.equals(u.spinP)) (u.baseP ||= new THREE.Vector3()).copy(b.position)
    }
    if (st.mode !== 'closed' || Math.abs(st.ratchetV) > 0.01) {
      this.base.quaternion.copy(this.base.userData.baseQ).multiply(_q.setFromAxisAngle(ZAX, (st.ratchet + st.fly) % (Math.PI * 64)))
      const opening = st.mode === 'opening' || st.mode === 'open' || st.mode === 'braking'
      const ext = opening ? openExt(st.d) : EXT * ss(st.d), tw = opening ? TWIST * ss((st.d - 0.45) / 0.4) : TWIST * ss(st.d)
      this.kids.forEach((k, i) => { k.position.copy(k.userData.baseP); k.position.z += ext; k.quaternion.copy(k.userData.baseQ).multiply(_q.setFromAxisAngle(NZ, tw * TSIGN[i])) })
    }
    for (const b of bones) { const u = b.userData; (u.spinQ ||= new THREE.Quaternion()).copy(b.quaternion); (u.spinP ||= new THREE.Vector3()).copy(b.position); b.updateMatrixWorld(true) }
  }
}
const ss = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)
const ZAX = new THREE.Vector3(0, 0, 1), NZ = new THREE.Vector3(0, 0, -1)
const TSIGN = [1, -1, -1, 1]      // top left, top right, bottom left, bottom right: direction about −Z (measured per barrel in the game's readyup / test spin)
const EXT = 0.09, OVER = 0.15, BACK = -0.03, TWIST = THREE.MathUtils.degToRad(45)
// spread curve (d: 0 -> 1): retract -> overshoot -> settle
const openExt = (d) => d < 0.2 ? BACK * ss(d / 0.2) : d < 0.6 ? BACK + (OVER - BACK) * ss((d - 0.2) / 0.4) : OVER + (EXT - OVER) * ss((d - 0.6) / 0.4)

// Sheila barrel: ratchet (one notch per key, with overshoot) + flywheel (keeps spinning with typing speed, friction decay after typing stops)
export class SheilaSpin {
  constructor(pet) {
    this.pet = pet
    this.step = Math.PI / 2
    this.ratchet = 0; this.ratchetV = 0; this.target = 0
    this.fly = 0; this.flyV = 0
    this.heat = 0
    this.axis = new THREE.Vector3(1, 0, 0)   // def_c_barrel_base local X is the barrel direction
  }
  // Only spins the Sheila on her own back (def_c_barrel_base local X is the barrel direction);
  // the prop Sheila's barrel bones have different axes, spinning them would turn about the wrong axis and fling the barrels off, so the animation spins them itself
  bonesNow() {
    const b = this.pet.bones.def_c_barrel_base
    return b ? [b] : []
  }
  key() { this.target += this.step }
  poke(turns = 2) { this.flyV += turns * Math.PI * 2 * 2.5 }
  update(dt, rate) {
    // ratchet: underdamped spring follows the target, about 8% overshoot
    const w = 45, z = 0.62
    const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n
    for (let i = 0; i < n; i++) {
      this.ratchetV += (-w * w * (this.ratchet - this.target) - 2 * z * w * this.ratchetV) * h
      this.ratchet += this.ratchetV * h
    }
    // flywheel: faster typing spins faster (max 12 turns/s), decays with τ=0.8 s after typing stops
    const want = Math.min(rate * 0.35, 12) * Math.PI * 2
    if (rate > 3 && want > this.flyV) this.flyV += (want - this.flyV) * Math.min(1, dt * 3)
    else this.flyV *= Math.exp(-dt / 0.8)
    this.fly += this.flyV * dt
    this.heat = Math.max(0, Math.min(1, this.heat + (this.flyV > 30 ? dt / 15 : -dt / 10)))
    const angle = (this.ratchet + this.fly) % (Math.PI * 64)
    _q.setFromAxisAngle(this.axis, angle)
    for (const b of this.bonesNow()) {
      // the mixer doesn't write bones on frames where values didn't change: remember the pose before spinning and assign "base × angle" each frame, never accumulating
      const u = b.userData
      if (!u.spunQ || !b.quaternion.equals(u.spunQ)) (u.baseQ ||= new THREE.Quaternion()).copy(b.quaternion)
      b.quaternion.copy(u.baseQ).multiply(_q)
      ;(u.spunQ ||= new THREE.Quaternion()).copy(b.quaternion)
    }
  }
}
