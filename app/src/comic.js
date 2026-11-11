// BOOM! comic transition layer (end of the typing burst): a 2D canvas over the character canvas; the result depends only on "seconds since the blast" (can pause, scrub, rewind).
// Moved as-is from the comicLayer() prototype (finalized after 5 design iterations),
// only the global canvas / view variables became parameters. Fonts are system ones only: Arial Black / Impact / Microsoft YaHei.
//   comicLayer(stage, view) -> { draw(u, anchor), cv }; u = seconds since the blast (null or outside [0, DURATION] clears it), anchor = muzzle position on the canvas
//   comicLayer.DURATION total length, comicLayer.HIDE_AT how long after the blast she is fully covered (hide her)
export function comicLayer(stage, view) {
  var cv = document.getElementById('comicBoom')
  if (!cv) {
    cv = document.createElement('canvas'); cv.id = 'comicBoom'
    cv.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:997'
    document.body.appendChild(cv)
  }
  var g = cv.getContext('2d')
  var DUR = comicLayer.DURATION
  // palette: ink black + paper white; accents are only chrome yellow and vermilion (vermilion only on the letter extrusion and the blast halftone)
  var INK = '#121212', PAPER = '#F4EEDF', YEL = '#FFC72C', YEL_L = '#FFE57A', RED_HT = '#B8321F'
  var FONT = '"Arial Black", "Segoe UI Black", Impact, sans-serif'
  var CN = '"Microsoft YaHei", "Segoe UI", sans-serif'
  var TAU = Math.PI * 2
  var L = null, dirty = false

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x }
  function lerp(a, b, t) { return a + (b - a) * t }
  function rnd(n) { var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x) }   // deterministic pseudo-random
  function outCubic(x) { x = clamp01(x); return 1 - (1 - x) * (1 - x) * (1 - x) }
  function outQuart(x) { x = clamp01(x); var y = 1 - x; return 1 - y * y * y * y }
  function inOut(x) { x = clamp01(x); return x * x * (3 - 2 * x) }
  function outBack(x) { x = clamp01(x); var c = 2.2, y = x - 1; return 1 + (c + 1) * y * y * y + c * y * y }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c }

  // ---------- pre-render ----------
  // one letter: paper-white outer stroke -> ink line -> vermilion extrusion (perspective toward a vanishing point below, darker far end, dark red halftone on top) -> chrome yellow face (hard-edged light facet + one highlight)
  function makeLetter(ch, f, vx, vy, S) {
    var m = mk(1, 1).getContext('2d'); m.font = '900 ' + f + 'px ' + FONT
    var w = m.measureText(ch).width, pad = f * 0.24 + 4
    var hw = w / 2 + pad + Math.abs(vx), hh = f * 0.62 + pad + Math.abs(vy)
    var cvs = mk(hw * 2 * S, hh * 2 * S), c = cvs.getContext('2d')
    var tmp = mk(cvs.width, cvs.height), t = tmp.getContext('2d')
    function prep(x) { x.setTransform(S, 0, 0, S, hw * S, hh * S); x.font = '900 ' + f + 'px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round' }
    prep(c); prep(t)
    var N = 12
    function stack(x, fn) { for (var i = N; i >= 0; i--) { var k = i / N, s = 1 - 0.12 * k; x.save(); x.translate(vx * k, vy * k); x.scale(s, s); fn(x, k); x.restore() } }
    stack(c, function (x) { x.lineWidth = f * 0.3; x.strokeStyle = PAPER; x.strokeText(ch, 0, 0) })
    stack(c, function (x) { x.lineWidth = f * 0.16; x.strokeStyle = INK; x.strokeText(ch, 0, 0) })
    // extrusion body (its own layer, so the halftone can go on top)
    stack(t, function (x, k) {
      var r = Math.round(lerp(226, 110, k)), gg = Math.round(lerp(65, 24, k)), b = Math.round(lerp(43, 14, k))
      x.fillStyle = 'rgb(' + r + ',' + gg + ',' + b + ')'; x.fillText(ch, 0, 0)
    })
    t.save(); t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-atop'; t.fillStyle = 'rgba(90,14,6,0.55)'
    var sp = 5 * S, dr = 1.35 * S
    t.beginPath()
    for (var y = 0, row = 0; y < tmp.height + sp; y += sp * 0.5, row++) for (var x = (row % 2) * sp * 0.5; x < tmp.width + sp; x += sp) { t.moveTo(x + dr, y); t.arc(x, y, dr, 0, TAU) }
    t.fill(); t.restore()
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(tmp, 0, 0); c.restore()
    // letter face
    c.lineWidth = f * 0.07; c.strokeStyle = INK; c.strokeText(ch, 0, 0)
    t.save(); t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, tmp.width, tmp.height); t.restore()
    t.fillStyle = YEL; t.fillText(ch, 0, 0)
    t.globalCompositeOperation = 'source-atop'
    // hard-edged light facet: top-left bevel
    t.fillStyle = YEL_L; t.beginPath(); t.moveTo(-hw, -hh); t.lineTo(hw, -hh); t.lineTo(hw, -f * 0.22); t.lineTo(-hw, f * 0.02); t.closePath(); t.fill()
    // highlight: one thin diagonal stripe
    t.fillStyle = 'rgba(255,255,255,0.9)'; t.beginPath(); t.moveTo(-hw, -f * 0.3); t.lineTo(hw, -f * 0.5); t.lineTo(hw, -f * 0.44); t.lineTo(-hw, -f * 0.24); t.closePath(); t.fill()
    // a little orange along the bottom: gives the face volume
    t.fillStyle = 'rgba(232,120,20,0.55)'; t.beginPath(); t.moveTo(-hw, f * 0.26); t.lineTo(hw, f * 0.16); t.lineTo(hw, hh); t.lineTo(-hw, hh); t.closePath(); t.fill()
    t.globalCompositeOperation = 'source-over'
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(tmp, 0, 0); c.restore()
    return { img: cvs, hw: hw, hh: hh }
  }
  // vermilion halftone of the blast: dots grow toward the center (pre-rendered once)
  function makeHalftone(R, S) {
    var cvs = mk(R * 2 * S, R * 2 * S), c = cvs.getContext('2d')
    c.setTransform(S, 0, 0, S, R * S, R * S); c.fillStyle = RED_HT
    var sp = 8, cs = Math.SQRT1_2
    c.beginPath()
    for (var i = -R / sp * 1.5; i <= R / sp * 1.5; i++) for (var j = -R / sp * 1.5; j <= R / sp * 1.5; j++) {
      var x = (i - j) * sp * cs, y = (i + j) * sp * cs, d = Math.hypot(x, y) / R
      if (d >= 1) continue
      var r = sp * 0.6 * Math.pow(1 - d, 1.6)
      if (r < 0.45) continue
      c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU)
    }
    c.fill()
    return { img: cvs, R: R }
  }

  function build(W, H, Yb, dpr) {
    var S = dpr * 1.3
    var SH = 4, MAT = 6
    var P = { x0: 2, x1: W - 2 - SH, y1: Math.ceil(Yb) }   // bottom edge sits on the floor line (below is the taskbar / off screen), no gap
    P.y0 = Math.max(2, P.y1 - Math.round(W * 0.68))
    var I = { x0: P.x0 + MAT, y0: P.y0 + MAT, x1: P.x1 - MAT, y1: P.y1 - MAT }
    var PW = I.x1 - I.x0, PH = I.y1 - I.y0
    // BOOM! layout: letters grow one by one (coming at the camera), the line rises to the right, each letter tilted a bit
    var chars = ['B', 'O', 'O', 'M', '!'], size = [0.92, 1.0, 1.06, 1.14, 1.22], rot = [-0.12, -0.05, 0.03, 0.08, 0.2], dy = [0.04, -0.02, 0.02, -0.03, -0.08]
    var m = mk(1, 1).getContext('2d'), fs = PH * 0.4, tr, ws, total
    function measure() {
      ws = []; total = 0; tr = -0.055 * fs
      for (var i = 0; i < chars.length; i++) { m.font = '900 ' + (fs * size[i]) + 'px ' + FONT; ws.push(m.measureText(chars[i]).width); total += ws[i] }
      total += tr * (chars.length - 1)
    }
    measure(); if (total > PW * 0.86) { fs *= PW * 0.86 / total; measure() }
    var wc = { x: I.x0 + PW * 0.5, y: I.y0 + PH * 0.56 }, wa = -0.09
    // the extrusion converges to a vanishing point below the word (low angle, like a sign standing on the ground)
    var VP = { x: I.x0 + PW * 0.72, y: I.y0 + PH * 1.7 }, EK = 0.075
    var letters = [], x = -total / 2
    for (var i = 0; i < chars.length; i++) {
      var lx = x + ws[i] / 2, ly = dy[i] * fs; x += ws[i] + tr
      var px = wc.x + lx * Math.cos(wa) - ly * Math.sin(wa), py = wc.y + lx * Math.sin(wa) + ly * Math.cos(wa)
      var vx = (VP.x - px) * EK, vy = (VP.y - py) * EK, a = rot[i] + wa
      var lvx = vx * Math.cos(-a) - vy * Math.sin(-a), lvy = vx * Math.sin(-a) + vy * Math.cos(-a)
      letters.push({ x: px, y: py, a: a, sp: rotated(makeLetter(chars[i], fs * size[i], lvx, lvy, S), a, dpr) })
    }
    return { k: W / 540, W: W, H: H, Yb: Yb, dpr: dpr, S: S, SH: SH, MAT: MAT, P: P, I: I, PW: PW, PH: PH, fs: fs, letters: letters, ht: makeHalftone(PW * 0.5, dpr),
      boom: bakeWord(letters, 4, dpr), boomX: bakeWord(letters, 5, dpr) }
  }
  // pre-rotate each letter image to its final angle and store it (in device pixels), so no rotation is needed per frame
  function rotated(sp, a, S) {
    var c0 = Math.abs(Math.cos(a)), s0 = Math.abs(Math.sin(a)), hw = sp.hw * c0 + sp.hh * s0, hh = sp.hw * s0 + sp.hh * c0
    var cvs = mk(hw * 2 * S, hh * 2 * S), c = cvs.getContext('2d')
    c.setTransform(S, 0, 0, S, hw * S, hh * S); c.rotate(a); c.imageSmoothingQuality = 'high'
    c.drawImage(sp.img, -sp.hw, -sp.hh, sp.hw * 2, sp.hh * 2)
    return { img: cvs, hw: hw, hh: hh }
  }
  // bake the settled word into one image (the hold phase draws one unrotated image per frame instead of 5 rotated, scaled small ones)
  function bakeWord(letters, n, S) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
    for (var i = 0; i < n; i++) { var lt = letters[i]; x0 = Math.min(x0, lt.x - lt.sp.hw); x1 = Math.max(x1, lt.x + lt.sp.hw); y0 = Math.min(y0, lt.y - lt.sp.hh); y1 = Math.max(y1, lt.y + lt.sp.hh) }
    x0 = Math.floor(x0); y0 = Math.floor(y0)
    var w = Math.ceil(x1 - x0), h = Math.ceil(y1 - y0), cvs = mk(w * S, h * S), c = cvs.getContext('2d')
    c.setTransform(S, 0, 0, S, -x0 * S, -y0 * S)
    for (var i = 0; i < n; i++) { var lt = letters[i]; c.drawImage(lt.sp.img, lt.x - lt.sp.hw, lt.y - lt.sp.hh, lt.sp.hw * 2, lt.sp.hh * 2) }
    return { img: cvs, x0: x0, y0: y0, w: w, h: h }
  }
  function ensure(W, H, Yb, dpr) {
    var key = W + 'x' + H + '@' + dpr + '/' + Math.round(Yb)
    if (!L || L.key !== key) { L = build(W, H, Yb, dpr); L.key = key }
  }
  function rect() {
    var st = stage
    if (!st) return null
    var r = st.canvas.getBoundingClientRect(), v = view
    var Yb = Math.min(r.height, v && v.footY > 0 ? v.footY : r.height)   // below the feet is the taskbar / off screen, not drawn
    return { r: r, Yb: Yb }
  }
  // pre-render as soon as the layout is built, so the blast moment does not stutter
  try { var R0 = rect(); if (R0) ensure(R0.r.width, R0.r.height, R0.Yb, window.devicePixelRatio || 1) } catch (e) {}

  // ---------- parts ----------
  // focus lines: wedges radiating from the muzzle, redrawn every 1/12 s (hand-drawn "boil")
  function focusLines(ax, ay, u, color) {
    var step = Math.floor(u * 12), N = 72, K = L.k, R = 900 * K, jit = (u < 0.12 ? 60 : 22) * K
    g.beginPath()
    for (var i = 0; i < N; i++) {
      var s = i * 7
      if (rnd(s) < 0.12) continue
      var a = (i + rnd(s + 1) * 0.8) * TAU / N + (rnd(step * 131 + i) - 0.5) * 0.012
      var r0 = (70 + rnd(s + 2) * 90) * K + (rnd(step * 131 + i + 71) - 0.5) * jit, w = (1.5 + rnd(s + 3) * 7) * K / R
      g.moveTo(ax + Math.cos(a) * r0, ay + Math.sin(a) * r0)
      g.lineTo(ax + Math.cos(a + w) * R, ay + Math.sin(a + w) * R)
      g.lineTo(ax + Math.cos(a - w) * R, ay + Math.sin(a - w) * R)
      g.closePath()
    }
    g.fillStyle = color; g.fill()
  }
  // blast center: irregular spikes
  function burst(x, y, R, rot, fill, stroke, seed) {
    var n = 13
    g.beginPath()
    for (var i = 0; i < n * 2; i++) {
      var a = rot + i * Math.PI / n + (rnd(seed + i) - 0.5) * 0.18
      var rr = (i % 2 ? 0.52 : 1) * R * (0.82 + rnd(seed + 40 + i) * 0.36)
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
    g.closePath(); g.fillStyle = fill; g.fill()
    if (stroke) { g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = stroke; g.stroke() }
  }
  // debris: flies out of the blast center, with damping and spin
  function debris(ax, ay, u) {
    if (u < 0.04 || u > 0.8) return
    var d = u - 0.04
    g.fillStyle = PAPER; g.beginPath()
    for (var i = 0; i < 9; i++) {
      var a = rnd(500 + i) * TAU, v = (380 + rnd(520 + i) * 520) * L.k, k = 5.5
      var dist = v * (1 - Math.exp(-k * d)) / k, x = ax + Math.cos(a) * dist, y = ay + Math.sin(a) * dist + 60 * d * d
      var s = (3 + rnd(540 + i) * 5) * L.k * (1 - clamp01((u - 0.55) / 0.25)), sp = rnd(560 + i) * 14 - 7, r = sp * d
      if (s <= 0.2) continue
      g.moveTo(x + Math.cos(r) * s, y + Math.sin(r) * s)
      g.lineTo(x + Math.cos(r + 2.3) * s * 0.8, y + Math.sin(r + 2.3) * s * 0.8)
      g.lineTo(x + Math.cos(r + 4.1) * s * 0.6, y + Math.sin(r + 4.1) * s * 0.6)
      g.closePath()
    }
    g.fill()
  }
  // letter entry times (the final "!" lags half a beat, comic timing)
  var T0 = [0.13, 0.165, 0.2, 0.235, 0.33], HIT = 0.055, BAKE4 = 6 / 12, BAKE5 = 10 / 12   // switch to the baked word: on a 12 fps boil frame change
  function letterXform(i, u) {
    var d = u - T0[i]
    if (d < 0) return null
    var sx, sy, a = 0, oy = 0
    if (d < HIT) {                         // slams down from in front of the camera: enlarged -> 1
      var p = d / HIT, s = 1 + 0.75 * (1 - p) * (1 - p); sx = sy = s
      if (i === 4) oy = -70 * L.k * (1 - p) * (1 - p)   // the "!" drops in from above
    } else {                               // squash on landing, bounce back; strictly at rest within 0.2 s (then the baked word takes over without a jump)
      var e = d - HIT, q = 0.14 * Math.exp(-e * 15) * Math.cos(e * 40) * (1 - inOut((e - 0.1) / 0.1))
      sy = 1 - q; sx = 1 + q * 0.7
      if (i === 4) a = 0.38 * Math.exp(-e * 6) * Math.cos(e * 21) * (1 - inOut((e - 0.22) / 0.2))   // the "!" wobbles twice, settles at 0.42 s
    }
    return { sx: sx, sy: sy, a: a, oy: oy }
  }
  // screen shake: one big one at the blast, a small one as each letter lands
  function shake(u) {
    var x = 0, y = 0
    function imp(t, amp, ph) { var d = u - t; if (d < 0) return; var k = amp * Math.exp(-d * 26); x += k * Math.sin(d * 95 + ph); y += k * Math.cos(d * 83 + ph * 2) }
    imp(0, 7, 0)
    for (var i = 0; i < 5; i++) imp(T0[i] + HIT, i === 4 ? 4 : 2.4, i + 1)
    var w = 1 - inOut((u - 0.5) / 0.15)   // strictly 0 after 0.65 s (so the halftone can be drawn on whole pixels without resampling)
    return { x: x * w, y: y * w }
  }

  // one full panel (paper border + black backdrop + content + speech bubble), in canvas coordinates; the outer transform handles flying away
  function drawPanel(u, ax, ay) {
    var P = L.P, I = L.I, MAT = L.MAT
    // first 0.09 s of the blast: the panel "pops" open from the muzzle to full size
    var k = outQuart(u / 0.09)
    var x0 = lerp(ax - 4, P.x0, k), x1 = lerp(ax + 4, P.x1, k), y0 = lerp(ay - 3, P.y0, k), y1 = lerp(ay + 3, P.y1, k)
    var inv = u < 0.045   // impact frame: black and white inverted
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + L.SH, y0 + L.SH, x1 - x0, y1 - y0)
    g.fillStyle = PAPER; g.fillRect(x0, y0, x1 - x0, y1 - y0)
    var m = Math.min(MAT, (x1 - x0) * 0.2)
    var cx0 = x0 + m, cy0 = y0 + m, cx1 = x1 - m, cy1 = y1 - m
    g.save()
    g.beginPath(); g.rect(cx0, cy0, cx1 - cx0, cy1 - cy0); g.clip()
    g.fillStyle = inv ? PAPER : INK; g.fillRect(cx0, cy0, cx1 - cx0, cy1 - cy0)
    if (inv) { g.lineWidth = 3; g.strokeStyle = INK; g.strokeRect(cx0 + 1.5, cy0 + 1.5, cx1 - cx0 - 3, cy1 - cy0 - 3) }
    var sh = shake(u)
    // slow push in (only the word, the background stays, for a bit of depth)
    var push = 1 + 0.03 * inOut((u - 0.3) / 0.8), mx = (I.x0 + I.x1) / 2, my = (I.y0 + I.y1) / 2
    g.translate(sh.x, sh.y)
    if (!inv) {
      // vermilion halftone flash: bursts from 0.04 s, then slowly dims
      var hk = outCubic((u - 0.04) / 0.22), R = L.ht.R * (0.35 + 0.65 * hk)
      if (hk > 0) {
        g.globalAlpha = 1 - 0.45 * clamp01((u - 0.3) / 0.7)
        if (hk >= 1 && !sh.x && !sh.y) { var dp = L.dpr; g.drawImage(L.ht.img, Math.round((ax - R) * dp) / dp, Math.round((ay - R) * dp) / dp, R * 2, R * 2) }
        else g.drawImage(L.ht.img, ax - R, ay - R, R * 2, R * 2)
        g.globalAlpha = 1
      }
    }
    focusLines(ax, ay, u, inv ? INK : 'rgba(244,238,223,0.88)')
    // blast spikes: ink silhouette on the impact frame, yellow after that, shrinking back
    var br = u < 0.05 ? L.PH * lerp(0.22, 0.36, u / 0.05) : L.PH * 0.36 * (1 - Math.pow(clamp01((u - 0.05) / 0.3), 2))
    if (br > 1) burst(ax, ay, br, u * 2, inv ? INK : YEL, inv ? null : INK, 7)
    if (!inv) debris(ax, ay, u)
    g.restore()
    // BOOM! (not clipped: letters may overlap the paper border)
    // once settled, the whole word jitters slightly at 12 fps (hand-drawn boil)
    var jt = Math.floor(u * 12), jx = u > 0.45 ? (rnd(jt * 9) - 0.5) * 1.3 : 0, jy = u > 0.45 ? (rnd(jt * 9 + 4) - 0.5) * 1.3 : 0
    g.save(); g.translate(sh.x * 0.6 + jx, sh.y * 0.6 + jy)
    g.translate(mx, my); g.scale(push, push); g.translate(-mx, -my)
    var nb = u >= BAKE5 ? 5 : u >= BAKE4 ? 4 : 0
    if (nb) { var bw = nb === 5 ? L.boomX : L.boom; g.drawImage(bw.img, bw.x0, bw.y0, bw.w, bw.h) }
    for (var i = nb; i < L.letters.length; i++) {
      var lt = L.letters[i], f = letterXform(i, u)
      if (!f) continue
      g.save()
      g.translate(lt.x, lt.y + f.oy); if (f.a) g.rotate(f.a); g.scale(f.sx, f.sy)
      var sp = lt.sp; g.drawImage(sp.img, -sp.hw, -sp.hh, sp.hw * 2, sp.hh * 2)
      g.restore()
    }
    g.restore()
    // "Cough...": a small speech bubble pops out of the dark, over the top border of the panel
    var bk = (u - 0.56) / 0.16
    if (bk > 0) {
      var s = outBack(bk), bx = I.x0 + L.PW * 0.2, by = I.y0 + 4, tx = I.x0 + L.PW * 0.1, ty = I.y0 + L.PH * 0.24
      g.save(); g.translate(bx, by); g.scale(s * L.k, s * L.k); tx = bx + (tx - bx) / L.k; ty = by + (ty - by) / L.k
      g.beginPath(); g.ellipse(0, 0, 54, 26, -0.05, 0, TAU)
      g.moveTo(-18, 18); g.lineTo(tx - bx, ty - by); g.lineTo(0, 24)
      g.fillStyle = PAPER; g.fill(); g.lineWidth = 2.5; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke()
      g.beginPath(); g.ellipse(0, 0, 52.5, 24.5, -0.05, 0, TAU); g.fillStyle = PAPER; g.fill()
      g.fillStyle = INK; g.font = 'bold 20px ' + CN; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText('Cough...', 0, 1)
      g.restore()
    }
  }

  // exit: a squat down first (anticipation), then the whole panel is blown into the sky, spinning and shrinking, and ends as a star "Ding~"
  var A0 = 1.0, A1 = 1.12, F1 = 1.35, TW = 1.3
  function panelXform(u) {
    var P = L.P, cx = (P.x0 + P.x1) / 2, cy = (P.y0 + P.y1) / 2
    if (u < A0) return { px: cx, py: P.y1, x: cx, y: P.y1, sx: 1, sy: 1, a: 0 }
    if (u < A1) { var k = Math.sin(Math.PI * 0.5 * clamp01((u - A0) / (A1 - A0))); return { px: cx, py: P.y1, x: cx, y: P.y1, sx: 1 - 0.015 * k, sy: 1 - 0.085 * k, a: 0 } }
    if (u >= F1) return null
    var k = (u - A1) / (F1 - A1), e = 1 - Math.pow(1 - k, 2.2)
    var T = target(), x = lerp(cx, T.x, e), y = lerp(cy, T.y, e) - Math.sin(Math.PI * e) * 30 * L.k
    var s = Math.exp(-k * 3.2) * (1 - k), a = 1.1 * e
    // keep the whole panel (shadow included) inside the canvas
    var hw = (P.x1 - P.x0) / 2 + L.SH, hh = (P.y1 - P.y0) / 2 + L.SH
    var ex = hw * Math.abs(Math.cos(a)) + hh * Math.abs(Math.sin(a)), ey = hw * Math.abs(Math.sin(a)) + hh * Math.abs(Math.cos(a))
    s = Math.min(s, (x - 1) / ex, (L.W - 1 - x) / ex, (y - 1) / ey, (L.Yb - 1 - y) / ey)
    return { px: cx, py: cy, x: x, y: y, sx: s, sy: s * (1 + 0.12 * Math.sin(Math.PI * k)), a: a, k: k }
  }
  function target() { return { x: L.W * 0.76, y: Math.max(36, L.P.y0 * 0.36) } }
  function streaks(u) {
    var k = (u - A1) / (F1 - A1)
    if (k <= 0 || k >= 1) return
    var cur = panelXform(u), prev = panelXform(Math.max(A1, u - 0.07))
    if (!cur || !prev) return
    var dx = cur.x - prev.x, dy = cur.y - prev.y, d = Math.hypot(dx, dy)
    if (d < 2) return
    var nx = -dy / d, ny = dx / d, K = L.k, span = Math.max(8 * K, cur.sx * (L.P.y1 - L.P.y0) * 0.45)
    g.fillStyle = 'rgba(18,18,18,' + (0.85 * (1 - k)).toFixed(3) + ')'
    g.beginPath()
    for (var i = -1; i <= 1; i++) {
      var o = i * span, bx = cur.x - dx / d * cur.sx * 40 * K + nx * o, by = cur.y - dy / d * cur.sx * 40 * K + ny * o, L2 = d * 2.2 * (1 - Math.abs(i) * 0.25)
      g.moveTo(bx + nx * 2 * K, by + ny * 2 * K); g.lineTo(bx - nx * 2 * K, by - ny * 2 * K); g.lineTo(bx - dx / d * L2, by - dy / d * L2); g.closePath()
    }
    g.fill()
  }
  // a puff of smoke left by the launch: a cluster of overlapping circles, thick ink stroke first then paper fill, forming one cloud outline; big in the middle, small at the sides, outer ones fade first
  function launchPuff(u) {
    var v = (u - A1) / 0.36
    if (v <= 0 || v >= 1) return
    var P = L.P, cx = (P.x0 + P.x1) / 2, n = 11, sp = (P.x1 - P.x0) * 0.3
    function path(extra) {
      g.beginPath()
      for (var i = 0; i < n; i++) {
        var t = i / (n - 1) * 2 - 1, at = Math.abs(t)
        var x = cx + t * sp * (1 + 0.35 * v) + (rnd(900 + i) - 0.5) * 14 * L.k
        var r0 = (34 - at * 16) * (0.85 + rnd(940 + i) * 0.3) * L.k
        var y = P.y1 - r0 * 0.55 - (rnd(920 + i) * 10 + 22 * v * (1 - at * 0.5)) * L.k
        var grow = outBack(v / 0.22), gone = inOut((v - 0.3 - (1 - at) * 0.25) / 0.4)
        var r = r0 * grow * (1 - gone)
        if (r <= 0.5) continue
        r += extra
        g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU)
      }
    }
    path(3 * L.k); g.fillStyle = INK; g.fill()
    path(0); g.fillStyle = PAPER; g.fill()
  }
  // four-point star: long and short points, paper white or chrome yellow fill, ink stroke
  function sparkle(x, y, R, fill, lw) {
    g.beginPath()
    for (var i = 0; i < 16; i++) { var a = i * TAU / 16, r = i % 4 === 0 ? R : i % 2 === 0 ? R * 0.42 : R * 0.26; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) }
    g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke()
  }
  function twinkle(u) {
    var v = u - TW
    if (v < 0) return
    var T = target(), s
    if (v < 0.07) s = 1.35 * outCubic(v / 0.07)
    else if (v < 0.14) s = lerp(1.35, 1, inOut((v - 0.07) / 0.07))
    else if (v < 0.21) s = 1
    else s = 1 - inOut((v - 0.21) / 0.1)
    if (s > 0.01) {
      g.save(); g.translate(T.x, T.y); g.rotate(v * 3); g.scale(s * L.k, s * L.k)
      sparkle(0, 0, 30, YEL, 2.4)
      g.restore()
    }
    // two small twinkles next to it, slightly staggered
    for (var j = 0; j < 2; j++) {
      var w = v - 0.05 - j * 0.05, ss = w < 0 ? 0 : w < 0.06 ? outBack(w / 0.06) : 1 - inOut((w - 0.08) / 0.1)
      if (ss <= 0.01) continue
      g.save(); g.translate(T.x + (j ? 26 : -30) * L.k, T.y + (j ? 24 : 14) * L.k); g.scale(ss * L.k, ss * L.k); sparkle(0, 0, 9, PAPER, 1.6); g.restore()
    }
    // small text "Ding~"
    var tk = (v - 0.04) / 0.08
    if (tk > 0) {
      var al = 1 - clamp01((v - 0.22) / 0.09)
      if (al > 0) {
        g.save(); g.globalAlpha = al; g.translate(T.x + 36 * L.k, T.y - 14 * L.k); g.rotate(-0.12); var ts = outBack(tk) * L.k; g.scale(ts, ts)
        g.font = 'bold 23px ' + CN; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round'
        g.lineWidth = 5; g.strokeStyle = INK; g.strokeText('Ding~', 0, 0); g.fillStyle = PAPER; g.fillText('Ding~', 0, 0)
        g.restore()
      }
    }
  }

  function draw(u, anchor) {
    var active = u != null && u >= 0 && u <= DUR
    if (!active) {
      if (dirty) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); dirty = false }
      return
    }
    var R = rect(); if (!R) return
    var r = R.r, dpr = window.devicePixelRatio || 1, W = r.width, H = r.height
    var bw = Math.round(W * dpr), bh = Math.round(H * dpr)
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh }
    cv.style.left = r.left + 'px'; cv.style.top = r.top + 'px'; cv.style.width = W + 'px'; cv.style.height = H + 'px'
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); dirty = true
    ensure(W, H, R.Yb, dpr)
    var ax = anchor ? anchor.x : W * 0.7, ay = anchor ? anchor.y : (L.P.y0 + L.P.y1) / 2
    ax = Math.min(L.I.x1 - 10, Math.max(L.I.x0 + 10, ax)); ay = Math.min(L.I.y1 - 10, Math.max(L.I.y0 + 10, ay))
    launchPuff(u)
    streaks(u)
    var X = panelXform(u)
    if (X) {
      g.save(); g.translate(X.x, X.y); g.rotate(X.a); g.scale(X.sx, X.sy); g.translate(-X.px, -X.py)
      drawPanel(u, ax, ay)
      g.restore()
    }
    twinkle(u)
  }
  return { draw: draw, cv: cv }
}
comicLayer.DURATION = 1.62
comicLayer.HIDE_AT = 0.1
