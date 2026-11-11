// Developer panel · ③ parameters: one row per item in params.js; "Save" applies immediately and writes tuning.json
//  Under Electron it is %APPDATA%/RampartPet3D/tuning.json (shared by the developer and release builds; a running release build follows along); in the browser it goes to localStorage
import { PARAMS, defaults, applyOverrides, diffFromDefaults } from '../params.js'
import { el } from './util.js'

// Sanity check before saving: returns an error message, or empty if all is well
function check(p) {
  for (const [g, items] of Object.entries(p)) for (const [k, v] of Object.entries(items))
    if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) return `"${PARAMS[g][1][k][1]}" must be a number ≥ 0`
  const I = p.idle, T = p.typing, Q = p.poke, S = p.system
  if (!(I.tier2 > I.tier1)) return 'Idle tier 2 ("bored") must start later than tier 1'
  if (I.napMax < I.napMin || I.stanceMax < I.stanceMin) return 'Max must not be less than min'
  if (!(T.burstRate > T.steadyRate)) return 'Burst typing speed must be higher than steady'
  if (!(T.stowAfter > 2.7)) return 'Stowing Sheila must come after the barrels fold (2.5 s after typing stops): at least 2.7 s'
  if (!(Q.warnFrom > Q.tauntFrom && Q.tauntFrom >= 2)) return 'Warn threshold must be above the taunt threshold; taunt at the 2nd poke or later'
  if (!(S.lateTo > S.lateFrom)) return 'Late-night bedtime nag: end hour must be after start hour'
  const M = p.music
  if (!(M.onSec > 0 && M.offSec > 0 && M.danceGap > 0)) return 'Music: on / off times and move interval must be > 0'
  if (!(M.danceP <= 1)) return 'Music: music-pool probability cannot exceed 1'
  const X = p.xp
  if (!(X.keysPerXp >= 1 && X.levelBase >= 1 && X.levelsPerDivision >= 1)) return 'XP: keys per XP, XP for level 1 → 2 and levels per division must all be ≥ 1'
  return ''
}

async function saveTuning(diff) {
  if (window.petAPI?.setTuning) {
    // The main process merges per group: each group is replaced whole, null deletes it; also clears the old flat keys saved by 2.0.0
    const patch = { lieMin: null, sleepMin: null, lateHalve: null }
    for (const g of Object.keys(PARAMS)) patch[g] = diff[g] || null
    return window.petAPI.setTuning(patch)
  }
  localStorage.setItem('pet3d.tuning', JSON.stringify(diff))
}

export function mountParams({ b, log, onError, body }) {
  const d = defaults()
  body.appendChild(el('div', 'note', 'Click "Save" to apply immediately and write tuning.json (shared by the developer and release builds; a running release build follows along).\nChanged items are highlighted in yellow, with the default on the right. To change the defaults themselves, edit src/params.js.'))
  const bar = el('div', 'bar pbar', '<button class="pri" data-p="save">Save</button><button data-p="def">Reset all to default</button><span class="tmsg"></span>')
  body.appendChild(bar)
  const msg = bar.querySelector('.tmsg')
  const say = (text, bad) => { msg.textContent = text; msg.style.color = bad ? '#ff9aa5' : '' }

  const items = []
  for (const [g, [label, defs]] of Object.entries(PARAMS)) {
    const det = el('details'); det.open = g === 'idle'
    det.appendChild(el('summary', '', `${label}<span class="cnt">${Object.keys(defs).length}</span>`))
    for (const [k, [, desc, unit]] of Object.entries(defs)) {
      const isBool = typeof d[g][k] === 'boolean'
      const row = el('div', 'prow')
      const lab = el('span', 'pl'); lab.textContent = desc; lab.title = `${g}.${k}`
      const inp = el('input'); inp.type = isBool ? 'checkbox' : 'number'; if (!isBool) inp.step = 'any'
      const u = el('span', 'pu'); u.textContent = unit
      const def = el('span', 'pd')
      row.append(lab, inp, u, def)
      det.appendChild(row)
      items.push({ g, k, isBool, inp, row, def })
    }
    body.appendChild(det)
  }
  const value = (it) => it.isBool ? it.inp.checked : Number(it.inp.value)
  const mark = () => {
    let n = 0
    for (const it of items) {
      const changed = value(it) !== d[it.g][it.k]
      if (changed) n++
      it.row.classList.toggle('changed', changed)
      it.def.textContent = changed ? `default ${d[it.g][it.k] === true ? 'on' : d[it.g][it.k] === false ? 'off' : d[it.g][it.k]}` : ''
    }
    return n
  }
  const fill = () => {
    for (const it of items) { const v = b.params[it.g][it.k]; if (it.isBool) it.inp.checked = v; else it.inp.value = v }
    mark()
  }
  for (const it of items) it.inp.addEventListener(it.isBool ? 'change' : 'input', mark)
  fill()
  window.petAPI?.onTuning?.(() => setTimeout(fill))    // the other side (release build / another developer window) saved

  bar.querySelector('[data-p="save"]').onclick = async () => {
    const p = {}
    for (const it of items) (p[it.g] ||= {})[it.k] = value(it)
    const err = check(p)
    if (err) return say(err, true)
    applyOverrides(b.params, p)
    const diff = diffFromDefaults(b.params)
    try { await saveTuning(diff) } catch (e) { onError('Saving parameters failed: ' + (e.stack || e)); return }
    const n = mark()
    say(n ? `Saved, ${n} item(s) differ from default` : 'Saved (all defaults)')
    log('ok', `Parameters saved: ${n ? Object.entries(diff).map(([g, o]) => Object.entries(o).map(([k, v]) => `${g}.${k}=${v}`).join(' ')).join(' ') : 'all default'}`)
  }
  bar.querySelector('[data-p="def"]').onclick = async () => {
    applyOverrides(b.params, {})
    fill()
    try { await saveTuning({}) } catch (e) { onError('Resetting to default failed: ' + (e.stack || e)); return }
    say('All reset to default'); log('ok', 'Parameters all reset to default')
  }
}
