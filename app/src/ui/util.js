// Small shared UI helpers: layout constants, springs, pixel snapping, element creation, number formatting
//  All parts (hud / xpbar / rankup / panel) take these from here; don't write your own copy

// Layout constants (CSS pixels). The HUD band height decides how far the floor is raised: main.js uses ui.band (0 with the HUD off)
export const LAYOUT = {
  band: 46,        // HUD band: her floor is this much above the taskbar top (plus footSink × ppm + 3, see ui.band in index.js)
  footSink: 0.105, // front foot perspective sink: the front foot's contact point projects this much below the foot reference (× pixels per meter; measured 15 / 17 / 23 px at S / M / L)
  hudRow: 20,      // HUD row height
  hudGap: 3,       // gap between the two rows
  hudBottom: 2,    // HUD bottom edge above the taskbar top
  hudSlant: 9,     // horizontal offset of the HUD parallelogram (right edge leans right): 9 / 20 = 0.45, measured from the match source image (mockup v5 used 7, too upright)
  hudStroke: 1.5,  // HUD stroke width
  edge: 8,         // margin kept when a part hits the screen edge
}

// Critically damped spring (no overshoot): s = { x, v }, larger omega follows tighter (6 ≈ lags half a beat, 12 ≈ very responsive)
// dt in seconds; stable even with large dt while sleeping at 20 fps (analytic solution, not Euler integration)
export function spring(s, target, omega, dt) {
  const d = s.x - target
  const e = Math.exp(-omega * dt)
  const k = (s.v + omega * d) * dt
  s.x = target + (d + k) * e
  s.v = (s.v - omega * k) * e
  return s.x
}
// Exponential approach (first-order low-pass): 63% after tau seconds
export const approach = (cur, target, tau, dt) => tau <= 0 ? target : cur + (target - cur) * (1 - Math.exp(-dt / tau))

// Snap to device pixels: transforms land on whole pixels, text and 1.5 px strokes stay sharp
export function snap(v) {
  const d = window.devicePixelRatio || 1
  return Math.round(v * d) / d
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v
// Soft clamp: starts closing in exponentially within soft of a bound, stops at the bound however far past it goes; value and slope are continuous (decelerates to a stop at the edge instead of hitting a wall). Shared by XP bar and HUD
export function softClamp(v, a, b, soft) {
  if (b < a) return a
  const s = Math.min(soft, (b - a) / 2)
  if (v > b - s) return b - s * Math.exp(-(v - (b - s)) / s)
  if (v < a + s) return a + s * Math.exp(-(a + s - v) / s)
  return v
}
// Quantize a value (for per-frame "did it change" checks, no strings): q(0.12345) = 0.123, q(v, 100) = two decimals
export const q = (v, k = 1000) => Math.round(v * k) / k
// Per-frame positioning: only write transform when the coordinates changed (unchanged frames create no strings and don't touch styles)
//   const at = { x: NaN, y: NaN }; place(el, snap(x), snap(y), at)
export function place(e, x, y, at) {
  if (x === at.x && y === at.y) return
  at.x = x; at.y = y
  e.style.transform = `translate3d(${x}px, ${y}px, 0)`
}
// Same idea: only write opacity when it changes by more than 0.002. An exponential approach never reaches 0 / 1: within 0.005 of either end snap to it (1 = no semi-transparent compositing group left,
//  0 = also visibility: hidden, so hidden parts drop out of compositing)
export function fade(e, a, at) {
  a = a > 0.995 ? 1 : a < 0.005 ? 0 : a
  if (Math.abs(a - at.a) < 0.002 && !(a === 0 && at.a !== 0) && !(a === 1 && at.a !== 1)) return
  if ((a === 0) !== (at.a === 0)) e.style.visibility = a === 0 ? 'hidden' : ''
  at.a = a
  e.style.opacity = a >= 1 ? '' : a.toFixed(3)
}

// Create an element: el('div', 'ui-hud', '<b>..</b>')
export function el(tag, cls, html) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}
// Only write to the DOM when the text changed (no layout thrash even when called every frame)
export function setText(e, s) {
  s = String(s)
  if (e.textContent !== s) e.textContent = s
  return e
}
// Text containing CJK characters uses a different optical centering (see .ui-tx / .ui-tx.cjk in base.css)
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/
export const hasCJK = (s) => CJK.test(s)
// Write text + toggle .cjk automatically: the optical-centering class .ui-tx picks the Latin or CJK ink box by content
export function tx(e, s) {
  setText(e, s)
  e.classList.toggle('cjk', hasCJK(e.textContent))
  return e
}

// Number formatting
//  3120 → '3.1k', 980 → '980', 2000 → '2.0k' (one decimal, stable digit count), 125000 → '125k', 1250000 → '1.3M'
export function kfmt(n) {
  n = Math.max(0, Math.round(n))
  if (n < 1000) return String(n)
  if (n < 1e5) return (Math.floor(n / 100) / 10).toFixed(1) + 'k'     // round down: don't show 5.0k before reaching 5.0k
  if (n < 1e6) return Math.floor(n / 1000) + 'k'
  return (Math.floor(n / 1e5) / 10).toFixed(1) + 'M'
}
//  ms → 'H:MM' (time together today: always hours:minutes, 0:42 = 42 minutes, 2:14 = 2 hours 14 minutes)
export function hmm(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
// Roman numerals (divisions IV → I)
export const ROMAN = ['', 'I', 'II', 'III', 'IV']
// Local date key: '2026-09-27' (today's stats reset at local midnight)
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Minimal events: const ev = emitter(); ev.on('x', f) returns an unsubscribe function; ev.emit('x', data)
export function emitter() {
  const L = {}
  return {
    on(type, f) { (L[type] ||= []).push(f); return () => { L[type] = L[type].filter(g => g !== f) } },
    emit(type, data) { for (const f of L[type] || []) { try { f(data) } catch (e) { console.error(e) } } },
  }
}
