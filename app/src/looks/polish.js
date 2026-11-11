// Look "polish" (direction A, "game original, corrected"): no style change, the render is fixed up to "the person in the game lobby preview" - properly lit, eyes that read as eyes.
// Built on lib/fix.js (bug fixes), adding only taste items here:
//   composite: display-space contrast (no clipping), toe ×0.5, saturation 1.0; one exposure per skin (median L* matched to the game preview); dark brown outline
//   lights: ambient 0.45 -> 0.8, IBL [diffuse, specular] per material class (skin slightly up so the face leads, cloth slightly down to regain depth); key light elevation 39° -> 28°, slightly warmer;
//         rim lights 4/2 -> 3/1.5; cloth direct specular discounted (HP silk pants not satin-shiny)
//   eyes: cornea highlight only + small camera-locked catchlight; cornea IBL reflection halved; eyelid shadow shell halved; face sphere normals 0.5 (not on the Bear skin's plush head);
//         base skin / HP borrow sticker's lid line mask (smoky makeup lifted a bit + upper lash line), the highlight only reads as "eyes looking at you" when framed by the dark lid line
//   materials: hair cav multiplies specular, skin SSS active (fix defaults); specular anti-aliasing
//   contact shadow: only within 0.35 m of the ground; when picked up / dropping in (canvas off the ground) fades out by pixels above ground, no longer floating in midair with her
// Zero extra passes: all shader patches and parameters. Hit testing (hitMode) goes through fix's composite, unaffected.
// URL parameters (diagnostics, defaults are final): pl_<CFG key>, e.g. pl_env=0.9, pl_eskin=1,0.5, pl_cs=0.35,0.7,4,0.7, pl_exp=1 (exposure for all skins)
import { fixLook, faceNormal, envSplit, expandChunk, matClass, skinOf, STATS, U } from './lib/fix.js'
import { lidLine, SU } from './lib/sticker_shade.js'
import { patchShader } from '../materials.js'

const q = new URLSearchParams(location.search)
const num = (k, d) => (q.has('pl_' + k) ? Number(q.get('pl_' + k)) : d)
const vec = (k, d) => (q.has('pl_' + k) ? q.get('pl_' + k).split(',').map(Number) : d)

const CFG = {
  env: num('env', 0.8),                    // total ambient (previously 0.45)
  toe: num('toe', 0.5),                    // PBR Neutral shadow offset multiplier
  con: num('con', 1.10),                   // display-space contrast (pivot 0.45, no clipping)
  sat: num('sat', 1.0),
  key: vec('key', [-2.0, 3.2, 3.8]),       // key light position (previously -2.2,4.2,3.4: elevation 39° -> 28°, lighter shadow under the brow)
  keyI: num('keyI', 3.0),
  kcol: q.get('pl_kcol') || 'fff0dd',      // key light color (sRGB hex; previously fff0dd)
  rim: vec('rim', [3.0, 1.5]),             // the two rim lights (previously 4 / 2)
  // IBL [diffuse, specular] per material class, multiplied onto env
  envSkin: vec('eskin', [1, 0.5]), envCloth: vec('ecloth', [1, 0.45]), envHair: vec('ehair', [0.8, 0.7]),
  envMetal: vec('emetal', [1, 1]), envEye: vec('eeye', [1, 0.5]),   // cornea reflection halved: no grey film over the eyes, the catchlight shows more
  cspec: num('cspec', 1),                  // cloth direct specular multiplier (metal pixels blend back to 1 by metalness)
  ci: num('ci', 2), cpx: num('cpx', 0.4),  // catchlight peak (linear HDR) / σ (output pixels)
  lid: vec('lid', [0, 1]),                // lid line mask [smoky makeup lift stLidK, lash line darkening stLidDark]; 0 = no patch
  es: num('es', 0.5),                      // eyelid shadow shell opacity
  fns: num('fns', 0.5),                    // face sphere normals
  saa: num('saa', 1),                      // specular anti-aliasing
  ol: vec('ol', [0.5, 26, 18, 13]),        // outline [alpha, r, g, b] (sRGB 0..255; previously 0.5, 1a120d)
  cs: vec('cs', [0.35, 0.7, 4, 0.7]),      // contact shadow far / blur / darkness / alpha
  lift: num('lift', 12),                   // CSS px of canvas above ground at which the contact shadow has faded to 0
}
// Per skin: exposure (post exposure; median L* matched to the game preview: base skin about 40, HP about 50, Bear skin about 60);
// Rebecca's face is already pale, skin-class ambient diffuse lowered to 0.6 so the face sits at L* about 70 without washing out (body exposure 0.9 keeps the jacket)
const SKIN = {
  base: { exp: 1.0 }, hp: { exp: 1.0 },
  rebecca: { exp: num('exr', 0.9), envSkin: vec('rskin', [0.6, 0.5]) },
  bear: { exp: num('exb', 0.85) },
}
if (q.has('pl_exp')) for (const k in SKIN) SKIN[k].exp = num('exp', 1)

const base = fixLook({
  post: { toeK: CFG.toe, pivot: 0.45 },
  cornea: { catchI: CFG.ci, catchPx: CFG.cpx },
  eyeShadow: CFG.es,
  specAA: CFG.saa > 0 ? {} : null,
  cs: { far: CFG.cs[0], blur: CFG.cs[1], darkness: CFG.cs[2], alpha: CFG.cs[3] },
})

// Cloth direct specular: the satin look of the HP silk pants is mostly key / rim direct specular (lowering IBL specular to 0.25 makes no visible difference).
// Same approach as sticker's stSpecK: a global set per pixel after metalness is computed, multiplied in RE_Direct
const PU = { plClothSpec: { value: CFG.cspec } }
const DSPEC = 'reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;'
function rep(src, a, b, name) {
  if (!src.includes(a)) console.error('polish patch missed', name, a.slice(0, 40))   // console.error: bench marks FAIL
  return src.replace(a, b)
}
function clothSpec(m, mesh) {
  if (!m.isMeshStandardMaterial || matClass(m, mesh) !== 'cloth' || CFG.cspec === 1) return
  patchShader(m, 'plClothSpec', (sh) => {
    sh.uniforms.plClothSpec = PU.plClothSpec
    let fs = expandChunk('uniform float plClothSpec; float plSpecK = 1.0;\n' + sh.fragmentShader, 'lights_physical_pars_fragment')
    fs = rep(fs, DSPEC, DSPEC.replace('+= ', '+= plSpecK * '), m.name)
    fs = rep(fs, '#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      plSpecK = mix( plClothSpec, 1.0, smoothstep( 0.3, 0.7, metalnessFactor ) );`, m.name)
    sh.fragmentShader = fs
  })
}

let skin = null, csBase = null
const missed = new Set()
export default {
  ...base,
  setup(stage, T) {
    base.setup(stage, T)
    stage.scene.environmentIntensity = CFG.env
    stage.key.position.set(...CFG.key); stage.key.intensity = CFG.keyI; stage.key.color.set('#' + CFG.kcol)
    stage.rim.intensity = CFG.rim[0]; stage.rim2.intensity = CFG.rim[1]
    const u = stage.postMat.uniforms
    u.contrast.value = CFG.con; u.saturation.value = CFG.sat
    u.outlineAlpha.value = CFG.ol[0]
    u.outlineColor.value.setRGB(CFG.ol[1] / 255, CFG.ol[2] / 255, CFG.ol[3] / 255, T.SRGBColorSpace)   // stored linear, toSRGB in postFix
    // per-class IBL multipliers are written only here (envSplit without a class doesn't write the shared uniforms)
    U.fxEnvSkin.value.set(...CFG.envSkin); U.fxEnvCloth.value.set(...CFG.envCloth); U.fxEnvHair.value.set(...CFG.envHair)
    U.fxEnvMetal.value.set(...CFG.envMetal); U.fxEnvEye.value.set(...CFG.envEye)
    SU.stLidK.value = CFG.lid[0]; SU.stLidDark.value = CFG.lid[1]
  },
  material(m, mesh, st) {
    base.material(m, mesh, st)
    envSplit(m, mesh)
    clothSpec(m, mesh)
    const s = skinOf(m)
    if (CFG.fns > 0 && s !== 'bear') faceNormal(m, mesh, { sphere: CFG.fns })
    if (CFG.lid[0] > 0 || CFG.lid[1] < 1) lidLine(m, mesh)   // only for the base skin / HP head (lidLine decides itself)
    // switching skins reloads the whole page, one skin per page: set exposure and skin-class IBL the first time the skin is recognized
    if (s && !skin) {
      skin = s
      st.postMat.uniforms.exposure.value = SKIN[s].exp
      if (SKIN[s].envSkin) U.fxEnvSkin.value.set(...SKIN[s].envSkin)
    }
  },
  beforeRender(stage, petRoot, fx) {
    base.beforeRender(stage, petRoot, fx)
    // when picked up / dropping in she still stands on the ground in 3D, so the contact shadow would float in midair with the canvas: fade out by canvas pixels above ground.
    // not written while grounded, so the dev panel shadow slider still works
    const w = window.__pet?.world, k = w ? Math.min(Math.max(1 - (w.floor - w.y) / CFG.lift, 0), 1) : 1
    const sa = stage.postMat.uniforms.shadowAlpha
    if (k < 1) { csBase ??= sa.value; sa.value = csBase * k } else if (csBase !== null) { sa.value = csBase; csBase = null }
  },
  afterChar(stage, petRoot) {
    base.afterChar(stage, petRoot)
    // fix's parts only console.warn on a miss; escalated to console.error here so bench marks FAIL
    for (const [part, mm] of Object.entries(STATS)) for (const [n, v] of mm) {
      if (v.startsWith('miss') && !missed.has(part + n)) { missed.add(part + n); console.error('polish patch missed', part, n, v) }
    }
  },
}
