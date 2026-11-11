// Event parameters (event tuning changes the defaults here, or tune them in the developer panel "Params" tab and save to tuning.json)
//  Each item: [default, description, unit]. Group and item names are a contract: the brain reads this.params.<group>.<item>, tuning.json stores by them
//  Changing a default changes the feel for everyone; to experiment locally, tune in the developer panel (saved to %APPDATA%/RampartPet3D/tuning.json, shared by the dev and release builds)
export const PARAMS = {
  idle: ['Idle / sleep', {
    lateHalve: [true, 'From 0 to 5 am, halve the time to lie down / fall asleep (that time is the "sleep after" setting x: lie down after x min, fall asleep after 2x, config.sleepAfter)', ''],
    tier1: [15, 'Idle longer than this enters the "idle a while" tier: the fidget pool adds welding Sheila, yoga, stretch, wander', 's'],
    tier2: [60, 'Idle longer than this enters the "bored" tier: adds bored moves and nap (until lying down)', 's'],
    gap0: [14, 'Mean gap between fidgets: active tier', 's'],
    gap1: [22, 'Mean gap between fidgets: idle-a-while tier', 's'],
    gap2: [35, 'Mean gap between fidgets: bored tier', 's'],
    resumeGap: [12, 'Mean gap to the next fidget after a behavior ends and returns to the base pose', 's'],
    typingBudget: [5, 'A key was pressed within this time: only fidgets that do not block the view, like blowing bubble gum', 's'],
    typingBubble: [0.3, 'Chance of a bubble when a fidget comes up during typing pauses', '0–1'],
    idleLine: [0.15, 'After idling a while, chance of an idle line with each fidget pick', '0–1'],
    napMin: [40, 'Shortest nap', 's'],
    napMax: [80, 'Longest nap', 's'],
    stanceMin: [20, 'Shortest hold of an alternate stance', 's'],
    stanceMax: [60, 'Longest hold of an alternate stance', 's'],
  }],
  pool: ['Idle fidgets: weight / cooldown', {
    fidgetCool: [60, 'Cooldown of each fidget clip (per-clip weights are in clips.js)', 's'],
    gunrevW: [1, 'Sheila test spin: weight', ''], gunrevCool: [120, 'Sheila test spin: cooldown', 's'],
    stanceW: [0.8, 'Alternate stance: weight', ''], stanceCool: [180, 'Alternate stance: cooldown', 's'],
    weldW: [1.5, 'Weld Sheila: weight (from the idle-a-while tier)', ''], weldCool: [300, 'Weld Sheila: cooldown', 's'],
    yogaW: [0.6, 'Yoga: weight (from the idle-a-while tier)', ''], yogaCool: [600, 'Yoga: cooldown', 's'],
    stretchW: [0.6, 'Stretch: weight (from the idle-a-while tier)', ''], stretchCool: [400, 'Stretch: cooldown', 's'],
    wanderW: [0.8, 'Wander: weight (from the idle-a-while tier)', ''], wanderCool: [240, 'Wander: cooldown', 's'],
    boredW: [0.5, 'Bored moves: weight of each (bored tier)', ''], boredCool: [1200, 'Bored moves: cooldown', 's'],
    napW: [1.2, 'Nap: weight (bored tier)', ''], napCool: [900, 'Nap: cooldown', 's'],
  }],
  typing: ['Typing', {
    steadyRate: [1.5, 'Steady tier: mean keys per second over the last 1 s ≥ (standing at this typing speed, she takes out Sheila and starts fixing)', 'keys/s'],
    steadyHold: [1.5, 'How long after the typing stop the typing tier ends (tier display only)', 's'],
    burstRate: [6, 'Burst tier: mean keys per second over the last 2 s ≥', 'keys/s'],
    stowAfter: [3, 'How long after the typing stop she stows Sheila and stands (the barrel stops at 2.5 s first, so keep this above 2.7)', 's'],
    revupAfter: [5, 'How long the burst tier must last while fixing Sheila to trigger a burst (turn and slam -> ride Sheila -> BOOM! -> skydive)', 's'],
    revupCool: [180, 'Burst cooldown', 's'],
    wakeGrace: [1.5, 'After a key wakes her, how long to wait after getting up before typing counts (a single key leaves her standing)', 's'],
  }],
  poke: ['Poke / pick up / throw', {
    pokeDelay: [0.45, 'Wait after a click to rule out a double-click before it counts as a poke', 's'],
    pokeDecay: [6, 'Poke count drops by one every', 's'],
    tauntFrom: [4, 'Consecutive poke number that starts the taunt', 'pokes'],
    warnFrom: [6, 'Consecutive poke number for the Sheila spin + sulk', 'pokes'],
    warnCap: [2, 'Max full warnings within 10 min (after that only the hit reaction)', 'times'],
    sulkTime: [8, 'How long she sulks crouched before forgiving you', 's'],
    pickupPx: [6, 'Drag distance while held down that counts as a pick up', 'px'],
    gravity: [3000, 'Fall gravity', 'px/s²'],
    flipSpeed: [1100, 'Throw speed above this may cause a flip', 'px/s'],
    flipChance: [0.5, 'Flip chance', '0–1'],
    heavyImpact: [1400, 'Landing speed above this is a heavy landing (she also gets up)', 'px/s'],
    photoHold: [3.2, 'Double-click photo: pose hold', 's'],
    clickRange: [900, 'Desktop click: how close to her it must be for her to look', 'px'],
    clickChance: [0.5, 'Desktop click: chance she looks over', '0–1'],
  }],
  touch: ['Head pat / wheel / hover', {
    patTurns: [3, 'Head pat: cursor direction changes within the window that count as a pat', 'times'],
    patWindow: [1.5, 'Head pat: direction change counting window', 's'],
    patSpeed: [120, 'Head pat: minimum horizontal cursor speed', 'px/s'],
    patLong: [8, 'Head pat longer than this triggers the messy-hair line', 's'],
    spinStep: [0.35, 'Spin per wheel notch', 'rad'],
    dizzyTurns: [3, 'Total turns before she gets dizzy', 'turns'],
    dizzyTime: [4, 'How long she stays dizzy', 's'],
    hoverLook: [0.8, 'Hover time before she looks at you and smiles', 's'],
    hoverSay: [5, 'Hover time before she says a line', 's'],
    hoverCool: [600, 'Hover line cooldown', 's'],
  }],
  music: ['Music', {
    loudLevel: [0.03, 'System audio peak above this counts as sound', '0–1'],
    sessions: [true, 'Tell sources apart per app (browser / meeting / video player / game audio does not count); off falls back to total system volume', ''],
    playerLoud: [0.5, 'Sound threshold multiplier for known players (NetEase Cloud Music / QQ Music / Kugou / Spotify / foobar2000), lower = looser', '×'],
    onSec: [3, 'Sustained sound for this long counts as music playing (silence under 0.4 s does not break it)', 's'],
    offSec: [2, 'Continuous silence for this long counts as music stopped', 's'],
    startCool: [60, 'Cooldown of the "I hear it" opening dance (short silences between songs do not trigger it every song)', 's'],
    onsetRatio: [1.35, 'Onset: nod when the peak is this many times the short-term mean', '×'],
    beatGap: [0.28, 'Shortest gap between two beat sync nods', 's'],
    danceGap: [12, 'With music on and idle, mean gap between move beats (counted from the end of the last move)', 's'],
    danceP: [0.7, 'Chance each beat picks from the music pool (dances + music fidgets); the rest goes to the idle director', '0–1'],
  }],
  system: ['Foreground app / time', {
    fgLook: [0.7, 'Chance she looks at the new window on a window switch', '0–1'],
    codeLine: [0.5, 'Chance of a line when switching to a code editor (at most once per launch)', '0–1'],
    lateFrom: [1, 'Late-night sleep nudge: from this hour', 'h'],
    lateTo: [5, 'Late-night sleep nudge: until this hour', 'h'],
    lateActive: [10, 'Late-night continuous activity before the sleep nudge', 'min'],
  }],
  xp: ['XP / rank', {
    perMinute: [2, 'Company: per minute you use the computer (a key / click / wheel within 2 min)', 'XP'],
    dayBonus: [60, 'First meeting of the day', 'XP'],
    keysPerXp: [25, 'Typing: +1 per this many keys', 'keys'],
    keysCapMin: [300, 'Typing: max keys counted per minute (held keys / autoclickers cannot farm it)', 'keys'],
    boom: [30, 'Landing a BOOM!', 'XP'],
    touch: [3, 'One poke / head pat', 'XP'],
    touchCapHour: [20, 'Poke / head pat: max counted per hour', 'times'],
    levelBase: [500, 'XP needed from level 1 to level 2', 'XP'],
    levelStep: [40, 'Extra XP each later level needs over the previous one', 'XP'],
    levelsPerDivision: [3, 'Levels per division (Rookie to Diamond, each IV -> I)', 'levels'],
    masterLevels: [12, 'Levels after Diamond I that are Master; beyond that is Apex Predator', 'levels'],
  }],
  lines: ['Line rate limit', {
    autoGap: [90, 'Shortest gap between unprompted lines (talking to herself)', 's'],
    autoPerHour: [10, 'Max unprompted lines per hour', 'times'],
    replyGap: [8, 'Shortest gap between replies to interactions (poke, pick up, photo...)', 's'],
  }],
}

// defaults: { group: { item: value } }
export function defaults() {
  const o = {}
  for (const [g, [, items]] of Object.entries(PARAMS)) {
    o[g] = {}
    for (const [k, [v]] of Object.entries(items)) o[g][k] = v
  }
  return o
}

// merge overrides (tuning.json content) into target: reset to defaults first, then apply overrides; unknown items and wrong types are ignored.
// accepts the flat lieMin / sleepMin / lateHalve stored by 2.0.0
export function applyOverrides(target, over) {
  over = over && typeof over === 'object' ? over : {}
  const d = defaults()
  for (const g of Object.keys(d)) {
    const src = { ...(g === 'idle' ? pickKeys(over, ['lieMin', 'sleepMin', 'lateHalve']) : {}), ...(over[g] && typeof over[g] === 'object' ? over[g] : {}) }
    for (const [k, v] of Object.entries(src)) if (k in d[g] && typeof v === typeof d[g][k] && (typeof v !== 'number' || Number.isFinite(v))) d[g][k] = v
    target[g] = d[g]
  }
  return target
}
const pickKeys = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]))

// items that differ from the defaults: { group: { item: value } } (used to save tuning.json)
export function diffFromDefaults(p) {
  const d = defaults(), out = {}
  for (const g of Object.keys(d)) for (const k of Object.keys(d[g])) if (p[g]?.[k] !== d[g][k]) (out[g] ||= {})[k] = p[g][k]
  return out
}
