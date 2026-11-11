// Unified input layer: in Electron global hooks (petAPI, see electron/API.md), in browser dev mode simulated with page events
// only the timing and class of key presses are taken, never which characters were typed
import { clock } from './clock.js'

const DOM_CLASS = (code) => {
  if (code === 'Space') return 'space'
  if (code === 'Enter' || code === 'NumpadEnter') return 'enter'
  if (code === 'Backspace' || code === 'Delete') return 'backspace'
  if (/^(Shift|Control|Alt|Meta)/.test(code)) return 'modifier'
  return 'letter'
}

export function makeInput({ dev }) {
  const listeners = {}
  const emit = (type, e) => (listeners[type] || []).forEach(f => f(e))
  const inp = {
    dev,
    mouse: { x: -1e4, y: -1e4, vx: 0, vy: 0, t: 0, speed: 0 },
    over: false,
    keyTimes: [],          // recent key press times (ms, clock time)
    lastKey: -1e9,
    lastMouse: -1e9,
    lastInput: 0,
    audio: 0,              // system output peak 0..1 (muted counts as 0)
    system: {},            // foreground window, fullscreen, system idle
    on(type, f) { (listeners[type] ||= []).push(f); return inp },
    setOver(v) {
      inp.over = v
      document.body.style.cursor = v ? 'grab' : ''
    },
    // key press rate over the last windowMs (presses/s)
    rate(windowMs = 1500) {
      const now = clock.now()
      while (inp.keyTimes.length && now - inp.keyTimes[0] > 8000) inp.keyTimes.shift()
      let n = 0
      for (let i = inp.keyTimes.length - 1; i >= 0 && now - inp.keyTimes[i] <= windowMs; i--) n++
      return n / (windowMs / 1000)
    },
    idleMs() { return clock.now() - inp.lastInput },
  }

  const onKey = (e) => {
    if (e.cls === 'modifier') return
    const now = clock.now()
    inp.keyTimes.push(now)
    inp.lastKey = now
    inp.lastInput = now
    const kind = e.cls === 'space' || e.cls === 'enter' || e.cls === 'backspace' ? e.cls : 'key'
    emit('key', { kind, cls: e.cls, hand: e.hand, combo: e.combo, t: now })
  }
  const onMove = (x, y) => {
    const now = clock.now()
    const m = inp.mouse
    const dt = Math.max(1, now - m.t)
    const vx = (x - m.x) / dt * 1000, vy = (y - m.y) / dt * 1000
    if (m.t > 0 && dt < 200) { m.vx = m.vx * 0.6 + vx * 0.4; m.vy = m.vy * 0.6 + vy * 0.4 }
    else { m.vx = 0; m.vy = 0 }
    m.x = x; m.y = y; m.t = now
    m.speed = Math.hypot(m.vx, m.vy)
    inp.lastMouse = now      // moving the cursor is not "activity": it does not reset idle (only key / click / wheel do); the gaze still follows the cursor
    emit('move', m)
  }

  // capture / debugging: simulated input
  inp.simKey = (code = 'KeyA', extra = {}) => onKey({ cls: DOM_CLASS(code), ...extra })
  inp.simMove = (x, y) => onMove(x, y)
  inp.simClick = (x, y) => emit('click', { type: 'down', button: 1, lx: x, ly: y })
  inp.simSystem = (s) => { inp.system = s; emit('system', s) }
  inp.simOnly = false      // set true while the dev panel runs tests: the page only accepts events dispatched by scripts, the real mouse and keyboard do not interfere

  // all page events are hooked here (real input is dropped while simOnly)
  const on = (type, f) => window.addEventListener(type, e => { if (!(inp.simOnly && e.isTrusted)) f(e) })
  // real sensors: the overlay uses all of them; the developer window (api.dev) only uses keyboard / audio / foreground app, the mouse uses page events inside the window
  const api = window.petAPI
  if (api) {
    api.onKey(e => { if (e.type === 'down' && !e.repeat && !inp.simOnly) onKey(e) })
    api.onAudio(e => { inp.audioRaw = e; if (inp.simOnly) return; inp.audio = e.muted ? 0 : (e.peak || 0); emit('audio', inp.audio) })
    api.onSystem(e => { inp.systemRaw = e; if (inp.simOnly) return; inp.system = e; emit('system', e) })
  }
  if (api && !api.dev) {
    api.onMouse(e => onMove(e.lx, e.ly))
    api.onButton(e => { inp.lastInput = clock.now(); emit('click', e) })
    api.onWheel(e => { inp.lastInput = clock.now(); emit('wheel', e) })
  } else {
    // shortcut semantics match the shell (comboOf in electron/input.js)
    const COMBO = { KeyS: 'save', KeyZ: 'undo', KeyY: 'redo', KeyC: 'copy', KeyV: 'paste', KeyX: 'cut', KeyA: 'selectAll', KeyF: 'find', KeyW: 'closeTab', KeyT: 'newTab' }
    on('keydown', e => {
      if (e.repeat || (api && e.isTrusted)) return      // with global hooks, real keys come through the hooks; only panel-simulated ones are taken here
      if (e.target?.closest?.('#ui')) return            // keys pressed inside the UI (the GUI settings panel) do not count as typing
      const combo = e.ctrlKey && !e.altKey ? (e.shiftKey && e.code === 'KeyZ' ? 'redo' : COMBO[e.code]) : undefined
      if (e.ctrlKey && !combo) return
      onKey({ cls: DOM_CLASS(e.code), combo })
    })
    on('mousemove', e => onMove(e.clientX, e.clientY))
    on('mousedown', e => { inp.lastInput = clock.now(); emit('click', { type: 'down', button: e.button + 1, lx: e.clientX, ly: e.clientY }) })
    on('wheel', e => { inp.lastInput = clock.now(); emit('wheel', { rotation: Math.sign(e.deltaY), lx: e.clientX, ly: e.clientY }) })
  }

  // in-page pointer events (drag, poke): in Electron the window only receives them while the mouse is on the character
  on('pointerdown', e => { if (e.button === 0) emit('pdown', e) })
  on('pointermove', e => emit('pmove', e))
  // release is not filtered by button (with chorded buttons a left release does not get its own pointerup); a pointer canceled by the system also counts as release
  on('pointerup', e => emit('pup', e))
  on('pointercancel', e => emit('pup', e))
  window.addEventListener('contextmenu', e => { e.preventDefault(); if (!(inp.simOnly && e.isTrusted)) emit('rclick', e) })
  on('dblclick', e => emit('dblclick', e))
  return inp
}
