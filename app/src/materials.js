// Material touch-ups: on top of three's physical materials, add what the game has but glTF can't express
//  - human skin: the game's thk map (scatter color × skin mask) drives wrapped-lighting subsurface transmission, a warm red glow at the terminator
import * as THREE from 'three'

const loader = new THREE.TextureLoader()
const loadTex = (url) => new Promise((ok, fail) => loader.load(url, ok, undefined, fail))

export const skinParams = { sss: 1.0, wrap: 0.55 }
const uniformsList = []

export async function enhanceMaterials(root, base) {
  let index = {}
  try { index = await fetch(base + 'tex/index.json').then(r => r.json()) } catch { return }
  const jobs = []
  root.traverse(o => {
    if (!o.isMesh) return
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const info = index[m.name]
      const thk = info?.maps?.thk?.file
      if (!thk || m.userData.sss) continue
      m.userData.sss = true
      jobs.push(loadTex(base + thk).then(t => {
        t.flipY = false
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = 4
        patchSkin(m, t)
      }))
    }
  })
  await Promise.all(jobs)
}

function patchSkin(mat, thkTex) {
  const u = { thkMap: { value: thkTex }, sssStrength: { value: skinParams.sss }, sssWrap: { value: skinParams.wrap } }
  uniformsList.push(u)
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.defines = { ...(sh.defines || {}), PET_SSS: '' }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_pars_fragment>',
        'uniform sampler2D thkMap;\nuniform float sssStrength;\nuniform float sssWrap;\nvec3 gSSS = vec3(0.0);\n#include <lights_physical_pars_fragment>')
      .replace('#include <map_fragment>',
        '#include <map_fragment>\ngSSS = texture2D(thkMap, vMapUv).rgb * sssStrength;')
    // add a term after direct-light diffuse: the part wrapped lighting adds over Lambert, tinted with the scatter color
    sh.fragmentShader = sh.fragmentShader.replace(
      'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );',
      `reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
      float wNL = saturate( ( dot( geometryNormal, directLight.direction ) + sssWrap ) / ( 1.0 + sssWrap ) );
      reflectedLight.directDiffuse += gSSS * max( wNL - dotNL, 0.0 ) * directLight.color * BRDF_Lambert( material.diffuseContribution ) * 2.2;`)
  }
  mat.customProgramCacheKey = () => 'pet_sss'
  mat.needsUpdate = true
}

export function setSkin(p) {
  Object.assign(skinParams, p)
  for (const u of uniformsList) { u.sssStrength.value = skinParams.sss; u.sssWrap.value = skinParams.wrap }
}

// Chain shader patches: keep the material's existing onBeforeCompile (skin subsurface etc.), then run fn; key goes into the program cache key
export function patchShader(mat, key, fn) {
  const prev = mat.onBeforeCompile
  const prevKey = mat.customProgramCacheKey
  mat.onBeforeCompile = (sh, r) => { prev?.call(mat, sh, r); fn(sh, r) }
  mat.customProgramCacheKey = () => prevKey.call(mat) + '|' + key
  mat.needsUpdate = true
}
