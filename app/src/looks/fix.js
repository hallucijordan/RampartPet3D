// Look "fix": the original look + diagnosed bug fixes, no taste changes (lights, ambient, exposure, saturation, contrast values all as before).
// Fixes (see lib/fix.js):
//   composite: contrast / saturation moved to display space, no more black clipping; outline color interpreted as sRGB
//   skin: the subsurface in materials.js actually takes effect (base skin head and body; Rebecca skin body excluded)
//   eyes: cornea only adds highlights (no longer 15% black glass), no catchlight, eyelid shadow shell unchanged
//   hair: cav removed from baseColor, multiplies the specular instead
//   contact shadow: only geometry within 0.35 m of the ground casts
// URL parameters for diagnostics / acceptance (defaults = the setup above):
//   fx_ci catchlight peak (0 off)  fx_cpx catchlight σ (output pixels)  fx_cdir direction x,y,z (camera space)  fx_mask=1 cornea outputs a constant (find the eye pixels)
//   fx_esA eyelid shadow shell opacity  fx_fn / fx_fns face normals (normal map -> geometry, -> sphere)  fx_saa=1 specular anti-aliasing
//   fx_env=skin:1,0.5;cloth:1,0.45  ambient [diffuse, specular] per class  fx_toe toe multiplier
//   turn off single items: fx_post=0 fx_sss=0 fx_cor=0 fx_hc=0 fx_cs=0; fx_sssx=none don't exclude the Rebecca skin body
import { fixLook } from './lib/fix.js'

const q = new URLSearchParams(location.search)
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d)
const off = (k) => q.get(k) === '0'
const env = q.get('fx_env') ? Object.fromEntries(q.get('fx_env').split(';').map(s => { const [k, v] = s.split(':'); return [k, v.split(',').map(Number)] })) : null

export default fixLook({
  post: off('fx_post') ? false : { toeK: num('fx_toe', 1) },
  sss: off('fx_sss') ? false : { exclude: q.get('fx_sssx') === 'none' ? null : /clockup/ },
  cornea: off('fx_cor') ? false : {
    catchI: num('fx_ci', 0), catchPx: num('fx_cpx', 0.4), mask: q.get('fx_mask') === '1',
    ...(q.get('fx_cdir') ? { catchDir: q.get('fx_cdir').split(',').map(Number) } : {}),
  },
  eyeShadow: num('fx_esA', 1),
  hairCav: !off('fx_hc'),
  env,
  faceN: q.has('fx_fn') || q.has('fx_fns') ? { k: num('fx_fn', 0), sphere: num('fx_fns', 0) } : null,
  specAA: q.get('fx_saa') === '1' ? {} : null,
  cs: off('fx_cs') ? false : {},
})
