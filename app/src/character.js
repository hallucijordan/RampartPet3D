// Character: loads the model and props, touches up materials, animation mixing (bones bound by name), clip trimming, loop seam fade, root motion handling
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { enhanceMaterials } from './materials.js'
import { Typing } from './typing.js'

const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)
const loadGLB = (url) => new Promise((ok, fail) => loader.load(url, ok, undefined, fail))
const FPS = 30
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3()
const ALWAYS_HIDDEN = []
const EYE_SHELLS = ['eye_cornea', 'eye_shadow']   // thin eye shells: cornea highlight and eyelid shadow, translucent over the eyeball
const BONE_MERGE = { wrench_card: 'ja_c_propGun' }   // props that follow the character by bone merge: prop short name -> bone to align with (see fixProps)
// Bone-merged props are attached to the hand instead: in the heirloom clip ja_c_propGun is rigid relative to the right wrist (1.1 mm, 0.5° drift over the clip). Following ja_c_propGun directly,
// that bone is a blend of two clips while fading into another clip (wrench drops to the floor going from fixing Sheila to riding Sheila); following the hand is immune to blending. Relative pose is computed from the tracks when this clip loads
const MERGE_HAND = { wrench_card: { hand: 'def_r_wrist', clip: 'gladcard__rampart_gladcard_animated_heirloom' } }
// Per-clip prop fixes: in the standing base pose only the tripod legs remain (the gun is on her back), so hide it
const PROP_OVERRIDE = {
  // when picked up she grabs the cursor with her hand, no zipline wrench
  melee__rampart_ziplineidle_wrench: { hide: ['wrench_w'] },
  melee__rampart_land_wrench: { hide: ['wrench_w'] },
  // panic dance: the game hides the tripod (she drops the gun body on the ground and dances). In the data the tripod is pinned in place the whole clip; shown, it is just a lonely stand
  emote__rampart_ground_emote_panicdance: { parts: { turret_lobby: ['rampart_turret_base'] } },
}

// Trim [a, b] seconds: add interpolated keyframes at both ends, then shift to 0.
// three's AnimationUtils.subclip keeps only keyframes inside the range; after export optimization constant tracks have only first and last keys, so trimming the middle drops whole tracks
function subclip(clip, name, a, b) {
  const tracks = []
  for (const t of clip.tracks) {
    const n = t.getValueSize(), interp = t.createInterpolant()
    const times = [a], vals = [...interp.evaluate(a)]
    for (let i = 0; i < t.times.length; i++) {
      const tt = t.times[i]
      if (tt > a + 1e-5 && tt < b - 1e-5) { times.push(tt); for (let k = 0; k < n; k++) vals.push(t.values[i * n + k]) }
    }
    times.push(b); vals.push(...interp.evaluate(b))
    const T = t.constructor
    tracks.push(new T(t.name, times.map(x => x - a), vals))
  }
  return new THREE.AnimationClip(name, b - a, tracks)
}

// Reverse: flip the time axis and reverse keyframe order (slot field reverse)
function reverseClip(clip) {
  const d = clip.duration
  clip.tracks = clip.tracks.map(t => {
    const n = t.getValueSize(), k = t.times.length, times = new Float32Array(k), vals = new Float32Array(k * n)
    for (let i = 0; i < k; i++) {
      times[i] = d - t.times[k - 1 - i]
      for (let j = 0; j < n; j++) vals[i * n + j] = t.values[(k - 1 - i) * n + j]
    }
    return new t.constructor(t.name, times, vals)
  })
}

// Rotate the whole clip deg degrees around the vertical axis, written into the tracks (slot field rot): character root bone jx_c_delta and each prop's rig object <short name>__rig.
// Both have the character root space as parent (rig nodes are identity, prop objects are only translated, placed at the root bone's horizontal position by fixProps),
// so rotating about the origin rotates everything together: prop objects follow the rotated root bone, no pivot needed
function rotateClip(clip, deg) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(deg)), r = new THREE.Quaternion()
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.'), node = t.name.slice(0, dot), prop = t.name.slice(dot + 1)
    if (node !== 'jx_c_delta' && !node.endsWith('__rig')) continue
    if (prop === 'position') for (let i = 0; i < t.values.length; i += 3) _v1.fromArray(t.values, i).applyQuaternion(q).toArray(t.values, i)
    if (prop === 'quaternion') for (let i = 0; i < t.values.length; i += 4) r.fromArray(t.values, i).premultiply(q).toArray(t.values, i)
  }
}

export class Character {
  constructor() {
    this.root = new THREE.Group()        // mixer root: character and props all hang under it
    this.root.name = 'pet_root'
    this.bones = {}
    this.meshes = []
    this.props = {}                      // prop name -> Object3D
    this.clips = new Map()               // clip id -> AnimationClip
    this.clipMeta = new Map()            // clip id -> index.json entry
    this.pending = new Map()
    this.current = null                  // current main action { key, action, clip, opts }
    this.typing = new Typing(this)       // typing rig (typing.js), used after the brain init
  }

  // Loads the 1K texture version by default (no visible difference at pet size, saves three quarters of VRAM); ?hi=1 loads the originals
  async load(base = './', { hi = false, skin = 'base' } = {}) {
    this.base = base
    // skin x's model is rampart_x.glb (base skin rampart.glb, skin table in tools/cfg.py); falls back to the base skin if missing
    const glb = (name) => hi ? loadGLB(base + name + '.glb') : loadGLB(base + name + '_1k.glb').catch(() => loadGLB(base + name + '.glb'))
    this.skin = skin || 'base'
    const model = skin && skin !== 'base'
      ? glb('rampart_' + skin).catch(e => { console.warn(`Skin ${skin} failed to load, falling back to base skin`, e); this.skin = 'base'; return glb('rampart') })
      : glb('rampart')
    const [gltf, index] = await Promise.all([
      model,
      fetch(base + 'anims/index.json').then(r => r.ok ? r.json() : []).catch(() => []),
    ])
    for (const e of (Array.isArray(index) ? index : index.clips || [])) this.clipMeta.set(e.id, e)

    this.model = gltf.scene
    this.root.add(this.model)
    this.model.traverse(o => {
      if (o.isBone) this.bones[o.name] = o
      if (o.isMesh) {
        this.meshes.push(o)
        o.castShadow = true
        o.receiveShadow = true
        o.frustumCulled = false
      }
    })
    this.fixMaterials(this.model)
    await enhanceMaterials(this.model, base)
    this.mixer = new THREE.AnimationMixer(this.root)
    this.captureRest()
    this.showProps([])
    return this
  }

  has(id) { return this.clipMeta.has(id) }

  // Record each bone's world orientation in the bind pose, so procedural layers like gaze can find the "forward" axis
  captureRest() {
    this.root.updateMatrixWorld(true)
    this.rest = {}
    const q = new THREE.Quaternion()
    for (const [name, b] of Object.entries(this.bones)) {
      b.getWorldQuaternion(q)
      this.rest[name] = { worldQ: q.clone(), localQ: b.quaternion.clone(), localP: b.position.clone() }
    }
  }

  fixMaterials(root) {
    root.traverse(o => {
      if (!o.isMesh) return
      if (EYE_SHELLS.some(n => o.name.includes(n))) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.transparent = true; m.alphaTest = 0; m.depthWrite = false; m.needsUpdate = true
        }
        o.renderOrder = 2
        o.castShadow = false
        return
      }
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m.envMapIntensity = 1.0
        if (m.alphaTest > 0 || m.transparent) {
          // hair cards: alpha to coverage gives soft edges in a multisampled target
          m.transparent = false
          m.alphaTest = Math.max(m.alphaTest, 0.35)
          m.alphaToCoverage = true
          m.side = THREE.DoubleSide
          m.depthWrite = true
        }
        m.needsUpdate = true
      }
    })
  }

  // Props and character share one mixer
  // Each prop loads only once: concurrent clip preloads share the in-flight Promise,
  // otherwise two props with the same name get attached, the mixer binds the hidden one and the visible one stays in bind pose
  loadProp(name, attach) {
    if (this.props[name]) return Promise.resolve(this.props[name])
    this._propLoads ||= {}
    return this._propLoads[name] ||= (async () => {
      const gltf = await loadGLB(`${this.base}props/${name}.glb`)
      const obj = gltf.scene
      obj.name = 'prop_' + name
      obj.visible = false
      obj.traverse(o => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; this.meshes.push(o) }
        o.userData.bind = [o.position.clone(), o.quaternion.clone(), o.scale.clone()]   // bind pose (used by the typing rig to compute prop poses from tracks)
      })
      this.fixMaterials(obj)
      this.root.add(obj)   // sibling of the character scene (attach points converted at export, tracks share the same root space)
      this.props[name] = obj
      this.warmProp(name)
      return obj
    })()
  }

  async loadClip(id) {
    if (this.clips.has(id)) return this.clips.get(id)
    if (this.pending.has(id)) return this.pending.get(id)
    const p = (async () => {
      const meta = this.clipMeta.get(id)
      if (!meta) throw new Error('No such clip: ' + id)
      const gltf = await loadGLB(this.base + (meta.file || `anims/${id}.glb`))
      const clip = gltf.animations[0]
      clip.name = id
      // keep only bone tracks that exist in the model or props (e.g. HP-skin-only ribbon bones get filtered out)
      clip.tracks = clip.tracks.filter(t => {
        const node = t.name.slice(0, t.name.lastIndexOf('.'))
        return this.bones[node] || node.includes('__')
      })
      for (const d of meta.prop_detail || (meta.props || []).map(name => ({ name }))) {
        await this.loadProp(d.name, d.attach).catch(e => console.warn('prop', d.name, e))
      }
      const ov = PROP_OVERRIDE[id]
      // show: prop is visible only within [a, b) seconds (game animation events CREATE_PROP / DESTROY_PROP, written to prop_detail.show_s at export)
      const show = Object.fromEntries((meta.prop_detail || []).filter(d => d.show_s).map(d => [d.name, d.show_s]))
      clip.userData = { props: (meta.props || []).filter(p => !ov?.hide?.includes(p)), hide: meta.hide || [], parts: ov?.parts || {}, show, meta }
      for (const [n, m] of Object.entries(MERGE_HAND)) {
        if (m.clip !== id) continue
        // relative pose hand -> merged bone (frame 0, computed from tracks, mixer untouched)
        const H = this.boneInClip(clip, 0, m.hand), G = this.boneInClip(clip, 0, BONE_MERGE[n])
        if (H && G) (this._handOff ||= {})[n] = H.invert().multiply(G)
      }
      this.unrootProps(clip)
      this.stripRootMotion(clip)
      this.recenter(clip)
      this.clips.set(id, clip)
      this.warmClip(clip)
      return clip
    })()
    this.pending.set(id, p)
    try { return await p } finally { this.pending.delete(id) }
  }

  // spec: 'id' or { id, from, to, rot?, reverse? } (frame numbers, 30 fps; rot = degrees to rotate the whole clip about the vertical axis, reverse = play backwards). Trimmed clips are cached,
  // the cache key includes rotation / reverse (one copy per treatment of the same range); the public clip name (pet.current.key) is still clips.js keyOf: id@from-to
  async getClip(spec) {
    if (typeof spec === 'string') return this.loadClip(spec)
    const key = `${spec.id}@${spec.from}-${spec.to}` + (spec.rot ? `~r${spec.rot}` : '') + (spec.reverse ? '~rev' : '')
    if (this.clips.has(key)) return this.clips.get(key)
    const full = await this.loadClip(spec.id)
    const a = (spec.from || 0) / FPS, b = Math.min((spec.to ?? Infinity) / FPS, full.duration)
    const sub = subclip(full, key, a, b)
    // from: trim start (seconds), reverse: backwards; prop show ranges are in original clip time
    sub.userData = { ...full.userData, from: a, reverse: !!spec.reverse }
    if (spec.rot) rotateClip(sub, spec.rot)
    if (spec.reverse) reverseClip(sub)
    this.clips.set(key, sub)
    this.warmClip(sub)
    return sub
  }

  // ---------- Warm-up (hitches the first time a prop renders or a clip plays) ----------
  // First render of a prop: shader compile + texture upload land on that frame (first typing entry 170 ms, first lie-down 115 ms, second time both < 10 ms);
  // first play of a clip: the mixer builds bone bindings for hundreds of tracks. So props / clips queue up as soon as they load and warm up one by one when idle:
  //  props: temporarily visible -> compile against the character HDR target rtChar (shader variants depend on the output target) -> upload textures one by one -> render offscreen once for main pass and contact shadow,
  //        visibility restored within the same synchronous code, nothing reaches the screen; clips: play at weight 0 then stop, bindings stay cached.
  // Things loaded before startWarm are caught up; later loads are queued as they come (typing rig calls startWarm 4 s after init, after the entrance landing)
  startWarm({ stage, fx }) {
    if (this._ws) return
    this._ws = { stage, fx }
    for (const n of Object.keys(this.props)) this.warmProp(n)
    for (const c of this.clips.values()) this.warmClip(c)
  }
  warmProp(name) { if (this._ws) this._warmPush(() => this._warmPropNow(name)) }
  warmClip(clip) { if (this._ws) this._warmPush(() => this._warmClipNow(clip)) }
  _warmPush(task) {
    (this._warmQ ||= []).push(task)
    if (this._warmRunning) return
    this._warmRunning = true
    const idle = () => new Promise(res => window.requestIdleCallback ? requestIdleCallback(res, { timeout: 1000 }) : setTimeout(res, 0))
    ;(async () => {
      while (this._warmQ.length) {
        await idle()
        try { await this._warmQ.shift()() } catch (e) { console.warn('Warm-up failed', e) }
      }
      this._warmRunning = false
    })()
  }
  _warmClipNow(clip) {
    const a = this.mixer.clipAction(clip)
    if (!a.isRunning() && !this.typing.owns(a) && a !== this.current?.action) { a.setEffectiveWeight(0); a.play(); a.stop() }
  }
  async _warmPropNow(name) {
    const obj = this.props[name], { stage: st, fx } = this._ws, r = st.renderer
    if (!obj || (this._warmedProps ||= new Set()).has(name)) return
    this._warmedProps.add(name)
    const saved = new Map()
    const show = () => obj.traverse(m => { if (!saved.has(m)) saved.set(m, m.visible); m.visible = true })
    const restore = () => { for (const [m, v] of saved) m.visible = v }
    // also compile the sprite material for dust puffs / bubble debris (compiled on the first puff otherwise): placed below ground out of sight, gone after a second
    if (!this._warmedSprite) { this._warmedSprite = true; fx?.puff(new THREE.Vector3(0, -50, 0), 1, 0) }
    const prevRT = r.getRenderTarget()
    show(); r.setRenderTarget(st.rtChar); const compiling = r.compileAsync(st.scene, st.camera); r.setRenderTarget(prevRT); restore()
    await compiling
    const idle = () => new Promise(res => window.requestIdleCallback ? requestIdleCallback(res, { timeout: 1000 }) : setTimeout(res, 0))
    const texs = new Set()
    obj.traverse(m => { if (m.isMesh) for (const mat of [].concat(m.material)) for (const v of Object.values(mat)) if (v?.isTexture) texs.add(v) })
    for (const t of texs) { await idle(); r.initTexture(t) }
    await idle()
    show()
    r.shadowMap.needsUpdate = true
    r.setRenderTarget(st.rtChar); r.render(st.scene, st.camera)
    st.scene.overrideMaterial = st.csDepth; r.setRenderTarget(st.csRT); r.render(st.scene, st.csCam); st.scene.overrideMaterial = null
    r.setRenderTarget(prevRT)
    restore()
  }

  // Matrix of a character bone in character root space at time t of a clip: computed from tracks (bind pose where no track), mixer untouched
  boneInClip(clip, t, name) {
    const val = (bn, prop) => { const tr = clip.tracks.find(k => k.name === bn + '.' + prop); return tr ? Array.from(tr.createInterpolant().evaluate(t)) : null }
    const chain = []
    for (let b = this.bones[name]; b && b.isBone; b = b.parent) chain.unshift(b)
    if (!chain.length) return null
    const M = new THREE.Matrix4(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1)
    for (const b of chain) {
      const r = this.rest[b.name], p = val(b.name, 'position'), q = val(b.name, 'quaternion')
      M.multiply(m.compose(p ? new THREE.Vector3().fromArray(p) : r.localP, q ? new THREE.Quaternion().fromArray(q) : r.localQ, one))
    }
    return M
  }

  // Before clearing the root bone's horizontal motion, subtract the same offset from the prop tracks: props are placed relative to the original root (readyup root is 2 m away, a finisher walks 1.2 m,
  // wrench walk/run clips cover over ten meters); clearing only the character leaves the props behind (tripod 2 m from her). Clips whose original root doesn't move (the vast majority) are unaffected
  unrootProps(clip) {
    const root = clip.tracks.find(t => t.name === 'jx_c_delta.position')
    if (!root) return
    let far = 0
    for (let i = 0; i < root.values.length; i += 3) far = Math.max(far, Math.abs(root.values[i]), Math.abs(root.values[i + 2]))
    if (far < 1e-3) return
    const ip = root.createInterpolant()
    clip.tracks = clip.tracks.map(t => {
      if (!t.name.endsWith('__rig.position')) return t
      const times = [...new Set([...t.times, ...root.times])].sort((x, y) => x - y), it = t.createInterpolant(), vals = []
      for (const x of times) { const v = it.evaluate(x), r = ip.evaluate(x); vals.push(v[0] - r[0], v[1], v[2] - r[2]) }
      return new THREE.VectorKeyframeTrack(t.name, times, vals)
    })
  }

  // Banner / emote poses are framed for their own cameras and the character is off origin: shift the whole clip back to origin by the first-frame horizontal hip position
  recenter(clip) {
    const B = this.bones
    const chain = ['jx_c_delta', 'jx_c_start', 'def_c_hip'].map(n => B[n]).filter(Boolean)
    if (chain.length < 3) return
    const saved = chain.map(b => [b.position.clone(), b.quaternion.clone()])
    for (const b of chain) {
      for (const t of clip.tracks) {
        if (t.name === b.name + '.position') b.position.fromArray(t.values, 0)
        if (t.name === b.name + '.quaternion') b.quaternion.fromArray(t.values, 0)
      }
    }
    this.root.updateMatrixWorld(true)
    const hip = B.def_c_hip.getWorldPosition(new THREE.Vector3())
    this.root.worldToLocal(hip)
    // first-frame chest facing (yaw relative to character root), used to turn her toward the camera for photos
    const chest = B.def_c_spineC
    if (chest) {
      const q = chest.getWorldQuaternion(new THREE.Quaternion()).multiply(this.rest.def_c_spineC.worldQ.clone().invert())
      q.premultiply(this.root.getWorldQuaternion(new THREE.Quaternion()).invert())
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
      clip.userData.facing = Math.atan2(f.x, f.z)
    }
    chain.forEach((b, i) => { b.position.copy(saved[i][0]); b.quaternion.copy(saved[i][1]) })
    this.root.updateMatrixWorld(true)
    const off = Math.hypot(hip.x, hip.z)
    clip.userData.hipOffset = off
    if (off < 0.12) return
    // convert the offset into jx_c_delta's parent space and add it to the root bone position track
    const parent = B.jx_c_delta.parent
    const a = this.root.localToWorld(new THREE.Vector3(0, 0, 0)), b = this.root.localToWorld(new THREE.Vector3(-hip.x, 0, -hip.z))
    parent.worldToLocal(a); parent.worldToLocal(b)
    const d = b.sub(a)
    for (const t of clip.tracks) {
      if (t.name !== 'jx_c_delta.position') continue
      for (let i = 0; i < t.values.length; i += 3) { t.values[i] += d.x; t.values[i + 1] += d.y; t.values[i + 2] += d.z }
    }
  }

  // Zero the root bone's horizontal motion (the pet performs in place), keep height changes
  stripRootMotion(clip) {
    for (const t of clip.tracks) {
      if (t.name === 'jx_c_delta.position') {
        const v = t.values
        for (let i = 0; i < v.length; i += 3) { v[i] = 0; v[i + 2] = 0 }
      }
    }
  }

  // Play (crossfade)
  //  loop: looping; with loopFade>0, crossfades with its own copy at the seam (for loops whose ends don't match)
  //  onDone: one-shot clips call back with exitFade seconds left (to fade out early and chain the next)
  //  returns null: a newer play() was issued while loading, so this one is dropped (last request wins, a late old clip won't override new behavior)
  async play(spec, { fade = 0.4, loop = true, loopFade = 0, speed = 1, at = 0, onDone = null, exitFade = 0.3 } = {}) {
    // typing rig running and something else wants to play: the rig hands over the mixer (its actions fade out over fade), character and prop visibility restored
    this.typing.release(fade)
    const gen = this._gen = (this._gen || 0) + 1
    let clip = await this.getClip(spec)
    if (gen !== this._gen) return null
    const key = typeof spec === 'string' ? spec : `${spec.id}@${spec.from}-${spec.to}`   // = clips.js keyOf (tests check against it)
    const cur = this.current
    if (cur && (cur.clip === clip || cur.clip === clip.userData.twin)) {
      if (loop && cur.opts.loop) {
        // same loop already playing: don't restart, just update parameters
        cur.action.timeScale = speed
        cur.action.setLoop(loopFade > 0 ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
        Object.assign(cur.opts, { loopFade, onDone, exitFade, speed })
        return cur.action
      }
      // replaying the one-shot clip currently playing: crossfade with a copy, otherwise reset fades in from the bind pose (A-pose flash)
      clip = this._twin(cur.clip)
    }
    const useOnce = !loop || loopFade > 0
    this._start(clip, { fade, speed, at, once: useOnce })
    this.current = { key, clip, action: this.mixer.clipAction(clip), opts: { loop, loopFade, onDone, exitFade, speed }, fired: false }
    this._gum = null   // bubble gum visibility: on clip change, start from "still, hidden" (see fixProps)
    this.showProps(clip.userData.props, clip.userData.hide, clip.userData.parts)
    return this.current.action
  }

  _start(clip, { fade, speed, at, once }) {
    const action = this.mixer.clipAction(clip)
    const prev = this.current?.action
    action.reset()
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
    action.clampWhenFinished = true
    action.timeScale = speed
    action.time = at
    action.enabled = true
    action.setEffectiveWeight(1)
    action.play()
    if (prev && prev !== action) prev.crossFadeTo(action, fade, false)
    else if (fade > 0) action.fadeIn(Math.min(fade, 0.2))
    return action
  }

  // copy used for seam fade
  _twin(clip) {
    if (!clip.userData.twin) {
      const t = clip.clone()
      t.name = clip.name + '#twin'
      t.userData = { ...clip.userData, twin: clip }
      clip.userData = { ...clip.userData, twin: t }
    }
    return clip.userData.twin
  }

  // Prop visibility; hide lists character meshes to hide (e.g. hide the Sheila on her back when the prop Sheila comes out);
  // parts: { prop name: [material names] }, prop parts to hide in this clip (matched by material name)
  showProps(names, hide = [], parts = {}) {
    for (const [n, obj] of Object.entries(this.props)) {
      const v = names.includes(n)
      if (obj.visible && !v) this.onPropHidden?.(n, obj)
      obj.visible = v
      if (v) obj.traverse(o => { if (o.isMesh) o.visible = !parts[n]?.includes(o.material.name) })
    }
    this.model.traverse(o => {
      if (o.isMesh) o.visible = !hide.some(h => o.name.includes(h)) && !ALWAYS_HIDDEN.some(h => o.name.includes(h))
    })
  }

  get time() { return this.current?.action.time ?? 0 }
  get remaining() { const c = this.current; return c ? (c.clip.duration - c.action.time) / Math.max(1e-3, Math.abs(c.action.timeScale)) : 0 }

  update(dt) {
    // Bones touched by procedural layers are first restored to "the value the mixer wrote last frame" (bind pose for bones without tracks).
    // Can't restore to bind pose: three's mixer doesn't write bones on frames where track values didn't change (static poses, constant spans), so they'd stick in bind pose
    const snap = this._snap ||= new Map()
    for (const b of this.procBones || []) {
      const v = snap.get(b)
      if (v) { b.position.copy(v.p); b.quaternion.copy(v.q) }
      else { const r = this.rest[b.name]; b.position.copy(r.localP); b.quaternion.copy(r.localQ) }
    }
    this.typing.update(dt)               // while the typing rig runs it sets the weights and times of its actions
    const c = this.current
    if (c && !this.typing.busy) {
      const left = this.remaining
      if (c.opts.loop && c.opts.loopFade > 0 && left <= c.opts.loopFade) {
        // seam: crossfade with the copy, start over
        const next = this._twin(c.clip)
        this._start(next, { fade: c.opts.loopFade, speed: c.opts.speed, at: 0, once: true })
        this.current = { ...c, clip: next, action: this.mixer.clipAction(next), fired: false }
      } else if (!c.opts.loop && !c.fired && left <= c.opts.exitFade) {
        c.fired = true
        c.opts.onDone?.()
      }
    }
    this.mixer?.update(dt)
    for (const b of this.procBones || []) {
      let v = snap.get(b)
      if (!v) snap.set(b, v = { p: new THREE.Vector3(), q: new THREE.Quaternion() })
      v.p.copy(b.position); v.q.copy(b.quaternion)
    }
    // stop actions that finished fading out, otherwise active actions pile up (each one evaluated every frame)
    for (const a of this.mixer?._actions || []) {
      if (a !== this.current?.action && !this.typing.owns(a) && !a._weightInterpolant && (!a.enabled || a.getEffectiveWeight() === 0) && this.mixer._isActiveAction(a)) a.stop()
    }
    this.root.updateMatrixWorld(true)
    this.fixProps(dt)
    this.typing.post()                   // prop placement fixes (tripod position interpolated per segment, base locked during bursts)
  }

  // Runtime prop fixes (things the game does with visibility toggles and IK, not in the animation data)
  fixProps(dt = 0) {
    // Props follow the horizontal fix of the character root: stripRootMotion / recenter only change the jx_c_delta tracks, prop tracks stay where they were
    // (lobby clips are off by 0.23 m, banner fireaway by 1.2 m). Prop clips are all in-place, so the root bone's current horizontal position is exactly that correction
    // (rig nodes are identity, root bone parent space = character root space)
    // Props that follow the body are also parented to a bone, local matrix = bone's current animated pose⁻¹ × character root × the translation fix above: same position in the animated pose,
    // and when the gaze layer / per-key nod (procedural, layers, which run after this) turn the chest or head, the prop turns with them.
    // Bubble gum on the mouth, gun body and welding torch held in hand on the chest: otherwise at ~30° of gaze head turn the gum is 4–7 cm off the mouth (floating beside it) and the hands leave the gun by 1–5 cm.
    // The tripod standing on the ground (turret_lobby) is not parented
    const p = this.bones.jx_c_delta?.position
    const T = this._fixT ||= new THREE.Matrix4()
    for (const [n, obj] of Object.entries(this.props)) {
      if (!obj.visible || !p) continue
      // bone merge (heirloom wrench): the prop carries its own copy of the character skeleton, the wrench hangs under its own ja_c_propGun; in the game it follows the character via same-name bone merge.
      // Parent it under the character's bone of that name, local matrix = inverse of that prop bone's matrix relative to the prop object, so the two bones coincide
      const mb = BONE_MERGE[n] && this.bones[BONE_MERGE[n]]
      if (mb) {
        const pg = (this._merge ||= {})[n] ||= obj.getObjectByName(n + '__' + BONE_MERGE[n])
        if (pg) {
          const off = this._handOff?.[n], hand = off && this.bones[MERGE_HAND[n].hand], par = hand || mb
          if (obj.parent !== par) { par.add(obj); obj.matrixAutoUpdate = false }
          const L = (this._mergeL ||= new THREE.Matrix4()).identity()
          for (let o = pg; o && o !== obj; o = o.parent) { o.updateMatrix(); L.premultiply(o.matrix) }
          obj.matrix.copy(L).invert()
          if (hand) obj.matrix.premultiply(off)
          obj.updateMatrixWorld(true)
          continue
        }
      }
      const bone = this.bones[{ bubblegum: 'def_c_mouth', turret_gun: 'def_c_spineC', welder: 'def_c_spineC' }[n]]
      if (bone) {
        if (obj.parent !== bone) { bone.add(obj); obj.matrixAutoUpdate = false }
        obj.matrix.copy(bone.matrixWorld).invert().multiply(this.root.matrixWorld).multiply(T.makeTranslation(p.x, 0, p.z))
      } else {
        obj.position.set(p.x, 0, p.z)
      }
      obj.updateMatrixWorld(true)
    }
    // prop show ranges (e.g. cricket bat: spawned at frame 25, destroyed at frame 230), hidden outside the range
    const c = this.current, u = c?.clip.userData
    if (u?.show) {
      const t = (u.reverse ? c.clip.duration - c.action.time : c.action.time) + (u.from || 0)
      for (const [n, [a, b]] of Object.entries(u.show)) {
        const obj = this.props[n]
        if (!obj?.visible) continue
        const on = t >= a && (b == null || t < b)
        obj.traverse(o => { if (o.isMesh) o.visible = on && !u.parts[n]?.includes(o.material.name) })
      }
    }
    const gum = this.props.bubblegum
    // skins without a mouth bone (Bear skin headgear) don't blow bubble gum: otherwise the bubble swells from inside the headgear
    if (gum?.visible && !this.bones.def_c_mouth) gum.traverse(o => { if (o.isMesh) o.visible = false })
    else if (gum?.visible) {
      // when not blowing, the animation leaves the gum as a small blob by the mouth (or held in the mouth); always shown and swaying with the motion it looks wrong.
      // Hide only the "small blob, not moving for a while" state: world scale of the bubble core (base × core; checked against 12 clips: in mouth / small blob ≤ 0.57,
      // blown ≥ 0.93); a change over 5% counts as moving and shows it at once, keeping the whole blow-up-to-pop; hidden only below 0.75 and still for 0.8 s or more.
      // On clip change it counts as still (hidden) until it first moves, so the blob doesn't flash for 0.8 s on every clip. More than 30 cm from the mouth (clips that park it at origin when not blowing) is hidden too
      const core = this._gumCore ||= gum.getObjectByName('bubblegum__bubblegumCore')
      const mouth = this.bones.def_c_mouth
      if (core && mouth) {
        const d = core.getWorldPosition(_v1).distanceTo(mouth.getWorldPosition(_v2))
        const s = core.getWorldScale(_v1).x / this.root.getWorldScale(_v2).x
        const g = this._gum ||= { ref: s, still: Infinity }
        if (Math.abs(s - g.ref) > 0.05 * g.ref) { g.ref = s; g.still = 0 } else g.still += dt
        const on = d < 0.3 && (s > 0.75 || g.still < 0.8)
        gum.traverse(o => { if (o.isMesh) o.visible = on })
      }
    }
    // welding torch: for the first 6 s of weld it sits 0.3–0.47 m below ground (hidden by the lobby floor in the game, appears in hand at 6.3 s). The pet has no floor, so hide it while below ground
    const wd = this.props.welder
    if (wd?.visible) {
      const b = this._welderBase ||= wd.getObjectByName('welder__def_c_base')
      if (b) {
        // hide when below ground (the span hidden by the lobby floor) or more than 40 cm from both hands (flung out during hand swaps)
        b.getWorldPosition(_v1)
        const near = ['def_l_wrist', 'def_r_wrist'].some(n => this.bones[n] && _v1.distanceTo(this.bones[n].getWorldPosition(_v2)) < 0.4)
        this.root.worldToLocal(_v1)
        wd.traverse(o => { if (o.isMesh) o.visible = _v1.y > 0 && near })
      }
    }
    // (this used to push the tripod's center column end back to the ground: a symptom of the prop stuck in bind pose, fixed in export, see the tripod prop section of tools/README)
  }
}
