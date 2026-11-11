// Materials and environment for the figure look (direction E): one uniform soft clear coat over everything + a softbox-style studio environment
// Only runtime shader and render parameters change, no model / texture files; the environment is a procedurally generated equirectangular map (no geometry at all)
import * as THREE from 'three'
import { patchShader } from '../../materials.js'
import { STATS, matClass, isCornea, isEyeShadow } from './fix.js'

// Shared uniforms: one [clear coat amount, clear coat roughness] per class, metal blended in per pixel by metalness
export const FU = {
  fgCoatSkin: { value: new THREE.Vector2(0.2, 0.45) },    // skin keeps only a very thin satin layer: a face shiny like plastic becomes a doll (classic uncanny valley spot)
  fgCoatCloth: { value: new THREE.Vector2(0.25, 0.42) },
  fgCoatHair: { value: new THREE.Vector2(0.7, 0.25) },    // hair is the shiniest: figure hair is one solid piece of glossy PVC
  fgCoatMetal: { value: new THREE.Vector2(0.6, 0.25) },
  fgCoatEnv: { value: 0.8 },          // clear coat environment reflection multiplier (softbox reflections)
  fgRough: { value: new THREE.Vector3(0.55, 0.6, 0.45) },   // base coat roughness pulled toward this value: skin / cloth / hair
  fgRoughK: { value: 0.3 },           // how far to pull (0 = keep the texture's roughness variation)
}
function mark(name, ok) { (STATS.coat ||= new Map()).set(name, ok ? 'hit' : 'miss:no include') }

// Clear coat: borrows the clearcoat path built into three's physical material (USE_CLEARCOAT: one direct GGX lobe + one environment reflection lobe + Fresnel energy handoff to the base layer),
// the standard material has no such switch, so the define and uniforms are added here, then material.clearcoat* is set per class after lights_physical_fragment.
// The clear coat normal is the geometric normal (three's default), so fine normal-map detail doesn't reach this layer: one smooth lacquer over the whole body.
// normalK: normal map strength multipliers [skin, cloth, hair] (a figure has no pores / weave, only big sculpted folds)
export function figureCoat(mat, mesh, { normalK = [0.35, 0.5, 0.7] } = {}) {
  if (!mat.isMeshStandardMaterial || isCornea(mesh) || isEyeShadow(mesh)) return false
  const c = matClass(mat, mesh)
  if (c === 'eye') return false
  const nk = { skin: normalK[0], cloth: normalK[1], hair: normalK[2] }[c]
  if (mat.normalScale && nk !== 1) mat.normalScale.multiplyScalar(nk)
  const cls = 'fgCoat' + c[0].toUpperCase() + c.slice(1)
  const ri = { skin: 'x', cloth: 'y', hair: 'z' }[c]
  const metal = c !== 'hair'
  patchShader(mat, 'fgCoat_' + c, (sh) => {
    sh.defines = { ...(sh.defines || {}), USE_CLEARCOAT: '' }
    Object.assign(sh.uniforms, FU, { clearcoat: { value: 0 }, clearcoatRoughness: { value: 0.3 } })
    let f = 'uniform vec2 fgCoatSkin; uniform vec2 fgCoatCloth; uniform vec2 fgCoatHair; uniform vec2 fgCoatMetal; uniform float fgCoatEnv; uniform vec3 fgRough; uniform float fgRoughK;\n' + sh.fragmentShader
    const A = '#include <lights_physical_fragment>', B = '#include <lights_fragment_end>'
    if (!f.includes(A) || !f.includes(B)) { mark(mat.name, false); sh.fragmentShader = f; return }
    f = f.replace(A, `${A}
      {
        vec2 fgC = ${cls};
        ${metal ? 'fgC = mix( fgC, fgCoatMetal, smoothstep( 0.3, 0.7, metalnessFactor ) );' : ''}
        material.clearcoat = fgC.x;
        material.clearcoatRoughness = min( max( fgC.y, 0.0525 ) + geometryRoughness, 1.0 );
        material.roughness = mix( material.roughness, fgRough.${ri}, fgRoughK );
      }`)
    f = f.replace(B, `clearcoatRadiance *= fgCoatEnv;\n    ${B}`)
    mark(mat.name, true)
    sh.fragmentShader = f
  })
  return true
}

// "Paint": flattens same-color small variations in the albedo (stains, weave, wear), keeps large or differently colored patterns (stripes, logos, prints, color splits) as is.
// Low-frequency base color = a high-bias mip of the same texture. Only the luminance ratio changes (hue kept); the core is coring: |log2 ratio| < t0 shrinks to k×, > t1 untouched;
// areas whose hue differs a lot from the base (prints) are untouched too.
// Only for cloth / metal classes (not head or hair: the 3 px eyes and brows on the face are detail that must not be flattened)
export const PAINT = { fgPaint: { value: new THREE.Vector4(3.5, 0.15, 0.2, 0.8) } }   // bias, k, t0, t1
export function paintClean(mat, mesh) {
  if (!mat.isMeshStandardMaterial || !mat.map || matClass(mat, mesh) !== 'cloth') return false
  patchShader(mat, 'fgPaint', (sh) => {
    Object.assign(sh.uniforms, PAINT)
    const A = '#include <map_fragment>'
    let f = 'uniform vec4 fgPaint;\n' + sh.fragmentShader
    if (!f.includes(A)) { (STATS.paint ||= new Map()).set(mat.name, 'miss:no map_fragment'); sh.fragmentShader = f; return }
    f = f.replace(A, `${A}
    {
      vec3 fgW = vec3( 0.2126, 0.7152, 0.0722 );
      vec3 fgLc = texture2D( map, vMapUv, fgPaint.x ).rgb;
      float fgHi = max( dot( sampledDiffuseColor.rgb, fgW ), 1e-3 );
      float fgLo = max( dot( fgLc, fgW ), 1e-3 );
      float fgL = log2( fgHi / fgLo );
      float fgDc = length( sampledDiffuseColor.rgb / fgHi - fgLc / fgLo );   // hue difference: prints and color splits differ from the base color, stains are just the same color darker
      float fgK = mix( fgPaint.y, 1.0, max( smoothstep( fgPaint.z, fgPaint.w, abs( fgL ) ), smoothstep( 0.08, 0.25, fgDc ) ) );
      diffuseColor.rgb *= exp2( fgL * ( fgK - 1.0 ) );
    }`)
    ;(STATS.paint ||= new Map()).set(mat.name, 'hit')
    sh.fragmentShader = f
  })
  return true
}

// Studio environment: grey gradient studio (bright top, dark bottom) + one big softbox upper front left + two strip lights back right and back left + a white reflector low in front.
// World coordinates: camera at +z looking at -z, y up. box: [direction x,y,z, half width °, half height °, brightness, r, g, b]
const BOXES = [
  [-0.55, 0.55, 0.62, 26, 20, 5.0, 1.0, 0.97, 0.93],   // main softbox: upper front left
  [0.78, 0.35, -0.52, 5, 32, 4.0, 1.0, 0.95, 0.88],    // back right strip light (rim)
  [-0.75, 0.3, -0.58, 5, 30, 2.2, 0.85, 0.92, 1.0],    // back left strip light (cool)
  [0.35, -0.12, 0.93, 30, 12, 1.1, 1.0, 1.0, 1.0],     // low front reflector
]
export function studioEnv(renderer, { boxes = BOXES, top = [0.42, 0.43, 0.45], mid = [0.26, 0.26, 0.26], floor = [0.1, 0.09, 0.08], soft = 4 } = {}) {
  const W = 256, H = 128, data = new Float32Array(W * H * 4)
  const B = boxes.map(([x, y, z, hw, hh, L, r, g, b]) => {
    const c = new THREE.Vector3(x, y, z).normalize()
    const rt = new THREE.Vector3(0, 1, 0).cross(c).normalize()   // the box's "right" (horizontal)
    const up = c.clone().cross(rt).normalize()
    return { c, rt, up, hw: hw * Math.PI / 180, hh: hh * Math.PI / 180, col: [r * L, g * L, b * L] }
  })
  const s = soft * Math.PI / 180, d = new THREE.Vector3()
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t) }
  for (let j = 0; j < H; j++) {
    const lat = ((j + 0.5) / H - 0.5) * Math.PI, cy = Math.sin(lat), cr = Math.cos(lat)
    for (let i = 0; i < W; i++) {
      const phi = ((i + 0.5) / W - 0.5) * 2 * Math.PI
      d.set(Math.cos(phi) * cr, cy, Math.sin(phi) * cr)   // inverse of three's equirectUv
      // studio base color: above the horizon from mid to top, below it drops quickly to floor (the desk)
      const t = cy > 0 ? Math.pow(cy, 0.6) : 0, fl = ss(0, -0.25, cy)
      const col = [0, 1, 2].map(k => (mid[k] + (top[k] - mid[k]) * t) * (1 - fl) + floor[k] * fl)
      for (const b of B) {
        const z = d.dot(b.c); if (z <= 0) continue
        const ax = Math.abs(Math.atan2(d.dot(b.rt), z)), ay = Math.abs(Math.atan2(d.dot(b.up), z))
        const m = ss(b.hw + s, b.hw - s, ax) * ss(b.hh + s, b.hh - s, ay)
        for (let k = 0; k < 3; k++) col[k] += b.col[k] * m
      }
      const o = (j * W + i) * 4
      data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 1
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  const pm = new THREE.PMREMGenerator(renderer)
  const env = pm.fromEquirectangular(tex).texture
  pm.dispose(); tex.dispose()
  return env
}
