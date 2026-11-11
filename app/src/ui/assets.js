// UI images: name → absolute runtime URL, also set as CSS variables on :root
//  Images live in assets/ui/img/ (vite publicDir, copied as-is to dist/ui/img/ when packaged); sources are listed in SOURCES.txt there; not in git
//  URLs must be built at runtime from document.baseURI: http://localhost:5176/ui/img/x.png in dev, app://pet/dist/ui/img/x.png when packaged
//  CSS always uses the variables: background: var(--ui-img-tex-dots); -webkit-mask: var(--ui-img-hud-kills) center / contain no-repeat
//  Variable name = --ui-img- + file name with _ replaced by - (rank_gold_icon → --ui-img-rank-gold-icon)

const TIER_IDS = ['rookie', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'apex']

export const IMAGES = [
  // Ranks: large badge rank_<tier>, small icon rank_<tier>_icon
  ...TIER_IDS.flatMap(t => [`rank_${t}`, `rank_${t}_icon`]),
  // Rank-up effects (white light images used as masks, fill = rank color)
  'fx_glow', 'fx_starburst', 'fx_rays', 'fx_ring_white',
  // HUD icons (white, tinted via mask)
  'hud_kills', 'hud_damage', 'hud_assist', 'hud_squad',
  // Menu
  'ic_check', 'ic_star', 'ic_lock', 'line_dashed', 'legend_face', 'legend_diamond',
  // 9-slice frames (white, tinted via -webkit-mask-box-image)
  'frame_b084', 'frame_b057', 'frame_b106',
  // Lines / textures
  'div_step', 'div_thin', 'corner_hatch', 'tex_twill', 'tex_noise', 'tex_dots',
]
// Only list what's used: everything is pre-decoded at startup, unused images just waste memory (the other images in assets/ui/img are alternates, not wired in)

const cache = new Map()
export function imgUrl(name) {
  let u = cache.get(name)
  if (!u) { u = new URL(`./ui/img/${name}.png`, document.baseURI).href; cache.set(name, u) }
  return u
}
export const imgVar = (name) => `--ui-img-${name.replace(/_/g, '-')}`

// Set every image as a :root variable; pre-decode in the background (so the rank-up effect doesn't flash the first time). A load failure only logs one warning, no error (icons / frames whose mask didn't arrive just don't show, fills and text are unaffected)
export function applyImageVars(root = document.documentElement) {
  for (const n of IMAGES) root.style.setProperty(imgVar(n), `url("${imgUrl(n)}")`)
  const bad = []
  const all = IMAGES.map(n => {
    const im = new Image()
    im.src = imgUrl(n)
    return im.decode().catch(() => bad.push(n))
  })
  return Promise.all(all).then(() => { if (bad.length) console.warn('UI images failed to load: ' + bad.join(', ')) })
}

// Source image sizes (pixels): for computing width from height (only images used in IMAGES)
export const IMG_SIZE = {
  corner_hatch: [202, 40], div_step: [250, 24], div_thin: [208, 12], frame_b057: [334, 91], frame_b084: [202, 130], frame_b106: [156, 123],
  fx_glow: [108, 108], fx_rays: [958, 1034], fx_ring_white: [431, 431], fx_starburst: [256, 256],
  hud_assist: [74, 57], hud_damage: [121, 73], hud_kills: [41, 49], hud_squad: [103, 100],
  ic_check: [80, 76], ic_lock: [73, 90], ic_star: [119, 130], legend_diamond: [106, 106], legend_face: [209, 252],
  line_dashed: [174, 12], rank_apex: [396, 366], rank_apex_icon: [59, 62], rank_bronze: [328, 332], rank_bronze_icon: [50, 50],
  rank_diamond: [368, 387], rank_diamond_icon: [55, 58], rank_gold: [336, 334], rank_gold_icon: [51, 51], rank_master: [388, 398],
  rank_master_icon: [60, 60], rank_platinum: [330, 334], rank_platinum_icon: [50, 51], rank_rookie: [314, 333], rank_rookie_icon: [47, 51],
  rank_silver: [338, 333], rank_silver_icon: [51, 51], tex_dots: [494, 71], tex_noise: [64, 64], tex_twill: [64, 128],
}
// Note: don't nudge icons with sub-pixel translates (the compositor rounds them to 1 px, in practice any nudge overshoots); to fine-tune, change the icon height or move the mask position (only ≥ 0.5 px lands back on a whole pixel)

// HTML for a white icon (tinted via mask): sized by height (these images have only 1–2 px of padding, element box ≈ ink box), centered when placed in a flex container with align-items: center
//   icon('hud_kills', 14)  icon('ic_check', 12, 'var(--ui-red)')
//   int = true: round the width (for blocks laid out on whole pixels like the HUD, so following content doesn't land on half pixels)
//   use an even h inside an even-height box (the 20 px HUD row) so the icon lands on whole pixels and is sharpest
export function icon(name, h, color, cls = '', int = false) {
  const [W, H] = IMG_SIZE[name] || [1, 1]
  const w = int ? Math.round(W * h / H) : +(W * h / H).toFixed(2)
  return `<i class="ui-ic ${cls}" style="--src: var(${imgVar(name)}); --w: ${w}px; --h: ${h}px; ${color ? `--c: ${color}; ` : ''}"></i>`
}
