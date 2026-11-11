// Expression overlay: from the game's quest emote poses (2-frame static full body + face) take "facial bone deltas relative to neutral",
// and layer them by weight onto any action. At small size they need some exaggeration (gain).
import * as THREE from 'three'

const FACE_RE = /lip|mouth|jaw|eyelid|eyesack|brow|forehead|cheek|nasolab|nose|nostril|chin|masseter|tongue/i
const NAMES = ['happy', 'angry', 'sad', 'surprised', 'fearful']

export class Expressions {
  constructor(pet) {
    this.pet = pet
    this.deltas = {}        // name -> [{ bone, q, p }]
    this.w = {}             // current weights
    this.target = {}        // target weights
    this.pulses = []        // { name, w, until, out }
    this.base = { happy: 0.12 }   // resting state: a slightly smug smile
    this.gain = 1.3
    this.ready = false
  }

  async load(side = 'l') {
    const pose = async (name) => {
      const clip = await this.pet.loadClip(`quest__rampart_quest_${name}_${side}`)
      const out = {}
      for (const t of clip.tracks) {
        const dot = t.name.lastIndexOf('.')
        const bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1)
        if (!FACE_RE.test(bone) || !this.pet.bones[bone]) continue
        ;(out[bone] ||= {})[prop] = Array.from(t.values.slice(0, prop === 'quaternion' ? 4 : 3))
      }
      return out
    }
    try {
      const neutral = await pose('neutral')
      for (const n of NAMES) {
        const p = await pose(n)
        const list = []
        for (const [bone, v] of Object.entries(p)) {
          const nv = neutral[bone]
          if (!nv) continue
          const q = new THREE.Quaternion(...v.quaternion)
          const qn = new THREE.Quaternion(...nv.quaternion)
          const dq = qn.clone().invert().multiply(q)          // local delta: q = qn * dq
          const dp = new THREE.Vector3(...v.position).sub(new THREE.Vector3(...nv.position))
          if (1 - Math.abs(dq.w) < 1e-5 && dp.lengthSq() < 1e-10) continue
          list.push({ bone: this.pet.bones[bone], q: dq, p: dp })
        }
        this.deltas[n] = list
        this.w[n] = 0
      }
      this.ready = true
    } catch (e) {
      console.warn('Expression poses failed to load', e)
    }
  }

  // target weights are kept per source (typing, head pats, being picked up each manage their own, clear only clears its own), max across same name
  set(name, w, src = 'misc') { this.target[src + ':' + name] = w }
  clear(name, src = 'misc') { delete this.target[src + ':' + name] }
  clearAll(src) { for (const k of Object.keys(this.target)) if (k.startsWith(src + ':')) delete this.target[k] }
  // pulse: hold weight w for hold seconds, then fade out over out seconds
  pulse(name, w = 0.8, hold = 0.6, out = 0.6) {
    this.pulses = this.pulses.filter(p => p.name !== name)
    this.pulses.push({ name, w, left: hold, out })
  }

  get bones() { return Object.values(this.deltas).flat().map(d => d.bone) }

  update(dt) {
    if (!this.ready) return
    const want = { ...this.base }
    for (const [k, w] of Object.entries(this.target)) { const n = k.slice(k.indexOf(':') + 1); want[n] = Math.max(want[n] || 0, w) }
    for (const p of this.pulses) {
      p.left -= dt
      const k = p.left > 0 ? 1 : Math.max(0, 1 + p.left / p.out)
      want[p.name] = Math.max(want[p.name] || 0, p.w * k)
    }
    this.pulses = this.pulses.filter(p => p.left > -p.out)
    const q = new THREE.Quaternion()
    for (const n of NAMES) {
      const tw = want[n] || 0
      const cur = this.w[n] || 0
      const rate = tw > cur ? 8 : 1.6          // fast in, slow out
      const w = cur + (tw - cur) * Math.min(1, dt * rate)
      this.w[n] = w
      if (w < 0.005) continue
      const k = Math.min(1.6, w * this.gain)
      for (const d of this.deltas[n]) {
        q.identity().slerp(d.q, k)
        d.bone.quaternion.multiply(q)
        d.bone.position.addScaledVector(d.p, k)
      }
    }
  }
}
