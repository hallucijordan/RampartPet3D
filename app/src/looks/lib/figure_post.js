// Composite effect for the figure look (direction E): a clean oval shadow under the feet (like the small soft shadow a figure casts standing on a desk)
// Computed analytically in the composite shader (fix's postFix hooks), no extra geometry, no extra passes
import * as THREE from 'three'

export const PU = {
  fgOvC: { value: new THREE.Vector2(0.5, 0.1) },   // oval center (composite uv)
  fgOvR: { value: new THREE.Vector2(0.05, 0.01) }, // semi-axes (uv)
  fgOvA: { value: 0 },                             // opacity (height falloff already applied)
}

export const DECL = `
uniform vec2 fgOvC; uniform vec2 fgOvR; uniform float fgOvA;
`

// Soft oval (Gaussian core + a smooth-edged ring), black, under the character, outline and contact shadow. hitMode returns before it, hit testing unaffected
export const FINAL = `  {
    float fgD = length((vUv - fgOvC) / fgOvR);
    float fgO = fgOvA * (0.55 * exp(-2.2 * fgD * fgD) + 0.45 * (1.0 - smoothstep(0.35, 1.0, fgD)));
    outc.a += fgO * (1.0 - outc.a);
  }`

// Circle on the ground -> oval on screen: center and radius from body bones (weighted more the closer to the ground, falling from 1 to 0 between lo..hi meters above ground),
// radius = k × weighted standard deviation + r0, capped at rMax. Body bones only: props (tripod, Sheila turret) have their own contact shadow, including them would spread the oval over half the image.
// The bone closest to the ground sets the strength: in the air (picked up, free fall) the oval fades out
const BODY = ['def_l_ankle', 'def_r_ankle', 'def_l_ball', 'def_r_ball', 'def_l_knee', 'def_r_knee', 'def_c_hip',
  'def_l_wrist', 'def_r_wrist', 'def_c_spineC', 'def_c_head']
let bones = [], root = null
const _p = new THREE.Vector3(), _q = new THREE.Vector3()
function uv(stage, v) { _q.copy(v).project(stage.camera); return [_q.x * 0.5 + 0.5, _q.y * 0.5 + 0.5] }
export function ovalFrame(stage, petRoot, { ovA = 0.45, lo = 0.05, hi = 0.45, k = 1.3, r0 = 0.06, rMax = 0.45 } = {}) {
  let p = bones[0]
  while (p && p !== petRoot) p = p.parent
  if (!p || root !== petRoot) {   // first time / skin changed: find the bones again
    root = petRoot; bones = []
    petRoot.traverse(o => { if (o.isBone && BODY.includes(o.name)) bones.push(o) })
  }
  let sw = 0, sx = 0, sz = 0, wmax = 0
  const W = []
  for (const b of bones) {
    b.getWorldPosition(_p)
    const t = Math.min(1, Math.max(0, (_p.y - lo) / (hi - lo))), w = 1 - t * t * (3 - 2 * t)
    if (w <= 0) continue
    W.push([w, _p.x, _p.z]); sw += w; sx += w * _p.x; sz += w * _p.z; wmax = Math.max(wmax, w)
  }
  if (!sw) { PU.fgOvA.value = 0; return }
  const cx = sx / sw, cz = sz / sw
  let vx = 0, vz = 0
  for (const [w, x, z] of W) { vx += w * (x - cx) ** 2; vz += w * (z - cz) ** 2 }
  const rx = Math.min(rMax, k * Math.sqrt(vx / sw) + r0), rz = Math.min(rMax, k * Math.sqrt(vz / sw) + r0)
  const c0 = uv(stage, _p.set(cx, 0, cz)), ex = uv(stage, _p.set(cx + rx, 0, cz)), ez = uv(stage, _p.set(cx, 0, cz + rz))
  PU.fgOvC.value.set(c0[0], c0[1])
  PU.fgOvR.value.set(Math.max(1e-4, Math.hypot(ex[0] - c0[0], ex[1] - c0[1])), Math.max(1e-4, Math.hypot(ez[0] - c0[0], ez[1] - c0[1])))
  PU.fgOvA.value = ovA * wmax
}
