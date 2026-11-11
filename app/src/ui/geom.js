// UI geometry: the HUD's blunt parallelograms, chamfered rectangles for the panel / rows, output as CSS clip-path
//
// Two-layer drawing (.ui-plate in base.css):
//   fill layer clip-path = inner (0.5 px outside the stroke's inner edge, tucked under the stroke, so no seam shows between two anti-aliased edges)
//   stroke layer clip-path = ring (outer outline minus inner outline, evenodd), on top of the fill
//   → the fill never leaks past the stroke's outer edge; the stroke is a true ring, so a semi-transparent interior shows what's behind instead of being brightened by the stroke color
//
// All coordinates are in the element's own box (origin top-left). Width follows the content: points on the right are written as calc(100% - x),
// so the same clip-path works for any width; height h is fixed (HUD row height 20).

// ---------- Blunt parallelogram ----------
// h tall, s horizontal offset (the top edge is shifted right by s relative to the bottom: both sides lean right, like the match HUD in the top-right corner)
// The four corners are rounded off with quadratic curves: obtuse corners (top-left, bottom-right) cut by tObtuse, acute corners (top-right, bottom-left) by tAcute (tangent length on the outer outline)
// With inset > 0, returns the outline offset strictly parallel by the stroke width inset: each edge moves in by inset, corner radii shrink by inset too (offset curve of the arc)
// Returns a point list [[x, y, right], ...], right = true means x is measured from the right edge (written as calc(100% - x))
function bluntPts({ h, s, inset = 0, tObtuse = 2, tAcute = 3.5, seg = 5 }) {
  const b = inset
  const L = Math.hypot(s, h)
  const d = b * L / h                        // horizontal shift when a slanted edge moves in by b
  // Outer outline corners (x measured from the left): top-left (s, 0), top-right (W, 0), bottom-right (W - s, h), bottom-left (0, h)
  // After the inset: top / bottom edges at y = b / h - b, slanted edges shifted by d in x
  const yT = b, yB = h - b
  const xl = (y) => s * (1 - y / h) + d      // x of the inset left slant at height y (from the left)
  const xr = (y) => s * y / h + d            // x of the inset right slant at height y (from the right)
  // Corner points: [x, y, right]
  const P = [[xl(yT), yT, false], [xr(yT), yT, true], [xr(yB), yB, true], [xl(yB), yB, false]]
  // Interior angles: top-left and bottom-right are obtuse θo, top-right and bottom-left acute θa
  const thO = Math.PI - Math.atan2(h, s), thA = Math.atan2(h, s)
  const cut = (t, th) => { const r = t * Math.tan(th / 2); return Math.max(0, r - b) / Math.tan(th / 2) }   // tangent length after the corner radius shrinks by b
  const T = [cut(tObtuse, thO), cut(tAcute, thA), cut(tObtuse, thO), cut(tAcute, thA)]
  // Map "measured from the right" x onto a virtual width for interpolation, then map back (each quadratic curve stays near one corner, never spans left and right)
  const W = 10000
  const abs = ([x, y, r]) => [r ? W - x : x, y]
  const out = []
  for (let i = 0; i < 4; i++) {
    const p = abs(P[i]), a = abs(P[(i + 3) % 4]), c = abs(P[(i + 1) % 4])
    const u = [p[0] - a[0], p[1] - a[1]], v = [c[0] - p[0], c[1] - p[1]]
    const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]), t = T[i]
    const A = [p[0] - u[0] / lu * t, p[1] - u[1] / lu * t], B = [p[0] + v[0] / lv * t, p[1] + v[1] / lv * t]
    const right = P[i][2]
    for (let k = 0; k <= seg; k++) {
      const q = k / seg, m = 1 - q
      const x = m * m * A[0] + 2 * q * m * p[0] + q * q * B[0]
      const y = m * m * A[1] + 2 * q * m * p[1] + q * q * B[1]
      out.push([right ? W - x : x, y, right])
      if (t === 0) break                     // sharp corner: one point is enough
    }
  }
  return out
}

// ---------- Chamfered rectangle ----------
// cuts = { tl, tr, br, bl }: length of each corner's 45° cut (0 = square corner); w / h not needed, right / bottom sides use calc
// inset > 0: offset parallel by the stroke width (after a 45° edge moves in by b the cut length becomes c - b(2 - √2))
// Returns a point list [[x, y, right, bottom], ...]
function chamferPts({ tl = 0, tr = 0, br = 0, bl = 0, inset = 0 }) {
  const b = inset, k = b * (2 - Math.SQRT2)
  const c = (v) => v > 0 ? Math.max(0, v - k) : 0
  const [a, e, f, g] = [c(tl), c(tr), c(br), c(bl)]
  const pts = []
  const P = (x, y, r, bt) => pts.push([x, y, r, bt])
  // Clockwise: top-left → top-right → bottom-right → bottom-left
  if (a) { P(b, b + a, 0, 0); P(b + a, b, 0, 0) } else P(b, b, 0, 0)
  if (e) { P(b + e, b, 1, 0); P(b, b + e, 1, 0) } else P(b, b, 1, 0)
  if (f) { P(b, b + f, 1, 1); P(b + f, b, 1, 1) } else P(b, b, 1, 1)
  if (g) { P(b + g, b, 0, 1); P(b, b + g, 0, 1) } else P(b, b, 0, 1)
  return pts
}

// ---------- Point list → CSS ----------
const num = (v) => (Math.round(v * 100) / 100).toString()
const cx = (x, r) => r ? `calc(100% - ${num(x)}px)` : `${num(x)}px`
const pt = (p) => `${cx(p[0], p[2])} ${cx(p[1], p[3])}`
const polygon = (pts) => `polygon(${pts.map(pt).join(', ')})`
// Ring: go once round the outer outline, cross over a doubled-back "bridge" to the inner outline and go round it in reverse; under evenodd the bridge cancels out and the middle is cut away
function ring(outer, inner) {
  const o = outer.map(pt), i = inner.map(pt).reverse()
  return `polygon(evenodd, ${[...o, o[0], i[0], ...i, i[0], o[0]].join(', ')})`
}

// ---------- Set the shape on an element directly ----------
// Sets the two variables .ui-plate uses: --ui-pr stroke ring, --ui-pi fill
// stroke: stroke width; tuck: how far the fill tucks under the stroke (default 0.5 px)
function plateVars(outerFn, opts, stroke, tuck = 0.5) {
  const o = outerFn({ ...opts, inset: 0 })
  const i = outerFn({ ...opts, inset: stroke })
  const f = outerFn({ ...opts, inset: Math.max(0, stroke - tuck) })
  return { '--ui-pr': ring(o, i), '--ui-pi': polygon(f) }
}
// HUD parallelogram: bluntPlate(el, { h: 20, s: 7 }, 1.5)
export function bluntPlate(el, opts, stroke = 1.5) {
  const v = plateVars(bluntPts, opts, stroke)
  for (const k in v) el.style.setProperty(k, v[k])
  return el
}
// Chamfered rectangle: chamferPlate(el, { br: 9 }, 1)
export function chamferPlate(el, cuts, stroke = 1) {
  const v = plateVars(chamferPts, cuts, stroke)
  for (const k in v) el.style.setProperty(k, v[k])
  return el
}
