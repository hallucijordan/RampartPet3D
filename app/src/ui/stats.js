// Today's stats: keystrokes, BOOM! count, head pats + pokes, time together today; plus running totals. Resets at local midnight
//
// Sources (observed read-only, the brain is not modified):
//   keys       input.on('key') (the input layer already drops auto-repeat and modifier keys)
//   booms      the moment pet.typing.phase becomes 'boom'
//   touches    pokes: delta of brain.pokeCount (④, only ever increases); without it, fall back to inference -- brain.pokes caps at 8 and also decays one by one, so watching it alone undercounts; also watch brain.pokeDecay (both a poke and a decay set it to now;
//              if it changed and pokes didn't drop = at least one poke) + brain.pat.count increasing (head pat)
//   togetherMs per frame: the app is visible and you're using the computer (input.lastInput within 2 minutes, only key presses / clicks / wheel count; only starts after the first input since launch)
// Storage: store.save('uiStats', …) (throttled 15 s, see store.js)
//
// Interface:
//   stats.today   { keys, booms, touches, togetherMs } (read-only)
//   stats.total   { keys, booms, touches, togetherMs }
//   stats.on('change', ({ key, value, delta }) => …)    any item changed (togetherMs reported once per whole second, not per frame)
//   stats.on('key' | 'boom' | 'touch', ({ n }) => …)    single events (progress uses them to add XP)
//   stats.on('minute', () => …)                         every full minute of time together today
//   stats.on('day', () => …)                            crossed midnight and reset
//   stats.update(dt, f)                                 called by index.js every frame
//   stats.set(today)  stats.resetToday()                for demos / the developer panel

import { clock } from '../clock.js'
import { dayKey, emitter } from './util.js'

const ACTIVE_MS = 120000
const zero = () => ({ keys: 0, booms: 0, touches: 0, togetherMs: 0 })

export function createStats({ brain, pet, input, store }) {
  const ev = emitter()
  const saved = store.get('uiStats', null)
  const s = {
    day: saved?.day || dayKey(),
    today: { ...zero(), ...(saved?.today || {}) },
    total: { ...zero(), ...(saved?.total || {}) },
  }
  const persist = () => store.save('uiStats', { day: s.day, today: s.today, total: s.total })
  const bump = (key, n = 1) => {
    s.today[key] += n; s.total[key] += n
    ev.emit('change', { key, value: s.today[key], delta: n })
    persist()
  }
  // Crossing midnight
  const checkDay = () => {
    const d = dayKey()
    if (d === s.day) return
    s.day = d; s.today = zero()
    ev.emit('day'); ev.emit('change', { key: '*', value: 0, delta: 0 })
    persist()
  }
  if (s.day !== dayKey()) checkDay()

  input.on('key', () => { bump('keys'); ev.emit('key', { n: 1 }) })

  let lastPhase = pet.typing?.phase, lastPokes = brain.pokes || 0, lastPokeT = brain.pokeDecay, lastPats = brain.pat?.count || 0, lastPokeCount = brain.pokeCount
  let secAcc = 0, minAcc = 0, dayAcc = 0
  const api = {
    get today() { return s.today },
    get total() { return s.total },
    on: ev.on,
    update(dt, f) {
      // BOOM!
      const ph = pet.typing?.phase
      if (ph === 'boom' && lastPhase !== 'boom') { bump('booms'); ev.emit('boom', { n: 1 }) }
      lastPhase = ph
      // Pokes + head pats (see top: still counted after pokes cap at 8)
      const p = brain.pokes || 0, pt = brain.pokeDecay, c = brain.pat?.count || 0
      // If ④ provides the ever-increasing brain.pokeCount, use its delta directly; only without it (④'s branch not merged yet) use the inference below
      const pc = brain.pokeCount
      const poked = typeof pc === 'number' ? Math.max(0, pc - (lastPokeCount ?? pc)) : p > lastPokes ? p - lastPokes : pt !== lastPokeT && p === lastPokes && p > 0 ? 1 : 0
      lastPokeCount = pc
      if (poked) { bump('touches', poked); ev.emit('touch', { n: poked }) }
      if (c > lastPats) { bump('touches', c - lastPats); ev.emit('touch', { n: c - lastPats }) }
      lastPokes = p; lastPokeT = pt; lastPats = c
      // Time together today: visible (update doesn't even run while hidden for fullscreen) + you're using the computer
      if (input.lastInput > 0 && clock.now() - input.lastInput < ACTIVE_MS) {
        const ms = dt * 1000
        s.today.togetherMs += ms; s.total.togetherMs += ms
        secAcc += ms; minAcc += ms
        if (secAcc >= 1000) { secAcc -= 1000; ev.emit('change', { key: 'togetherMs', value: s.today.togetherMs, delta: 1000 }); persist() }
        if (minAcc >= 60000) { minAcc -= 60000; ev.emit('minute') }
      }
      // Crossing midnight: checking once a second is enough
      if ((dayAcc += dt) > 1) { dayAcc = 0; checkDay() }
    },
    // Demo / debugging: set today's numbers directly (not added to the totals)
    set(today) {
      Object.assign(s.today, today)
      ev.emit('change', { key: '*', value: 0, delta: 0 })
      persist()
    },
    resetToday() { s.today = zero(); ev.emit('change', { key: '*', value: 0, delta: 0 }); persist() },
    // Developer panel "+1 BOOM": takes the same path as the real thing (today / total / XP all go up)
    fake(kind) {
      if (kind === 'boom') { bump('booms'); ev.emit('boom', { n: 1 }) }
      else if (kind === 'touch') { bump('touches'); ev.emit('touch', { n: 1 }) }
      else if (kind === 'key') { bump('keys'); ev.emit('key', { n: 1 }) }
    },
  }
  return api
}
