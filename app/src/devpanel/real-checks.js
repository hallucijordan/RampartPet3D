// Developer panel · ② real-input recognition: you actually do it, and see whether the recognition layer picks it up
// This page dispatches no simulated signals: keyboard / audio / foreground app / system idle come from the real sensors (the developer exe's global hooks and Win32),
// and the mouse is your real interaction with her in this window. Checks look at recognition results (tier, shortcut, poke count, foreground category...), not animation
//  To add a recognition item, add a row to the G2 table
import { el } from './util.js'
import { sourceKind } from '../brain/music.js'

export function mountReal({ b, input, world, log, realBody, reset, onError, realResults }) {
  const sensors = !!window.petAPI
  const R = { keys: [], clicks: [] }
  input.on('key', e => { R.keys.push({ ...e, at: performance.now() }); if (R.keys.length > 300) R.keys.shift() })
  input.on('click', e => { if (e.type === 'down') R.clicks.push({ ...e, over: input.over, at: performance.now() }) })
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const KIND = { key: 'letter / digit etc.', space: 'Space', enter: 'Enter', backspace: 'Backspace' }
  const HAND = { L: 'left-hand zone', R: 'right-hand zone', C: 'middle (Space)' }
  const LEVEL = { none: 'not typing', steady: 'steady', burst: 'burst' }
  const SRC = { music: 'counts as music', player: 'player (lower threshold)', browser: 'browser (ignored)', other: 'meeting / video / game (ignored)' }
  // Who is making sound: per-app audio sessions (the shell's onAudio sessions)
  const who = () => {
    const ss = input.audioRaw?.sessions
    if (ss === null) return 'per-app session API unavailable, falling back to master volume'
    if (!ss?.length) return '—'
    return ss.slice().sort((x, y) => y.peak - x.peak).map(s => `${esc(s.exe)} ${s.peak.toFixed(2)} (${SRC[sourceKind(s)]})`).join(', ')
  }
  const musicNow = () => { const M = b.music; return M.on ? `music detected (level ${M.level.toFixed(2)}${M.player ? ', player' : ''}; off after ${b.params.music.offSec} s of silence)` :
    `none (music level ${M.level.toFixed(2)}${b.quietApp ? ' · foreground is video / meeting, ignored' : ''} · sound for ${M.loudT.toFixed(1)} / ${b.params.music.onSec} s)` }
  const fgKind = () => {
    const f = input.systemRaw?.fg
    return !f ? '—' : f.isSelf ? 'the developer window itself' : b.apexOn ? 'Apex' : b.fgCode ? 'code editor / terminal' : b.quietApp ? 'video / meeting (quiet mode)' : 'regular app'
  }

  realBody.appendChild(el('div', 'note', sensors
    ? 'Click "Start" on an item, then follow its instructions. Recognized: ✓ with what it was recognized as; not recognized before the timeout: ✗ with the signals actually seen meanwhile.\nKeyboard items can be typed in another window (global hook); do not minimize the developer window, leaving a corner visible is enough.'
    : 'Browser mode has no real sensors: only the mouse items can be tested (interact with her on the page). For keyboard / audio / foreground app, use the developer build (RampartPet3D.exe --dev).'))
  const mon = el('div', 'mon')
  realBody.appendChild(mon)
  setInterval(() => {
    if (realBody.style.display === 'none') return
    const k = R.keys[R.keys.length - 1], a = input.audioRaw, s = input.systemRaw, d = new Date(), hr = d.getHours()
    const rows = [
      ['Keys from', sensors ? 'global hook (typing in any window counts)' : 'this page only (browser mode)'],
      ['Last key', k ? `${KIND[k.kind] || k.kind}${k.hand ? ' · ' + HAND[k.hand] : ''}${k.combo ? ' · shortcut ' + k.combo : ''} (${((performance.now() - k.at) / 1000).toFixed(1)} s ago)` : '—'],
      ['Speed', `${input.rate(1000).toFixed(1)} keys/s · ${LEVEL[b.typing.level]}`],
      ['Cursor', input.over ? 'on her' : 'not on her'],
      ['Audio', a ? `<i class="meter"><i style="width:${Math.min(100, a.peak * 100).toFixed(0)}%"></i></i>${a.peak.toFixed(3)}${a.muted ? ' · muted' : ''}` : '(no audio sensor)'],
      ['Music', musicNow()],
      ['Sound from', who()],
      ['Foreground', s?.fg ? `${esc(s.fg.exe)} · ${esc((s.fg.title || '').slice(0, 30))}` : '—'],
      ['Category', fgKind()],
      ['Fullscreen', s ? (s.fullscreen ? 'yes' : 'no') : '—'],
      ['Idle', `pet ${(input.idleMs() / 1000).toFixed(1)} s${s ? ` · system ${(s.idleMs / 1000).toFixed(1)} s (reset by mouse moves, not used by the pet)` : ''}`],
      ['Time', `${String(hr).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}${hr >= 1 && hr < 5 ? ' · late night (bedtime nag active)' : ''}`],
    ]
    mon.innerHTML = rows.map(([k2, v]) => `<b>${k2}</b><span>${v}</span>`).join('')
  }, 200)

  // Recognition items: how is what you do; done(st) returns a description once recognized (returning { fail } means recognized, but wrongly)
  const keysSince = (st) => R.keys.filter(k => k.at >= st.t0)
  const G2 = [
    { g: 'Keyboard (global hook: typing in another window counts)', items: [
      { name: 'Normal-speed typing → draws Sheila to repair', how: 'Switch to any window (e.g. Notepad) and type continuously at your normal speed for 4 seconds', sensor: true,
        done: (st) => st.levels.has('steady') && st.acts.has('typing') && `Steady tier recognized (peak ${st.maxRate.toFixed(1)} keys/s), she draws Sheila and starts repairing` },
      { name: 'Stop typing → stows Sheila', how: 'Type for a few seconds so she starts repairing, then stop and wait 5 seconds', sensor: true, timeout: 30,
        done: (st) => st.acts.has('typing') && !b.act && `Stop recognized, Sheila stowed, back to standing (stows after ${b.params.typing.stowAfter} s)` },
      { name: 'Sustained fast typing → burst', how: 'Type as fast as you can for 8+ seconds (6+ keys per second)', sensor: true, timeout: 40,
        live: (st) => `peak ${st.maxRate.toFixed(1)} keys/s · ${LEVEL[b.typing.level]}`,
        done: (st) => st.acts.has('burst') && `Burst recognized (peak ${st.maxRate.toFixed(1)} keys/s): ride Sheila → BOOM! → skydive` },
      { name: 'Enter and Space', how: 'Press Enter once and Space once', sensor: true,
        done: (st) => { const ks = keysSince(st); return ks.some(k => k.kind === 'enter') && ks.some(k => k.kind === 'space') && 'Both Enter and Space recognized' } },
      { name: 'Left / right hand', how: 'First press only left-half keys (QWERT / ASDFG) a few times, then only right-half keys (YUIOP / HJKL)', sensor: true,
        done: (st) => { const hs = new Set(keysSince(st).map(k => k.hand)); return hs.has('L') && hs.has('R') && 'Both left- and right-hand zones recognized' } },
    ] },
    { g: 'Mouse (interact with her in this window)', items: [
      { name: 'Hover', how: 'Move the cursor onto her and hold for 1 second', done: () => b.hover.looked && 'Hover recognized (she looks at you)' },
      { name: 'Click = poke', how: 'Click on her once', done: (st) => b.pokes > st.pokes && `Poke recognized (count ${b.pokes})` },
      { name: 'Double-click = photo (not a poke)', how: 'While she is standing, double-click on her',
        done: (st) => st.acts.has('photo') && (b.pokes <= st.pokes ? 'Double-click recognized, the two clicks did not count as pokes' : { fail: `Double-click recognized, but ${b.pokes - st.pokes} extra poke(s) counted` }) },
      { name: 'Press and drag = pick up', how: 'Press on her, drag a bit, then release', done: (st) => st.states.has('held') && 'Pick-up recognized' },
      { name: 'Fling = throw', how: 'After picking her up, fling quickly and release', done: (st) => st.states.has('held') && st.states.has('air') && 'Throw recognized' },
      { name: 'Head pat', how: 'Move the cursor back and forth above her head (no buttons), 3+ times within 1.5 seconds', done: (st) => b.pat.count > st.pat && 'Head pat recognized (squints)' },
      { name: 'Wheel spins her', how: 'Put the cursor on her and scroll the wheel', done: () => Math.abs(b.spin.yaw) > 0.3 && 'Wheel recognized (she turned)' },
      { name: 'Mouse moves are not input', how: 'After clicking "Start", only move the mouse in this window for 10 seconds (no keys, clicks or wheel)', timeout: 15,
        live: () => `pet idle ${(input.idleMs() / 1000).toFixed(1)} s`,
        done: (st) => {
          if (performance.now() - st.t0 < 10000) return false
          if (!(input.lastMouse > st.m0)) return { fail: 'No mouse movement received in these 10 seconds' }
          return input.idleMs() >= 9500 ? `Mouse moved, idle timer kept running (${(input.idleMs() / 1000).toFixed(1)} s)` : { fail: `Idle timer was reset (only ${(input.idleMs() / 1000).toFixed(1)} s)` }
        } },
      { name: 'Click elsewhere on desktop', how: 'Click an empty spot next to her (not on the panel)',
        done: (st) => R.clicks.some(c => c.at >= st.t0 && !c.over && c.button === 1 && c.lx < world.w) && 'Desktop click recognized (she looks over half the time)' },
    ] },
    { g: 'System (needs the developer exe sensors)', items: [
      { name: 'Any sound', how: 'Play a song or any sound', sensor: true, live: () => `current peak ${(input.audioRaw?.peak || 0).toFixed(3)}`,
        done: (st) => st.maxPeak > 0.03 && `Heard it (peak ${st.maxPeak.toFixed(2)})` },
      { name: 'Song in a player → music detected, dances', how: 'Play a song in a music player app (e.g. Spotify; not a browser) and wait 5 seconds', sensor: true, timeout: 40,
        live: () => `sound for ${b.music.loudT.toFixed(1)} s · ${who()}`,
        done: (st) => st.music && (st.acts.has('dance') ? `Music detected, she starts dancing (${who()})` : false) },
      { name: 'Pause → off within 2 s', how: 'Play a song until she detects it, then pause', sensor: true, timeout: 60,
        live: (st) => b.music.on ? 'Music on: pause now' : st.music ? 'Off' : `Music not detected yet (sound for ${b.music.loudT.toFixed(1)} s)`,
        done: (st) => { if (b.music.on) { st.onSeen = true; return false } if (!st.onSeen) return false
          return `Turned off after pause (about ${b.params.music.offSec} s from the last sound to off)` } },
      { name: 'Music in a browser does not count', how: 'Play music only in a browser (any video or music site), for 15 seconds', sensor: true, timeout: 40,
        live: () => who(),
        done: (st) => {
          if (b.music.on) return { fail: `Detected as music (${who()})` }
          const br = (input.audioRaw?.sessions || []).some(s => sourceKind(s) === 'browser' && s.peak > 0.03)
          if (br) st.brT = (st.brT || 0) + 0.1
          return st.brT > 12 && `Browser sound for 12+ s, not detected as music` } },
      { name: 'Mute', how: 'Mute via the taskbar volume icon (unmute afterwards)', sensor: true, done: () => input.audioRaw?.muted && 'Mute recognized' },
      { name: 'Switch foreground window', how: 'Click another window', sensor: true,
        done: (st) => { const f = input.systemRaw?.fg; return f && !f.isSelf && f.exe + f.title !== st.fg && `Foreground change recognized: ${f.exe}` } },
      { name: 'Code editor / terminal', how: 'Switch to VS Code, Cursor, JetBrains or Windows Terminal', sensor: true,
        done: () => b.fgCode && `Code category recognized (${input.systemRaw?.fg?.exe})` },
      { name: 'Video / meeting → quiet', how: 'Switch to a YouTube / Bilibili page, a video player (PotPlayer, VLC) or meeting software', sensor: true,
        done: () => b.quietApp && `Quiet category recognized (${input.systemRaw?.fg?.exe})` },
      { name: 'Fullscreen', how: 'Press F11 in a browser, or play a video fullscreen', sensor: true, done: () => input.systemRaw?.fullscreen && 'Fullscreen recognized (the release build hides at this point)' },
      { name: 'Away for 15 seconds', how: 'After clicking "Start", no keys, clicks or wheel for 15 seconds (moving the mouse is fine)', timeout: 45,
        live: () => `pet idle ${(input.idleMs() / 1000).toFixed(1)} s`,
        done: () => input.idleMs() >= 15000 && `Idle timer OK (per the "sleep after" setting: lies down after ${b.sleepAfter} min idle, sleeps after ${b.sleepAfter * 2} min)` },
      { name: 'Apex (optional)', how: 'Launch Apex Legends', sensor: true, timeout: 180, done: () => b.apexOn && 'Apex recognized' },
    ] },
  ]

  let active = null     // watch only one item at a time
  const fgKey = () => { const f = input.systemRaw?.fg; return f ? f.exe + f.title : '' }
  const finish = (it, ok, text) => {
    clearInterval(active.timer); active = null
    it.el.classList.remove('run'); it.el.classList.add(ok ? 'pass' : 'fail')
    it.el.querySelector('.dot').textContent = ok ? '✓' : '✗'
    it.el.querySelector('.res').textContent = text
    it.el.querySelector('button').textContent = 'Retest'
    realResults.set(it.name, { name: it.name, ok, text })
    log(ok ? 'ok' : 'e', `${ok ? '✓ recognized' : '✗ not recognized'}: ${it.name} (${text.split('\n')[0]})`)
  }
  async function start(it) {
    if (active) { const a = active; finish(a.it, false, 'Cancelled'); if (a.it === it) return }
    await reset(0)
    const st = { t0: performance.now(), m0: input.lastMouse, pokes: b.pokes, pat: b.pat.count, fg: fgKey(),
      levels: new Set(), states: new Set(), acts: new Set(), maxRate: 0, maxPeak: 0, music: false }
    const T = (it.timeout || 20) * 1000
    it.el.classList.remove('pass', 'fail'); it.el.classList.add('run')
    it.el.querySelector('.dot').textContent = '…'
    it.el.querySelector('button').textContent = 'Cancel'
    log('ok', `[Real input] ${it.name}: ${it.how}`)
    active = { it, st }
    active.timer = setInterval(() => {
      st.levels.add(b.typing.level); st.states.add(b.state); if (b.act) st.acts.add(b.act.name)
      st.maxRate = Math.max(st.maxRate, input.rate(1000)); st.maxPeak = Math.max(st.maxPeak, input.audioRaw?.peak || 0)
      if (b.music.on) st.music = true
      let r = false
      try { r = it.done(st) } catch (e) { onError(`${it.name} check failed: ${e.stack || e}`) }
      if (r && r.fail) return finish(it, false, 'Recognized wrongly: ' + r.fail)
      if (r) return finish(it, true, r)
      const left = T - (performance.now() - st.t0)
      if (left <= 0) {
        const seen = [`tier ${[...st.levels].join(' / ')}`, `state ${[...st.states].join(' / ')}`, st.acts.size ? `behavior ${[...st.acts].join(' / ')}` : '',
          `peak typing speed ${st.maxRate.toFixed(1)} keys/s`, `${keysSince(st).length} key(s) received`, sensors ? `peak volume ${st.maxPeak.toFixed(3)}, foreground category ${fgKind()}` : ''].filter(Boolean)
        return finish(it, false, `Not recognized within ${(T / 1000).toFixed(0)} s. Seen meanwhile:\n${seen.join(', ')}`)
      }
      it.el.querySelector('.res').textContent = `${(left / 1000).toFixed(0)} s left${it.live ? ' · ' + it.live(st) : ''}`
    }, 100)
  }
  for (const g of G2) {
    const d = el('details'); d.open = true
    d.appendChild(el('summary', '', `${g.g}<span class="cnt">${g.items.length}</span>`))
    for (const it of g.items) {
      const r = el('div', 'row')
      r.innerHTML = `<div class="top"><span class="dot">·</span><span class="nm"></span><button>Start</button></div><div class="cond"></div><div class="res"></div>`
      r.querySelector('.nm').textContent = it.name
      r.querySelector('.cond').textContent = 'How: ' + it.how
      const x = r.querySelector('button')
      if (it.sensor && !sensors) { x.disabled = true; x.title = 'Needs the real sensors of the developer exe' }
      x.onclick = () => start(it)
      it.el = r
      d.appendChild(r)
    }
    realBody.appendChild(d)
  }
}
