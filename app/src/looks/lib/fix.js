// Shared foundation for looks: fixes for the render bugs confirmed by diagnosis, plus a few small parts every direction uses.
// Every part counts "hits" in the shader: a replacement target not found is recorded as miss, and after the character is first drawn console.warn prints a one-line summary (visible in bench's errors.json).
// Usage:
//   import { fixLook } from './lib/fix.js'
//   export default fixLook({ ...options })              // use directly as a look
//   or assemble single parts yourself: postFix / skinSSS / cornea / eyeShadow / hairCav / envSplit / faceNormal / specAA / contactShadow
// No model file changes, no animation changes: everything is runtime shader patches and render parameters.
import * as THREE from 'three'
import { POST_FRAG } from '../../stage.js'
import { patchShader } from '../../materials.js'

// ---------- Hit statistics ----------
// STATS[part] = Map(material name -> 'hit' | 'miss:<reason>' | 'skip'); post is string replacement, counted per item
export const STATS = {}
let pending = 0, dirty = false, lastLine = ''
function mark(part, name, ok) {
  (STATS[part] ||= new Map()).set(name, ok === true ? 'hit' : ok.startsWith?.('skip') ? ok : 'miss:' + ok)
  dirty = true
}
// One-line summary: part hits/total [missed material names]; not reported while textures are still loading, waits for the next frame
export function report(prefix = 'FIX') {
  if (!dirty || pending > 0) return
  dirty = false
  // part hits/expected, MISS[...] = replacement target not found (needs fixing), skip[...] = materials skipped by rule
  const parts = Object.entries(STATS).map(([k, m]) => {
    const e = [...m], miss = e.filter(([, v]) => v.startsWith('miss')), skip = e.filter(([, v]) => v.startsWith('skip'))
    const n = e.length - skip.length
    return `${k} ${n - miss.length}/${n}` + (miss.length ? ` MISS[${miss.map(([a, v]) => a + ' ' + v).join(', ')}]` : '') +
      (skip.length ? ` skip[${skip.map(([a]) => a).join(',')}]` : '')
  })
  const line = `${prefix} ${parts.join(' | ')}`
  if (line === lastLine) return
  lastLine = line
  // warn only for offscreen capture (bench reads errors.json) or when a replacement missed; info otherwise, so the developer panel event stream isn't spammed with ⚠
  if (CAPTURE || line.includes('MISS')) console.warn(line); else console.info(line)
}
const CAPTURE = new URLSearchParams(location.search).has('capture')

// Replace and record the hit: miss if target isn't found
function rep(src, target, to, part, name) {
  if (!src.includes(target)) { mark(part, name, 'no ' + target.slice(0, 40)); return src }
  mark(part, name, true)
  return src.replace(target, to)
}

// Expand an #include into source in place (idempotent): includes aren't expanded yet at onBeforeCompile, so lines inside a chunk can only be replaced after expanding it
export function expandChunk(src, chunk) {
  return src.replace(`#include <${chunk}>`, THREE.ShaderChunk[chunk])
}

// ---------- Material classes ----------
const low = (m) => (m.name || '').toLowerCase()
export const isCornea = (mesh) => /eye_cornea/.test(mesh.name)
export const isEyeShadow = (mesh) => /eye_shadow/.test(mesh.name)
export const isHair = (m) => low(m).endsWith('_hair')
export const isHead = (m, mesh) => low(m).endsWith('_head') && /head/.test(mesh.name)
// Skin (game cosmetic): recognized by material name (glb files of other skins have different material names)
export function skinOf(m) {
  const n = low(m)
  if (n.includes('clockup')) return 'rebecca'
  if (n.includes('traditional')) return 'hp'
  if (n.includes('cosmictechno')) return 'bear'
  if (n.startsWith('rampart_base_') && !n.endsWith('_props')) return 'base'
  return null
}
// Ambient classes (for envSplit): eye (the two eye shells) > hair (*_hair) > skin (*_head; *_body with thk blends in per pixel by the thk mask) > cloth (the rest)
// Metal is split per pixel (only for skin, cloth): metalness 0.3..0.7 blends smoothly to metal. Hair and eyes aren't split: 85% of base skin hair pixels became "metal" in the spec->metal conversion,
// but they are really tinted specular; 26% of Rebecca's face is metal (cybernetics) and goes to metal
export function matClass(m, mesh) {
  if (isCornea(mesh) || isEyeShadow(mesh)) return 'eye'
  if (isHair(m)) return 'hair'
  if (low(m).endsWith('_head')) return 'skin'
  return 'cloth'
}

// ---------- Shared uniforms (updated each frame by frame()) ----------
export const U = {
  fxSs: { value: 2 },                                        // supersampling factor (render pixels / output pixels)
  fxCornSpec: { value: 1 },                                   // cornea physical specular multiplier
  fxCatchI: { value: 0 },                                     // catchlight peak (linear HDR)
  fxCatchDir: { value: new THREE.Vector3(-0.15, -0.05, 1).normalize() },   // light direction in camera space
  fxCatchPx: { value: 0.4 },                                  // catchlight Gaussian σ (output pixels)
  fxCatchMin: { value: 0.03 },                                // catchlight minimum angular width (radians, σ): doesn't shrink to a pinpoint when zoomed way in
  fxHeadC: { value: new THREE.Vector3() },                    // head sphere center (camera space)
  fxFaceK: { value: 0 }, fxFaceS: { value: 0 }, fxFaceR: { value: new THREE.Vector2(0.11, 0.15) },
  fxSaaK: { value: 1 }, fxSaaMax: { value: 0.18 },
  fxEnvSkin: { value: new THREE.Vector2(1, 1) }, fxEnvCloth: { value: new THREE.Vector2(1, 1) },
  fxEnvHair: { value: new THREE.Vector2(1, 1) }, fxEnvMetal: { value: new THREE.Vector2(1, 1) },
  fxEnvEye: { value: new THREE.Vector2(1, 1) },
}
const _v = new THREE.Vector3()
let headBone = null
// Called at the start of each frame (in look.beforeRender): supersampling factor, head sphere center
export function frame(stage, petRoot) {
  U.fxSs.value = stage.ss
  let p = headBone
  while (p && p !== petRoot) p = p.parent   // after a skin change the old bone is no longer under petRoot, find it again
  if (!p) headBone = petRoot.getObjectByName('def_c_head')
  if (headBone) {
    stage.camera.updateMatrixWorld()
    headBone.getWorldPosition(_v)
    _v.y += 0.01   // def_c_head is at the skull center at eye height, a bit higher is used as the sphere center
    U.fxHeadC.value.copy(_v).applyMatrix4(stage.camera.matrixWorldInverse)
  }
}

// ---------- 1. Composite shader ----------
// Fixes three things, the rest matches stage.js's POST_FRAG line for line (derived from it by string replacement, so a stage.js change makes this miss loudly):
//  - contrast: was pivoted at 0.5 in linear space, i.e. an overall −0.02 then clipped, everything linear <0.0192 (sRGB 37) became 0.
//    now a "pivoted power curve" in display space (sRGB encoded values): slope = contrast at pivot cPivot, 0 and 1 fixed, no clipping
//  - saturation: moved to display space (luma mix on sRGB encoded values)
//  - toe: PBR Neutral shadow offset multiplied by toeK (1 = as before)
//  - outline color: the uniform is a THREE.Color (linear), yet was added as a display value after toSRGB, so dark brown (26,18,13) became near black (2,1,1); toSRGB it first here
// Extension hooks (GLSL snippets, all optional):
//   decl     before main: own uniforms / functions (toSRGB, neutralTM already available)
//   resolve  replaces the supersample reconstruction, must define vec4 c (premultiplied HDR); default is the original 2x2 + tent
//   linear   before tone mapping, modify vec3 col (linear HDR, alpha already divided out)
//   display  after contrast, modify vec3 col (display space 0..1)
//   final    before output, modify vec4 outc (premultiplied, including outline and shadow); the hitMode branch returns before it, unaffected
export function postFix({ toeK = 1, pivot = 0.45, decl = '', resolve = '', linear = '', display = '', final = '' } = {}) {
  const P = 'post'
  let f = POST_FRAG
  f = rep(f, 'uniform float hitMode;', 'uniform float hitMode;\nuniform float toeK;\nuniform float cPivot;', P, 'uniforms')
  f = rep(f, 'color -= offset;', 'color -= offset * toeK;', P, 'toe')
  f = rep(f, 'void main() {', `// display-space pivoted power curve: x<p segment p·(x/p)^c, x>p segment 1−(1−p)·((1−x)/(1−p))^c; slope c at the pivot, endpoints fixed
vec3 fxContrast(vec3 x, float c, float p) {
  vec3 lo = p * pow(x / p, vec3(c));
  vec3 hi = 1.0 - (1.0 - p) * pow((1.0 - x) / (1.0 - p), vec3(c));
  return mix(lo, hi, step(vec3(p), x));
}
${decl}
void main() {`, P, 'decl')
  f = rep(f, `  col = neutralTM(col * exposure);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, saturation);
  col = clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
  col = toSRGB(col);`, `  ${linear}
  col = neutralTM(col * exposure);
  col = toSRGB(clamp(col, 0.0, 1.0));
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = clamp(mix(vec3(l), col, saturation), 0.0, 1.0);
  col = fxContrast(col, contrast, cPivot);
  ${display}`, P, 'grade')
  f = rep(f, 'outc.rgb += outlineColor * olA;', 'outc.rgb += toSRGB(outlineColor) * olA;', P, 'outline')
  if (final) f = rep(f, '  gl_FragColor = outc;', `  ${final}\n  gl_FragColor = outc;`, P, 'final')
  // late particles (stage draws them into tFx when the look has fxLate): same tone mapping, layered on top, not part of the outline / sticker border
  f = rep(f, 'uniform float hitMode;', 'uniform float hitMode;\nuniform sampler2D tFx;\nuniform float tFxOn;', P, 'fxDecl')
  f = rep(f, '  gl_FragColor = outc;', `  if (tFxOn > 0.5) {
    vec4 fq = texture2D(tFx, vUv);
    float fa = clamp(fq.a, 0.0, 1.0);
    if (fa > 1e-4) {
      vec3 fc = toSRGB(clamp(neutralTM(fq.rgb / fq.a * exposure), 0.0, 1.0));
      outc = vec4(fc * fa + outc.rgb * (1.0 - fa), fa + outc.a * (1.0 - fa));
    }
  }
  gl_FragColor = outc;`, P, 'fx')
  if (resolve) {
    const m = f.match(/ {2}vec4 c = texture2D\(tChar, vUv\) \* 0\.5;[\s\S]*?\n\n/)
    if (m) { f = f.replace(m[0], resolve + '\n\n'); mark(P, 'resolve', true) } else mark(P, 'resolve', 'no tent block')
  }
  return { postFrag: f, uniforms: { toeK: { value: toeK }, cPivot: { value: pivot }, tFx: { value: null }, tFxOn: { value: 0 } } }
}

// ---------- 2. Skin subsurface (fixing dead code in materials.js) ----------
// materials.js's patchSkin replaces the diffuse line of RE_Direct_Physical in onBeforeCompile, but at that point lights_physical_pars_fragment
// is still a single #include line, so the replacement always misses. A patch is chained after it here: expand the chunk first, then do the same replacement (same uniforms: thkMap / sssStrength /
// sssWrap, so the dev panel sliders work too). Only for skin materials with thk: *_head / *_body (props don't go through enhanceMaterials, so they never had it);
// Rebecca's clockup_body is excluded by default (body thk covers 29%, once fixed the legs turn pink while the head has no thk and stays cool grey, head and body mismatch)
const SSS_DIFF = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );'
export function skinSSS(mat, mesh, { include = /_(head|body)$/, exclude = /clockup/ } = {}) {
  const n = low(mat)
  if (!mat.userData.sss) return false
  if (!include.test(n) || (exclude && exclude.test(n))) { mark('sss', mat.name, 'skip'); return false }
  patchShader(mat, 'fxSss', (sh) => {
    const fs = expandChunk(sh.fragmentShader, 'lights_physical_pars_fragment')
    sh.fragmentShader = rep(fs, SSS_DIFF, `${SSS_DIFF}
      float wNL = saturate( ( dot( geometryNormal, directLight.direction ) + sssWrap ) / ( 1.0 + sssWrap ) );
      reflectedLight.directDiffuse += gSSS * max( wNL - dotNL, 0.0 ) * directLight.color * BRDF_Lambert( material.diffuseContribution ) * 2.2;`, 'sss', mat.name)
  })
  return true
}

// ---------- 3. Eyes ----------
// Cornea: was 15% black glass with normal blending, which only darkened the eyes, and its own specular got multiplied by 0.15 too. Now additive, specular only (One/One, target alpha untouched).
// Catchlight (catchI > 0): a Gaussian lobe at a fixed camera-space direction, from the angle between the reflection vector and the light direction. Lobe width isn't hardcoded:
//   screen derivatives measure "how much the reflection angle changes per render pixel" (dFdx/dFdy of the reflection vector), σ = max(catchMin radians, catchPx output pixels × supersampling × angle per pixel).
//   So at ppm150 (eye about 3 px) and ppm450 alike it's a highlight about catchPx output pixels wide, no sub-pixel flicker, and no big grey blotch at large sizes.
//   Peak catchI is linear HDR, compressed close to white by Neutral. While blinking / sleeping the eyelid geometry occludes the cornea (depth test), so the highlight disappears too.
//   Defaults (catchI 2, σ 0.4 px, direction slightly lower left) were accepted after testing: at ppm150 1–2 px per eye, brightness 1.3–2.4× the skin below the eye,
//   no single-eye flicker under sub-pixel translation / ppm 146–154 / a 2 s idle sequence; σ 0.2 px already flickers in one eye (5/30 frames). Lower direction because she often looks down at the cursor,
//   and a higher highlight would be covered by the upper lid first. About 2×2 px at ppm450
// Cornea renderOrder moved after the eyelid shadow shell (3 > 2), so the highlight isn't darkened by the shadow shell.
// mask: true makes the cornea output a constant 5 (diagnostic: find eye pixels by diffing against the normal image)
export function cornea(mat, mesh, { spec = 1, catchI = 2, catchDir = [-0.15, -0.05, 1], catchPx = 0.4, catchMin = 0.03, mask = false } = {}) {
  if (!isCornea(mesh)) return false
  Object.assign(mat, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false, transparent: true })
  mesh.renderOrder = 3
  U.fxCornSpec.value = spec; U.fxCatchI.value = catchI; U.fxCatchDir.value.set(...catchDir).normalize()
  U.fxCatchPx.value = catchPx; U.fxCatchMin.value = catchMin
  patchShader(mat, 'fxCornea' + (mask ? 'M' : ''), (sh) => {
    Object.assign(sh.uniforms, { fxSs: U.fxSs, fxCornSpec: U.fxCornSpec, fxCatchI: U.fxCatchI, fxCatchDir: U.fxCatchDir, fxCatchPx: U.fxCatchPx, fxCatchMin: U.fxCatchMin })
    const body = mask ? 'gl_FragColor = vec4( vec3( 5.0 ), 1.0 );' : `{
      vec3 fxR = reflect( -geometryViewDir, normalize( nonPerturbedNormal ) );
      float fxG = max( length( dFdx( fxR ) ), length( dFdy( fxR ) ) );          // reflection angle change per render pixel (radians)
      float fxS = max( fxCatchMin, fxCatchPx * fxSs * fxG );                   // lobe width σ (radians)
      float fxA = acos( clamp( dot( fxR, fxCatchDir ), -1.0, 1.0 ) );
      float fxC = fxCatchI * exp( -0.5 * fxA * fxA / ( fxS * fxS ) );
      gl_FragColor = vec4( totalSpecular * fxCornSpec + vec3( fxC ), 1.0 );
    }`
    sh.fragmentShader = rep('uniform float fxSs; uniform float fxCornSpec; uniform float fxCatchI; uniform vec3 fxCatchDir; uniform float fxCatchPx; uniform float fxCatchMin;\n' + sh.fragmentShader,
      '#include <opaque_fragment>', body, 'cornea', mat.name + (mask ? '(mask)' : ''))
  })
  return true
}
// Eyelid shadow shell: texture alpha median 0.87, near-black color. k is its opacity (1 = as before, 0 = hidden).
// Measured effect in the current pipeline is small: ppm150 eye area mean brightness k=1 -> 0 only +3.6 (sRGB 0–255), ppm450 +6; the dark eye band mostly comes from the texture and lighting
export function eyeShadow(mat, mesh, k = 1) {
  if (!isEyeShadow(mesh)) return false
  mat.opacity = k
  mat.visible = k > 0
  mark('eyeShadow', mat.name, true)
  return true
}

// ---------- 4. Hair cav ----------
// tex.py multiplied cav into baseColor (linear) as 0.6 + 0.4·cav, but in the game hair cav is a specular multiplier (flat 0.26 for base skin / HP).
// Undone at runtime: after map_fragment diffuseColor /= 0.6 + 0.4·cav (metallic F0 comes back with it), after AO both direct and ambient specular are multiplied by cav.
// The cav source is read from tex/index.json (assets/tex/<material>_cav.png), loaded asynchronously; patched only once loaded, the first frame or two look as before.
const INDEX = fetch('./tex/index.json').then(r => r.json()).catch(() => ({}))
const texLoader = new THREE.TextureLoader()
export function hairCav(mat) {
  if (!isHair(mat)) return false
  pending++
  INDEX.then(idx => {
    const f = idx[mat.name]?.maps?.cav?.file
    if (!f) { mark('hairCav', mat.name, 'no cav map'); return }
    return texLoader.loadAsync('./' + f).then(t => {
      t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4
      patchShader(mat, 'fxHairCav', (sh) => {
        sh.uniforms.fxCav = { value: t }
        let fs = 'uniform sampler2D fxCav;\n' + sh.fragmentShader
        fs = rep(fs, '#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb /= 0.6 + 0.4 * texture2D( fxCav, vMapUv ).r;', 'hairCav', mat.name + '/albedo')
        fs = rep(fs, '#include <aomap_fragment>', `#include <aomap_fragment>
  { float fxCv = texture2D( fxCav, vMapUv ).r; reflectedLight.directSpecular *= fxCv; reflectedLight.indirectSpecular *= fxCv; }`, 'hairCav', mat.name + '/spec')
        sh.fragmentShader = fs
      })
    })
  }).catch(e => mark('hairCav', mat.name, 'load ' + e)).finally(() => { pending-- })
  return true
}

// ---------- 5. Ambient split by material class ----------
// The scene's environmentIntensity multiplies both IBL diffuse and specular; raising ambient makes cloth look like satin (HP silk pants). Here each class gets its own [diffuse, specular]:
// before lights_fragment_end, scale iblIrradiance (IBL diffuse, which in physical materials also carries a small multi-scatter part of the specular) and radiance (IBL specular).
// Hemisphere light unaffected. Classes see matClass(); metal blends smoothly per pixel by metalness (0.3..0.7), bodies with thk blend into skin by the thk mask
export function envSplit(mat, mesh, cls = {}) {
  if (!mat.isMeshStandardMaterial) return false
  const c = matClass(mat, mesh)
  for (const [k, v] of Object.entries(cls)) U['fxEnv' + k[0].toUpperCase() + k.slice(1)]?.value.set(...v)
  const base = 'fxEnv' + c[0].toUpperCase() + c.slice(1)
  const metal = c === 'cloth' || c === 'skin'
  patchShader(mat, 'fxEnv_' + c, (sh) => {
    Object.assign(sh.uniforms, { fxEnvSkin: U.fxEnvSkin, fxEnvCloth: U.fxEnvCloth, fxEnvHair: U.fxEnvHair, fxEnvMetal: U.fxEnvMetal, fxEnvEye: U.fxEnvEye })
    const thk = c === 'cloth' && sh.defines && 'PET_SSS' in sh.defines
    const code = `{
      vec2 fxE = ${base};
      ${thk ? 'vec3 fxT = texture2D( thkMap, vMapUv ).rgb; fxE = mix( fxE, fxEnvSkin, smoothstep( 0.02, 0.1, max( max( fxT.r, fxT.g ), fxT.b ) ) );' : ''}
      ${metal ? 'fxE = mix( fxE, fxEnvMetal, smoothstep( 0.3, 0.7, metalnessFactor ) );' : ''}
      iblIrradiance *= fxE.x; radiance *= fxE.y;
    }
    #include <lights_fragment_end>`
    sh.fragmentShader = rep('uniform vec2 fxEnvSkin; uniform vec2 fxEnvCloth; uniform vec2 fxEnvHair; uniform vec2 fxEnvMetal; uniform vec2 fxEnvEye;\n' + sh.fragmentShader,
      '#include <lights_fragment_end>', code, 'env', `${mat.name}:${c}${thk ? '+thk' : ''}`)
  })
  return true
}

// ---------- 6. Face normal smoothing ----------
// Only for *_head (mesh name contains head): k pulls the normal-map normal toward the geometric normal (0 = as before, 1 = no normal map);
// sphere further pulls toward the spherical normal "head center -> surface" (broken shadows in the eye sockets and nose wings become black blocks on a 25 px face; the spherical normal smooths them out).
// The sphere term falls off with distance to the center: fxFaceR = [full strength radius, zero radius] (meters), so the neck doesn't become a ball. Center updated every frame by frame()
export function faceNormal(mat, mesh, { k = 0, sphere = 0, r = [0.11, 0.15] } = {}) {
  if (!isHead(mat, mesh) || (k <= 0 && sphere <= 0)) return false
  U.fxFaceK.value = k; U.fxFaceS.value = sphere; U.fxFaceR.value.set(...r)
  patchShader(mat, 'fxFaceN', (sh) => {
    Object.assign(sh.uniforms, { fxFaceK: U.fxFaceK, fxFaceS: U.fxFaceS, fxFaceR: U.fxFaceR, fxHeadC: U.fxHeadC })
    sh.fragmentShader = rep('uniform float fxFaceK; uniform float fxFaceS; uniform vec2 fxFaceR; uniform vec3 fxHeadC;\n' + sh.fragmentShader,
      '#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = normalize( mix( normal, nonPerturbedNormal, fxFaceK ) );
      {
        vec3 fxD = -vViewPosition - fxHeadC;
        float fxW = fxFaceS * ( 1.0 - smoothstep( fxFaceR.x, fxFaceR.y, length( fxD ) ) );
        normal = normalize( mix( normal, normalize( fxD ), fxW ) );
      }`, 'faceN', mat.name)
  })
  return true
}

// ---------- 7. Specular anti-aliasing ----------
// Tokuyoshi & Kaplanyan 2019: screen-space normal variance added to GGX α² (α² += min(2σ²·k, kappa)), plus Toksvig (normals shorten after mip averaging = normal spread within a pixel).
// three's built-in geometryRoughness only looks at the geometric normal and can't see normal-map detail. Measured (base skin ppm150, frozen pose + 0.1 px translation per frame):
// pixels with second-order temporal difference >4: 390 -> 207, p99 5.4 -> 4.3; still frame about 1000 px with dE>3 (mainly duller metal highlights), the face barely changes
export function specAA(mat, mesh, { k = 1, kappa = 0.18 } = {}) {
  if (!mat.isMeshStandardMaterial || isCornea(mesh) || isEyeShadow(mesh)) return false
  U.fxSaaK.value = k; U.fxSaaMax.value = kappa
  patchShader(mat, 'fxSpecAA', (sh) => {
    Object.assign(sh.uniforms, { fxSaaK: U.fxSaaK, fxSaaMax: U.fxSaaMax })
    let f = 'uniform float fxSaaK; uniform float fxSaaMax;\n' + sh.fragmentShader
    f = rep(f, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      #ifdef USE_NORMALMAP_TANGENTSPACE
        float fxNLen = length( texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0 );
      #else
        float fxNLen = 1.0;
      #endif`, 'specAA', mat.name + '/nlen')
    f = rep(f, '#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      {
        vec3 fxNx = dFdx( normal ), fxNy = dFdy( normal );
        float fxK2 = min( 2.0 * 0.25 * ( dot( fxNx, fxNx ) + dot( fxNy, fxNy ) ) * fxSaaK, fxSaaMax );
        float fxNl = clamp( fxNLen, 0.2, 1.0 );
        float fxA = material.roughness * material.roughness;
        material.roughness = sqrt( sqrt( clamp( fxA * fxA + fxK2 + ( 1.0 - fxNl ) / fxNl, 0.0, 1.0 ) ) );
      }`, 'specAA', mat.name + '/rough')
    sh.fragmentShader = f
  })
  return true
}

// ---------- 8. Contact shadow ----------
// Previously the whole body within 1.4 m of the ground cast a shadow, dragging a ~140 px slanted "floor" shadow across upright wallpaper. Defaults (tuned on the light camera preset):
// far: height above ground that still casts (meters), blur: blur, darkness: depth -> darkness multiplier, alpha: shadow layer opacity in the composite.
// Prop parts touching the ground (the tripod legs in lounge) are still within far, the thin legs just get lighter after blurring (shadow alpha peak 249 -> 90);
// airborne poses (held free fall) are higher than far, so there's no longer a blob of ground shadow floating along with her
export function contactShadow(stage, { far = 0.35, blur = 1.2, darkness = 3.5, alpha = 0.6 } = {}) {
  stage.csCam.far = far; stage.csCam.updateProjectionMatrix()
  stage.cs.blur = blur
  stage.cs.darkness = darkness
  stage.postMat.uniforms.shadowAlpha.value = alpha
  mark('cs', `far${far} blur${blur} dark${darkness} a${alpha}`, true)
}

// ---------- Assembled into a look ----------
// Default = "as before + bug fixes": composite fix, SSS active, highlight-only cornea (no catchlight), hair cav, contact shadow.
// Taste items off by default: without a cornea option it's { catchI: 0 } (fix the cornea only, no catchlight); passing a cornea options object uses cornea()'s defaults (catchI 2),
// so write catchI: 0 explicitly if no catchlight is wanted. eyeShadow 1; env / faceN / specAA not patched. Pass false for any item to turn that fix off.
export function fixLook({
  post = {}, sss = {}, cornea: corn = { catchI: 0 }, eyeShadow: esA = 1, hairCav: hc = true,
  env = null, faceN = null, specAA: saa = null, cs = {},
} = {}) {
  const p = post ? postFix(post) : null
  return {
    postFrag: p?.postFrag, uniforms: p?.uniforms,
    setup(stage) {
      if (cs) contactShadow(stage, cs)
    },
    material(m, mesh) {
      if (corn) cornea(m, mesh, corn)
      eyeShadow(m, mesh, esA)
      if (sss) skinSSS(m, mesh, sss)
      if (hc) hairCav(m)
      if (faceN) faceNormal(m, mesh, faceN)
      if (saa) specAA(m, mesh, saa)
      if (env) envSplit(m, mesh, env)
    },
    beforeRender(stage, petRoot) { frame(stage, petRoot) },
    afterChar() { report() },
  }
}
