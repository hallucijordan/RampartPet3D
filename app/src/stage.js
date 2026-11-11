// Render pipeline: character drawn into an HDR multisampled target (supersampling), shadow in a separate target,
// final pass composites to the canvas: downsample + tone mapping + outline + contact shadow, premultiplied alpha output.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export const POST_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

export const POST_FRAG = /* glsl */`
uniform sampler2D tChar;
uniform sampler2D tShadow;
uniform vec2 charTexel;
uniform float exposure;
uniform float saturation;
uniform vec3 outlineColor;
uniform float outlineAlpha;
uniform float outlineWidth;   // output pixels
uniform float shadowAlpha;
uniform float contrast;
uniform float hitMode;   // 1: output only character alpha (for click hit testing, no shadow or outline)
varying vec2 vUv;

// Khronos PBR Neutral: highlights don't shift hue, skin tones stay faithful
vec3 neutralTM(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  // supersampled source: 2x2 block mean (bilinear sample at block center), plus four diagonal taps for a slight tent filter
  vec4 c = texture2D(tChar, vUv) * 0.5;
  c += texture2D(tChar, vUv + charTexel * vec2( 1.0,  1.0)) * 0.125;
  c += texture2D(tChar, vUv + charTexel * vec2(-1.0,  1.0)) * 0.125;
  c += texture2D(tChar, vUv + charTexel * vec2( 1.0, -1.0)) * 0.125;
  c += texture2D(tChar, vUv + charTexel * vec2(-1.0, -1.0)) * 0.125;

  float a = c.a;
  vec3 col = a > 1e-4 ? c.rgb / a : vec3(0.0);
  col = neutralTM(col * exposure);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, saturation);
  col = clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
  col = toSRGB(col);

  // outline: dilated alpha minus itself (character layer only, shadow gets no outline)
  float dil = 0.0;
  vec2 px = charTexel * 2.0 * outlineWidth;
  for (int i = 0; i < 12; i++) {
    float ang = float(i) * 0.5235988;
    dil = max(dil, texture2D(tChar, vUv + vec2(cos(ang), sin(ang)) * px).a);
  }
  float ol = clamp(dil - a, 0.0, 1.0) * outlineAlpha;

  float sh = texture2D(tShadow, vUv).a * shadowAlpha;

  if (hitMode > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, a); return; }
  // premultiplied composite: character over outline over shadow
  vec4 outc = vec4(col * a, a);
  float olA = ol * (1.0 - outc.a);
  outc.rgb += outlineColor * olA;
  outc.a += olA;
  float shA = sh * (1.0 - outc.a);
  outc.a += shA;   // shadow is black, rgb unchanged
  gl_FragColor = outc;
}
`

// Selectable looks (the "look" option in the settings panel, config.look): fix = original look + render bug fixes (default), sticker = Apex sticker
const LOOKS = {
  fix: () => import('./looks/fix.js'),
  sticker: () => import('./looks/sticker.js'),
}
const DEFAULT_LOOK = 'fix'

export class Stage {
  constructor(canvas, { cssW = 560, cssH = 680, ss = 2 } = {}) {
    this.canvas = canvas
    this.ss = ss
    const r = this.renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, premultipliedAlpha: true, antialias: false,
      powerPreference: 'high-performance', stencil: false, depth: false,
    })
    r.setClearColor(0x000000, 0)
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFShadowMap
    r.shadowMap.autoUpdate = false
    r.outputColorSpace = THREE.LinearSRGBColorSpace  // post-processing converts to sRGB itself

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(20, cssW / cssH, 0.5, 60)

    // ambient: soft indoor IBL, gives metal and cloth a bit of reflection
    const pmrem = new THREE.PMREMGenerator(r)
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = this.envTex
    this.scene.environmentIntensity = 0.45
    pmrem.dispose()

    this._makeLights()
    this._makeShadowCatcher()
    this._makePost()
    this.resize(cssW, cssH)

    // look (src/looks/<name>.js): URL ?style= wins (debugging / recording; none = no look, i.e. as in 2.4.0),
    // then config.look (written by the settings panel, page reloads after a change), default fix (original look + render bug fixes). Nothing is drawn until decided
    this.look = null
    this.lookPending = true
    this._seenMats = new WeakSet()
    this.lookReady = this._pickLook().then(name => {
      if (name === 'none') return
      // release builds bundle only what's in LOOKS; in dev other names (diagnostic experiments) load directly by file name
      const load = LOOKS[name] || (import.meta.env.DEV && /^[a-z0-9_]+$/i.test(name)
        ? () => import(/* @vite-ignore */ `./looks/${name}.js`) : LOOKS[DEFAULT_LOOK])
      return load().then(m => this.setLook(m.default))
    }).catch(e => console.error('Failed to load look', e)).finally(() => { this.lookPending = false })
  }

  async _pickLook() {
    const q = new URLSearchParams(location.search).get('style')
    if (q) return q
    const cfg = await window.petAPI?.getConfig?.().catch(() => null)
    return cfg?.look || DEFAULT_LOOK
  }

  // Look extension points (all optional):
  //   setup(stage, THREE)                    once at load: change lights, environment, post params, create own render targets
  //   material(mat, mesh, stage)             first time each character / prop material appears (chain shader changes with patchShader from materials.js)
  //   postFrag / uniforms                    replace the composite shader / add uniforms (must keep hitMode: output only character alpha)
  //   depthTexture: true                     character target gets a depth texture, available as tDepth in the composite
  //   resize(stage, w, h)                    canvas size changed (w, h in output pixels)
  //   beforeRender(stage, petRoot, fxObjs)   start of each frame (extra passes)
  //   afterChar(stage, petRoot)              after the character is drawn, before compositing
  //   liftPx(stage)                          how many CSS px to shift the whole image up (so edges drawn outside the silhouette land on the ground line)
  //   fxLate: true                           particles are not drawn into the character target but into tFx (character depth written first to occlude what's behind), layered last in the composite:
  //                                          outline / sticker border computed from character alpha won't wrap sparks and dust (composite shader must read tFx / tFxOn, see lib/fix.js)
  setLook(look) {
    this.look = look
    look.setup?.(this, THREE)
    if (look.uniforms) Object.assign(this.postMat.uniforms, look.uniforms)
    if (look.postFrag) { this.postMat.fragmentShader = look.postFrag; this.postMat.needsUpdate = true }
    if (look.depthTexture) this.postMat.uniforms.tDepth ||= { value: null }
    this.resize(this.cssW, this.cssH)
  }

  _patchNewMaterials(root) {
    root.traverse(o => {
      if (!o.isMesh) return
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (this._seenMats.has(m)) continue
        this._seenMats.add(m)
        this.look.material(m, o, this)
        m.needsUpdate = true
      }
    })
  }

  _makeLights() {
    const s = this.scene
    // key light: warm, upper front left, casts shadows
    const key = this.key = new THREE.DirectionalLight(0xfff0dd, 3.0)
    key.position.set(-2.2, 4.2, 3.4)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    const sc = key.shadow.camera
    sc.left = -1.4; sc.right = 1.4; sc.top = 2.4; sc.bottom = -0.6; sc.near = 0.5; sc.far = 12
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.012
    key.shadow.radius = 3
    s.add(key, key.target)
    key.target.position.set(0, 0.9, 0)

    // fill light: cool, front right, low intensity
    const fill = this.fill = new THREE.DirectionalLight(0xcfe0ff, 0.5)
    fill.position.set(3, 1.6, 2.5)
    s.add(fill)

    // rim light: upper back right, separates her from any wallpaper
    const rim = this.rim = new THREE.DirectionalLight(0xffe2c0, 4.0)
    rim.position.set(2.6, 3.2, -3.0)
    s.add(rim)
    const rim2 = this.rim2 = new THREE.DirectionalLight(0xa8c8ff, 2.0)
    rim2.position.set(-3.0, 2.0, -2.5)
    s.add(rim2)

    // sky light / ground bounce
    const hemi = this.hemi = new THREE.HemisphereLight(0xdde8ff, 0x6b5a4a, 0.35)
    s.add(hemi)
  }

  // Contact shadow: an orthographic camera shoots the character's depth from the ground up, darker closer to the ground, blurred twice and mapped back onto the ground
  _makeShadowCatcher() {
    const W = 3.2, D = 2.4, H = 1.4
    this.cs = { W, D, H, size: 256, darkness: 2.4, blur: 2.0 }
    const rt = () => new THREE.WebGLRenderTarget(256, 256, { depthBuffer: false })
    this.csRT = rt(); this.csBlurRT = rt()
    this.csCam = new THREE.OrthographicCamera(-W / 2, W / 2, D / 2, -D / 2, 0, H)
    this.csCam.rotation.x = Math.PI / 2
    const dm = this.csDepth = new THREE.MeshDepthMaterial()
    dm.userData.darkness = { value: this.cs.darkness }
    dm.onBeforeCompile = (sh) => {
      sh.uniforms.darkness = dm.userData.darkness
      sh.fragmentShader = 'uniform float darkness;' + String.fromCharCode(10) + sh.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'float k = 1.0 - fragCoordZ; gl_FragColor = vec4( vec3( 0.0 ), k * k * darkness );')
    }
    dm.depthTest = false; dm.depthWrite = false
    const blurFrag = (dir) => `uniform sampler2D tDiffuse; uniform float h; varying vec2 vUv;
      void main() { vec4 s = vec4(0.0);
        s += texture2D(tDiffuse, vUv + ${dir} * -4.0 * h) * 0.051; s += texture2D(tDiffuse, vUv + ${dir} * -3.0 * h) * 0.0918;
        s += texture2D(tDiffuse, vUv + ${dir} * -2.0 * h) * 0.12245; s += texture2D(tDiffuse, vUv + ${dir} * -1.0 * h) * 0.1531;
        s += texture2D(tDiffuse, vUv) * 0.1633;
        s += texture2D(tDiffuse, vUv + ${dir} * 1.0 * h) * 0.1531; s += texture2D(tDiffuse, vUv + ${dir} * 2.0 * h) * 0.12245;
        s += texture2D(tDiffuse, vUv + ${dir} * 3.0 * h) * 0.0918; s += texture2D(tDiffuse, vUv + ${dir} * 4.0 * h) * 0.051;
        gl_FragColor = s; }`
    const vert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
    this.csBlurH = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, h: { value: 0 } }, vertexShader: vert, fragmentShader: blurFrag('vec2(1.0, 0.0)'), depthTest: false })
    this.csBlurV = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, h: { value: 0 } }, vertexShader: vert, fragmentShader: blurFrag('vec2(0.0, 1.0)'), depthTest: false })
    this.csQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.csBlurH)
    this.csQuad.frustumCulled = false
    this.csQuadScene = new THREE.Scene(); this.csQuadScene.add(this.csQuad)
    const pm = new THREE.MeshBasicMaterial({ map: this.csRT.texture, transparent: true, depthWrite: false, color: 0x000000, side: THREE.DoubleSide })
    // texture alpha only, used as shadow
    pm.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = texture2D( map, vMapUv ); diffuseColor = vec4(0.0, 0.0, 0.0, sampledDiffuseColor.a);') }
    const g = new THREE.PlaneGeometry(W, D)
    g.rotateX(-Math.PI / 2)
    g.scale(1, 1, -1)
    this.catcher = new THREE.Mesh(g, pm)
    this.catcher.position.y = 0.002
    this.catcher.frustumCulled = false
    this.scene.add(this.catcher)
  }

  _blurCS(amount) {
    const r = this.renderer
    this.csQuad.material = this.csBlurH
    this.csBlurH.uniforms.tDiffuse.value = this.csRT.texture
    this.csBlurH.uniforms.h.value = amount / 256
    r.setRenderTarget(this.csBlurRT); r.render(this.csQuadScene, this.postCam)
    this.csQuad.material = this.csBlurV
    this.csBlurV.uniforms.tDiffuse.value = this.csBlurRT.texture
    this.csBlurV.uniforms.h.value = amount / 256
    r.setRenderTarget(this.csRT); r.render(this.csQuadScene, this.postCam)
  }

  _makePost() {
    this.postScene = new THREE.Scene()
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tChar: { value: null },
        tShadow: { value: null },
        charTexel: { value: new THREE.Vector2() },
        exposure: { value: 1.0 },
        saturation: { value: 1.06 },
        contrast: { value: 1.04 },
        outlineColor: { value: new THREE.Color(0x1a120d) },
        outlineAlpha: { value: 0.5 },
        outlineWidth: { value: 1.0 },
        shadowAlpha: { value: 0.72 },
        hitMode: { value: 0 },
      },
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat)
    quad.frustumCulled = false
    this.postScene.add(quad)
  }

  resize(cssW, cssH) {
    this.cssW = cssW; this.cssH = cssH
    const dpr = window.devicePixelRatio || 1
    this.dpr = dpr
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(cssW, cssH, false)
    this.canvas.style.width = cssW + 'px'
    this.canvas.style.height = cssH + 'px'
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr)
    this.outW = w; this.outH = h
    this.camera.aspect = cssW / cssH
    this.camera.updateProjectionMatrix()

    this.rtChar?.dispose(); this.rtShadow?.dispose(); this.rtOut?.dispose()
    this.rtChar = new THREE.WebGLRenderTarget(w * this.ss, h * this.ss, {
      type: THREE.HalfFloatType, samples: 4, depthBuffer: true,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthTexture: this.look?.depthTexture ? new THREE.DepthTexture(w * this.ss, h * this.ss) : null,
    })
    this.rtShadow = new THREE.WebGLRenderTarget(Math.ceil(w / 2), Math.ceil(h / 2), {
      type: THREE.UnsignedByteType, samples: 0, depthBuffer: true,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    })
    // 8-bit output copy: read back asynchronously for per-pixel click hit testing
    this.rtOut = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false })
    this.postMat.uniforms.tChar.value = this.rtChar.texture
    this.postMat.uniforms.tShadow.value = this.rtShadow.texture
    this.postMat.uniforms.charTexel.value.set(1 / (w * this.ss), 1 / (h * this.ss))
    if (this.postMat.uniforms.tDepth) this.postMat.uniforms.tDepth.value = this.rtChar.depthTexture
    this.rtFx?.dispose(); this.rtFx = null   // particle target created only when particles first appear (_renderFxLate)
    this.look?.resize?.(this, w, h)
  }

  // Particles drawn late (look.fxLate): skipped entirely with no live particles; otherwise write character and props as depth only (sparks behind her get occluded), then draw only the particles.
  // Can't draw back into the character target: three drops its color buffer after the multisample resolve, drawing into it again wipes out the character
  _renderFxLate(petRoot, fxObjs) {
    const r = this.renderer
    const alive = fxObjs.some(o => o.isPoints ? o.geometry.attributes.life?.array.some(v => v > 0) : o.children?.length > 0)
    this.postMat.uniforms.tFxOn.value = alive ? 1 : 0
    if (!alive) return
    if (!this.rtFx) {   // about 12 MB VRAM at size s; not allocated normally (no sparks, no dust)
      this.rtFx = new THREE.WebGLRenderTarget(this.outW * this.ss, this.outH * this.ss, {
        type: THREE.HalfFloatType, samples: 0, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      })
      this.postMat.uniforms.tFx.value = this.rtFx.texture
    }
    this._depthOnly ||= new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })
    r.setRenderTarget(this.rtFx)
    r.setClearColor(0x000000, 0)
    r.clear(true, true, false)
    const ac = r.autoClear
    r.autoClear = false
    this.scene.overrideMaterial = this._depthOnly
    r.render(this.scene, this.camera)          // particles still hidden at this point
    this.scene.overrideMaterial = null
    petRoot.visible = false
    for (const o of fxObjs) o.visible = true
    r.render(this.scene, this.camera)
    petRoot.visible = true
    r.autoClear = ac
  }

  // petRoot: root of character and props; fxObjs: effects (no contact shadow, not in the shadow layer)
  render(petRoot, fxObjs = []) {
    if (this.lookPending) return   // look not decided yet (reading config, loading module, a few ms): skip drawing so the first frame doesn't flash the plain look
    const r = this.renderer
    const cam = this.camera
    const setVis = (arr, v) => { for (const o of arr) o.visible = v }
    const look = this.look
    if (look?.material) this._patchNewMaterials(petRoot)
    look?.beforeRender?.(this, petRoot, fxObjs)
    // shift the whole image up by lift CSS px (things like the sticker border drawn outside the silhouette land on the ground line instead of being cut by the taskbar):
    // only the projection is shifted while drawing (changing the z column = whole screen-space translation), stage.project() is unchanged, so foot placement, bubbles and hit testing follow the drawn image
    const lift = look?.liftPx?.(this) || 0
    const pm = cam.projectionMatrix.elements
    if (lift) pm[9] -= 2 * lift / this.cssH

    // 1) character (also updates the self-shadow map)
    const fxLate = !!(look?.fxLate && this.postMat.uniforms.tFx)
    if (fxLate) setVis(fxObjs, false)
    this.catcher.visible = false
    r.shadowMap.needsUpdate = true
    r.setRenderTarget(this.rtChar)
    r.setClearColor(0x000000, 0)
    r.clear(true, true, false)
    r.render(this.scene, cam)
    look?.afterChar?.(this, petRoot)
    if (fxLate) { this._renderFxLate(petRoot, fxObjs); setVis(fxObjs, true) }

    // 2), 3) contact shadow (skipped entirely for looks with composite opacity 0, shadow layer cleared once)
    if (this.postMat.uniforms.shadowAlpha.value > 0) {
      // 2) shoot depth from the ground up, blur
      setVis(fxObjs, false)
      this.csDepth.userData.darkness.value = this.cs.darkness
      this.scene.overrideMaterial = this.csDepth
      r.setRenderTarget(this.csRT)
      r.clear(true, false, false)
      r.render(this.scene, this.csCam)
      this.scene.overrideMaterial = null
      this._blurCS(this.cs.blur)
      this._blurCS(this.cs.blur * 0.45)

      // 3) shadow layer: ground shadow only
      petRoot.visible = false
      this.catcher.visible = true
      r.setRenderTarget(this.rtShadow)
      r.clear(true, true, false)
      r.render(this.scene, cam)
      petRoot.visible = true
      this.catcher.visible = false
      setVis(fxObjs, true)
      this._shadowDirty = true
    } else if (this._shadowDirty !== false) {
      r.setRenderTarget(this.rtShadow)
      r.clear(true, true, false)
      this._shadowDirty = false
    }
    if (lift) pm[9] += 2 * lift / this.cssH

    // 4) composite into the 8-bit copy (for hit testing) and the canvas
    if (this.wantReadback) {
      this.postMat.uniforms.hitMode.value = 1
      r.setRenderTarget(this.rtOut)
      r.render(this.postScene, this.postCam)
      this.postMat.uniforms.hitMode.value = 0
    }
    r.setRenderTarget(null)
    r.render(this.postScene, this.postCam)
  }

  // Asynchronously read back alpha at canvas coordinate (x, y) (CSS px, top-left origin)
  async alphaAt(x, y) {
    const px = Math.floor(x * this.dpr), py = Math.floor((this.cssH - y) * this.dpr)
    if (px < 0 || py < 0 || px >= this.outW || py >= this.outH) return 0
    const buf = new Uint8Array(4)
    try {
      await this.renderer.readRenderTargetPixelsAsync(this.rtOut, px, py, 1, 1, buf)
    } catch { return 0 }
    return buf[3] / 255
  }

  // Project a world point to canvas CSS coordinates
  project(v3) {
    const v = v3.clone().project(this.camera)
    return { x: (v.x * 0.5 + 0.5) * this.cssW, y: (-v.y * 0.5 + 0.5) * this.cssH }
  }
}
