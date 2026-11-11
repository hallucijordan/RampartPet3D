// XP, level, rank
//
// Rules belong to ④ (event parameters and logic): values are in the xp group of params.js (tunable on the "③ params" tab, live after saving), read fresh from brain.params.xp every time
//   If ④'s branch isn't merged yet, brain.params.xp doesn't exist and FALLBACK below is used (same as ④'s final defaults)
//
// Interface:
//   progress.xp          total XP
//   progress.level       level (starts at 1)
//   progress.cur         XP earned in this level      progress.next  XP needed for the next level      progress.frac  cur / next (0..1)
//   progress.tier        rank id: 'rookie' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master' | 'apex'
//   progress.division    division 4..1 (IV..I), 0 for Master / Apex Predator (no divisions)
//   progress.add(kind, n = 1)   kind: 'keys' (keystrokes) | 'boom' | 'touch' | 'minutes' (minutes together) | 'xp' (add XP directly)
//   progress.set({ xp } | { level, frac })   set directly (demo / developer panel), no level / division / tier events
//   progress.on(type, cb):
//     'xp'        { gain, xp, kind }                    any XP change
//     'level'     { from, to }                          level up (may skip several levels at once, emitted once)
//     'division'  { from: {tier, division}, to }        division change within a tier (IV → III)
//     'tier'      { from: {tier, division}, to }        tier change (if tier fires, division doesn't)
//   progress.rankAt(level) → { tier, division }         rank for a given level
//   TIERS: rank table (id, rank color), used by ui.rank() in index.js to build names and images
//
// Rules (set by ④, DESIGN §5.9):
//   perMinute per minute together; dayBonus for the first meeting each day (given with the first minute counted that day, stored by date in uiProgress.bonusDay to avoid duplicates)
//   +1 per keysPerXp keystrokes, at most keysCapMin keys counted per minute (calendar minutes, excess keys don't carry into the remainder)
//   boom per BOOM!; touch per poke / head pat, at most touchCapHour counted in the last 60 minutes (excess only goes into stats, no XP)
//   level n → n+1 takes levelBase + levelStep·n; every levelsPerDivision levels is one division (Rookie to Diamond each IV → I), after Diamond I masterLevels levels of Master, then Apex Predator
//   only goes up; if tuning changes the curve, the level is recomputed from total XP

import { emitter } from './util.js'

const FALLBACK = {
  perMinute: 2, dayBonus: 60, keysPerXp: 25, keysCapMin: 300, boom: 30, touch: 3, touchCapHour: 20,
  levelBase: 500, levelStep: 40, levelsPerDivision: 3, masterLevels: 12,
}
const DIVISION_TIERS = ['rookie', 'bronze', 'silver', 'gold', 'platinum', 'diamond']   // these ranks have four divisions IV..I

// Current rules: once createProgress has the brain, read brain.params.xp (fresh every time, tuning applies immediately)
let src = () => null
const R = (k) => { const v = src()?.[k]; return typeof v === 'number' && isFinite(v) ? v : FALLBACK[k] }
const levelXp = (n) => Math.max(1, R('levelBase') + R('levelStep') * n)

// Rank colors (rank border colors from the game's color table ui_colors.csv)
export const TIERS = [
  { id: 'rookie', color: '#9f8a78' },
  { id: 'bronze', color: '#99786b' },
  { id: 'silver', color: '#afafb9' },
  { id: 'gold', color: '#d0b583' },
  { id: 'platinum', color: '#5ad2ff' },
  { id: 'diamond', color: '#1d8ff2' },
  { id: 'master', color: '#7e4ad7' },
  { id: 'apex', color: '#ff4139' },
]
export const tierColor = (id) => TIERS.find(t => t.id === id)?.color || '#c3d8d9'

export function rankAt(level) {
  const per = Math.max(1, R('levelsPerDivision'))
  const d = Math.floor((level - 1) / per)
  const n = DIVISION_TIERS.length * 4
  if (d < n) return { tier: DIVISION_TIERS[Math.floor(d / 4)], division: 4 - (d % 4) }
  if ((level - 1) - n * per < R('masterLevels')) return { tier: 'master', division: 0 }
  return { tier: 'apex', division: 0 }
}
// Lowest level of a rank (division): used for rank-up demos
export function levelOf(tier, division = 4) {
  for (let lv = 1; lv < 1000; lv++) { const r = rankAt(lv); if (r.tier === tier && (!division || r.division === division || !r.division)) return lv }
  return 1
}

const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }

export function createProgress({ store, brain }) {
  src = () => brain?.params?.xp
  const ev = emitter()
  const saved = store.get('uiProgress', null)
  const st = { xp: saved?.xp || 0, keyRem: saved?.keyRem || 0, bonusDay: saved?.bonusDay || '' }
  const cap = { min: -1, keys: 0, touches: [] }      // per-minute typing cap, 60-minute poke / head pat cap (memory only, not restored after restart)
  let cache = null, sig = ''
  // Total XP → level / progress in level (also recomputed when the curve params change: sig is the curve-related values)
  const solve = () => {
    let lv = 1, left = st.xp
    while (left >= levelXp(lv) && lv < 5000) { left -= levelXp(lv); lv++ }
    const r = rankAt(lv)
    cache = { level: lv, cur: left, next: levelXp(lv), tier: r.tier, division: r.division }
    sig = `${R('levelBase')},${R('levelStep')},${R('levelsPerDivision')},${R('masterLevels')}`
  }
  const fresh = () => { if (sig !== `${R('levelBase')},${R('levelStep')},${R('levelsPerDivision')},${R('masterLevels')}`) solve(); return cache }
  solve()
  const persist = () => store.save('uiProgress', { xp: Math.round(st.xp), keyRem: st.keyRem, bonusDay: st.bonusDay })

  const gain = (n, kind) => {
    if (!(n > 0)) return
    const before = fresh()
    st.xp += n
    solve()
    persist()
    ev.emit('xp', { gain: n, xp: st.xp, kind })
    if (cache.level === before.level) return
    ev.emit('level', { from: before.level, to: cache.level })
    const from = { tier: before.tier, division: before.division }, to = { tier: cache.tier, division: cache.division }
    if (to.tier !== from.tier) ev.emit('tier', { from, to })
    else if (to.division !== from.division) ev.emit('division', { from, to })
  }

  return {
    get xp() { return st.xp },
    get level() { return fresh().level },
    get cur() { return fresh().cur },
    get next() { return fresh().next },
    get frac() { const c = fresh(); return c.cur / c.next },
    get tier() { return fresh().tier },
    get division() { return fresh().division },
    on: ev.on,
    add(kind, n = 1) {
      if (kind === 'keys') {
        // At most keysCapMin keys counted per minute (calendar minutes); excess keys don't carry into the remainder
        const m = Math.floor(Date.now() / 60000)
        if (m !== cap.min) { cap.min = m; cap.keys = 0 }
        const k = Math.max(0, Math.min(n, R('keysCapMin') - cap.keys))
        cap.keys += k
        if (!k) return
        const per = Math.max(1, R('keysPerXp'))
        st.keyRem += k
        const x = Math.floor(st.keyRem / per)
        st.keyRem -= x * per
        if (x) gain(x, kind); else persist()
      } else if (kind === 'boom') gain(R('boom') * n, kind)
      else if (kind === 'touch') {
        // At most touchCapHour counted in the last 60 minutes
        const now = Date.now()
        cap.touches = cap.touches.filter(t => now - t < 3600e3)
        let k = 0
        while (k < n && cap.touches.length < R('touchCapHour')) { cap.touches.push(now); k++ }
        if (k) gain(R('touch') * k, kind)
      } else if (kind === 'minutes') {
        // First minute together counted today: daily meeting bonus
        const d = dayKey()
        let x = R('perMinute') * n
        if (st.bonusDay !== d) { st.bonusDay = d; x += R('dayBonus') }
        gain(x, kind)
      } else if (kind === 'xp') gain(n, kind)
    },
    // Set progress directly (demo / debugging): { xp } or { level, frac }
    set(o) {
      if (o.xp != null) st.xp = Math.max(0, o.xp)
      else if (o.level != null) {
        let x = 0
        for (let l = 1; l < o.level; l++) x += levelXp(l)
        st.xp = x + Math.floor((o.frac || 0) * levelXp(o.level))
      }
      solve(); persist()
      ev.emit('xp', { gain: 0, xp: st.xp, kind: 'set' })
    },
    rankAt, levelOf,
  }
}
