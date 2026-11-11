// Look "figure" (direction E, "collectible figure"): makes the miniature explicit - she is a PVC / painted resin figure on the desk, not a shrunken real person
// Built on lib/fix.js (bug fixes + parts like the eye catchlight), adding the figure feel:
//   materials: one uniform soft clear coat over everything (figureCoat in lib/figure_shade.js), fine normal-map detail flattened (skin reads as lacquered resin), skin SSS off
//   environment: procedural studio environment (softboxes + strip lights + reflector), softbox reflections visible in the clear coat
//   composite: analytic oval shadow under the feet (lib/figure_post.js), saturation slightly raised
//   eyes: fix's highlight-only cornea + a small camera-locked catchlight (like a dab of gloss on a figure's eyes)
// Diagnostic URL parameters (default = final): fg_<key>, see CFG
import { fixLook, faceNormal, skinOf, U } from './lib/fix.js'
import { figureCoat, paintClean, studioEnv, FU, PAINT } from './lib/figure_shade.js'
import { PU, DECL, FINAL, ovalFrame } from './lib/figure_post.js'

const q = new URLSearchParams(location.search)
const num = (k, d) => (q.has('fg_' + k) ? Number(q.get('fg_' + k)) : d)
const vec = (k, d) => (q.has('fg_' + k) ? q.get('fg_' + k).split(',').map(Number) : d)

const CFG = {
  env: num('env', 1.4), studio: num('studio', 1),     // total ambient; 1 = studio environment, 0 = three's RoomEnvironment
  toe: num('toe', 0.5), con: num('con', 1.08), sat: num('sat', 1.05),
  key: vec('key', [-2.0, 3.2, 3.8]), keyI: num('keyI', 3.0), rim: vec('rim', [3.0, 1.5]), fill: num('fill', 0.5),
  eskin: vec('eskin', [1.1, 0.35]), ecloth: vec('ecloth', [1, 0.35]), ehair: vec('ehair', [0.8, 0.5]),
  emetal: vec('emetal', [1, 0.8]), eeye: vec('eeye', [1, 0.5]),
  // clear coat [amount, roughness]
  cskin: vec('cskin', [0.2, 0.45]), ccloth: vec('ccloth', [0.25, 0.42]), chair: vec('chair', [0.7, 0.25]), cmetal: vec('cmetal', [0.6, 0.25]),
  cenv: num('cenv', 0.8), nk: vec('nk', [0.35, 0.5, 0.7]), rk: num('rk', 0.3),
  sss: num('sss', 0),
  paint: vec('paint', [3.5, 0.15, 0.2, 0.8]),          // paint: bias, fraction of small bumps kept, threshold t0..t1 (log2); second item 1 = off
  ci: num('ci', 2.3), cpx: num('cpx', 0.4), es: num('es', 0.5), fns: num('fns', 0.5),
  cs: vec('cs', [0.35, 0.7, 4, 0.55]),                    // contact shadow far / blur / darkness / alpha
  ov: num('ov', 0.45),                                   // oval shadow opacity
}
const SKIN = {
  base: { exp: 1.0 }, hp: { exp: 1.0 },
  rebecca: { exp: num('exr', 0.9), eskin: vec('rskin', [0.6, 0.35]) },
  bear: { exp: num('exb', 0.85) },
}

const base = fixLook({
  post: { toeK: CFG.toe, pivot: 0.45, decl: DECL, final: FINAL },
  sss: CFG.sss > 0 ? {} : false,
  cornea: { catchI: CFG.ci, catchPx: CFG.cpx, mask: q.get('fx_mask') === '1' },   // fx_mask=1: cornea outputs a constant (diagnostic: find the eye pixels)
  eyeShadow: CFG.es,
  env: { skin: CFG.eskin, cloth: CFG.ecloth, hair: CFG.ehair, metal: CFG.emetal, eye: CFG.eeye },
  specAA: {},
  cs: { far: CFG.cs[0], blur: CFG.cs[1], darkness: CFG.cs[2], alpha: CFG.cs[3] },
})
FU.fgCoatSkin.value.set(...CFG.cskin); FU.fgCoatCloth.value.set(...CFG.ccloth)
FU.fgCoatHair.value.set(...CFG.chair); FU.fgCoatMetal.value.set(...CFG.cmetal)
FU.fgCoatEnv.value = CFG.cenv; FU.fgRoughK.value = CFG.rk
PAINT.fgPaint.value.set(...CFG.paint)

let skin = null
export default {
  ...base,
  uniforms: { ...base.uniforms, ...PU },
  setup(stage, T) {
    base.setup(stage, T)
    if (CFG.studio) stage.scene.environment = studioEnv(stage.renderer)
    stage.scene.environmentIntensity = CFG.env
    stage.key.position.set(...CFG.key); stage.key.intensity = CFG.keyI
    stage.rim.intensity = CFG.rim[0]; stage.rim2.intensity = CFG.rim[1]; stage.fill.intensity = CFG.fill
    const u = stage.postMat.uniforms
    u.contrast.value = CFG.con; u.saturation.value = CFG.sat
  },
  material(m, mesh, st) {
    base.material(m, mesh, st)
    figureCoat(m, mesh, { normalK: CFG.nk })
    if (CFG.paint[1] < 1) paintClean(m, mesh)
    const s = skinOf(m)
    if (CFG.fns > 0 && s !== 'bear') faceNormal(m, mesh, { sphere: CFG.fns })
    // switching skins reloads the whole page: set exposure the first time the skin is recognized
    if (s && s !== skin) { skin = s; st.postMat.uniforms.exposure.value = SKIN[s].exp }
    // envSplit writes the shared U.fxEnv* back to generic values on every patch, so write the per-skin value again afterwards
    if (skin && SKIN[skin].eskin) U.fxEnvSkin.value.set(...SKIN[skin].eskin)
  },
  beforeRender(stage, petRoot, fx) {
    base.beforeRender(stage, petRoot, fx)
    ovalFrame(stage, petRoot, { ovA: CFG.ov })
  },
}
