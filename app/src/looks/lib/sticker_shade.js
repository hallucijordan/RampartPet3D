// Material patches for the sticker look:
//  - stickerRamp: key light diffuse becomes a soft two-block "light / dark" step (not hard cel shading), the dark side uses a hued dark color (not grey-black);
//    the key light's shadows and the unlit side land on the same dark step, the third value level comes from AO / ambient occlusion. Other lights (fill, rim) unchanged.
//    the face (*_head) uses a wider step (a hard shader step on a 25 px face turns nose shadows and eye sockets into color blocks, confirmed by diagnosis)
//  - lidLine: eye area mask on the base skin face UV (shared by base / hp / rebecca): eye shadow area lifted a bit toward skin color, a dark lash line drawn on the upper lid rim
// Key light direction / color updated each frame by shadeFrame() (camera space)
import * as THREE from 'three'
import { patchShader } from '../../materials.js'
import { expandChunk, isCornea, isEyeShadow, isHair, isHead, skinOf, STATS } from './fix.js'

export const SU = {
  stKeyDir: { value: new THREE.Vector3(0, 0, 1) }, stKeyCol: { value: new THREE.Color(1, 1, 1) },
  stTh: { value: 0.0 }, stThFace: { value: -0.3 }, stSoft: { value: 0.2 }, stSoftFace: { value: 0.4 },
  stShade: { value: 0.42 }, stForm: { value: 0.25 },
  stTintCloth: { value: new THREE.Vector3(0.86, 0.86, 1.08) },   // cloth / gear dark side cool purple
  stTintSkin: { value: new THREE.Vector3(1.08, 0.82, 0.8) },     // skin dark side warm red
  stSpec: { value: new THREE.Vector4(0.35, 0.5, 0.8, 1.0) },   // direct specular multipliers: cloth, skin, hair, metal (blended per pixel by metalness)
  stMipB: { value: 1 },
  stLidK: { value: 1 }, stLidDark: { value: 0.35 },
}

// Hit statistics go into fix.js's STATS and are printed together by report()
function mark(part, name, ok) {
  (STATS[part] ||= new Map()).set(name, ok === true ? 'hit' : ok.startsWith?.('skip') ? ok : 'miss:' + ok)
}
function rep(src, target, to, part, name) {
  if (!src.includes(target)) { mark(part, name, 'no ' + target.slice(0, 40)); return src }
  mark(part, name, true)
  return src.replace(target, to)
}

const DIFF = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );'
export function stickerRamp(mat, mesh) {
  if (!mat.isMeshStandardMaterial || isCornea(mesh) || isEyeShadow(mesh)) return false
  const face = isHead(mat, mesh) && skinOf(mat) !== 'bear'
  const skin = /_head$/.test((mat.name || '').toLowerCase()) && skinOf(mat) !== 'bear'   // the bear head is plush, treated as cloth
  const hair = isHair(mat)
  patchShader(mat, 'stRamp' + (face ? 'F' : skin ? 'S' : hair ? 'H' : ''), (sh) => {
    Object.assign(sh.uniforms, SU)
    let fs = 'uniform vec4 stSpec; float stSpecK = 1.0;\n' + 'uniform vec3 stKeyDir; uniform vec3 stKeyCol; uniform float stTh; uniform float stThFace; uniform float stSoft; uniform float stSoftFace;\n' +
      'uniform float stShade; uniform float stForm; uniform vec3 stTintCloth; uniform vec3 stTintSkin;\n' + sh.fragmentShader
    fs = expandChunk(fs, 'lights_physical_pars_fragment')
    fs = rep(fs, DIFF, `if ( dot( directLight.direction, stKeyDir ) > 0.9995 ) {
        // key light: soft step. x = N·L (three's geometryNormal is the perturbed normal; already smoothed by sphere normals on the face), shadow factor = actual light color / the lamp's color
        float stX = dot( geometryNormal, directLight.direction );
        float stS = ${face ? 'stSoftFace' : 'stSoft'};
        float stP = clamp( dot( directLight.color, vec3( 1.0 ) ) / max( dot( stKeyCol, vec3( 1.0 ) ), 1e-4 ), 0.0, 1.0 );
        float stC = ${face ? 'stThFace' : 'stTh'};
        float stL = smoothstep( stC - stS, stC + stS, stX ) * stP;
        vec3 stT = ${skin ? 'stTintSkin' : 'stTintCloth'};
        vec3 stLvl = mix( stShade * stT, vec3( 1.0 ), stL ) * mix( 1.0 - stForm, 1.0, saturate( stX ) );
        reflectedLight.directDiffuse += stLvl * stKeyCol * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
      } else {
        ${DIFF}
      }`, 'ramp', mat.name)
    // direct specular: satin look on cloth / skin removed (a sticker keeps highlights only on hair and metal); metal blended per pixel
    fs = rep(fs, 'reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;',
      'reflectedLight.directSpecular += stSpecK * irradiance * specularBRDF * material.multiScatteringCompensation;', 'ramp', mat.name + '/spec')
    fs = rep(fs, '#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      stSpecK = ${hair ? 'stSpec.z' : `mix( ${skin ? 'stSpec.y' : 'stSpec.x'}, stSpec.w, smoothstep( 0.3, 0.7, metalnessFactor ) )`};`, 'ramp', mat.name + '/specK')
    sh.fragmentShader = fs
  })
  return true
}

// Eye area (base skin face UV, on the 1024² texture left eye u 0.31..0.45, right eye u 0.55..0.70, lid seam v≈0.346):
//   eye shadow lift: inside the oval mask, outside the lid rim line, albedo interpolated by stLidK·0.6 toward the skin color of a ring outside the mask (half of the smoky dark band)
//   lash line: a band v 0.334..0.347 above the lid seam, albedo darkened to stLidDark (upper lid rim, sitting right on the top edge of the eyeball when open)
//   painted eyeliner (hp's black winged liner, linear luma < 0.012) isn't lifted and stays dark: it already is the sticker's "drawn upper lid line"
// Only for base / hp heads: bear's head is a bear head (different UV); Rebecca's face uses the same UV, but the purple eye makeup and black liner are part of her look, her eyes were never a dark band
export function lidLine(mat, mesh) {
  const s = skinOf(mat)
  if (!isHead(mat, mesh) || (s !== 'base' && s !== 'hp')) return false
  patchShader(mat, 'stLid', (sh) => {
    Object.assign(sh.uniforms, { stLidK: SU.stLidK, stLidDark: SU.stLidDark })
    let fs = 'uniform float stLidK; uniform float stLidDark;\n' + sh.fragmentShader
    fs = rep(fs, '#include <map_fragment>', `#include <map_fragment>
      {
        vec2 fu = vMapUv;
        float side = fu.x < 0.5 ? 0.0 : 1.0;
        vec2 c = vec2( mix( 0.385, 0.618, side ), 0.347 );          // eye center (lid seam midpoint)
        vec2 e = ( fu - c ) / vec2( 0.075, 0.034 );                  // eye shadow oval
        float r = length( e );
        float inEye = 1.0 - smoothstep( 0.75, 1.15, r );
        // skin reference color: the cheek right below the oval (same texture, follows the skin)
        vec3 skinRef = texture2D( map, c + vec2( 0.0, 0.07 ) ).rgb;
        float lash = smoothstep( 0.328, 0.336, fu.y ) * ( 1.0 - smoothstep( 0.345, 0.349, fu.y ) ) * ( 1.0 - smoothstep( 0.55, 0.8, abs( e.x ) ) );
        float liner = 1.0 - smoothstep( 0.012, 0.03, dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, max( diffuseColor.rgb, skinRef ), inEye * ( 1.0 - lash ) * ( 1.0 - liner ) * 0.6 * stLidK );
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * stLidDark, lash * stLidK );
      }`, 'lid', mat.name)
    sh.fragmentShader = fs
  })
  return true
}

// Detail flattening for cloth / gear: mip bias on the albedo texture sample (fabric texture, stains, scratches smeared into color blocks), normal map strength discounted (fewer broken fold shadows).
// Leaves the face (features need detail), hair (the cav patch changes diffuseColor after map_fragment and would be overwritten here) and eye shells alone
export function flatten(mat, mesh, { bias = 1, normal = 0.6 } = {}) {
  if (!mat.isMeshStandardMaterial || isCornea(mesh) || isEyeShadow(mesh) || isHair(mat) || /_head$/.test((mat.name || '').toLowerCase())) return false
  if (mat.normalScale) mat.normalScale.multiplyScalar(normal)
  if (!mat.map || bias <= 0) return true
  patchShader(mat, 'stFlat', (sh) => {
    sh.uniforms.stMipB = SU.stMipB
    sh.fragmentShader = rep('uniform float stMipB;\n' + sh.fragmentShader, '#include <map_fragment>',
      '#include <map_fragment>\n  diffuseColor.rgb = diffuse * texture( map, vMapUv, stMipB ).rgb;', 'flat', mat.name)
  })
  return true
}

// Per frame: key light direction and color (× intensity) in camera space, for the step to identify the lamp and compute the shadow factor
const _a = new THREE.Vector3(), _b = new THREE.Vector3()
export function shadeFrame(stage) {
  const k = stage.key
  stage.camera.updateMatrixWorld(); k.updateMatrixWorld(); k.target.updateMatrixWorld()
  _a.setFromMatrixPosition(k.matrixWorld); _b.setFromMatrixPosition(k.target.matrixWorld)
  SU.stKeyDir.value.copy(_a.sub(_b)).transformDirection(stage.camera.matrixWorldInverse)
  SU.stKeyCol.value.copy(k.color).multiplyScalar(k.intensity)
}
