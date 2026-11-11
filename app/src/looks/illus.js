// Look "illus": direction C, "illustrated PBR". Built on lib/fix.js (bug fixes + polish parts), with the light/shade organization of lib/illus_shade.js on top.
// Tuned over two review rounds (v2); parameter notes are inline here and in lib/illus_shade.js
// polish layer (shared by both; with il=0 only this layer + direction A's lights remain, as the control):
//   composite toe ×0.5, contrast / saturation in display space; cornea highlight only + catchlight (the default accepted for the foundation); eyelid shadow shell ×0.5;
//   IBL specular reduced per class (skin 0.5, cloth 0.45, hair 0.7); face sphere normals 0.5; specular anti-aliasing; contact shadow only under the feet; rim lights 3 / 1.5
// illustration layer: key light warm, slightly from the side, half-Lambert soft step, the dark side keeps a slightly cool shade (not black), shadows merged into the step, halved on the face; ambient 0.7;
//   the face is the value focus (head focus brightening + frontal face light + eye socket fill); cloth direct specular ×0.6; dark brown outline 0.8
//   eye area: base skin / HP borrow sticker's lidLine (smoky eye shadow lifted toward skin tone, a dark lash line on the upper lid rim), eyes read as "dark almond + small highlight" rather than "pale purple blotch + white dot"
//   per skin: exposure, face organization multiplier, Rebecca skin-class ambient diffuse 0.6 (same as polish), set once at load
// URL parameters (tuning / ablation; defaults are final, last one wins for duplicates): il=0 illustration layer off; il_env ambient; il_key=x,y,z key light position; il_kcol=ffe6cc key light color;
//   il_ki key intensity; il_exp exposure multiplier (on top of per-skin exposure); il_ramp=0 key light falls back to Lambert (ablation)
//   il_th / il_soft / il_fsoft / il_shade / il_tint=r,g,b / il_fcast / il_spec=cloth,skin,hair,metal / il_focus=k,r0,r1 / il_front=k,r0,r1 / il_sock=k,σ
//   il_ol=alpha,r,g,b (outline, color 0..255 sRGB) il_ci catchlight il_es eyelid shadow shell il_fns face sphere normals il_toe il_con il_sat
//   il_lid=k,dark (eye area mask strength, lash line darkening; 0 off) il_rskin=diffuse,specular (Rebecca skin-class ambient)
import { fixLook, skinOf, U } from './lib/fix.js'
import { illusShade, illusFrame, illusReport, IL, BASE } from './lib/illus_shade.js'
import { lidLine, SU } from './lib/sticker_shade.js'

const q = new URLSearchParams(location.search)
const last = (k) => q.getAll(k).at(-1)   // duplicate parameters: last one wins (later ones override earlier ones in sweeps)
const num = (k, d) => (q.has(k) ? Number(last(k)) : d)
const vec = (k, d) => (q.has(k) ? last(k).split(',').map(Number) : d)
const on = q.get('il') !== '0'

const base = fixLook({
  post: { toeK: num('il_toe', 0.5) },
  cornea: { catchI: num('il_ci', 2) },
  eyeShadow: num('il_es', 0.5),
  env: { skin: [1, 0.5], cloth: [1, 0.45], hair: [1, 0.7] },
  faceN: { sphere: num('il_fns', 0.5) },
  specAA: {},
})

// Per skin (switching skins reloads the whole page, set once when the skin is first recognized): exposure, face organization (focus / frontal light / socket fill) multiplier, skin-class ambient [diffuse, specular]
// Rebecca: her skin is already pale, brightening the face further makes a white mask -> face organization off, skin-class ambient diffuse 0.6 (polish's approach), exposure 0.9 to keep the jacket; the Bear skin is bright overall
const SKIN = on
  ? { base: { exp: 1.04, face: 1 }, hp: { exp: 1.02, face: 1 }, rebecca: { exp: 0.9, face: 0, envSkin: vec('il_rskin', [0.6, 0.5]) }, bear: { exp: 0.85, face: 0.4 } }
  : { base: { exp: 1.0, face: 1 }, hp: { exp: 1.0, face: 1 }, rebecca: { exp: 0.85, face: 1 }, bear: { exp: 0.85, face: 1 } }
let skin = null

// Lights: the illustration layer uses a key light a bit more from the side, warmer and stronger, and weaker ambient (the dark side is held up by the step's shade, never black);
// the polish control (il=0) uses direction A's lights: key near the camera, ambient 0.8
const LIGHT = on
  ? { env: 0.7, key: [-2.4, 3.0, 3.4], ki: 3.4, kcol: 'ffe6cc' }
  : { env: 0.8, key: [-1.8, 3.0, 4.0], ki: 3.0, kcol: 'fff0dd' }

// URL overrides of the library defaults (the defaults are final, defined in lib/illus_shade.js)
const set3 = (u, v) => u.value.set(...v)
if (q.has('il_th')) IL.ilTh.value = num('il_th')
if (q.has('il_soft')) IL.ilSoft.value = num('il_soft')
if (q.has('il_fsoft')) IL.ilFaceSoft.value = num('il_fsoft')
if (q.has('il_shade')) IL.ilShade.value = num('il_shade')
if (q.has('il_tint')) set3(IL.ilTint, vec('il_tint'))
if (q.has('il_fcast')) IL.ilFaceCast.value = num('il_fcast')
if (q.has('il_spec')) set3(IL.ilSpec, vec('il_spec'))
if (q.has('il_focus')) { const v = vec('il_focus'); BASE.focus = v[0]; IL.ilFocus.value.set(...v) }
if (q.has('il_front')) { const v = vec('il_front'); BASE.front = v[0]; IL.ilFront.value.set(...v) }
if (q.has('il_sock')) { const v = vec('il_sock'); BASE.sock = v[0]; IL.ilSocket.value.y = v[1] ?? IL.ilSocket.value.y }
if (q.get('il_ramp') === '0') IL.ilRamp.value = 1
const LID = vec('il_lid', [1, 0.35])
SU.stLidK.value = LID[0]; SU.stLidDark.value = LID[1] ?? 0.35

export default {
  ...base,
  setup(stage, T) {
    base.setup(stage, T)
    stage.scene.environmentIntensity = num('il_env', LIGHT.env)
    stage.key.position.set(...vec('il_key', LIGHT.key))
    stage.key.color.set('#' + (last('il_kcol') || LIGHT.kcol))
    stage.key.intensity = num('il_ki', LIGHT.ki)
    stage.rim.intensity = 3.0
    stage.rim2.intensity = 1.5
    const u = stage.postMat.uniforms
    u.contrast.value = num('il_con', 1.06)
    u.saturation.value = num('il_sat', 1.0)
    if (on) {
      const ol = vec('il_ol', [0.8, 42, 26, 16])
      u.outlineAlpha.value = ol[0]
      u.outlineColor.value.setRGB(ol[1] / 255, ol[2] / 255, ol[3] / 255, T.SRGBColorSpace)   // stored linear, toSRGB in postFix
    }
  },
  material(m, mesh, st) {
    base.material(m, mesh, st)
    const s = skinOf(m)
    if (s && s !== skin) { skin = s; st.postMat.uniforms.exposure.value = num('il_exp', 1) * (SKIN[s] || SKIN.base).exp }   // set once, the dev panel exposure slider still works
    // envSplit writes the shared U.fxEnv* back to generic values on every patch (including props loaded later), so write the per-skin value again afterwards (same as polish)
    const es = SKIN[skin]?.envSkin
    if (es) U.fxEnvSkin.value.set(...es)
    if (!on) return
    illusShade(m, mesh)
    if (LID[0] > 0) lidLine(m, mesh)
  },
  beforeRender(stage, root, fx) {
    base.beforeRender(stage, root, fx)
    if (on) illusFrame(stage, root, (SKIN[skin] || SKIN.base).face)
  },
  afterChar(stage, root) {
    base.afterChar(stage, root)
    illusReport()
  },
}
