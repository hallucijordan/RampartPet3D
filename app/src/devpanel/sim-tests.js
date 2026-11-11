// Developer panel · ① animation triggers (simulated): test table checking event → animation
//  Each row: play calls the behavior directly; sim simulates the real trigger (falls back to play); expect(o, before) judges; want is the expectation (for humans)
//  o is this test's observation record (behaviors acts, clips, states, base poses bases, typing tiers levels, lines, expressions exprs, effects fx...)
//  Counts / durations in the simulations follow the current parameters (b.params, see params.js), so tests still hold after tuning
//  Add a row here when adding a behavior; behavior names and clip slot names are the contract with the brain
import { clock } from '../clock.js'
import { C, keyOf, clipName } from '../clips.js'
import { sleep, until } from './util.js'

export function simGroups(T) {
  const { b, input, world, h, chest, head, fire, sim, obs } = T
  const L = b.lines, P = () => b.params
  const G = []
  const group = (name, rows) => G.push({ name, rows })
  const hasLine = (o, cat) => o.lines.some(l => l.cat === cat && l.ok)
  const saidAny = (o, re) => o.lines.some(l => re.test(l.cat))
  const rect = (x, y, w, hh) => ({ x, y, width: w, height: hh, lx: x, ly: y })
  const fastRate = () => Math.max(9, P().typing.burstRate + 3)            // typing speed that reliably reaches the burst tier
  const fidgetRow = (id, name, spec, want) => ({
    id, name, cond: 'Drawn at random from the idle pool by weight and cooldown', want: want || `Plays "${clipName(keyOf(spec))}"`,
    play: () => { b.endAct(); b.fidget(spec) }, timeout: 5, fidgets: false,
    expect: (o) => o.clips.has(keyOf(spec)),
  })

  group('Mouse', [
    { id: 'poke1', name: 'Single poke', cond: 'Single click on her (no second click shortly after, default 0.45 s)', want: 'Hit recoil, poke count +1, surprised → angry expression',
      play: () => { const p = chest(), e = { clientX: p.x, clientY: p.y }; b.recoil(e); b.poke(e) },
      sim: (h) => h.click(), expect: (o) => b.pokes >= 1 && o.exprs.has('surprised'), timeout: P().poke.pokeDelay + 1.5 },
    { id: 'taunt', name: 'Repeated pokes → taunt', cond: 'Keep clicking up to the taunt threshold (default 4th–5th poke; count drops by one per 6 s without pokes)', want: 'Behavior taunt, clip "taunt"',
      play: () => { b.pokes = P().poke.tauntFrom - 1; b.poke({}) },
      sim: (h) => h.clicks(P().poke.tauntFrom, P().poke.pokeDelay + 0.15), expect: (o) => o.acts.has('taunt'), timeout: 4 },
    { id: 'warn', name: 'Repeated pokes → Sheila rev + sulk', cond: 'Keep poking up to the warn threshold (default 6th poke); at most two full escalations per 10 minutes', want: 'Behavior warn: sparks, revs Sheila, then sulks crouched, then forgives you',
      play: () => { b.endAct(); b.pokes = P().poke.warnFrom - 1; b.poke({}) },
      sim: (h) => h.clicks(P().poke.warnFrom, P().poke.pokeDelay + 0.15), expect: (o) => o.acts.has('warn'), timeout: 5 },
    { id: 'held', name: 'Pick up', cond: 'Press on her and drag more than a few pixels (default 6 px)', want: 'State held, clip "grabbed" → "dangling", surprised',
      sim: async (h) => { await h.onto(); const p = chest(); h.down(p); await h.glide({ x: p.x + 10, y: p.y - 120 }, 0.4); await sleep(1.5); h.up(input.mouse) },
      expect: (o) => o.states.has('held') && o.acts.has('held') && o.clips.has(keyOf(C.grab)), timeout: 3 },
    { id: 'throw', name: 'Throw → land', cond: 'After picking up, fling and release; above the speed threshold (default 1100 px/s) she may flip', want: 'State held → air → idle, behavior land',
      sim: async (h) => { await h.onto(); const p = chest(); h.down(p); await h.glide({ x: p.x, y: p.y - 60 }, 0.3); await sleep(0.3); await h.glide({ x: p.x - 320, y: p.y - 160 }, 0.1); h.up(input.mouse) },
      expect: (o) => o.states.has('air') && o.acts.has('land'), timeout: 6 },
    { id: 'drop', name: 'Drop from high → heavy landing + get up', cond: 'Landing speed above the heavy-landing threshold (default 1400 px/s, about a 400 px drop)', want: 'Clip "heavy landing" then "get up", dust',
      sim: async (h) => { await h.onto(); const p = chest(); h.down(p); await h.glide({ x: p.x, y: Math.max(40, p.y - 620) }, 1.3); await sleep(0.4); h.up(input.mouse) },
      expect: (o) => o.clips.has(keyOf(C.landHeavy)) && o.clips.has(keyOf(C.getUp)), timeout: 8 },
    { id: 'photo', name: 'Double-click → photo pose', cond: 'Double-click on her while standing (the two clicks do not count as pokes)', want: 'Behavior photo, white flash, strikes a banner pose',
      play: () => { input.over = true; b.onDouble() },
      sim: async (h) => { await h.onto(); const p = chest(); h.down(p); h.up(p); await sleep(0.08); h.down(p); h.up(p); fire('dblclick', p) },
      expect: (o) => o.acts.has('photo') && o.fx.has('flash') && b.pokes === 0, timeout: 3 },
    { id: 'pat', name: 'Head pat', cond: 'Cursor moves back and forth above her head (default ≥3 direction changes within 1.5 s, no clicks)', want: 'Squints, happy, head leans into the pat',
      sim: async (h) => { const p = head(); await h.onto({ x: p.x, y: p.y - 10 }); for (let i = 0; i < 16; i++) await h.glide({ x: p.x + (i % 2 ? -45 : 45), y: p.y - 10 }, 0.12) },
      expect: (o, s) => b.pat.count > s.patCount, timeout: 2 },
    { id: 'dizzy', name: 'Wheel spin → dizzy', cond: 'Scroll the wheel with the cursor on her until enough turns (default 0.35 rad per notch, 3 turns)', want: 'Body spins along; when enough, head circles, sad, line dizzy',
      sim: async (h) => { await h.onto(); const T = P().touch; await h.wheel(Math.ceil(T.dizzyTurns * 2 * Math.PI / T.spinStep) + 26, 0.015) },
      expect: (o, s) => b.spin.dizzyUntil > s.dizzy, timeout: 2 },
    { id: 'hover', name: 'Hover → looks at you, smiles', cond: 'Cursor rests on her for a moment (default 0.8 s; after 5 s she says a line, once per 10 minutes)', want: 'Looks at the camera, happy expression',
      sim: async (h) => { await h.onto(); await sleep(P().touch.hoverLook + 0.4) }, expect: (o) => b.hover.looked && o.exprs.has('happy'), timeout: 2 },
    { id: 'gclick', name: 'Click elsewhere on desktop → looks over', cond: 'Click the desktop near her (default within 900 px, 50% chance)', want: 'Gaze turns to the click point (attention click)',
      sim: async (h) => { for (let i = 0; i < 8 && !(b.attn.click); i++) { const p = { x: Math.max(20, world.x - 300), y: world.y - 350 }; h.move(p); fire('mousedown', p, { button: 0 }); await sleep(0.2) } },
      expect: () => !!b.attn.click, timeout: 2 },
  ])

  // Typing: draw Sheila → repair Sheila with back turned → stop typing, stow Sheila; burst → ride Sheila → BOOM! → skydive entrance. The device is the motion module's pet.typing
  const drawTime = 1.2                                                    // rough duration of drawing Sheila + fading into the repair loop
  let musicOffSec = 99, musicMoveSeen = false, musicBrowserOn = true             // music test results (recorded before the simulation ends)
  let pinnedOk = false                                                   // result of the "panel open, stays put" test (recorded before pinned is cleared)
  let turretSeen = new Set()                                              // barrel states seen during the barrel test (the motion module's proc.turret.mode)
  group('Keyboard', [
    { id: 'typeIn', name: 'Typing → draw Sheila → repair', cond: 'While standing, keys per second reach the steady tier (default ≥1.5)', want: 'Behavior typing, clip "draw Sheila" → "repair Sheila (loop)"',
      sim: (h) => h.type(4, drawTime + 1.5), expect: (o) => o.acts.has('typing') && o.clips.has(keyOf(C.typeDraw)) && o.clips.has(keyOf(C.typeLoop)), timeout: 2 },
    { id: 'typeOut', name: 'Stop typing → stow Sheila → stand', cond: 'Stop typing for a while during the repair loop (default 3 s)', want: 'Clip "stow Sheila", back to the standing base pose',
      sim: (h) => h.type(4, drawTime + 1), expect: (o) => o.clips.has(keyOf(C.typeStow)) && !b.act && b.pet.typing?.phase === 'none', timeout: P().typing.stowAfter + 4 },
    { id: 'turret', name: 'Barrels unfold, then spin during repair', manual: !b.proc.turret,   // until the motion module's tripod barrels (proc.turret) exist, this can only be checked by eye
      cond: 'Press keys once in the repair loop' + (b.proc.turret ? '' : ' (proc.turret not available yet: planned in the motion module)'), want: 'The barrels of tripod Sheila first unfold into four (opening), then spin with typing speed (open)',
      sim: async (h) => {
        const seen = turretSeen = new Set(), p = h.type(5, drawTime + 2.5)
        let done = false; p.then(() => { done = true })
        while (!done) { seen.add(b.proc.turret?.mode); await sleep(0.05) }
      },
      expect: () => turretSeen.has('opening') && turretSeen.has('open'), timeout: 1 },
    { id: 'burst', name: 'Burst → ride Sheila → BOOM! → skydive → stand', cond: 'Burst tier during repair (≥6 keys/s over the last 2 s) held for a while (default 5 s), with cooldown (default 3 minutes)',
      want: 'Behavior burst, clip "turn and slam" → "ride Sheila", after BOOM! a skydive from above (state air, behavior land)',
      sim: (h) => h.type(fastRate(), drawTime + P().typing.revupAfter + 1.5),
      expect: (o) => o.acts.has('burst') && o.clips.has(keyOf(C.burstTurn)) && o.clips.has(keyOf(C.burstRide)) && o.states.has('air') && o.acts.has('land') && !b.act, timeout: 20 },
    { id: 'typePoke', name: 'Poke during repair → recoil only, no interrupt', cond: 'Poke up to the taunt threshold while typing', want: 'Behavior stays typing, poke count still rises, no taunt',
      sim: async (h) => { const p = h.type(4, drawTime + 3.5); await sleep(drawTime + 0.3); await h.clicks(P().poke.tauntFrom, P().poke.pokeDelay + 0.15); await p },
      expect: (o) => o.acts.has('typing') && !o.acts.has('taunt') && b.pokes >= P().poke.tauntFrom, timeout: 1 },
  ])

  group('Idle / sleep', [
    { id: 'director', name: 'Idle director picks one at random', cond: 'Standing with nothing to do, picks one every so often by idle tier (simulated: next pick time set to now)', want: 'Starts any idle behavior', fidgets: true,
      sim: () => { b.nextFidget = clock.now() }, expect: (o) => o.acts.size > 0, timeout: 3 },
    { id: 'lie', name: 'Idle past threshold → lie down', cond: 'Idle (no keys / clicks / wheel) longer than the lie-down time (③ parameters; simulated: idle time injected)', want: 'Behavior lieDown, clip "lie down", base pose lounge',
      play: () => { b.endAct(); b.lieDown() }, sim: () => { input.lastInput = clock.now() - b.idleThresholds().lieAt - 12e3 },
      expect: (o) => o.acts.has('lieDown') && b.base === 'lounge', timeout: 12 },
    { id: 'sleep', name: 'Lying idle past threshold → fall asleep', cond: 'Idle while lying longer than the sleep time (counted from the last input; simulated: injected)', want: 'Base pose sleep, eyes closed, bubble in front of the mouth swells and shrinks, 20 fps',
      play: () => h.setBase('sleep'), sim: async (h) => { h.setBase('lounge'); await sleep(1); input.lastInput = clock.now() - b.idleThresholds().sleepAt - 12e3 },
      expect: (o) => o.bases.has('sleep') && b.fps === 20, timeout: 2 },
    { id: 'sleepMove', name: 'Mouse move while asleep → stays asleep', cond: 'Moving the cursor is not input (not even across her)', want: 'Stays asleep, no getUp',
      sim: async (h) => { h.setBase('sleep'); await sleep(1.2); const p = chest(); await h.glide({ x: p.x - 220, y: p.y - 120 }, 0.5); await h.glide({ x: p.x + 40, y: p.y }, 0.5); await h.glide({ x: p.x - 260, y: p.y - 160 }, 0.5); await sleep(0.6) },
      expect: (o) => b.base === 'sleep' && !o.acts.has('getUp'), timeout: 0.3 },
    { id: 'wakeKey', name: 'Key press while asleep → wakes with a start', cond: 'Key / click / wheel while asleep (mouse moves do not count)', want: 'Bubble pops, surprised, behavior getUp, line wake',
      sim: async (h) => { h.setBase('sleep'); await sleep(1.5); h.key('KeyA') }, expect: (o) => o.acts.has('getUp') && o.fx.has('pop'), timeout: 3 },
    { id: 'wakeIdle', name: 'Woken, no typing → stays standing', cond: 'Press a single key while asleep (the waking key is not typing; wait a bit after getting up, default 1.5 s)', want: 'Behavior getUp, then keeps standing, does not draw Sheila',
      sim: async (h) => { h.setBase('sleep'); await sleep(1.5); h.key('KeyA') },
      expect: (o) => o.acts.has('getUp') && b.typing.graceUntil > 0 && clock.now() > b.typing.graceUntil + 800 && !o.acts.has('typing') && b.base === 'stand' && !b.act, timeout: 8 },
    { id: 'wakeType', name: 'Woken, keeps typing → draws Sheila after grace', cond: 'Wake her with a key while asleep, then keep typing', want: 'Behavior getUp, then typing (draw Sheila) a bit after getting up',
      sim: async (h) => { h.setBase('sleep'); await sleep(1.5); await h.type(4, 5 + P().typing.wakeGrace) },
      expect: (o) => o.acts.has('getUp') && o.acts.has('typing') && o.clips.has(keyOf(C.typeDraw)), timeout: 2 },
    { id: 'wakePoke', name: 'Poke while asleep → poked awake', cond: 'Single click on her while asleep', want: 'Behavior getUp, line wake_poke',
      sim: async (h) => { h.setBase('sleep'); await sleep(1.5); await h.click() }, expect: (o) => o.acts.has('getUp') && saidAny(o, /^wake_poke$/), timeout: 8 },
    { id: 'loungePoke', name: 'Poke while lying → gets up', cond: 'Single click on her while lying (not asleep)', want: 'Behavior getUp',
      sim: async (h) => { h.setBase('lounge'); await sleep(1.5); await h.click() }, expect: (o) => o.acts.has('getUp'), timeout: 3 },
    { id: 'loungeKey', name: 'Key press while lying → gets up', cond: 'Press any key while lying', want: 'Behavior getUp',
      sim: async (h) => { h.setBase('lounge'); await sleep(1.5); h.key('KeyA') }, expect: (o) => o.acts.has('getUp'), timeout: 3 },
    { id: 'pinned', name: 'UI panel open → no lying down, no wandering', cond: 'brain.pinned is set while the GUI settings panel is open (simulated: set it, then inject idle past the lie-down time)', want: 'Stays in place, no lieDown / wander', fidgets: true,
      sim: async () => {
        b.pinned = true; pinnedOk = false
        input.lastInput = clock.now() - b.idleThresholds().lieAt - 12e3
        for (let i = 0; i < 6; i++) { b.nextFidget = clock.now(); await sleep(0.4) }
        pinnedOk = b.base === 'stand' && !['lieDown', 'wander'].includes(b.act?.name) && !obs().acts.has('lieDown') && !obs().acts.has('wander')
        b.pinned = false; input.lastInput = clock.now()
      },
      expect: () => pinnedOk, timeout: 1 },
    { id: 'nap', name: 'Nap', cond: 'The "bored" tier pool contains "nap": lie down for a while, then get up (default 40–80 s)', want: 'Behavior lieDown, base pose lounge',
      play: () => { b.endAct(); b.fidget('nap') }, expect: (o) => o.acts.has('lieDown'), timeout: 3 },
  ])

  group('Idle fidgets (played one by one to check clips load)', [
    ...C.fidgets.map(([spec, , , name], i) => fidgetRow('f' + i, name, spec)),
    fidgetRow('gunrev', 'Sheila rev', C.gunrev),
    { id: 'stance', name: 'Change base pose', cond: 'Idle pool: crouch / another standing pose, held for a while (default 20–60 s)', want: 'Clip switches to the crouch or another standing pose',
      play: () => { b.endAct(); b.fidget('stance') }, expect: (o) => o.acts.has('stance') && C.stances.some(s => o.clips.has(s)), timeout: 4 },
    fidgetRow('weldFull', 'Weld Sheila (full clip)', C.weld),
    { id: 'yoga', name: 'Yoga', cond: 'Pool from idle tier 1 on, with cooldown', want: 'Clip "yoga" followed by its loop',
      play: () => { b.endAct(); b.fidget(C.yoga) }, expect: (o) => o.acts.has('yoga') && o.clips.has(keyOf(C.yoga)), timeout: 5 },
    fidgetRow('stretch', 'Stretch', C.stretch),
    ...C.bored.map((s, i) => fidgetRow('bored' + i, clipName(s), s, `Plays "${clipName(s)}" (the "bored" tier pool)`)),
    { id: 'wander', name: 'Wander', cond: 'Pool from idle tier 1 on: sneaks crouched to another spot on the taskbar', want: 'Behavior wander, clip "crouch sneak", moves sideways',
      play: () => { b.endAct(); b.wander() }, expect: (o, s) => o.acts.has('wander') && o.clips.has(keyOf(C.sneak)) && Math.abs(world.x - s.x) > 20, timeout: 5 },
  ])

  const beat = (t) => ((t % 500) < 70 ? 0.55 : 0.12)     // 120 BPM
  // Music (rewritten in 2.5): simulated volume goes to input.audio (the "master volume" when no sessions are injected); the browser test injects input.simSessions
  group('Music', [
    { id: 'music', name: 'Play music → music detected', cond: 'Sound continues for a while (default 3 s; silences under 0.4 s do not interrupt)', want: 'Music starts (music.on)',
      sim: async () => { sim.audio = beat; await until(() => b.music.on, P().music.onSec + 3) }, expect: (o) => o.music, timeout: 1 },
    { id: 'musicOff', name: 'Pause → off within 2 s', cond: 'Continuous silence after music was detected (default 2 s)', want: 'About offSec seconds after silence, music.on goes back to false (no more than +0.5 s)',
      sim: async () => {
        sim.audio = beat; await until(() => b.music.on, P().music.onSec + 3)
        sim.audio = () => 0; const t0 = clock.now()
        await until(() => !b.music.on, P().music.offSec + 3); musicOffSec = (clock.now() - t0) / 1000
      },
      expect: () => musicOffSec <= P().music.offSec + 0.5, timeout: 1 },
    { id: 'musicStart', name: 'Song starts → dances right away', cond: 'Music detected while standing idle (opening dance has a cooldown, default 60 s)', want: 'Right after music starts, behavior dance plays one of C.dances',
      sim: async () => { sim.audio = beat; await until(() => b.music.on, P().music.onSec + 3) },
      expect: (o) => o.acts.has('dance') && C.dances.some(s => o.clips.has(s)), timeout: 2 },
    { id: 'musicMove', name: 'Music playing, idle → music-pool move', cond: 'Music on, idle, a time slot about every 12 s (default 70% drawn from the music pool; simulated: skip the opening dance, set the slot to now)', want: 'Behavior dance or musicFidget',
      sim: async () => {
        sim.audio = beat; await until(() => b.music.on, P().music.onSec + 3)
        b.music.pending = false; musicMoveSeen = false
        for (let i = 0; i < 12 && !musicMoveSeen; i++) {
          b.endAct(); b.music.nextMove = clock.now(); await sleep(0.3)
          musicMoveSeen = ['dance', 'musicFidget'].includes(b.act?.name)
        }
      },
      expect: () => musicMoveSeen, timeout: 1 },
    { id: 'musicTyping', name: 'No dancing while typing, dances after', cond: 'Music starts during the repair loop: typing wins, dances right after Sheila is stowed', want: 'Behavior typing first, dance only after typing ends',
      sim: async (h) => { const p = h.type(4, 6); await sleep(0.5); sim.audio = beat; await p },
      expect: (o) => { const a = [...o.acts]; return a.includes('typing') && a.includes('dance') && a.indexOf('typing') < a.indexOf('dance') }, timeout: P().typing.stowAfter + 6 },
    { id: 'musicBrowser', name: 'Browser audio does not count', cond: 'Only a browser makes sound (simulated: a chrome.exe session injected)', want: 'Never detected as music',
      sim: async () => { input.simSessions = [{ exe: 'chrome.exe', pid: 1, game: false, peak: 0.4 }]; sim.audio = beat; await sleep(P().music.onSec + 2); musicBrowserOn = b.music.on },
      expect: () => !musicBrowserOn, timeout: 1 },
    ...C.musicFidgets.map(([spec, , , name], i) => fidgetRow('mf' + i, 'Music fidget: ' + name, spec)),
  ])

  group('Foreground app / system', [
    { id: 'apexOn', name: 'Apex opens → line', cond: 'Foreground app becomes r5apex.exe', want: 'Line apex_start',
      sim: (h) => h.system({ fg: { exe: 'r5apex.exe', title: 'Apex Legends' } }), expect: (o) => hasLine(o, 'apex_start'), timeout: 1 },
    { id: 'apexOff', name: 'Apex closes → skydive entrance again', cond: 'Apex not in the foreground and not fullscreen', want: 'Line apex_end, skydives from the top of the screen, greets on landing',
      sim: async (h) => { h.system({ fg: { exe: 'r5apex.exe', title: 'Apex Legends' } }); await sleep(0.5); L.lastReply = -1e9; h.system({ fg: { exe: 'explorer.exe', title: '' } }) },
      expect: (o) => hasLine(o, 'apex_end') && o.states.has('air') && o.acts.has('land'), timeout: 6 },
    { id: 'code', name: 'Switch to a code editor → line', cond: 'Foreground is VS Code / Cursor / an IDE / a terminal; at most once per launch, with a chance', want: 'Line code',
      sim: async (h) => { for (let i = 0; i < 8 && !hasLine(obs(), 'code'); i++) { b.saidCode = false; L.lastAuto = -1e9; h.system({ fg: { exe: 'Code.exe', title: 'x' + i } }); await sleep(0.1) } },
      expect: (o) => hasLine(o, 'code'), timeout: 1 },
    { id: 'fgLook', name: 'Window switch → looks over', cond: 'Foreground window changed (with a chance, default 70%)', want: 'Gaze turns to the center of the new window',
      sim: async (h) => { for (let i = 0; i < 8 && !b.attn.click; i++) { h.system({ fg: { exe: 'notepad.exe', title: 'w' + i, rect: rect(100 + i * 20, 120, 600, 400) } }); await sleep(0.2) } },
      expect: () => !!b.attn.click, timeout: 1 },
    { id: 'quiet', name: 'Video / meeting → no unprompted lines', cond: 'Foreground is Zoom / Teams / a video player, or the title contains YouTube / Bilibili etc.', want: 'Lines enter quiet mode (lines.quiet)',
      sim: (h) => h.system({ fg: { exe: 'zoom.exe', title: 'Meeting' } }), expect: () => L.quiet, timeout: 1 },
    { id: 'fsDrag', name: 'Hidden by fullscreen while dragged → treated as release', cond: 'Regression test: the window gets hidden by a fullscreen app mid-drag and the release event is lost', want: 'State held → air, not stuck to the cursor',
      sim: async (h) => { await h.onto(); const p = chest(); h.down(p); await h.glide({ x: p.x, y: p.y - 100 }, 0.3); await sleep(0.3); h.system({ hidden: true }); await sleep(0.4); h.system({ hidden: false }); h.forget() },
      expect: (o) => o.states.has('held') && o.states.has('air') && !b.dragging, timeout: 3 },
  ])

  group('Time / entrance', [
    { id: 'entrance', name: 'Skydive entrance', cond: 'On launch / after Apex closes', want: 'Falls from the top of the screen, heavy landing, greets by time of day',
      play: () => b.entrance(), expect: (o) => o.states.has('air') && o.acts.has('land') && saidAny(o, /^greet_/), timeout: 7 },
    { id: 'hour', name: 'On the hour → glances at the clock', cond: 'Standing when the hour turns (simulated: "last hour" set back by one)', want: 'Gaze turns to the taskbar clock at the bottom right',
      sim: () => { b.lastHour = (new Date().getHours() + 23) % 24 }, expect: () => b.attn.click && b.attn.click.x > world.w - 100, timeout: 1 },
    { id: 'late', name: 'Active late at night → bedtime nag', cond: 'Active for a while late at night (default 1–5 AM, 10 minutes; depends on system time, cannot be simulated; "Play" only shows the line)', want: 'Line late',
      play: () => { L.lastAuto = -1e9; L.say('late', { p: 1 }) }, manual: true },
  ])

  return G
}
