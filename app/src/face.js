// Face procedural layer: blink (incl. double blink), sleepy squint, eyes closed when sleeping
// Eyelid bones are translation driven: upper lids move down, lower lids up. Offsets are defined in character space, converted to the parent bone's local space and added on top of the animation
import * as THREE from 'three'

// [bone name suffix, character-space y direction, offset (meters, fully closed)]
const LIDS = [
  ['eyelidUpper', -1, 0.0105],
  ['eyelidUpperInner', -1, 0.0085],
  ['eyelidUpperOutter', -1, 0.0085],
  ['eyelidUpperFurrow', -1, 0.004],
  ['eyesackUpper', -1, 0.002],
  ['eyelidLower', 1, 0.0022],
  ['eyelidLowerInner', 1, 0.0018],
  ['eyelidLowerOutter', 1, 0.0018],
]

export class Face {
  constructor(pet) {
    this.pet = pet
    this.base = 0          // base closure 0..1 (sleepy, asleep)
    this.baseS = 0
    this.blinkT = -1       // blink progress (seconds), <0 means not blinking
    this.next = 1.5
    this.double = false
    this.scale = 1         // overall offset scale, for calibration
    this.items = []
    const inv = new THREE.Quaternion()
    for (const s of ['l', 'r']) {
      for (const [n, dy, m] of LIDS) {
        const b = pet.bones[`def_${s}_${n}`]
        if (!b) continue
        inv.copy(pet.rest[b.parent.name].worldQ).invert()
        const off = new THREE.Vector3(0, dy * m, 0).applyQuaternion(inv)
        this.items.push({ bone: b, off })
      }
    }
    this.bones = this.items.map(i => i.bone)
  }

  blink(double = false) {
    if (this.blinkT >= 0) return
    this.blinkT = 0
    this.double = double
  }

  // blink curve: 60 ms close, 40 ms hold, 130 ms open
  blinkAmount() {
    const t = this.blinkT
    if (t < 0) return 0
    if (t < 0.06) return t / 0.06
    if (t < 0.1) return 1
    if (t < 0.23) return 1 - (t - 0.1) / 0.13
    return 0
  }

  update(dt) {
    this.baseS += (this.base - this.baseS) * Math.min(1, dt * 2.5)
    if (this.blinkT >= 0) {
      this.blinkT += dt
      if (this.blinkT > 0.23) {
        this.blinkT = -1
        if (this.double) { this.double = false; this.next = 0.09 }
      }
    } else {
      this.next -= dt
      if (this.next <= 0 && this.baseS < 0.9) {
        this.blink(Math.random() < 0.12)
        // blink interval roughly 2-6 s, long tail to the right
        this.next = 1.8 + Math.random() * 2.2 + (Math.random() < 0.25 ? Math.random() * 3 : 0)
      }
    }
    const close = Math.min(1, this.baseS + (1 - this.baseS) * this.blinkAmount()) * this.scale
    if (close <= 0.001) return
    for (const it of this.items) it.bone.position.addScaledVector(it.off, close)
  }
}
