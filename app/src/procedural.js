// Procedural animation layer: on top of the game animations, runs every frame after the mixer
//  - gaze: upper spine / neck / head share the turn, eyeballs track the target separately and faster, with micro-saccades
//  - spring bones: ponytail, hem, driven by the character's movement on screen (dragging, falling)
//  - blink: drives the eyelid bones (calibrated in face.js)
import * as THREE from 'three'
import { Face } from './face.js'
import { KeyBounce, SheilaSpin, TurretSpin } from './layers.js'
import { Expressions } from './expressions.js'
import { clock } from './clock.js'

const V = () => new THREE.Vector3()
const Q = () => new THREE.Quaternion()
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V()
const _q1 = Q(), _q2 = Q(), _q3 = Q(), _q4 = Q()
const UP = new THREE.Vector3(0, 1, 0)
const FWD = new THREE.Vector3(0, 0, 1)

// Critically damped spring (by half-life), x follows target
function damp(x, target, halflife, dt) {
  return target + (x - target) * Math.pow(0.5, dt / Math.max(1e-4, halflife))
}

// World direction -> yaw / pitch relative to the character root
function dirToAngles(dirWorld, rootQInv) {
  const d = _e.copy(dirWorld).applyQuaternion(rootQInv)
  return { yaw: Math.atan2(d.x, d.z), pitch: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) }
}
function anglesToDir(yaw, pitch, rootQ, out) {
  const cp = Math.cos(pitch)
  return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).applyQuaternion(rootQ)
}

// Apply world-space rotation dq to a bone
const _r1 = Q(), _r2 = Q()
function rotateBoneWorld(bone, dq) {
  bone.parent.getWorldQuaternion(_r1)
  bone.getWorldQuaternion(_r2)
  _r2.premultiply(dq)
  bone.quaternion.copy(_r1.invert().multiply(_r2))
  bone.updateMatrixWorld(true)
}

class SpringChain {
  constructor(bones, opt) {
    this.bones = bones
    this.opt = opt
    this.joints = bones.map((b, i) => {
      const child = bones[i + 1]
      const tail = child ? child.position.clone() : bones[i].position.clone().multiplyScalar(0.8)
      return { bone: b, tailLocal: tail, len: tail.length(), cur: V(), prev: V(), init: false }
    })
  }
  reset() { for (const j of this.joints) j.init = false }
  shift(delta) { for (const j of this.joints) { j.cur.add(delta); j.prev.add(delta) } }
  step(dt, colliders, weight) {
    const { stiff, drag, grav, radius } = this.opt
    for (const j of this.joints) {
      const b = j.bone
      b.parent.updateMatrixWorld(false)
      b.updateMatrixWorld(false)
      const head = _a.setFromMatrixPosition(b.matrixWorld)
      b.parent.getWorldQuaternion(_q1)
      const animWorldQ = _q2.copy(_q1).multiply(b.quaternion)
      const restTail = _b.copy(j.tailLocal).multiply(b.scale).applyQuaternion(animWorldQ).add(head)
      if (!j.init) { j.cur.copy(restTail); j.prev.copy(restTail); j.init = true }
      const restDir = _c.copy(restTail).sub(head).normalize()
      // Verlet: inertia + spring back + gravity
      const next = _d.copy(j.cur).sub(j.prev).multiplyScalar(1 - drag).add(j.cur)
      next.addScaledVector(restDir, stiff * dt)
      next.y -= grav * dt
      // length constraint
      next.sub(head).normalize().multiplyScalar(j.len).add(head)
      // collision spheres
      for (const s of colliders) {
        const dx = next.x - s.p.x, dy = next.y - s.p.y, dz = next.z - s.p.z
        const r = s.r + radius
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 1e-4
          next.x = s.p.x + dx / d * r; next.y = s.p.y + dy / d * r; next.z = s.p.z + dz / d * r
          next.sub(head).normalize().multiplyScalar(j.len).add(head)
        }
      }
      j.prev.copy(j.cur)
      j.cur.copy(next)
      // rotate the bone: from the animated tail direction to the simulated one
      const to = _e.copy(next).sub(head).normalize()
      _q3.setFromUnitVectors(restDir, to)
      if (weight < 1) _q3.slerp(_q4.identity(), 1 - weight)
      const newWorld = _q3.multiply(animWorldQ)
      b.quaternion.copy(_q1.invert().multiply(newWorld))
      b.updateMatrixWorld(false)
    }
  }
}

// The game's jiggle bones: a port of Source engine jigglebones.cpp (BuildJiggleTransformations), parameters from the base skin model's QC
// (the Bear skin's jigglebone parameters are identical).
// Bone local X = left, Y = up, Z = along the bone (same as the game, verified); goal = the pose the animation gives at this moment.
//  rigid: gravity only, swings freely within yaw / pitch limits; flexible: adds a spring back to the goal (stiffness / damping give acceleration from position error).
//  hitting a limit zeroes velocity (the game does exactly that, no bounce). The game's length can't be read (overwritten by tip_mass when RSX writes the QC), so the distance to the child bone is used
const INCH = 0.0254
const PONY_JIGGLE = {
  def_c_ponytail03: { yaw: 0.2, pitch: 0.1 },
  def_c_ponytail04: { yaw: 0.2, pitch: 0.3 },
  def_c_ponytail05: { stiff: 5, damp: 2, yaw: 0.2, pitch: 0.5 },
  def_c_ponytail06: { stiff: 5, damp: 2, yaw: 0.3, pitch: 0.6 },
}
// Per-skin jiggle bone parameters (the $jigglebone entries in each model's QC, parsed into *_jigglebones.json).
// The Bear skin rampart_lgnd_v24_cosmictechno_w is a separate model, but ponytail 03–06 parameters and bones (hierarchy, length, orientation) match the base skin exactly.
// Skins not listed (the Heritage ribbons, the Rebecca skin's twin tails) have no exported parameters and still use spring chains
const JIGGLE_SKINS = { base: PONY_JIGGLE, bear: PONY_JIGGLE }
const JIGGLE_GRAV = 150 * INCH      // tip_mass 150: in the game this is the gravity acceleration (inch / s²)
const _jm = new THREE.Matrix4(), _jl = V(), _ju = V(), _jf = V(), _jb = V(), _jt = V(), _jd = V(), _jq = Q()

class JiggleBone {
  constructor(bone, p) {
    this.bone = bone; this.p = p
    const child = bone.children.find(c => c.isBone)
    this.len = child.position.length()
    this.tip = V(); this.vel = V(); this.init = false
  }
  reset() { this.init = false }
  shift(delta) { this.tip.add(delta) }
  update(dt, weight) {
    const b = this.bone, p = this.p
    b.updateMatrixWorld(false)
    // goal frame (animated pose), world space; scale is folded into length and gravity
    const e = b.matrixWorld.elements
    const s = _jl.set(e[0], e[1], e[2]).length()
    const left = _jl.normalize(), up = _ju.set(e[4], e[5], e[6]).normalize(), fwd = _jf.set(e[8], e[9], e[10]).normalize()
    const base = _jb.setFromMatrixPosition(b.matrixWorld)
    const L = this.len * s
    const goalTip = _jt.copy(base).addScaledVector(fwd, L)
    if (!this.init) { this.tip.copy(goalTip); this.vel.set(0, 0, 0); this.init = true }
    // explicit Euler, substeps of 1/60 s (the game steps per frame; substeps just keep it stable at 20 fps while sleeping)
    const n = Math.max(1, Math.ceil(dt / (1 / 60) - 1e-6)), h = dt / n
    for (let i = 0; i < n; i++) {
      this.vel.y -= JIGGLE_GRAV * s * h
      if (p.stiff) {
        const err = _jd.copy(goalTip).sub(this.tip)
        const ax = p.stiff * err.dot(left) - p.damp * this.vel.dot(left)
        const ay = p.stiff * err.dot(up) - p.damp * this.vel.dot(up)
        this.vel.addScaledVector(left, ax * h).addScaledVector(up, ay * h)
      }
      this.tip.addScaledVector(this.vel, h)
      this.constrain(base, left, up, fwd, L)
    }
    // aim the bone at the tail: forward = tail direction, left = up × forward
    const f = _jd.copy(this.tip).sub(base).normalize()
    const l = _jt.crossVectors(up, f).normalize()
    const u = _ju.crossVectors(f, l)
    _jm.makeBasis(l, u, f)
    const worldQ = _jq.setFromRotationMatrix(_jm)
    const parentQ = b.parent.getWorldQuaternion(_q1)
    const localQ = parentQ.invert().multiply(worldQ)
    if (weight < 1) b.quaternion.slerp(localQ, weight)
    else b.quaternion.copy(localQ)
    b.updateMatrixWorld(true)
  }
  // yaw (left/right, local XZ plane) / pitch (up/down, local YZ plane) limits: past the limit, push onto the limit plane and zero velocity; finally restore bone length.
  // Difference from the game: when the tail is flung behind the bone (flips, falls), the game pushes it to the opposite side of the limit plane, the bone flips over and sticks, the strands twist into a braid;
  // here it always goes to the side in front of the bone (lf takes the absolute value)
  constrain(base, left, up, fwd, L) {
    const p = this.p
    const along = _jd.copy(this.tip).sub(base)
    let x = along.dot(left), y = along.dot(up), z = along.dot(fwd)
    const yaw = Math.atan2(x, z)
    if (Math.abs(yaw) > p.yaw) {
      const a = Math.sign(yaw) * p.yaw, sy = Math.sin(a), cy = Math.cos(a)
      // "forward" of the limit plane = sy·left + cy·fwd; keep the up component and the component along the limit plane's forward
      const lf = Math.max(Math.abs(sy * x + cy * z), 0.05 * L)
      this.tip.copy(base).addScaledVector(up, y).addScaledVector(left, sy * lf).addScaledVector(fwd, cy * lf)
      this.vel.set(0, 0, 0)
      along.copy(this.tip).sub(base); x = along.dot(left); y = along.dot(up); z = along.dot(fwd)
    }
    const pitch = Math.atan2(y, z)
    if (Math.abs(pitch) > p.pitch) {
      const a = Math.sign(pitch) * p.pitch, sp = Math.sin(a), cp = Math.cos(a)
      const lf = Math.max(Math.abs(sp * y + cp * z), 0.05 * L)
      this.tip.copy(base).addScaledVector(left, x).addScaledVector(up, sp * lf).addScaledVector(fwd, cp * lf)
      this.vel.set(0, 0, 0)
    }
    // length constraint: pull the tail back to bone length, remove velocity along the bone
    const f = _jd.copy(this.tip).sub(base).normalize()
    this.tip.copy(base).addScaledVector(f, L)
    this.vel.addScaledVector(f, -this.vel.dot(f))
  }
}

export class Procedural {
  constructor(pet, stage, view, world) {
    this.pet = pet; this.stage = stage; this.view = view; this.world = world
    this.look = {
      mode: 'cursor',        // cursor | camera | point | none
      point: V(),            // world position when mode=point
      weight: 1, weightS: 0, // target weight / smoothed
      eyeWeight: 1,
      yaw: 0, pitch: 0,      // smoothed head angles (relative to character root)
      eyeYaw: 0, eyePitch: 0,
      sacc: { yaw: 0, pitch: 0, next: 0 },
      headHalf: 0.16,
    }
    this.physWeight = 1
    this.lastScreen = null
    this.acc = 0
    this.blink = null
  }

  init() {
    const B = this.pet.bones
    const rest = this.pet.rest
    const fwdLocal = name => FWD.clone().applyQuaternion(rest[name].worldQ.clone().invert())
    this.lookChain = [
      ['def_c_spineC', 0.10], ['def_c_neckA', 0.2], ['def_c_neckB', 0.28], ['def_c_head', 1.0],
    ].filter(([n]) => B[n]).map(([n, f]) => ({ bone: B[n], frac: f }))
    this.headFwd = fwdLocal('def_c_head')
    this.eyes = ['def_l_eyeball', 'def_r_eyeball'].filter(n => B[n]).map(n => ({ bone: B[n], fwd: fwdLocal(n) }))

    const chain = (names, opt) => {
      const bones = names.map(n => B[n]).filter(Boolean)
      return bones.length ? new SpringChain(bones, opt) : null
    }
    const pony = []
    for (let i = 1; i <= 7; i++) pony.push('def_c_ponytail0' + i)
    // the Heritage skin has no ponytail, but two ribbons (upper / lowerRibbon1..3)
    const ribbon = (k) => [1, 2, 3].map(i => `def_c_${k}Ribbon${i}`)
    // the ponytail uses the game's jiggle bone parameters (only 03–06 are physics bones, 01, 02, 07 follow the animation), looked up per skin in JIGGLE_SKINS; skins without parameters still use spring chains
    const jp = JIGGLE_SKINS[this.pet.skin]
    this.jiggles = jp ? Object.entries(jp).filter(([n]) => B[n]).map(([n, p]) => new JiggleBone(B[n], p)) : []
    this.chains = [
      this.jiggles.length ? null : chain(pony, { stiff: 1.4, drag: 0.12, grav: 0.35, radius: 0.025 }),
      chain(ribbon('upper'), { stiff: 1.0, drag: 0.1, grav: 0.4, radius: 0.012 }),
      chain(ribbon('lower'), { stiff: 1.0, drag: 0.1, grav: 0.4, radius: 0.012 }),
    ].filter(Boolean)
    this.colliderDefs = [
      { bone: 'def_c_head', off: [0, 0.07, -0.01], r: 0.1 },
      { bone: 'def_c_neckA', off: [0, 0, -0.02], r: 0.07 },
      { bone: 'def_c_spineC', off: [0, 0.1, -0.1], r: 0.13 },
      { bone: 'def_c_spineC', off: [0, -0.1, -0.12], r: 0.13 },
    ].filter(c => B[c.bone])
    // collision sphere offsets are written in character space and converted to the bone's bind-pose local space, so they rotate with the bone
    for (const c of this.colliderDefs) {
      c.local = new THREE.Vector3(...c.off).applyQuaternion(rest[c.bone].worldQ.clone().invert())
    }
    this.colliders = this.colliderDefs.map(() => ({ p: V(), r: 0 }))
    this.face = new Face(this.pet)
    this.bounce = new KeyBounce(this.pet)
    this.sheila = new SheilaSpin(this.pet)
    this.turret = new TurretSpin(this.pet)   // barrel of the tripod Sheila while fixing Sheila during typing (the brain writes allow and calls key())
    this.expr = new Expressions(this.pet)
    this.tiltX = 0; this.tiltV = 0; this.tiltTarget = 0   // whole-body tilt while picked up / flying (pendulum)
    this.yawTarget = null                                   // whole-body facing (turned sideways when lying down)
    this.pet.procBones = [
      ...this.lookChain.map(l => l.bone), ...this.eyes.map(e => e.bone),
      ...this.face.bones, ...this.chains.flatMap(c => c.bones), ...this.jiggles.map(j => j.bone), ...this.bounce.bones,
    ]
    this.exprBonesAdded = false
  }

  // Cursor (overlay coordinates) -> world look-at point: ray from the camera through the cursor, intersected with a vertical plane 1.2 m in front of the character
  cursorWorld(mx, my, out) {
    const v = this.view, st = this.stage
    const nx = ((mx - v.left) / st.cssW) * 2 - 1
    const ny = -(((my - v.top) / st.cssH) * 2 - 1)
    const cam = st.camera
    const p = _a.set(nx, ny, 0.5).unproject(cam)
    const dir = p.sub(cam.position).normalize()
    const planeZ = 1.2
    const t = (planeZ - cam.position.z) / dir.z
    return out.copy(cam.position).addScaledVector(dir, t)
  }

  // Convert screen motion (pixels) to world motion, driving spring bone inertia
  applyScreenMotion() {
    const w = this.world
    if (this.lastScreen) {
      const dx = (w.x - this.lastScreen.x) / this.view.ppm
      const dy = (w.y - this.lastScreen.y) / this.view.ppm
      if (dx || dy) {
        // the character stays at the origin, equivalent to the world moving the opposite way
        const delta = _a.set(-dx, dy, 0)
        const sims = [...this.chains, ...this.jiggles]
        if (delta.length() > 1.5) sims.forEach(c => c.reset())
        else sims.forEach(c => c.shift(delta))
      }
    }
    this.lastScreen = { x: w.x, y: w.y }
  }

  update(dt) {
    if (!this.lookChain) return
    this.applyScreenMotion()
    if (this.expr.ready && !this.exprBonesAdded) { this.exprBonesAdded = true; this.pet.procBones.push(...new Set(this.expr.bones)) }
    // pendulum tilt: a spring follows the target angle
    const tg = this.pet.root.parent
    if (tg && tg.userData.tilt) {
      const w = 9, z = 0.45
      this.tiltV += (-w * w * (this.tiltX - this.tiltTarget) - 2 * z * w * this.tiltV) * dt
      this.tiltX += this.tiltV * dt
      tg.rotation.z = this.tiltX
    }
    if (this.yawTarget != null) {
      this.yawBase = (this.yawBase ?? this.pet.root.rotation.y)
      this.yawBase += (this.yawTarget - this.yawBase) * Math.min(1, dt * 2.2)
      this.pet.root.rotation.y = this.yawBase + (this.yawExtra || 0)   // yawExtra: turning her with the scroll wheel
      this.pet.root.updateMatrixWorld(true)
    }
    this.updateLook(dt)
    this.bounce.apply(dt, this.pet.root)
    this.expr.update(dt)
    this.face.update(dt)
    this.applySleepBubble()
    this.sheila.update(dt, this.input ? this.input.rate(1000) : 0)
    this.turret.update(dt)
    // spring bones on a fixed timestep
    this.acc += dt
    const h = 1 / 60
    let n = 0
    for (const [i, c] of this.colliderDefs.entries()) {
      const b = this.pet.bones[c.bone]
      this.colliders[i].p.setFromMatrixPosition(b.matrixWorld).add(_a.copy(c.local).applyQuaternion(b.getWorldQuaternion(_q1)))
      this.colliders[i].r = c.r
    }
    while (this.acc >= h && n < 4) {
      for (const ch of this.chains) ch.step(h, this.colliders, this.physWeight)
      this.acc -= h; n++
    }
    if (n === 4) this.acc = 0
    // jiggle bones step per frame (parents first: 03 -> 06)
    for (const j of this.jiggles) j.update(dt, this.physWeight)
  }

  // While sleeping the bubble swells and shrinks with breathing: fixed in front of the mouth (when not blowing, the animation parks the bubble at origin), scale follows breathing
  applySleepBubble() {
    if (this.sleepBubble == null) return
    const gum = this.pet.props.bubblegum
    const base = gum?.getObjectByName('bubblegum__def_c_base')
    const core = gum?.getObjectByName('bubblegum__bubblegumCore')
    const mouth = this.pet.bones.def_c_mouth, head = this.pet.bones.def_c_head
    if (!base || !core || !mouth) return
    gum.visible = true
    const fwd = _b.copy(this.headFwd).applyQuaternion(head.getWorldQuaternion(_q2))
    const p = mouth.getWorldPosition(_a).addScaledVector(fwd, 0.01 + 0.045 * this.sleepBubble)
    base.parent.worldToLocal(p)
    base.position.copy(p)
    base.scale.setScalar(1)
    core.scale.setScalar(0.25 + 0.9 * this.sleepBubble)
    gum.updateMatrixWorld(true)
    gum.traverse(o => { if (o.isMesh) o.visible = true })
  }

  updateLook(dt) {
    const L = this.look
    const root = this.pet.root
    const rootQ = root.getWorldQuaternion(_q1).clone()
    const rootQInv = rootQ.clone().invert()
    const head = this.lookChain[this.lookChain.length - 1].bone
    const headPos = head.getWorldPosition(V())

    // target direction
    let target = null
    if (L.mode === 'cursor') {
      const m = this.input?.mouse
      if (m && m.x > -1e3) target = this.cursorWorld(m.x, m.y, V())
    } else if (L.mode === 'camera') {
      target = this.stage.camera.position.clone()
    } else if (L.mode === 'point') {
      target = L.point.clone()
    }
    L.weightS = damp(L.weightS, target ? L.weight : 0, 0.25, dt)
    L.eyeWS = damp(L.eyeWS || 0, target ? L.weight * L.eyeWeight : 0, 0.05, dt)   // eye weight is faster, ahead of the head

    // the animation's own head direction; facing straight up / down / away / upside down (flips) makes yaw/pitch singular, so the gaze layer yields to the animation
    const animFwd = _b.copy(this.headFwd).applyQuaternion(head.getWorldQuaternion(_q2))
    const fz = _c.copy(animFwd).applyQuaternion(rootQInv).z
    const gate = THREE.MathUtils.smoothstep(fz, 0.0, 0.7)
    const w = L.weightS * gate
    const anim = dirToAngles(animFwd, rootQInv)
    if (target) {
      const a = dirToAngles(_c.copy(target).sub(headPos).normalize(), rootQInv)
      L.yaw = damp(L.yaw, THREE.MathUtils.clamp(a.yaw, -1.25, 1.25), L.headHalf, dt)
      L.pitch = damp(L.pitch, THREE.MathUtils.clamp(a.pitch, -0.6, 0.5), L.headHalf, dt)
    }

    // head: weighted turn from the animated direction to the smoothed target, shared across bones
    if (w > 0.002) {
      const yaw = anim.yaw + (L.yaw - anim.yaw) * w
      const pitch = anim.pitch + (L.pitch - anim.pitch) * w
      const want = anglesToDir(yaw, pitch, rootQ, V())
      for (const { bone, frac } of this.lookChain) {
        const cur = _b.copy(this.headFwd).applyQuaternion(head.getWorldQuaternion(_q2))
        const full = _q3.setFromUnitVectors(cur, want)
        const part = _q4.identity().slerp(full, frac)
        rotateBoneWorld(bone, part)
      }
    }

    // eyes: fast weighted turn from the animation's own eye direction to the target, with micro-saccades; when the target is gone keep the last offset and fade with the weight
    if (!this.eyes.length) return
    const headFwdNow = _b.copy(this.headFwd).applyQuaternion(head.getWorldQuaternion(_q2))
    const hA = dirToAngles(headFwdNow, rootQInv)
    if (target) {
      const now = clock.now(), s = L.sacc
      if (now > s.next) { s.yaw = (Math.random() - 0.5) * 0.06; s.pitch = (Math.random() - 0.5) * 0.04; s.next = now + 400 + Math.random() * 1600 }
      const eA = dirToAngles(_c.copy(target).sub(headPos).normalize(), rootQInv)
      L.eyeYaw = damp(L.eyeYaw, THREE.MathUtils.clamp(eA.yaw - hA.yaw + s.yaw, -0.45, 0.45), 0.035, dt)
      L.eyePitch = damp(L.eyePitch, THREE.MathUtils.clamp(eA.pitch - hA.pitch + s.pitch, -0.3, 0.25), 0.035, dt)
    }
    const we = L.eyeWS * gate
    if (we < 0.002) return
    const eyeWant = anglesToDir(hA.yaw + L.eyeYaw, hA.pitch + L.eyePitch, rootQ, V())
    for (const e of this.eyes) {
      const cur = _b.copy(e.fwd).applyQuaternion(e.bone.getWorldQuaternion(_q2))
      _q3.setFromUnitVectors(cur, eyeWant)
      rotateBoneWorld(e.bone, _q4.identity().slerp(_q3, we))
    }
  }
}
