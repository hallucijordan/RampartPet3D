// Sticker die-cut border: one separable Gaussian blur of the character alpha at output resolution (two small fullscreen passes, alpha only, no scene redraw),
// and in the composite the blurred alpha is thresholded as the "die-cut line":
//   - cream frame: within bw output pixels of the silhouette, narrow gaps (< about 2·bw) get filled, just like a real sticker's die cut
//   - thin grey outer rim: a translucent warm grey ring rimW px outside the die-cut line, which separates the cream border from light window backgrounds
//   - shadow: blurred alpha offset dsOff px to the lower right, then soft-thresholded, for a sticker lifting slightly off the desk (replaces the ground contact shadow)
// The dark inner outline reuses stage's alpha dilation outline (outlineColor / outlineAlpha), not duplicated here.
// Usage: const B = stickerBorder(opts); in the look, splice decl/final into postFix, merge uniforms, forward resize / afterChar.
// Distance doesn't use fwidth (2×2 pixel block differences jump around on the Gaussian tail and the die-cut line crawls under sub-pixel motion, measured TL(err) p99 16):
// for a straight edge the blurred alpha = 0.5·erfc(d / (σ√2)), inverted d = σ√2·erfcinv(2·bA) is the "distance to the character silhouette" (pixels),
// a smooth function of the blur field with no derivative noise; at corners and thin hair strands it's an approximate distance but still smooth. Die-cut line = where d equals bw.
// Thin hair strands (1 px wide) still raise a border around bw via the Gaussian line response; isolated 1 px dots don't get their own border.
import * as THREE from 'three'

// erfcinv (Giles 2010 single-precision erfinv approximation, erfcinv(y) = erfinv(1 − y), (1−x)(1+x) written directly as y(2−y) to avoid cancellation at small y)
const ERFCINV = `
float stErfcinv(float y) {
  y = clamp(y, 1e-7, 1.9999999);
  float w = -log(y * (2.0 - y)), p;
  if (w < 5.0) {
    w -= 2.5;
    p = 2.81022636e-08; p = 3.43273939e-07 + p * w; p = -3.5233877e-06 + p * w; p = -4.39150654e-06 + p * w;
    p = 0.00021858087 + p * w; p = -0.00125372503 + p * w; p = -0.00417768164 + p * w; p = 0.246640727 + p * w; p = 1.50140941 + p * w;
  } else {
    w = sqrt(w) - 3.0;
    p = -0.000200214257; p = 0.000100950558 + p * w; p = 0.00134934322 + p * w; p = -0.00367342844 + p * w;
    p = 0.00573950773 + p * w; p = -0.0076224613 + p * w; p = 0.00943887047 + p * w; p = 1.00167406 + p * w; p = 2.83297682 + p * w;
  }
  return p * (1.0 - y);
}`

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
// 1D Gaussian (taps over ±R output pixels); the first pass reads the supersampled character target directly: bilinear sample at the output pixel center = 2×2 block mean
const blurFrag = (R) => `uniform sampler2D tSrc; uniform vec2 dir; uniform float sigma; varying vec2 vUv;
void main() {
  float s = 0.0, w = 0.0;
  for (int i = -${R}; i <= ${R}; i++) {
    float k = exp(-0.5 * float(i * i) / (sigma * sigma));
    s += texture2D(tSrc, vUv + dir * float(i)).a * k; w += k;
  }
  gl_FragColor = vec4(0.0, 0.0, 0.0, s / w);
}`

export function stickerBorder({
  bw = 2.5,                 // cream border width (output pixels, measured from the character silhouette)
  sigma = 1.8,              // blur σ (output pixels): larger = rounder die-cut line, more gap filling
  cream = [0.965, 0.945, 0.9],   // cream (sRGB encoded values)
  creamIn = null,                // color of the 1 px hugging the outline (an Apex sticker's grey border has a bright line on the inner side); null = same as cream
  rimW = 0.9, rimA = 0.42, aa = 1.0, rim = [0.42, 0.37, 0.33],   // thin outer rim: width (px), opacity, color (sRGB)
  dsOff = [0.9, 1.6], dsA = 0.26, dsSoft = 2.2,         // shadow: offset (px, right, down), opacity, softening (px)
  refH = 550, maxK = 1.6,   // the pixel values above are set for "canvas height 550 output pixels" (size s, 100% scale); larger sizes / scales scale with canvas height, up to maxK×
} = {}) {
  const R = Math.ceil(sigma * maxK * 3)
  const U = {
    tStBlur: { value: null }, stBw: { value: bw }, stSig: { value: sigma * Math.SQRT2 }, stCream: { value: new THREE.Vector3(...cream) }, stCreamIn: { value: new THREE.Vector3(...(creamIn || cream)) },
    stAA: { value: aa }, stRimW: { value: rimW }, stRimA: { value: rimA }, stRim: { value: new THREE.Vector3(...rim) },
    stDsOff: { value: new THREE.Vector2() }, stDsA: { value: dsA }, stDsSoft: { value: dsSoft },
  }
  const mk = () => new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2() }, sigma: { value: sigma } },
    vertexShader: VERT, fragmentShader: blurFrag(R), depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  })
  const mH = mk(), mV = mk()
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mH)
  quad.frustumCulled = false
  const scene = new THREE.Scene(); scene.add(quad)
  let rtA = null, rtB = null, W = 1, H = 1
  const opt = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }

  return {
    uniforms: U,
    // composite shader: decl goes before main, final before output (hitMode has already returned, hit testing unaffected)
    decl: /* glsl */`
uniform sampler2D tStBlur; uniform float stBw; uniform float stSig; uniform vec3 stCream; uniform vec3 stCreamIn;
uniform float stAA; uniform float stRimW; uniform float stRimA; uniform vec3 stRim;
uniform vec2 stDsOff; uniform float stDsA; uniform float stDsSoft;
${ERFCINV}
float stDist(vec2 uv) { return stSig * stErfcinv(2.0 * texture2D(tStBlur, uv).a); }   // distance to the character silhouette (px, negative inside)`,
    final: /* glsl */`
  {
    float d0 = stDist(vUv), d = stBw - d0;                                  // signed distance to the die-cut line (px, positive inside, negative outside)
    float cr = clamp(d / stAA + 0.5, 0.0, 1.0);                    // cream area (includes the character interior, covered anyway); transition width stAA px
    float rm = clamp((d + stRimW) / stAA + 0.5, 0.0, 1.0) - cr;    // thin rim rimW px outside the die-cut line
    float sd = (1.0 - smoothstep(stBw - 0.5, stBw + stDsSoft, stDist(vUv - stDsOff))) * stDsA;   // shadow: same distance ruler after the offset
    float k = cr * (1.0 - outc.a);  outc.rgb += mix(stCreamIn, stCream, smoothstep(0.9, 1.9, d0)) * k;  outc.a += k;
    k = rm * stRimA * (1.0 - outc.a);  outc.rgb += stRim * k;  outc.a += k;
    k = sd * (1.0 - outc.a);  outc.a += k;              // shadow is black, rgb unchanged
  }`,
    resize(stage, w, h) {
      rtA?.dispose(); rtB?.dispose()
      rtA = new THREE.WebGLRenderTarget(w, h, opt); rtB = new THREE.WebGLRenderTarget(w, h, opt)
      W = w; H = h
      U.tStBlur.value = rtB.texture
      // the sticker border scales with the character (a real sticker's die cut and artwork are one sheet); the inner outline and thin outer rim are line widths, not scaled
      const k = Math.min(maxK, Math.max(0.75, h / refH))
      U.stBw.value = bw * k; U.stSig.value = sigma * k * Math.SQRT2; U.stDsSoft.value = dsSoft * k
      mH.uniforms.sigma.value = mV.uniforms.sigma.value = sigma * k
      U.stDsOff.value.set(dsOff[0] * k / w, -dsOff[1] * k / h)   // uv y points up: offset downward = sample above
    },
    // after the character is drawn: alpha -> horizontal blur -> vertical blur
    afterChar(stage) {
      const r = stage.renderer
      quad.material = mH
      mH.uniforms.tSrc.value = stage.rtChar.texture; mH.uniforms.dir.value.set(1 / W, 0)
      r.setRenderTarget(rtA); r.render(scene, stage.postCam)
      quad.material = mV
      mV.uniforms.tSrc.value = rtA.texture; mV.uniforms.dir.value.set(0, 1 / H)
      r.setRenderTarget(rtB); r.render(scene, stage.postCam)
    },
  }
}
