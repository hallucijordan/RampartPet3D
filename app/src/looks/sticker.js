// Look "sticker" (direction D, "Apex sticker"): treats her as "an Apex sticker stuck on the desktop" rather than "a tiny real person standing on the taskbar"
// Built on the bug fixes of lib/fix.js (composite without black clipping, highlight-only cornea, hair cav, SSS, specAA), adding:
//   outside: pale warm grey die-cut border (bright line on the inner side) + translucent thin outer rim + dark brown inner outline (4th-power mean dilation, no flicker) + sticker drop shadow (replaces the ground contact shadow)
//         border width 3.2 px at size s, 100% scale, scaled with canvas height (up to 1.6×)   -> lib/sticker_border.js
//   shading: soft key light steps (light / dark groups + a third level for shadow / AO), the dark side is hued (cloth cool purple, skin warm red); cloth / skin direct and ambient specular lowered;
//         cloth albedo mip bias +1, normals ×0.6 (flatter color blocks)   -> lib/sticker_shade.js
//   eyes: same as fix (bug fixes only) - highlight-only cornea, no catchlight, no eyeliner, no face sphere normals (reviewed 2026-09-28: painted eyeliner looked more uncanny).
//         the three former items remain as switches: st_ci=1.5 catchlight, st_fns=0.5 face sphere normals, st_lid=1 eye area mask (smoky eye shadow lifted + upper lid rim darkened)
//   grading: display-space saturation 1.18 + soft chroma knee (>0.4 compressed, "saturated but no pure colors"), toe ×0.5, contrast 1.1; per-skin exposure
// Diagnostic URL parameters (default = final): st_bw border width px, st_sig blur σ, st_ds shadow opacity, st_rim / st_rimw thin outer rim, st_aa border transition width,
//   st_cream / st_creamin border color (sRGB r,g,b), st_ola inner outline opacity, st_ci / st_cpx catchlight peak / σ, st_env ambient, st_key key light position,
//   st_ki key intensity, st_sat saturation, st_ck / st_cs chroma knee / compression, st_con contrast, st_exp exposure multiplier, st_mb / st_nk cloth mip bias / normal multiplier,
//   stShade stSoft stSoftFace stTh stThFace stForm stSpec=cloth,skin,hair,metal stLidDark stLidK (steps and eye area),
//   switches: st_ramp=0 st_flat=0 st_chroma=0; st_lines=1 enables interior ink lines (off by default: interior flicker under sub-pixel motion p99 2.6 -> 6.9, above cur)
import { fixLook, frame, report, skinOf } from './lib/fix.js'
import { stickerBorder } from './lib/sticker_border.js'
import { stickerRamp, lidLine, flatten, shadeFrame, SU } from './lib/sticker_shade.js'

const q = new URLSearchParams(location.search)
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d)
const on = (k) => q.get(k) !== '0'

const border = stickerBorder({
  bw: num('st_bw', 3.2), sigma: num('st_sig', 1.8), dsA: num('st_ds', 0.26), rimA: num('st_rim', 0.42),
  rimW: num('st_rimw', 0.9), aa: num('st_aa', 1.0),
  // border color: pale warm grey band + a brighter line hugging the outline (the grey border of Apex's stickerdrop series, brightened). Pure cream vanishes entirely on white windows, leaving only the thin outer rim
  cream: (q.get('st_cream') || '0.88,0.87,0.85').split(',').map(Number),
  creamIn: (q.get('st_creamin') || '0.97,0.96,0.94').split(',').map(Number),
})

// Grading (display space): soft chroma knee, high-chroma gear colors (neon green, pure orange) pulled into the sticker palette, mid / low chroma untouched
const CHROMA = on('st_chroma') ? `
  {
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    vec3 dv = col - l; float c = length(dv);
    float cc = c <= stCk ? c : stCk + (c - stCk) / (1.0 + (c - stCk) * stCs);
    col = clamp(l + dv * (cc / max(c, 1e-5)), 0.0, 1.0);
  }` : ''

// Interior ink lines: at depth discontinuities (arm over the body, gun over the leg...) draw a 1 px dark brown line on the "far side" (same rule as the outer outline).
// Only inside the character (alpha > 0.5); the face is a continuous surface and the bangs are within the threshold of the forehead, so no lines there
const LINES = q.get('st_lines') === '1' ? `
  {
    // test each of the 4 render pixels under the output pixel (neighbors at ±1 output pixel), average as coverage: the line gets 1/4-step anti-aliasing instead of 1 px jaggies
    vec2 t = charTexel;
    float ln = stEdge(vUv + t * vec2(-0.5, -0.5)) + stEdge(vUv + t * vec2(0.5, -0.5)) + stEdge(vUv + t * vec2(-0.5, 0.5)) + stEdge(vUv + t * vec2(0.5, 0.5));
    col = mix(col, toSRGB(outlineColor), 0.25 * ln * stLineA * smoothstep(0.5, 0.9, a));
  }` : ''
const LINES_DECL = `
uniform sampler2D tDepth; uniform float stNear; uniform float stFar; uniform float stLineThr; uniform float stLineA;
float stLinZ(vec2 uv) { float d = texture2D(tDepth, uv).r; return stNear * stFar / (stFar - d * (stFar - stNear)); }
// whether this render pixel is next to "something in front" (a neighbor closer by more than thr): soft threshold thr..3·thr, so the line fades in and out as the gap changes slowly, no popping
float stEdge(vec2 uv) {
  vec2 o = charTexel * 2.0;
  float z0 = stLinZ(uv), m = 0.0;
  m = max(m, z0 - stLinZ(uv + vec2(o.x, 0.0)));  m = max(m, z0 - stLinZ(uv - vec2(o.x, 0.0)));
  m = max(m, z0 - stLinZ(uv + vec2(0.0, o.y)));  m = max(m, z0 - stLinZ(uv - vec2(0.0, o.y)));
  return smoothstep(stLineThr, stLineThr * 3.0, m);
}`

// Per-skin exposure (the Rebecca skin is bright, the Bear skin whitish, both overexpose easily)
const EXPO = { base: 1.0, hp: 1.0, rebecca: 0.9, bear: 0.9 }

const base = fixLook({
  post: {
    toeK: 0.5,
    decl: border.decl + '\nuniform float stCk; uniform float stCs;' + (LINES ? LINES_DECL : ''),
    display: LINES + CHROMA,
    final: border.final,
  },
  cornea: { catchI: num('st_ci', 0), catchPx: num('st_cpx', 0.4), mask: q.get('fx_mask') === '1' },
  eyeShadow: 1,
  env: { skin: [1, 0.5], cloth: [1, 0.45], hair: [1, 0.6], metal: [1, 0.85] },
  faceN: q.has('st_fns') ? { sphere: num('st_fns', 0.5) } : null,
  specAA: {},
  cs: { alpha: 0 },   // ground contact shadow off: a sticker has no floor, the shadow comes from the offset shadow of the die-cut border
})

const UNI = {
  ...base.uniforms, ...border.uniforms, stCk: { value: num('st_ck', 0.4) }, stCs: { value: num('st_cs', 1.5) },
  stNear: { value: 0.5 }, stFar: { value: 60 }, stLineThr: { value: num('st_lt', 0.025) }, stLineA: { value: num('st_la', 0.75) },
}
// Dark brown inner outline: stage's outline takes the max of 12 point samples (dilation); under sub-pixel motion the max jumps between sample points,
// and dark brown on cream is very high contrast, measured as the main source of edge flicker (TL p99 15 -> 7.4 without the outline). Replaced by a 4th-power mean (a smooth "soft max")
let postFrag = base.postFrag
const INK = [
  ['dil = max(dil, texture2D(tChar, vUv + vec2(cos(ang), sin(ang)) * px).a);',
    '{ float t = texture2D(tChar, vUv + vec2(cos(ang), sin(ang)) * px).a; t *= t; dil += t * t; }'],
  ['float ol = clamp(dil - a, 0.0, 1.0) * outlineAlpha;', 'dil = sqrt(sqrt(dil / 12.0));\n  float ol = clamp(dil - a, 0.0, 1.0) * outlineAlpha;'],
]
for (const [a, b] of INK) {
  if (postFrag.includes(a)) postFrag = postFrag.replace(a, b)
  else console.error('sticker: outline replacement missed', a.slice(0, 40))
}

let skinMesh = null, skin = null, lastSkin
export default {
  ...base,
  postFrag,
  uniforms: UNI,
  depthTexture: !!LINES,
  fxLate: true,   // sparks and dust don't get the sticker border (with it they become a string of cream-bordered beads)
  setup(stage, T) {
    base.setup(stage, T)
    if (q.has('stSpec')) SU.stSpec.value.set(...q.get('stSpec').split(',').map(Number))
    SU.stMipB.value = num('st_mb', 1)
    for (const k of ['stShade', 'stSoft', 'stSoftFace', 'stTh', 'stThFace', 'stForm', 'stLidDark', 'stLidK']) if (q.has(k)) SU[k].value = Number(q.get(k))
    stage.scene.environmentIntensity = num('st_env', 0.5)
    stage.key.position.set(...(q.get('st_key') || '-2.6,3.2,3.0').split(',').map(Number))
    stage.key.intensity = num('st_ki', 2.6)
    stage.rim.intensity = 2.4
    stage.rim2.intensity = 1.2
    const u = stage.postMat.uniforms
    u.saturation.value = num('st_sat', 1.18)
    u.contrast.value = num('st_con', 1.1)
    u.outlineColor.value.setHex(0x2b1a10)   // dark brown of the sticker's main outline (sRGB value, three converts to linear, fix's composite converts back)
    u.outlineAlpha.value = num('st_ola', 0.85)
    u.outlineWidth.value = 1.0
  },
  material(m, mesh, st) {
    base.material(m, mesh, st)
    if (on('st_ramp')) stickerRamp(m, mesh)
    if (q.get('st_lid') === '1') lidLine(m, mesh)
    if (on('st_flat')) flatten(m, mesh, { bias: num('st_mb', 1), normal: num('st_nk', 0.6) })
    const s = skinOf(m)
    if (s && /_head$/.test(m.name.toLowerCase())) { skinMesh = mesh; skin = s }
  },
  resize(stage, w, h) { border.resize(stage, w, h) },
  // die-cut border, thin outer rim and shadow are drawn outside the silhouette: shift the whole image up by this much (CSS px) so the ring under the feet lands on the ground line, not cut off or covered by the taskbar / HUD
  liftPx(stage) { const u = border.uniforms; return Math.ceil((u.stBw.value + u.stRimW.value - u.stDsOff.value.y * stage.outH) / stage.dpr) },
  beforeRender(stage, petRoot) {
    frame(stage, petRoot)
    shadeFrame(stage)
    UNI.stNear.value = stage.camera.near; UNI.stFar.value = stage.camera.far
    // current skin: reuse the remembered head mesh if it's still under petRoot, otherwise (skin changed) recognize it from the new materials
    let p = skinMesh
    while (p && p !== petRoot) p = p.parent
    if (!p) {
      skinMesh = petRoot; skin = null   // if no head is found remember petRoot, to avoid traversing every frame
      petRoot.traverse(o => {
        const s = o.isMesh && !skin && /_head$/.test((o.material?.name || '').toLowerCase()) ? skinOf(o.material) : null
        if (s) { skin = s; skinMesh = o }
      })
    }
    // write exposure only when the skin changes (the developer panel exposure slider still works otherwise)
    if (skin !== lastSkin) { lastSkin = skin; stage.postMat.uniforms.exposure.value = (EXPO[skin] ?? 1) * num('st_exp', 1) }
  },
  afterChar(stage) {
    border.afterChar(stage)
    report('FIX')
  },
}
