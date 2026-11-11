// Light/shade organization patches for direction C, "illustrated PBR" (built on the bug fixes of lib/fix.js, game textures kept):
//   1. key light: half-Lambert squared + soft step, splitting light and shade into two big blocks "light / dark"; shadows merge into the same step (shadow = dark side, same value, no longer another layer of black)
//      the dark side isn't black: the key light leaves shade× there, slightly cool (tint). Shadows on the face halved (half of the black bars cast by bangs / brow on a 25 px face removed)
//   2. specular organization: direct specular multiplied per class (cloth down, skin slightly down, metal untouched); in the dark side the step already turns key specular off
//   3. value focus: darkens outward from the head sphere center (face brightest). Computed relative to the head center, so it holds lying down, facing away, in the air
//   4. frontal face light: near the head (blended by distance to the head center) the key light direction is pulled toward the camera, the face sits in the lit side while the body keeps side-lit volume
//   5. eye socket fill: Gaussian brightening around both eyeball centers (σ 1.5 cm, face only); the Bear skin has no eyeball bones, so it's naturally 0.
//      defined in world size, so wider at larger sizes: fades out from 220 -> 300 output pixels per meter (meant for small sizes only)
// Focus and socket fill multiply only the lit part, not emissive (the Rebecca skin's neon strips stay as they are)
// All of it is one fragment patch per material + a few shared uniforms, no extra pass, no geometry change
// The key light is identified by index: three puts shadow-casting lights first, and the key is the only shadow-casting directional light -> light 0 of the directional loop (v1 matched by direction, dot > 0.98, fragile)
// Usage: illusShade(mat, mesh) in material(), illusFrame(stage, petRoot) in beforeRender(); hit summary illusReport() (called in afterChar)
import * as THREE from 'three'
import { patchShader } from '../../materials.js'
import { U, expandChunk, isCornea, isEyeShadow, isHead, isHair, skinOf } from './fix.js'

// Shared uniforms: changes need no recompile. Defaults are final (looks/illus.js overrides them only when URL parameters are present)
export const IL = {
  ilTh: { value: 0.42 }, ilSoft: { value: 0.15 },       // step position / half width (measured on half-Lambert squared)
  ilFaceSoft: { value: 0.26 },                          // softer step on the face (a hard step on a small face reads as a mask)
  ilShade: { value: 0.28 },                             // how much key light remains in the dark side
  ilTint: { value: new THREE.Vector3(0.88, 0.92, 1.0) },  // dark side tint (slightly cool; v1's .76/.86/1 turned the dark side of orange clothes grey-purple at 2x)
  ilFaceCast: { value: 0.5 },                           // shadow strength on the face (1 = unchanged)
  ilSpec: { value: new THREE.Vector4(0.6, 0.8, 1.0, 1.0) },   // direct specular multipliers: cloth, skin, hair, metal
  ilFocus: { value: new THREE.Vector3(0.1, 0.12, 0.45) },     // head focus: brightening k, full strength radius, zero radius (meters)
  ilFront: { value: new THREE.Vector3(0.35, 0.12, 0.2) },     // frontal face light: how far the key direction is pulled toward the camera, full strength radius, zero radius (meters)
  ilEyeL: { value: new THREE.Vector3(0, 0, -99) }, ilEyeR: { value: new THREE.Vector3(0, 0, -99) },   // both eyeball centers (camera space)
  ilSocket: { value: new THREE.Vector2(0.3, 0.015) },         // eye socket fill: brightening k (multiplied each frame by the skin multiplier and size fade), Gaussian σ (meters)
  ilRamp: { value: 0 },                                       // 1: key light falls back to Lambert (ablation only)
}
// Base strength of the eye socket fill (each frame IL.ilSocket.x = SOCK_K · skin multiplier · size fade); focus and frontal light use the skin multiplier too
export const BASE = { sock: 0.3, focus: 0.1, front: 0.35 }

const STATS = new Map()
let dirty = false, last = ''
// Hit summary; includes LOOKFAIL when a replacement target wasn't found, so bench reports failure (v1 only warned, and bench still said ok)
export function illusReport() {
  if (!dirty) return
  dirty = false
  const e = [...STATS], miss = e.filter(([, v]) => v !== 'hit')
  const line = `ILLUS ${e.length - miss.length}/${e.length}` + (miss.length ? ` LOOKFAIL MISS[${miss.map(([a, v]) => a + ' ' + v).join(', ')}]` : '')
  if (line !== last) { last = line; (miss.length ? console.error : console.warn)(line) }
}
function rep(src, target, to, name) {
  if (!src.includes(target)) { STATS.set(name, 'no ' + target.slice(0, 40)); dirty = true; return src }
  STATS.set(name, 'hit'); dirty = true
  return src.replace(target, to)
}

const DIFF = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );'
const SPEC = 'reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;'
const DIRL = 'getDirectionalLightInfo( directionalLight, directLight );'

// Classes: 0 cloth (props included), 1 skin (*_head, the Bear skin's plush head counts too), 2 hair. Metal is blended per pixel by metalness in the shader
export function illusShade(mat, mesh) {
  if (!mat.isMeshStandardMaterial || isCornea(mesh) || isEyeShadow(mesh)) return false
  const face = isHead(mat, mesh) && skinOf(mat) !== 'bear'
  const cls = isHair(mat) ? 2 : (mat.name || '').toLowerCase().endsWith('_head') ? 1 : 0
  const nm = mat.name
  patchShader(mat, `il${cls}${face ? 'f' : ''}`, (sh) => {
    Object.assign(sh.uniforms, IL, { ilHeadC: U.fxHeadC })
    let f = `uniform float ilTh; uniform float ilSoft; uniform float ilFaceSoft; uniform float ilShade; uniform vec3 ilTint; uniform float ilFaceCast;
uniform vec4 ilSpec; uniform vec3 ilFocus; uniform vec3 ilHeadC; uniform vec3 ilFront; uniform vec3 ilEyeL; uniform vec3 ilEyeR; uniform vec2 ilSocket; uniform float ilRamp;
bool ilIsKey = false; vec3 ilKc = vec3( 1.0 );   // written in the directional light loop: whether this light is the key, and its color without shadow
` + sh.fragmentShader
    f = expandChunk(f, 'lights_physical_pars_fragment')
    f = expandChunk(f, 'lights_fragment_begin')
    // directional light loop: light 0 is the key (the only shadow caster, three puts it first); record the original color before the shadow is multiplied into directLight.color
    f = rep(f, DIRL, `${DIRL}
		ilIsKey = UNROLLED_LOOP_INDEX == 0; ilKc = directLight.color;`, nm + '/key')
    // the key light's diffuse becomes the step; shadow factor = actual color / color without shadow
    f = rep(f, DIFF, `if ( ilIsKey ) {
        float ilSh = clamp( dot( directLight.color, vec3( 1.0 ) ) / max( dot( ilKc, vec3( 1.0 ) ), 1e-4 ), 0.0, 1.0 );
        ${face ? 'ilSh = mix( 1.0, ilSh, ilFaceCast );' : ''}
        // near the head the key light is pulled toward the camera (illustrations often give the face its own frontal light): blended by distance to the head center, original direction below the neck
        float ilFw = ilFront.x * ( 1.0 - smoothstep( ilFront.y, ilFront.z, length( geometryPosition - ilHeadC ) ) );
        vec3 ilL = normalize( mix( directLight.direction, vec3( 0.0, 0.0, 1.0 ), ilFw ) );
        float ilH = dot( geometryNormal, ilL ) * 0.5 + 0.5; ilH *= ilH;
        float ilW = ${face ? 'ilFaceSoft' : 'ilSoft'};
        float ilS = smoothstep( ilTh - ilW, ilTh + ilW, ilH ) * ilSh;
        vec3 ilLv = mix( mix( ilShade * ilTint, vec3( 1.0 ), ilS ), vec3( dotNL * ilSh ), ilRamp );   // ilRamp = 1: falls back to Lambert (for ablation)
        reflectedLight.directDiffuse += ilLv * ilKc * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
      } else {
        ${DIFF}
      }`, nm + '/ramp')
    f = rep(f, SPEC, `reflectedLight.directSpecular += mix( ilSpec[${cls}], ilSpec.w, ${cls === 2 ? '0.0' : 'smoothstep( 0.3, 0.7, material.metalness )'} ) * irradiance * specularBRDF * material.multiScatteringCompensation;`, nm + '/spec')
    f = rep(f, '#include <opaque_fragment>', `{
      vec3 ilD = -vViewPosition - ilHeadC;                                // relative to the head sphere center (camera space, meters)
      float ilG = 1.0 + ilFocus.x * ( 1.0 - smoothstep( ilFocus.y, ilFocus.z, length( ilD ) ) );
      ${face ? `{   // eye socket fill: Gaussian brightening around both eyeball centers (how illustrators brighten eye sockets on small figures)
        vec3 ilPe = -vViewPosition; float ilI = 0.5 / ( ilSocket.y * ilSocket.y );
        ilG *= 1.0 + ilSocket.x * ( exp( -dot( ilPe - ilEyeL, ilPe - ilEyeL ) * ilI ) + exp( -dot( ilPe - ilEyeR, ilPe - ilEyeR ) * ilI ) );
      }` : ''}
      outgoingLight = ( outgoingLight - totalEmissiveRadiance ) * ilG + totalEmissiveRadiance;   // emissive not multiplied
    }
    #include <opaque_fragment>`, nm + '/focus')
    sh.fragmentShader = f
  })
  return true
}

// Per frame: both eyeball centers (camera space), write focus / frontal light / socket fill by skin multiplier and size
const _a = new THREE.Vector3()
let eyes = null, eyesOf = null
export function illusFrame(stage, petRoot, faceK = 1) {
  // switching skins reloads the page, so finding them once is enough; without eyeball bones (Bear skin) put a placeholder far from the face, so the fill is naturally 0
  if (eyesOf !== petRoot) { eyesOf = petRoot; eyes = ['def_l_eyeball', 'def_r_eyeball'].map(n => petRoot.getObjectByName(n) || new THREE.Object3D()) }
  eyes.forEach((b, i) => { b.getWorldPosition(_a); (i ? IL.ilEyeR : IL.ilEyeL).value.copy(_a).applyMatrix4(stage.camera.matrixWorldInverse) })
  // output pixels per meter at the head (perspective camera): sizes s / m / l are 150 / 180 / 220 (100% scale)
  const cam = stage.camera, z = Math.max(0.1, -U.fxHeadC.value.z)
  const ppm = stage.cssH * stage.dpr / (2 * z * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)))
  IL.ilSocket.value.x = BASE.sock * faceK * (1 - THREE.MathUtils.smoothstep(ppm, 220, 300))
  IL.ilFocus.value.x = BASE.focus * faceK
  IL.ilFront.value.x = BASE.front * faceK
}
