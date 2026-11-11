// Typing rig (motion module): normal typing (take out Sheila -> fix Sheila facing away loop -> stow Sheila) and burst (turn and slam -> ride Sheila -> one more swing -> muzzle sparks -> BOOM!).
// The brain (events module) only decides when to enter / exit / burst; blending, props, sparks and BOOM! all live here. Grown from the startDraw / startBurst prototype
//
// Interface (agreed with the brain, 2026-09-27):
//   init({ proc, fx, stage, world, view })   called once in brain.start()
//   enter()   stand -> take out Sheila -> fix Sheila loop; resolves when the loop starts
//   exit()    finish the current round -> stow Sheila -> fade back to the standing base pose; resolves when fully back in the base pose (enter is ignored while exiting)
//   burst()   from the current round into turn and slam -> ride Sheila -> one more swing -> muzzle sparks -> BOOM!; resolves when BOOM! finishes (she and the props are hidden from 0.1 s after the blast),
//             on resolve phase is back to 'none' and the brain follows with pet.play for the skydive (play restores visibility)
//   cancel(fade = 0.25)   sets phase back to 'none' synchronously, fades back to standing, clears prop state (interrupted by pick up etc.; the brain's pet.play right after overrides the fade to standing)
//   phase     'none' | 'draw' | 'loop' | 'stow' | 'burst' | 'boom' (read only); busy = phase !== 'none'
//   in each phase pet.current.key = keyOf(C.xxx) of the dominant clip; tests match on it
//
// How: while running, the rig manages its own actions in the mixer (all paused, time and weight set every frame); Character.update calls update / post before and after the mixer;
// when someone else calls pet.play, release() hands the mixer back
import * as THREE from 'three'
import { C, keyOf } from './clips.js'
import { comicLayer } from './comic.js'

const ss = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)
const FPS = 30
const L1 = 1.0, SEAM = 0.3, PD = L1 - SEAM, IN = 24 / FPS   // fixing Sheila: two actions relay, 1 s per round, 0.3 s overlap (period 0.7 s), joins at frame 24
const FH = 0.35, FX = 0.5                                    // fades: standing <-> take out / stow Sheila, take out / stow Sheila <-> fixing Sheila
const FADE_R = 0.45, LF = 0.3                                // slam -> ride Sheila, first ride swing -> second
const SPARK_AT = 0.15, SPARK_DUR = 0.6                       // how long into the second swing the muzzle sparks start and how long they last, then BOOM!
const EXT = 15                                               // take-out (reversed) and turn-and-slam keep playing forward during the fade (frames), to keep momentum
const TRI = 'turret_lobby__'
const isTri = (name) => name.startsWith(TRI)
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1)
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4()

// speed table for the burst turn: from frame 30 of fixing Sheila, 30->66 at double speed, normal speed after 66, 0.2 s smoothing at the boundary; [s, frame]
const TURN = (() => { const tab = [[0, 30]]; let t = 0, f = 30; const h = 1 / 600; while (f < 110) { let sp = f < 66 ? 2 : 1; const d = (f - 66) / 30; if (Math.abs(d) < 0.1) sp = 2 - ss(d / 0.2 + 0.5); f += sp * 30 * h; t += h; tab.push([t, f]) } return tab })()
const turnFrame = (u) => { const T = TURN; let lo = 0, hi = T.length - 1; if (u >= T[hi][0]) return T[hi][1] + (u - T[hi][0]) * 30; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m][0] <= u) lo = m; else hi = m } return T[lo][1] }
const turnTime = (F) => { for (const [t, f] of TURN) if (f >= F) return t; return TURN[TURN.length - 1][0] }

export class Typing {
  constructor(pet) {
    this.pet = pet
    this.phase = 'none'
    this.A = {}            // name -> action (owned by the rig while it runs)
    this.owned = new Set()
    this.waits = []        // resolve functions of pending Promises
  }
  get busy() { return this.phase !== 'none' }
  owns(a) { return this.owned.has(a) }
  init(ctx) {
    Object.assign(this, ctx)
    // warm up once idle after startup (after the entrance landing): the shared warm-up queue (character.js, prop shaders / textures, clip bone bindings) starts working,
    // and the typing clips get prepared too (clip parsing, alignment), so the first typing entry does not stutter
    const idle = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 0))
    setTimeout(() => idle(() => this.warm().catch(e => console.warn('typing warm-up failed', e))), 4000)
  }

  // warm-up (measured: the first typing entry after startup stalled 109 / 143 ms): prepare the typing clips first; props (tripod, wrench, bubble gum) already joined the shared warm-up queue on load;
  // the rig's own derived clips (split for the relay, readyup after alignment) do not go through getClip, so they are handed to the queue here for bone binding
  async warm() {
    if (this._warmed || !this.stage) return
    this._warmed = true
    this.pet.startWarm({ stage: this.stage, fx: this.fx })
    const K = await this._prepare()
    for (const c of [K.body0, K.body1, K.tri, K.pin, K.ride, K.ride2]) this.pet.warmClip(c)
  }

  // ---------- clip preparation (once) ----------
  async _prepare() {
    return this._prep ||= (async () => {
      const P = this.pet
      const only = (src, name, keep) => { const c = new THREE.AnimationClip(name, src.duration, src.tracks.filter(t => keep(t.name)).map(t => t.clone())); c.userData = { ...src.userData }; return c }
      const [hub, draw, loop, stow, turn, ride, ride2] = await Promise.all([
        P.getClip(C.hub), P.getClip({ ...C.typeDraw, from: C.typeDraw.from - EXT }), P.getClip(C.typeLoop), P.getClip(C.typeStow),
        P.getClip({ ...C.burstTurn, to: C.burstTurn.to + EXT }), P.getClip(C.burstRide), P.getClip(C.burstRideLoop)])
      // bones of Sheila on her back: pinned to the standing base pose (fixing Sheila / mech bull move them 4 m underground; unpinned they fly back up from below)
      const sheila = new Set(Object.keys(P.bones).filter(n => /turret|barrel|sheila/i.test(n)))
      const node = (n) => n.slice(0, n.lastIndexOf('.'))
      const K = {
        hub, draw, stow, turn,
        body0: only(loop, 'typeLoop.body0', n => !isTri(n)), body1: only(loop, 'typeLoop.body1', n => !isTri(n)),
        tri: only(loop, 'typeLoop.tri', isTri),                      // tripod bones in their own copy: the two relay copies do not blend tripods from two moments
        pin: only(hub, 'hub.pinSheila', n => sheila.has(node(n))),
      }
      // align readyup (jump on Sheila, ride and swing) to fixing Sheila: tripod base position and facing match (prototype alignReadyup; both clips are already rotated 150° by their slots)
      const tp = P.props.turret_lobby, bb = tp.getObjectByName(TRI + 'def_c_bot_base')
      const at = (clip, t) => { const M = this._pose(clip, t, bb), p = new THREE.Vector3().setFromMatrixPosition(M), f = X.clone().transformDirection(M); return { p: p.setY(0), yaw: Math.atan2(f.x, f.z) } }
      const H = at(loop, 0), R = at(ride, 0), dy = H.yaw - R.yaw
      const Al = new THREE.Matrix4().makeTranslation(H.p.x, 0, H.p.z).multiply(new THREE.Matrix4().makeRotationY(dy)).multiply(new THREE.Matrix4().makeTranslation(-R.p.x, 0, -R.p.z))
      K.ride = this._align(ride, Al, dy, 'burstRide.aligned'); K.ride2 = this._align(ride2, Al, dy, 'burstRideLoop.aligned')
      // tripod prop object position in each clip (fixProps puts it at the root bone's horizontal position at runtime): interpolated by the weights of the clips the tripod follows
      const rootXZ = (clip) => { const tr = clip.tracks.find(t => t.name === 'jx_c_delta.position'); const v = tr.createInterpolant().evaluate(0); return new THREE.Vector3(v[0], 0, v[2]) }
      K.at = { draw: rootXZ(draw), stow: rootXZ(stow), loop: rootXZ(loop), turn: rootXZ(turn), ride: rootXZ(K.ride), ride2: rootXZ(K.ride2) }
      this._K = K
      return K
    })()
  }

  // matrix of a prop node in character root space at time t of a clip: computed from tracks (mixer untouched). The prop object sits at the root bone's horizontal position, times each node level (bind pose where there is no track)
  _pose(clip, t, node) {
    const val = (name, prop) => { const tr = clip.tracks.find(k => k.name === name + '.' + prop); return tr ? Array.from(tr.createInterpolant().evaluate(t)) : null }
    const r = val('jx_c_delta', 'position') || [0, 0, 0]
    const M = new THREE.Matrix4().makeTranslation(r[0], 0, r[2])
    const chain = []
    for (let o = node; o && o.userData.bind && !o.name.startsWith('prop_'); o = o.parent) chain.unshift(o)
    for (const o of chain) {
      const [p0, q0, s0] = o.userData.bind, p = val(o.name, 'position'), q = val(o.name, 'quaternion'), s = val(o.name, 'scale')
      M.multiply(_m.compose(p ? new THREE.Vector3().fromArray(p) : p0, q ? new THREE.Quaternion().fromArray(q) : q0, s ? new THREE.Vector3().fromArray(s) : s0))
    }
    return M
  }

  // copy the whole clip moved by Al (rotation about the vertical axis + translation): the character root bone is multiplied by Al directly; prop rig objects keep their original world pose after moving to the new root position
  _align(src, Al, dy, name) {
    const c = src.clone(); c.name = name; c.userData = { ...src.userData }
    const qA = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dy)
    const root = c.tracks.find(t => t.name === 'jx_c_delta.position'), r0 = new THREE.Vector3().fromArray(root.values, 0).setY(0)
    const r1 = r0.clone().applyMatrix4(Al)
    const Mr = new THREE.Matrix4().makeTranslation(-r1.x, 0, -r1.z).multiply(Al).multiply(new THREE.Matrix4().makeTranslation(r0.x, 0, r0.z))
    for (const t of c.tracks) {
      const dot = t.name.lastIndexOf('.'), node = t.name.slice(0, dot), prop = t.name.slice(dot + 1)
      const M = node === 'jx_c_delta' ? Al : node.endsWith('__rig') ? Mr : null
      if (!M) continue
      if (prop === 'position') for (let i = 0; i < t.values.length; i += 3) _v.fromArray(t.values, i).applyMatrix4(M).toArray(t.values, i)
      if (prop === 'quaternion') for (let i = 0; i < t.values.length; i += 4) _q.fromArray(t.values, i).premultiply(qA).toArray(t.values, i)
    }
    return c
  }

  // ---------- flow ----------
  _wait() { return new Promise(res => this.waits.push(res)) }
  _done() { const w = this.waits; this.waits = []; for (const r of w) r() }
  _action(name, clip) {
    const a = this.pet.mixer.clipAction(clip)
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.enabled = true; a.setEffectiveWeight(0); a.play(); a.paused = true
    this.A[name] = a; this.owned.add(a)
    return a
  }

  async enter() {
    if (this.phase !== 'none') return
    const K = await this._prepare()
    if (this.phase !== 'none') return
    const P = this.pet
    this.prev = P.current?.action || null
    if (this.prev) this.owned.add(this.prev)
    for (const k of ['draw', 'body0', 'body1', 'tri', 'pin']) this._action(k, K[k])
    this.phase = 'draw'; this.t = 0; this.x = 0; this.hold = null; this.on = null
    return this._wait()
  }

  async exit() {
    if (this.phase === 'draw') await this._wait()          // still taking out Sheila: wait for the loop, then stow
    if (this.phase !== 'loop') return
    const K = await this._prepare()
    this._action('stow', K.stow)
    const hub = this._action('hub', K.hub); hub.paused = false; hub.setLoop(THREE.LoopRepeat, Infinity); hub.clampWhenFinished = false
    this.phase = 'stow'; this.t = 0; this.hold = this._freeze()
    return this._wait()
  }

  async burst() {
    if (this.phase === 'draw') await this._wait()          // still taking out Sheila: wait for the loop
    if (this.phase !== 'loop') return
    const K = await this._prepare()
    for (const k of ['turn', 'ride', 'ride2']) this._action(k, K[k])
    this.comic ||= this.stage ? comicLayer(this.stage, this.view) : null   // build it ahead (pre-render about 90 ms) so the blast moment does not stutter
    this.phase = 'burst'; this.t = 0; this.hold = this._freeze(); this.bt = null; this.lock = null; this.lastSpark = -1; this.hidden = false
    return this._wait()
  }

  async cancel(fade = 0.25) {
    this.release(fade)
    await this.pet.play(C.hub, { fade, loop: true })
  }

  // hand the mixer back: the rig's actions fade out over fade (the dominant one is carried off by pet.play's crossfade), visibility restored, BOOM! cleared
  release(fade = 0.25) {
    if (this.hiddenModel) { this.pet.model.visible = true; this.hiddenModel = false }
    if (!this.owned.size && this.phase === 'none') return
    for (const a of this.owned) if (a !== this.pet.current?.action) a.fadeOut(fade)
    this.owned.clear(); this.A = {}; this.prev = null
    this.comic?.draw(null); this.comicT = null
    this.phase = 'none'
    this._done()
  }

  // fixing Sheila relay: x = relay time (joins at frame 24). Returns weights and times of the two actions
  _relay(x) {
    const k = Math.floor(x / PD), u = x - k * PD, c = k % 2 ? 'body1' : 'body0', p = k % 2 ? 'body0' : 'body1'
    const w = { body0: 0, body1: 0 }, tm = { body0: 0, body1: 0 }
    if (k > 0 && u < SEAM) { const f = ss(u / SEAM); w[c] = f; tm[c] = u; w[p] = 1 - f; tm[p] = u + PD } else { w[c] = 1; tm[c] = Math.min(L1, u) }
    return { w, tm, c, u, k }
  }
  // on exit / burst no new round starts: remember the current round and keep playing it (the previous round in the seam still finishes fading)
  _freeze() { const r = this._relay(this.x); return { k: r.k, x0: this.x } }
  _held(dt) {
    this.x += dt
    const h = this.hold, u = this.x - h.k * PD, c = h.k % 2 ? 'body1' : 'body0', p = h.k % 2 ? 'body0' : 'body1'
    const w = { body0: 0, body1: 0 }, tm = { body0: 0, body1: 0 }
    if (h.k > 0 && u < SEAM) { const f = ss(u / SEAM); w[c] = f; tm[c] = u; w[p] = 1 - f; tm[p] = u + PD } else { w[c] = 1; tm[c] = Math.min(L1, u) }
    return { w, tm, c, u }
  }

  // ---------- per frame (Character.update calls this before the mixer) ----------
  update(dt) {
    if (this.comicT != null) this._comic(dt)
    if (!this.busy || !this._K) return
    this.t += dt
    const t = this.t, w = {}, tm = {}
    let key = null
    if (this.phase === 'draw') {
      const DIN = (C.typeDraw.to - C.typeDraw.from) / FPS
      tm.draw = t
      if (t < FH) { const q = ss(t / FH); w.prev = 1 - q; w.draw = q }
      else if (t < DIN) w.draw = 1
      else {
        const q = ss((t - DIN) / FX); this.x = IN + (t - DIN)
        const r = this._relay(this.x); w.draw = 1 - q; w.body0 = r.w.body0 * q; w.body1 = r.w.body1 * q; Object.assign(tm, r.tm)
        if (t >= DIN + FX) { this.phase = 'loop'; this._stopPrev(); this._done() }
      }
      key = w.draw >= 0.5 || t < DIN ? C.typeDraw : C.typeLoop
    } else if (this.phase === 'loop') {
      this.x += dt
      const r = this._relay(this.x); Object.assign(w, r.w); Object.assign(tm, r.tm)
      key = C.typeLoop
    } else if (this.phase === 'stow') {
      const r = this._held(dt), q = ss(t / FX), DOUT = (C.typeStow.to - C.typeStow.from) / FPS, T6 = Math.max(FX, DOUT)
      w.body0 = r.w.body0 * (1 - q); w.body1 = r.w.body1 * (1 - q); Object.assign(tm, r.tm)
      tm.stow = t
      if (t < T6) { w.stow = q; key = q < 0.5 ? C.typeLoop : C.typeStow }
      else { const q2 = ss((t - T6) / FH); w.stow = 1 - q2; w.hub = q2; key = q2 < 0.5 ? C.typeStow : C.hub }
      if (t >= T6 + FH) return this._handBack()
    } else {   // burst / boom
      const r = this._held(dt)
      if (this.bt == null) {                       // wait for the current round to reach frame 30 before turning (same pose as frame 30 of turn and slam)
        Object.assign(w, r.w); Object.assign(tm, r.tm); key = C.typeLoop
        if (r.u >= L1) this.bt = 0
      }
      if (this.bt != null) {
        this.bt += dt
        const u = this.bt, TC = turnTime(C.burstTurn.to), T2 = TC + (C.burstRide.to - C.burstRide.from) / FPS - LF, TS = T2 + SPARK_AT, TK = TS + SPARK_DUR
        tm.turn = (turnFrame(u) - C.burstTurn.from) / FPS; w.turn = 1; key = C.burstTurn
        if (u >= TC) { const k = ss((u - TC) / FADE_R); w.turn = 1 - k; w.ride = k; tm.ride = u - TC; if (k >= 0.5) key = C.burstRide }
        if (u >= T2) { const k = ss((u - T2) / LF); w.ride *= 1 - k; w.ride2 = k; tm.ride2 = u - T2; if (k >= 0.5) key = C.burstRideLoop }
        if (u >= TS && u < TK && (u - this.lastSpark >= 0.05)) {   // muzzle sparks: one burst every 0.05 s, denser and faster over time
          this.lastSpark = u; const s = (u - TS) / SPARK_DUR, m = this._muzzle()
          if (m) this.fx?.sparks(m.p, m.d, Math.round(4 + 10 * s), 1.6 + 1.2 * s)
        }
        if (u >= TK && this.comicT == null && this.phase === 'burst') { this.phase = 'boom'; this.comicT = 0; this.anchor = this._anchor() }
      }
    }
    this._apply(w, tm)
    this._current(key)
  }

  // time and weight of each action; the tripod follows the dominant fixing-Sheila copy; Sheila on her back is pinned by the total weight of clips with the tripod; prop visibility
  _apply(w, tm) {
    const A = this.A, dur = (a) => a.getClip().duration - 0.004
    for (const [k, a] of Object.entries(A)) {
      if (k === 'hub' || k === 'tri' || k === 'pin') continue
      if (tm[k] != null) a.time = Math.min(dur(a), Math.max(0, tm[k]))
      a.setEffectiveWeight(w[k] || 0)
    }
    if (this.prev && this.owned.has(this.prev)) this.prev.setEffectiveWeight(w.prev || 0)
    if (A.hub) A.hub.setEffectiveWeight(w.hub || 0)
    const WB = (w.body0 || 0) + (w.body1 || 0)
    if (A.tri) { A.tri.setEffectiveWeight(WB); A.tri.time = Math.min(dur(A.tri), (w.body0 || 0) >= (w.body1 || 0) ? tm.body0 || 0 : tm.body1 || 0) }
    this.w = w
    const WP = WB + (w.draw || 0) + (w.stow || 0) + (w.turn || 0) + (w.ride || 0) + (w.ride2 || 0)
    if (A.pin) { A.pin.setEffectiveWeight(500 * WP); A.pin.time = 0 }
    // props: clips with the tripod over half in total -> tripod shown, Sheila on her back hidden; of those, the two heirloom clips (fixing Sheila, turn and slam) over half -> wrench in hand (bones merged, see character.js)
    const st = WP < 0.5 ? 'off' : WB + (w.turn || 0) >= 0.5 ? 'wrench' : 'on'
    if (st !== this.on) {
      const wasOff = !this.on || this.on === 'off'
      this.on = st
      const hubU = this.pet.clips.get(typeof C.hub === 'string' ? C.hub : keyOf(C.hub))?.userData
      this.pet.showProps(st === 'off' ? hubU?.props || [] : ['bubblegum', 'turret_lobby', ...(st === 'wrench' ? ['wrench_card'] : [])], st === 'off' ? hubU?.hide || [] : ['sheila'])
      if (st !== 'off' && wasOff) this.puffPending = true      // dust puff at her feet when the tripod appears (position computed after post places it)
    }
  }

  _current(spec) {
    const P = this.pet, A = this.A
    const name = { [keyOf(C.typeDraw)]: 'draw', [keyOf(C.typeStow)]: 'stow', [keyOf(C.burstTurn)]: 'turn', [keyOf(C.burstRide)]: 'ride', [keyOf(C.burstRideLoop)]: 'ride2', [keyOf(C.hub)]: 'hub' }[keyOf(spec)]
    const a = name ? A[name] : (this.w?.body0 || 0) >= (this.w?.body1 || 0) ? A.body0 : A.body1
    if (!a) return
    P.current = { key: keyOf(spec), clip: a.getClip(), action: a, opts: { loop: true, loopFade: 0, onDone: null, exitFade: 0.3, speed: 1 }, fired: false }
  }

  _stopPrev() {
    const p = this.prev
    if (p && !Object.values(this.A).includes(p)) { p.stop(); this.owned.delete(p) }
    this.prev = null
  }

  // stow Sheila done: the standing base pose goes back to the normal playback flow
  _handBack() {
    const P = this.pet, hub = this.A.hub
    for (const a of this.owned) if (a !== hub) a.stop()
    this.owned.clear(); this.A = {}
    hub.setEffectiveWeight(1)
    P.current = { key: keyOf(C.hub), clip: hub.getClip(), action: hub, opts: { loop: true, loopFade: 0, onDone: null, exitFade: 0.3, speed: 1 }, fired: false }
    this.phase = 'none'; this.on = null
    this._done()
  }

  // ---------- after the mixer (Character.update calls this after fixProps): tripod placement ----------
  post() {
    if (!this.busy || !this.w) return
    const tp = this.pet.props.turret_lobby, Kd = this._K
    if (!tp?.visible || !Kd) return
    // tripod prop object position interpolated by clip weights (its root bone horizontal position in each clip), so it does not slide with the character's blended root
    const w = this.w, parts = [['draw', 'draw'], ['stow', 'stow'], ['turn', 'turn'], ['ride', 'ride'], ['ride2', 'ride2']]
    const WB = (w.body0 || 0) + (w.body1 || 0)
    let sum = WB; const p = Kd.at.loop.clone().multiplyScalar(WB)
    for (const [k, a] of parts) if (w[k]) { p.addScaledVector(Kd.at[a], w[k]); sum += w[k] }
    if (sum > 1e-4) { tp.position.copy(p.multiplyScalar(1 / sum)); tp.quaternion.identity(); tp.updateMatrixWorld(true) }
    // burst: during the fade from turn and slam to riding Sheila, put the tripod base back at the locked position / facing every frame (the blended prop tracks of the two clips would wobble)
    if (this.phase === 'burst' || this.phase === 'boom') {
      const bb = tp.getObjectByName(TRI + 'def_c_bot_base'), WR = (w.ride || 0) + (w.ride2 || 0)
      const where = () => { const q = bb.getWorldQuaternion(new THREE.Quaternion()).premultiply(this.pet.root.getWorldQuaternion(_q).invert()); const f = X.clone().applyQuaternion(q); const pos = bb.getWorldPosition(new THREE.Vector3()); this.pet.root.worldToLocal(pos); return { p: pos, y: Math.atan2(f.x, f.z) } }
      if (WR < 1e-4) this.lock = where()
      else if (this.lock && WR < 0.999) {
        const n = where(), dy = this.lock.y - n.y
        const M = new THREE.Matrix4().makeTranslation(this.lock.p.x, 0, this.lock.p.z).multiply(new THREE.Matrix4().makeRotationY(dy)).multiply(new THREE.Matrix4().makeTranslation(-n.p.x, 0, -n.p.z)).multiply(tp.matrix)
        M.decompose(tp.position, tp.quaternion, tp.scale); tp.updateMatrixWorld(true)
      }
    }
    if (this.puffPending) {
      this.puffPending = false
      // position from the tripod base bone, raised 0.2 m off the ground (the prototype used Box3.setFromObject's box center: skinned meshes need per-vertex bone transforms, 16 ms each time)
      const bb = tp.getObjectByName(TRI + 'def_c_bot_base')
      if (bb && this.fx) { const c = bb.getWorldPosition(new THREE.Vector3()); this.fx.puff(new THREE.Vector3(c.x, 0.2, c.z), 9, 0.4) }
    }
  }

  // muzzle: 0.55 m along local +Z from the barrel base of the tripod Sheila, direction +Z (world space)
  _muzzle() {
    const b = this.pet.props.turret_lobby?.getObjectByName(TRI + 'def_c_barrel_base')
    if (!b) return null
    const d = Z.clone().applyQuaternion(b.getWorldQuaternion(_q))
    return { p: b.getWorldPosition(new THREE.Vector3()).addScaledVector(d, 0.55), d }
  }
  _anchor() { const m = this._muzzle(); return m && this.stage ? this.stage.project(m.p) : null }

  // BOOM!: HIDE_AT s after the blast she and the props are hidden (the black backdrop already covers them), resolve when DURATION finishes
  _comic(dt) {
    this.comicT += dt
    const u = this.comicT
    if (this.phase === 'boom' && u < comicLayer.HIDE_AT) this.anchor = this._anchor() || this.anchor
    this.comic?.draw(u <= comicLayer.DURATION ? u : null, this.anchor)
    if (u >= comicLayer.HIDE_AT && !this.hiddenModel && this.phase === 'boom') {
      this.hiddenModel = true; this.pet.model.visible = false
      for (const o of Object.values(this.pet.props)) o.visible = false
    }
    if (u > comicLayer.DURATION) {
      this.comicT = null
      if (this.phase === 'boom') {
        // hand the mixer back: stop all rig actions (she is hidden), the brain follows with pet.play for the skydive; visibility is restored by play -> release
        for (const a of this.owned) a.stop()
        this.owned.clear(); this.A = {}
        this.phase = 'none'; this.on = null
        this._done()
      }
    }
  }
}
