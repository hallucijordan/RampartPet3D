# DESIGN.md — Rampart desktop pet: personality and behavior design

> Concept: a real-time 3D Rampart, about 340 px tall, standing on the taskbar. **Every key you press gets a reaction** (the core idea, inherited from the old prototype);
> the rest of the time she has her own life: chewing gum, fixing Sheila, lounging and blowing bubbles, sleeping, the occasional wisecrack. She never steals focus and disappears when anything goes fullscreen.
>
> Clip ids always use the runtime format `category__action` (e.g. `lobby__rampart_menu_lobby_center_idle`). Frame numbers are 30 fps source frames.
> Data marked "verified" was measured in Blender on `rampart_hp_anims.blend`; items marked "to check" still need a visual check on the base skin.

---

## 1. Personality pillars

| Pillar | How it shows on the pet | Off limits |
|---|---|---|
| **Cocky confidence** | Smug side-eye, raised brow, hands on hips; talks back and taunts when poked; even a compliment comes with a jab first | No real insults, never belittles your work; sulking lasts 10 s at most |
| **Relaxed, lazy** | Low-to-medium energy by default: weight on one leg, hand on hip, slow gum chewing; slow in, slow out, lots of pauses; when bored she lies back on Sheila | No panic, no begging for attention, no cutesy stuff (no hearts, no "~", no meowing) |
| **Gearhead with restless hands** | Small actions are all "tinkering": welding Sheila, test-spinning the barrels, checking the ammo belt. Your typing is her engine: faster keys, faster Sheila | No cute filler actions unrelated to machines |
| **Playful, mischievous** | Plays with the cursor, treats being picked up as skydiving, flips when thrown, dances to music, poses for photos | Never touches your cursor or windows (Desktop Goose-style pranks get old when used daily) |
| **Sheila is family** | Sheila is the second character: barrels spin with your typing speed, she protects Sheila when poked, talks to her when idle | Never fires at you; spin only, no shooting, at most sparks and barrel heat |
| **Your work buddy** | When you type she "works" too: back turned, fixing Sheila, barrels spinning with your typing speed | No talking and no other big actions while you type |

**Voice**: short, punchy, casual; the occasional English `Oi` / `mate`, very rarely a Hindi interjection `Arre` / `Chalo`; no emoji.
Background (only to set the tone, never copy actual game lines): a mechanic from Gaea who grew up in a junkyard and ran her own mod shop, Big Maude (later operating out of Mirage's bar and a tank on World's Edge);
trades insults with Mirage but they are friends; loves pranks; her heirloom is a pipe wrench that spits gum balls (Problem Solver).

---

## 2. Research findings → design rules (only the actionable ones)

| Source | Finding | Our rule |
|---|---|---|
| Bongo Cat (100k+ concurrent on Steam) | The sense of company comes from **instant visible feedback on every input**, plus a little collecting | Visible reaction within 1 frame of each key (§5 K1); typing speed maps to Sheila's spin speed |
| Desktop Mate | Liked: watches the cursor, pick up / drop, sits on windows, lies down when ignored. Disliked: nothing new after an hour, feels like a tech demo; shadows / resource usage | Depth comes from **situational reactions + non-repeating idles**, not more buttons; resource usage far below it (measured ~15% CPU / 50% GPU on a laptop) |
| VPet desktop pet simulator | Different reactions for head pat / body pat / lift; each action has A start / B loop / C end; several state sets by mood | Per-region click detection; every behavior uses the A/B/C structure; mood affects expressions and clip choice |
| Shimeji | Dragging, throwing, gravity and landing make people want to play | Parabola + landing clip picked by landing speed |
| Clippy post-mortems | Hated because it interrupted uninvited, misread intent, and could not be shut up | Rate limits, silence during focus, one-click quiet (§7) |
| Modern "no-punishment" pet design (Mochi etc.) | Reward interaction instead of punishing neglect; hidden progression beats stat bars | No hunger/cleanliness bars; neglect only makes her fall asleep, and she is happy when you return; familiarity quietly unlocks new lines/poses |
| The Last Guardian (Trico) | Hand-keyed animation + procedural correction layered on top; when gazing, head settles first then neck follows; attention targets are prioritized | Base clips + procedural layer; scored attention targets (§4.4) |
| Anki Vector character design | Fast saccades = high energy/excited, slow = contemplative | Saccade and blink speed driven by arousal |
| Eye-head coordination research | Eyes move first; small angles (< 20°) mostly eyes, larger angles involve the head more and more, > 40° nearly simultaneous | Gaze split table (§4.4); **but at 340 px the eyes are only a few pixels, so the head turns more than a real person's** |
| Blink statistics | Resting 15–20/min; drops noticeably when reading/focused; higher in conversation; 100–400 ms each; large saccades often come with a blink | Blink rate varies by state (§4.7) |
| Idle animation practice | A single loop gets spotted in about 90 s; short loops + random fidgets + minimum gaps | Selection algorithm (§4.5) |
| Guido Henkel on idles | Keep breathing subtle; leave the sense of life to hair and clothing | Small breathing amplitude; the spring layer does the heavy lifting |
| Peripheral vision basics | Peripheral vision is very sensitive to motion; big movements grab attention | "Motion budget": only small actions while you type (§7-5) |

---

## 3. Animation vocabulary (basis for clip choice)

### 3.1 Verified key facts
- **Hub pose**: frame 0 of `lobby__rampart_menu_lobby_center_idle`, `…_center_idle_gunrev` and `…_center_idle_weld` is identical (head world position (-0.091, 0.271, 1.666) in all three),
  and all of them end back in the starting pose (mean key bone deviation ≤ 0.1°). → The three can **chain seamlessly**; this is the backbone of the whole idle system.
- `center_idle` (512 frames): f0–f195 is very calm, **f0–f124 works as a breathing loop** (start/end deviation < 4°, a 0.2 s fade is enough); about f195–f365 is a "lean and blow a bubble" fidget; f365–f511 is calm again.
- `…_center_idle_gunrev` (257 frames): about f20–f235 she lifts Sheila and test-spins her; `…_center_idle_weld` (709 frames): about f60–f675 she welds Sheila.
- `lobby__rampart_menu_lobby_select_idle` is almost the same motion as `center_idle` (starting position differs by 2 cm); **does not count as a new variation**.
- `move__rampart_idle_ua` (54 s) is one continuous performance (big bubble, swinging Sheila, stretching) that **never returns to the starting pose and has no still frames**; usable only in segments with crossfades. `melee__rampart_idle_wrench` has the same data.
- `lobby__rampart_menu_lobby_refresh_center_idle` (24.6 s): another hands-on-hips lean (head offset from the hub about 0.38 m sideways, needs a 0.5 s fade); start and end do not match (~30° off); used as "change base pose".
- `lobby__rampart_s10e01_idle`: a 2 s loopable third base pose.
- `emote__rampart_ground_emote_chillaxing_loop`: **start and end do not match** (~23° off); looping needs a 0.5 s crossfade or ping-pong.
- `emote__rampart_ground_emote_yoga_loop`: closes cleanly, loops directly.
- `quest__rampart_quest_{neutral,happy,angry,sad,surprised,fearful}_{l,r}`: 2-frame static **full-body + facial expression** poses; 60+ face bones differ clearly from neutral (lips up to 60°, eyelids and forehead move too).
  → Take the "face bone delta relative to neutral" as an **expression additive layer**; the full-body pose can be a 0.8 s "emotion flash".
- Static gladcard poses such as `gladcard__rampart_gladcard_static_wink` also carry facial expressions (wink has one eye closed → source for the closed-eye pose, mirrored to the other eye for blinking).
- Bones: eyelids `def_[lr]_eyelidUpper/Lower/…`, jaw `def_c_jawA`; the Sheila on her back has spring bones `def_c_turret_springA/B/C` (the carried Sheila can sway too).
- Sheila has **4 barrels** (`def_[lr]_top_barrel`, `def_[lr]_bot_barrel` around `def_c_barrel_base`) → 90° per key, one step.
- The bubble gum prop `rig_rampart_bubblegum` has scale keyframes on its `bubblegumCore` bone → **the bubble can be scaled procedurally** (the sleep bubble relies on this).
- The `heirloom` category is mostly first-person (ptpov) and cannot be used on a full-body character.
- gladcard animations (revup/gum/heirloom/rainingbullets…) are posed for the banner camera with **large root motion** (heirloom jumps from the turret to the front of the frame); remove horizontal root motion before use.

### 3.2 Grouped by use

| Use | Clips | Notes |
|---|---|---|
| Base pose A (hub) | `lobby__rampart_menu_lobby_center_idle` f0–124 loop | Default |
| Base pose B / C | `lobby__rampart_menu_lobby_refresh_center_idle`, `lobby__rampart_s10e01_idle` | Switch every 3–6 minutes |
| Small fidget (returns to hub) | center_idle f195–365 (bubble), segments of `move__rampart_idle_ua` | 4–8 s |
| Medium fidget (returns to hub) | `lobby__rampart_menu_lobby_center_idle_gunrev` (8.6 s), `…_weld` (23.6 s, can be cut to 8–12 s) | Welding torch = work buddy |
| Big performance (emote) | `emote__rampart_ground_emote_{boombox,bollywood_dance,panicdance,taunt,turretspin,cricket,mechbull,smokebomb}`, `emote__goldenhorse_rampart_celebration` | boombox: Sheila on her shoulder as a speaker while dancing; goldenhorse: fist-pump celebration |
| Burst celebration | `gladcard__rampart_gladcard_animated_revup` (4.4 s, root motion removed) | or the gunrev segment |
| Stretch | `emote__rampart_ground_emote_yoga` → `…_yoga_loop` | After a break reminder |
| Sit / lie | `lobby__rampart_menu_select` → `…_select_idle` (sitting on Sheila, to check); `emote__rampart_ground_emote_chillaxing` → `…_chillaxing_loop` (leaning back on Sheila, hands behind head, blowing bubbles) | Watching video / bored / sleeping |
| Get up | `lobby__rampart_menu_lobby_refresh_pose01_intro` (1.5 s, crouch → stand up hands on hips) | Universal transition from lying/landing back to standing |
| Held / airborne | `skydive__rampart_freefall` (18 parts, probably a direction blend; use part 0 first, to check), `skydive__rampart_anticipate` | |
| Air tricks | `emote__rampart_freefall_emote_{backflip,genericflip,surfing,turretride,booster}` | surfing rides an amped wall like a surfboard |
| Landing | `move__medium_land_ua` (light), `melee__rampart_landhigh_wrench` (heavy, one knee down) | Both 1 s |
| Entrance / ready | `gladcard__rampart_gladcard_animated_gum` (jumps into frame → lands → blows a bubble), `lobby__rampart_menu_select_readyup` (6 s) | |
| Take out Sheila | `sheila__rampart_ultimate_draw_mobilehmg` → `…_idle_mobilehmg` → (additive) `…_fire_mobilehmg_01` → `…_ultimate_holster_mobilehmg` | Only for "spinning", never firing |
| Expression / emotion flash | `quest__rampart_quest_*`, `gladcard__rampart_gladcard_static_*` | |
| Photo poses | `gladcard__rampart_gladcard_static_{wink,peace,taunting,lookingup,bigsheila,fireaway,mechanic,sittinggun,gunjump,friend}` | mechanic/friend come with drone and loot box props |
| Not used | `execution__*` (finishers, need a victim and are violent), `heirloom__*` (first person), `aim__*` (aim additives), mythic weapon previews (props missing) | |

---

## 4. Behavior architecture

### 4.1 Layers (composited bottom-up every frame)

```
L0 base clip layer    A/B/C clips picked by the Director, crossfaded (0.2–0.5 s)
L1 reaction layer     short one-shots: emotion flash, flinch, landing, per-key impulses (additive)
L2 procedural layer   gaze (eyes/head/upper body) · blink · breathing · head noise · expression · gum/talk jaw
                      springs: 7-segment ponytail, jacket hem, Sheila on her back (turret_spring) · Sheila barrel speed
L3 presentation       sparks / dust / bubble bits / barrel heat · speech bubble
```
The procedural layer sits on top of the animation result (relative values, clamped). In clips with choreographed head motion (dances, flips) the gaze weight drops to 0.3.

### 4.2 Internal state

| Variable | Range | Rises | Falls | Affects |
|---|---|---|---|---|
| `energy` | 0–1 | Day/night baseline (§5.7); you being active +; music + | −0.1 per 5 idle minutes | Fidget interval, motion amplitude, chance to lie/sit, sleep threshold |
| `arousal` | 0–1 | Typing burst +0.3, poked +0.25, thrown +0.5, music starts +0.2 | Exponential decay τ = 15 s | Breathing rate, blink/saccade speed, playback speed ±8% |
| `mood` | −1–1 | Head pat +0.15 (at most +0.4 per 10 minutes), you return +0.2, music +0.1 | Poke −0.08, throw −0.05, held too long −0.1; returns to 0 with τ = 10 min | Expression bias (smug ↔ annoyed), line pool, whether she sulks |
| `boredom` | 0–1 | +1 per 6 minutes without input | Any input ×0.2 | Idle ladder (§5.4) |
| `affinity` (persisted) | counters | Days together, head pats, times thrown… | Never falls | Unlocks lines, photo poses, greeting variants (never shown as a number) |

### 4.3 Modes and priority

| Priority | Mode | Enter | Can be interrupted by |
|---|---|---|---|
| 6 | Hidden | Fullscreen / presentation mode / hidden manually | Only its exit conditions |
| 5 | Held / Airborne | Press and drag; release with velocity | Not interruptible; back to selection after landing |
| 4 | Direct interaction | Poke, head pat, double-click, hover | 5–6 |
| 3 | Event | You return, startup, Apex, music starts, late-night reminder | 4–6 |
| 2 | Typing | Fixing Sheila, burst (§5.1) | Only 5 (pick up); events and interactions from 3–4 wait until typing ends |
| 1 | Ambient idle/bored/lying/sleeping | Default | Any higher layer |

- Higher-priority interruptions use a quick 0.15–0.25 s fade; lower-priority events queue for at most 3 s and are dropped when stale (no replaying outdated reactions).
- Per-key micro reactions, gaze, blinking, breathing and springs run in every mode except Hidden (press keys while she is held and Sheila still spins).
- Every behavior = A (enter, optional) / B (loop or body) / C (exit, back to hub or get up). An exit **always** lands back on the hub pose or goes through the `refresh_pose01_intro` get-up.

### 4.4 Attention / gaze

**Targets and interest scores** (evaluated every 100 ms):

| Target | Base score | Salience | Habituation |
|---|---|---|---|
| Cursor | 0.6 | + speed (saturates at 1500 px/s); +0.8 at the moment of a click | Decays with τ = 3 s once the cursor stops |
| Viewer (camera) | 0.3 | +0.7 on hover, talking, greeting, after landing, when you stop typing | Decays after > 2.5 s of continuous looking; ≤ 20% of total time |
| Work area (center of the lower third of the foreground window) | 0.35 | +0.4 on key presses (when the cursor is still) | Decays 2 s after keys stop |
| New window / focus change | — | 0.8 at the moment of the switch | Gone within 1.2 s |
| Herself (bubble, Sheila, nails) | 0.2 | Taken over by the clip when a fidget needs it | — |
| Taskbar clock | — | 0.7 for 10 s around the top of the hour | One glance only |
| Random "daydream point" | 0.25 | — | 0.8–2 s each |

- Switch condition: new target score > current × 1.3, and the current one has been held ≥ 0.4–0.8 s (strong stimuli like clicks, pokes, drops switch immediately).
- **Eyes first, head second**: eyes arrive in 40 ms; the head starts 80–150 ms later and follows with a critically damped spring (ω ≈ 9 rad/s).
- Split (at 340 px the eyes are only a few pixels, so the head turns more than a real person's):

| Target angle | Eyes | Head | Upper body |
|---|---|---|---|
| < 12° | 60% | 40% | 0 |
| 12–35° | clamped ±18° | the rest | 0 |
| > 35° | ±18° | the rest, at most yaw ±60° / pitch ±25° | 15% (spine shares) |
- Switches with a target angle > 25° come with a blink 60% of the time.
- While fixating, micro-saccades of ±0.7° every 0.4–1.2 s; 0.15 Hz Perlin noise ±1.5° on the head (never fully still).
- Saccade and head speed × (0.8 + 0.5·arousal).
- Default body facing is 20–30° toward the screen center (at bottom right she faces left), so looking at the work area/cursor does not wring her neck.

### 4.5 Picking idles without repetition

```
score(b) = w_b × E(b, energy) × M(b, mood) × C(b, foreground context) × N(b)
N(b)     = 1 − exp(−seconds since last played / τ_b)   # freshness, τ_b = the behavior's cooldown
candidates = behaviors in the current "bag" that are past their hard cooldown
pick       = weighted random by score
bag        = one shuffle bag per tier; played items are removed; refill when empty, excluding the last 2
```
- Wait until the next fidget ~ Gamma(k=3), mean by tier: active 14 s / bored 25 s / low energy 45 s; no fidget within 4 s after any interaction.
- Micro variation: random loop start point, playback speed 0.95–1.05, fast/slow variants of the same fidget picked by arousal. **No mirroring** (Sheila is asymmetric; mirroring would give it away).
- The base pose changes every 3–6 minutes (three poses A/B/C), so the 90 s pattern never shows.

### 4.6 Transitions
- Between the three hub clips: 0–0.2 s. Other standing clips: 0.3–0.5 s. Stand ↔ lie: only in via `chillaxing`, only out via `refresh_pose01_intro`.
- Ground clips lock horizontal root motion (`jx_c_delta` / hip xy back to the anchor), keeping only vertical; gladcard animations subtract the root offset of their first frame.
- Inertialization may replace crossfades later; crossfades first.

### 4.7 Procedural layer parameters (starting values, tune on real hardware)

| Layer | Parameters |
|---|---|
| Breathing | Resting 14/min; excited 22/min (decays with arousal); sleeping 9/min. Spine 0.8°, shoulders up 2–3 mm, ×1.5 when sleeping |
| Blinking | Log-normal interval: resting mean 3.5 s (≈17/min); watching you type / watching video 7 s; excited or talking 2.5 s; 10% double blinks. Close 70 ms – hold 30 ms – open 120 ms; drowsy 180/150/300 ms, 30% half blinks |
| Expression | quest face delta × intensity × **1.3** (exaggerate at small size); at most 2 mixed at once; in 0.12 s, out 0.6 s; 0.15 happy at rest (smug mouth corners) |
| Gum chewing | `def_c_jawA` opens 3–6°, 1.6 Hz, 4–9 chews then a 0.8–3 s pause; locks to the beat when typing at 2–6 keys/s (one chew per 2 keys); stops while talking, sleeping, or in bubble clips |
| Talking jaw | 8–10 Hz small open/close + noise while the bubble types out, a small nod at punctuation |
| Ponytail | 7-segment spring (`def_c_ponytail01..07`), root → tip ω 14 → 6 rad/s, ζ 0.25 → 0.15, gravity, head/shoulder collision capsules |
| Hem / Sheila on her back | Hem ω 10, ζ 0.35; `def_c_turret_springA-C` ω 12, ζ 0.3 |
| Sheila barrels | +90° per key (70 ms ease-out, 8% overshoot); continuous speed = min(keys/s × 90°, 12 rev/s); friction decay τ 0.8 s after stopping; orange barrel heat when a burst lasts > 15 s, 10 s cooldown |

---

## 5. Behavior tables

### 5.1 Typing (core, reworked in 2.3)

**Typing has only two interactions: normal typing (back turned, fixing Sheila) and the burst.** The older per-key nod / shoulder twitch, per-key spin of the Sheila on her back, burst laugh + sparks, test-spinning Sheila during a sustained burst,
look-at-you + bubble when you stop, reactions to Backspace / Enter / Ctrl+S / undo, and long-focus welding were all removed (welding Sheila remains only as an idle fidget).
Clip blending, props, barrels, sparks and BOOM! live in the typing rig `pet.typing` (`src/typing.js`); the brain (`brain/typing.js`) only decides enter, exit and burst.

**Rhythm tiers** (key timing only, never content; parameters in `params.typing`)

| Tier | Condition | Use |
|---|---|---|
| Steady | ≥ 1.5 keys/s over the last second (held for 1.5 s after you stop) | When standing, reaching this typing speed makes her take out Sheila |
| Burst | ≥ 6 keys/s over the last 2 seconds | Sustained for 5 s while fixing Sheila → burst |

| ID | Behavior | Trigger | Reaction | Clips | Cooldown / parameters |
|---|---|---|---|---|---|
| K1 | `typing` | Standing, typing speed reaches Steady; only idle-type behaviors (fidgets, base pose change, wandering) get interrupted | 0.35 s fade into taking out Sheila (played in reverse for 0.5 s) → 0.5 s fade into fixing Sheila with her back turned, two copies looping in relay; barrels first unfold into four, then spin with typing speed | `C.typeDraw` → `C.typeLoop` | Facing fixed at +18° throughout; gaze weight ≤ 0.35 (back turned, don't twist the neck) |
| K2 | `typing` | Stopped typing for `stowAfter` (default 3 s) while fixing Sheila | 2.5 s after stopping the barrels brake and fold → the current round finishes, 0.5 s fade into stowing Sheila → 0.35 s fade back to standing | `C.typeStow` | No re-draw while exiting; re-evaluated after stowing |
| K3 | `burst` | Burst tier sustained for `revupAfter` (default 5 s) during the fixing loop | Turn and slam (first half at double speed) → jumps onto Sheila and rides her → one more ride → muzzle sparks 0.6 s → BOOM! (1.62 s, she is hidden at 0.1 s) → skydive entrance (same as startup, no greeting) → standing; if you are still typing she takes Sheila out again | `C.burstTurn` → `C.burstRide` → `C.burstRideLoop` → `C.fall` / `C.landHeavy` / `C.getUp` | `revupCool` default 3 minutes; lines T1–T3 with probability 0.5 (unprompted rate limit) |
| K4 | — | Key pressed while she sleeps / lies | Wakes her up (§5.4 S3). **The waking key does not count as typing**; after getting up she waits `wakeGrace` (default 1.5 s) before judging typing, so one or two presses leave her standing idle | — | — |

During typing / burst: poking her only gives a hit flinch + line (no taunt, no warning), double-click takes no photo, the scroll wheel does not spin her, music does not make her dance; **only picking her up interrupts** (the rig's `cancel()` fades back to standing).

### 5.2 Mouse

| ID | Priority | Trigger | Reaction | Clips / procedural layer | Cooldown / cap | Why it feels alive |
|---|---|---|---|---|---|---|
| M1 | **P0** | Cursor moves | Gaze system (§4.4): eyes first, head follows; daydreams once habituated | Procedural layer | — | "She's watching my cursor", but not a dead turret stare |
| M2 | **P0** | Hover over her | 0.3 s eyes on cursor → 0.8 s head turns, smirk → 2 s look at camera, raised brow → still for 5 s, line H1/H2 | Gaze + expression; cursor becomes a grab hand | Line once per 10 minutes | The feeling of being noticed |
| M3 | **P0** | Click on her (< 250 ms, moved < 6 px) | Hit by region: head / body / legs / Sheila. Angular impulse away from the click (head snaps 6°), surprised 0.8 → after 0.4 s angry 0.4 fading slowly, ponytail whips, looks at camera | Procedural flinch (impulse into the spine chain) + expression; poking Sheila: barrels spin hard 2 turns + sparks + she looks at Sheila first, then you, line PS1/PS2 | See M4 | A physical hit reaction looks more real than a canned "got hit" clip |
| M4 | **P0** | Repeated pokes (counter −1 every 6 s) | c=1: flinch, 50% "Oi!"<br>c=2–3: + emotion flash `quest__rampart_quest_angry_l` 0.8 s + line<br>c=4–5: taunt `emote__rampart_ground_emote_taunt` (pokes during it only snap the head)<br>c≥6: "warning": line P5, lifts Sheila and test-spins her at the cursor (gunrev segment, spin only, no firing) → sulk: hands on hips (base pose B), **ignores the cursor for 10 s** → bubble pops, forgives (P6) | Expression layer, emote, gaze blacklist for 10 s | Full escalation at most twice per 10 minutes, after that flinch only; resets after 20 s without pokes | Has a temper and a limit, and ends as a joke rather than a punishment |
| M5 | **P0** | Press and drag (moved > 6 px) | Surprised at the grab; switch to freefall pose; pendulum around the grab point: body tilt = −k × horizontal speed (≤ 35°); ponytail, hem and the Sheila on her back swing widely; after 1.5 s held, expression turns "resigned"; 40% line D1 | `skydive__rampart_freefall` (0.12 s fade in) + pendulum spring | — | Physics + hair = the part you most want to play with |
| M6 | P1 | Held still ≥ 4 s | Entertains herself: a flip in the air + line D2/D3 | `emote__rampart_freefall_emote_genericflip` / `_backflip` | Once per pick-up | She is not a prop; even held up she has attitude |
| M7 | **P0** | Release, speed < 400 px/s | Freefall (g = 3000 px/s²) → landing | Same as below | — | |
| M8 | **P0** | Release, speed ≥ 400 px/s (throw) | Parabola (air drag 0.3/s), body pitches with velocity; bounces off left/right screen edges (restitution 0.4); flights > 0.8 s get a flip or wall surfing 40% of the time | `emote__rampart_freefall_emote_backflip` / `_surfing` | — | |
| M9 | **P0** | Landing | Impact < 900 px/s: light landing `move__medium_land_ua`; ≥ 900: one-knee heavy landing `melee__rampart_landhigh_wrench` + dust ring + spring overshoot; then looks at camera, 50% lines L1–L4; arousal +0.4, mood −0.05 | fx dust | Lines under the global rate limit | Landing weight; she is a good playmate |
| M10 | P1 | Cursor in the head area (top 18% of the silhouette) reverses left/right ≥ 3 times within 1.5 s (no click) | Head pat: eyes closed, squinty smile, head tilts 6° toward the stroke, happy 0.6; after 3 s blows a contented bubble; too long (> 8 s) she shakes her head | Expression + head roll + bubble bone scale | First of the day: H3; afterwards H4/H5 rate-limited | VPet-style head pat; she won't admit she likes it |
| M11 | P1 | Double-click her | Photo: 0.15 s snap to a static gladcard pose + matching expression, white flash, hold 3 s, back to hub; 30% lines F1–F3 | Rotating `gladcard__rampart_gladcard_static_*` (bag) | Once per 10 s | Screenshot moment, §8 |
| M12 | P1 | Click elsewhere (not on her) | 50% chance her eyes flick to the click point (within 900 px); ≥ 4 clicks within 1 s → wide eyes, staring | Gaze | — | Peripheral awareness |
| M13 | P2 | Scroll wheel over her | Turntable: body spins around the vertical axis ±; after 3 full turns she gets dizzy (head circles) + line | Root rotation + procedural head wobble | Dizzy once per 2 minutes | You can spin her like a figurine |
| M14 | P2 | Cursor sweeps within 80 px of her head at > 3000 px/s | Ducks; 1 in 5 swings a cricket bat | Additive crouch; swing segment of `emote__rampart_ground_emote_cricket` | Once per 5 minutes | A surprise joke |

### 5.3 Idle pool (Ambient, picked per §4.5)

| Tier | Behaviors (weight) | Clips |
|---|---|---|
| Active (0–15 s without input) | Mostly breathing in place; now and then glances at the clock / at you | Hub loop |
| Normal (15 s–1 min, since 2.5) | Bubble (3), look at hands / at Sheila (2), change base pose (1), `idle_ua` segment (2), test-spin barrels (1) | center_idle f195–365, segments of `move__rampart_idle_ua`, gunrev |
| Bored (1 min until lying down, since 2.5) | Weld Sheila (3), yoga (1), spin Sheila (1), cricket (1), ride Sheila like a mechanical bull (0.5), taunt the air (0.5), lines I1–I6 (once) | weld, yoga, `…turretspin`, `…cricket`, `…mechbull`, `…taunt` |

≥ 90 s between big emotes, ≥ 20 minutes before the same emote repeats.

### 5.4 Bored → lie down → sleep → wake / return

Idle = how long since the last key press / click / scroll; **moving the mouse does not count** (you should be able to fall asleep with her while jiggling the mouse during a video; gaze still follows the cursor).
Since 2.5, lying down / falling asleep is set by the "Nap after" setting x (`config.sleepAfter`, default 5, options 3 / 5 / 10 / 20, in the settings panel): lie down after x idle minutes, sleep after 2x, halved between 0:00 and 5:00 (`params.idle.lateHalve`).

| ID | Priority | Trigger (idle, see above) | Reaction | Clips / procedural layer | Cooldown | Why it feels alive |
|---|---|---|---|---|---|---|
| S1 | **P0** | x – 2x minutes (default 5–10; halved late at night) | Lies back on Sheila, hands behind head, blows the occasional bubble; slower blinks; eyes closed 30% of the time; line S1 (N3 late at night, once) | `emote__rampart_ground_emote_chillaxing` → `_chillaxing_loop` (0.5 s rewind) | — | Neglect is not punished; she just gets comfortable |
| S2 | **P0** | ≥ 2x minutes (default 10; halved late at night) | Asleep: loop slowed to 0.5×, eyelids fully closed, breathing 9/min, head drops 8°; **the bubble swells and shrinks with her breath** (`bubblegumCore` scale 0.3–0.9); after 10 minutes asleep, 20% chance of sleep talk S2/S3; rendering drops to 15 fps | chillaxing_loop + procedural layer | Sleep talk ≤ 1 per sleep | The anime snot bubble, as bubble gum: the signature shot |
| S3 | **P0** | Key / click / scroll while she sleeps (mouse movement doesn't count; a click on her goes through "poked awake") | **The bubble pops** (pink bits), she jolts awake surprised 0.9, springs up, looks around, looks at you, line W1/W2 (W3 when poked awake) | fx bits → 0.3 s fade into `lobby__rampart_menu_lobby_refresh_pose01_intro` → hub | — | The very first key "wakes her up", closing the loop with the core typing feedback |
| S4 | **P0** | You return (idle 2–15 minutes, not asleep) | Looks at camera, nods, 30% line | Gaze + impulse | — | Small and timely |
| S5 | **P0** | You return (15 minutes–4 hours) | If asleep: S3; otherwise looks at you + return line B1/B2/B4 | | | |
| S6 | P1 | You return (> 4 hours) or first activity of the day (after 04:00) | **Skydive entrance**: freefalls from the top of the screen, heavy landing, dust, gets up and looks at you, time-of-day greeting G1–G4 or B3 | `skydive__rampart_freefall` → `melee__rampart_landhigh_wrench` → `refresh_pose01_intro` | Once a day | "A new day, and here she comes again" |

### 5.5 Music

Detection (rewritten in 2.5, `brain/music.js`): **sources are told apart per program**. Every 0.5 s the shell enumerates the audio sessions on the default output device (one per program) and sends each program's peak (`sessions`) with `onAudio`.
A program counts as music if it is not a browser (mixed with video), not a meeting / voice / video player, and not a game (process path under steamapps\common etc.);
known players (`cloudmusic` `QQMusic` `KuGou` `Spotify` `foobar2000`) get a threshold relaxed by half, and the list is not extended; while the foreground is a video / meeting (quietApp in §5.6) nothing counts.
Timing is in seconds, not frames: 3 s of continuous sound (gaps under 0.4 s don't break it) → music on; **2 s of continuous silence turns it off**. If the session API fails it falls back to the endpoint's total peak. Levels only: nothing is recorded, stored or uploaded.

| ID | Priority | Trigger | Reaction | Clips / procedural layer | Cooldown | Why it feels alive |
|---|---|---|---|---|---|---|
| A1 | P1 | Music playing | Nods on onsets (peak well above the short-term mean) | `proc.bounce` impulse (the beat-following layer was dropped in 2.5) | — | She "hears" it |
| A2 | P1 | Music starts (standing) | **Dances right away** (behavior `dance`): this is the "I heard it" reaction; while typing / fixing Sheila she waits until Sheila is stowed; lying / sleeping does not wake her | `C.dances` (boombox / Bollywood) | Opening dance once per 60 s (brief silence between songs does not retrigger it) | Highlight moment |
| A2b | P1 | Music playing and she is idle | About every 12 s (Gamma sampled, counted from the end of the previous action) a slot: 70% drawn from the music pool (behaviors `dance` / `musicFidget`, never the same one twice in a row), 30% handed to the idle director | `C.dances` + `C.musicFidgets` (look around / touch hair / gesture) | No long cooldown; yields to typing as soon as it starts | Always something to do while music plays |
| A3 | P1 | Head pat or 2 s hover during music | Taken as an invitation, dances right away (A2's pool) | | 3 minutes | You can "request a song" |
| A4 | P2 | Sudden loud sound (peak jumps > 20 dB out of quiet) | Small startle, looks at the screen | Impulse + gaze | 5 minutes | |

### 5.6 Foreground program (exe + title, classified in memory only, never logged or uploaded)

| ID | Priority | Category / detection | Reaction | Clips | Cooldown |
|---|---|---|---|---|---|
| F1 | **P0** | Fullscreen (foreground covers the whole screen, or QUNS 3/4) | 150 ms fade out, stop rendering; fade back in 1.5 s after leaving fullscreen (avoids Alt-Tab flicker), skydive entrance if > 10 minutes | — | — |
| F2 | P1 | Apex starts (`r5apex.exe` / `r5apex_dx12.exe` process appears, before it goes fullscreen) | Gearing up: jumps on Sheila in a ready pose + line A1/A2, then hides with fullscreen | `lobby__rampart_menu_select_readyup` | Each launch |
| F3 | P1 | Apex exits | Skydives back onto the taskbar + line A3/A4 | Same as S6 | Each time |
| F4 | P1 | Code / terminal (`Code.exe`, `Cursor.exe`, `devenv.exe`, `idea64.exe`, `pycharm64.exe`, `rider64.exe`, `sublime_text.exe`, `notepad++.exe`, `WindowsTerminal.exe`…) | Work-buddy mood: welding torch and fixing weights ×3, big emotes ×0.3; line C1 on entry (once a day) | weld, `gladcard__rampart_gladcard_animated_fixing` (root motion removed) | — |
| F5 | P1 | Video (`vlc.exe`, `PotPlayerMini64.exe`, `mpv.exe`; browser title contains YouTube / bilibili / Netflix / iQIYI / Youku / Tencent Video / Twitch / Douyu / Huya, also matched by their Chinese names) | Turns to watch with you: sits on Sheila or lies down; blinks less; **no lines, no big actions**; does not count as music | `lobby__rampart_menu_select` → `_select_idle` (to check) / chillaxing | — |
| F6 | P1 | Meeting / recording (`Zoom.exe`, `Teams.exe`, `ms-teams.exe`, `wemeetapp.exe`, `obs64.exe`) | Automatically quiet: no lines, no big actions | — | — |
| F7 | P2 | Other windowed games (path contains `steamapps\common` etc.) | Watches the screen, gets tense when you click frantically | Gaze + expression | — |

### 5.7 Late night and time

| ID | Priority | Trigger | Reaction | Cooldown |
|---|---|---|---|---|
| T1 | P1 | Still active ≥ 10 minutes between 01:00 and 05:00 | Go-to-bed line N1/N2 (once a night); energy baseline 0.3; sleep threshold halved; procedural yawn (jaw wide open 1.5 s + eyes closed + head back) | Yawn once per 15 minutes |
| T2 | P1 | Top of the hour | Glances at the taskbar clock (no line) | — |
| T3 | P1 | 2 hours of continuous activity | Line K1 (water); if you then go idle → yoga | Once per 2 hours |
| T4 | P2 | Day 7 / 30 / 100 together | Anniversary line Y1–Y3 + automatically strikes a newly unlocked photo pose | One-off |

Day/night energy baseline: 06–09 rises to 0.6, 09–12 0.9, 12–14 0.7 (post-lunch slump, higher yawn chance), 14–18 0.85, 18–23 0.75, 23–01 0.5, 01–05 0.3.

### 5.8 Startup / exit

| ID | Priority | Trigger | Reaction |
|---|---|---|---|
| E1 | **P0** | Startup | Entrance: `gladcard__rampart_gladcard_animated_gum` (jumps in → lands → blows a bubble, root motion removed) or the skydive entrance; looks at you, time-of-day greeting (G6 for late-night startup); first run additionally G5 (only once) |
| E2 | P2 | Tray "Hide for 1 hour" / exit | Smoke bomb exit `emote__rampart_ground_emote_smokebomb` (smoke segment) before hiding |
| E3 | P2 | Thrown off the top of the screen | Falls back down from the top, off screen for ≤ 1 s |


### 5.9 XP / rank

Ranks follow Apex: Rookie / Bronze / Silver / Gold / Platinum / Diamond, each IV → I, then Master, then Apex Predator. Numbers live in `params.xp` (editable on the developer panel's Parameters page); the UI `src/ui/progress.js` computes from them.

| Source | XP | Anti-farming |
|---|---|---|
| Company (you are using the computer: a key / click / scroll within 2 minutes) | 2 per minute | Natural cap (at most 24 h a day) |
| First meeting of the day | 60 | Once a day |
| Typing | 1 per 25 keys | At most 300 keys counted per minute (held keys are already filtered by the input layer, so auto-clickers can't farm it) |
| Each BOOM! | 30 | The burst itself has a 3-minute cooldown |
| Poke / head pat | 3 each | At most 20 counted per hour |

Leveling: level n → n+1 needs `500 + 40·n`; every 3 levels is a division, 12 levels after Diamond I is Master, beyond that Apex Predator.
**XP only goes up** (§7-9, no punishment for neglect: rank never drops however long you are away).

Pace estimate (6 hours of computer use a day, 15k keys, a few BOOM!s and pokes, about 1600 XP / day):
Rookie IV → III on the first day; about 1 week to Bronze, 2.5 weeks Silver, 1 month Gold, 7 weeks Platinum, 2.3 months Diamond, 3 months Master, 4 months Apex Predator.
Typing volume varies by person; tune after watching the HUD stats for a while.

---

## 6. Speech bubble lines (original writing, 63 lines)

Rules: one shuffle bag per category; no repeats among the last 30 lines globally, and the same line not within 3 hours; short lines, at most 2 lines on screen; types out at 35 characters/s; stays 1.6 s + 0.12 s per character; 0.25 s fade out; jaw moves while text types out, gum chewing pauses.

**Greetings (startup / new day)**
- G1 morning: Morning. Gum first, then work.
- G2 noon: Had lunch? Can't fight on an empty tank.
- G3 afternoon: Afternoon. What are we taking apart today?
- G4 evening: Only booting up now? Night owl. I like it.
- G5 first run: Mod shop, desktop branch: open for business! Need me? Click the tray icon.
- G6 late-night startup: Booting up at this hour... another late one? Fine, I'll keep you company.

**You're back**
- B1: Oi, you're back. Sheila was just asking about you.
- B2: Took you long enough. My gum lost its flavor.
- B3 (new day): New day, new ammo belt. Chalo!
- B4: I didn't touch anything while you were gone. Probably.

**Typing**
- T1 burst: Fast hands! You've got Sheila spinning!
- T2 burst: That RPM... got a grudge against your keyboard?
- T3 burst: Faster! Let's see those barrels smoke!
(T4–T8, the stop-typing / mass-delete / long-focus lines, were removed with the 2.3 typing rework)

**Hover / head pat**
- H1: What are you looking at? Never seen a mechanic?
- H2: Quit waving that cursor around, I'm getting dizzy.
- H3 first head pat of the day: ...Just this once. Don't make it a habit.
- H4 keeps patting: Fine. A bit longer, then.
- H5 pats too long: Okay, okay, enough! You're wrecking my hair!

**Poke**
- P1: Oi!
- P2: Poking me? Bold.
- P3: Go on, poke me again. I dare you.
- P4: Arre, itchy fingers? There's a cure for that.
- P5 (lifts Sheila as a warning): Right. You asked for it.
- P6 (calms down): ...Fine, you're forgiven. Just this once.
- PS1 poke Sheila: Hands off Sheila, she's shy with strangers.
- PS2 poke Sheila: Hands off, I just calibrated her!

**Pick up / throw / land**
- D1 picked up: Hey hey hey! Put me down!
- D2 held long: Nice altitude. The view's so-so.
- D3 held long: I'm a mechanic, not a parcel.
- L1 landing: Perfect ten landing.
- L2 heavy landing: Knees still work. Lucky you.
- L3 landing: That's it? Go higher, I'll still stick it.
- L4 thrown for the third time today: Next time, get me a parachute.

**Idle / bored**
- I1: Bored... got anything I can take apart?
- I2: If Mirage were here, I could at least prank him.
- I3: Your desktop icons are as messy as my workbench.
- I4: Sheila, you look gorgeous today.
- I5: Three pieces of gum left. Gotta ration them.
- I6: A gun I've modded never jams.

**Lie down / sleep / wake**
- S1 lies down: Taking a break. Need something, call me. Otherwise, don't.
- S2 sleep talk: ...one more barrel...
- S3 sleep talk: ...Mirage... my wrench... give it back...
- W1 jolts awake: I wasn't sleeping! I was... listening to the floor.
- W2 jolts awake: Who? Who touched my wrench?
- W3 poked awake: ...This better be important.

**Music**
- M1: This one's good. Turn it up?
- M2 before dancing: A good song needs good moves. Watch this.
- M3: Now that's a beat. Even Sheila wants to spin.

**Programs**
- A1 Apex starts: Off to the fight? Grab my share of the kills too.
- A2 Apex starts: Set your cover up right. Don't embarrass me.
- A3 Apex exits: Done? Did you win? ...Got it, I won't ask.
- A4 Apex exits: Good to have you back. Next round I'll mod you a gun.
- C1 code editor opens: You write your code, I'll fix my guns.

**Late night / time**
- N1: Do you know what time it is? Bed!
- N2: Anything written at midnight gets redone in the morning. Trust me.
- N3 (she falls asleep first): I'm grabbing some shut-eye. You wrap up soon too.
- K1: Top of the hour. Drink some water, mate.

**Photo**
- F1: Make it a good one, this jumpsuit is my trademark.
- F2: This angle? Perfect.
- F3: Screenshot all you want, just give Sheila some good lighting too.

**Anniversaries (P2, not implemented yet)**
- Y1 day 7: One week. You put up with me pretty well.
- Y2 day 30: One month! Five percent off all mods for you.
- Y3 day 100: A hundred days. Fine, you're officially a regular.

---

## 7. Anti-annoyance rules

1. **Never steal focus**: the window never activates (no-activate, tool window, not in Alt-Tab/taskbar), never calls SetForegroundWindow; menus only appear when you click the tray icon (right-clicking the character does nothing: accidental popups are too disruptive).
2. **Never touch your stuff**: never moves the cursor or other windows, no system notifications; **silent** by default.
3. **Click-through**: only her rendered silhouette (alpha > 0.1, grown by 2 px) is clickable; speech bubble, sparks and dust are all click-through.
4. **Hide on fullscreen**: fullscreen / exclusive / presentation mode fades her out and stops rendering within ≤ 1 s; she comes back only 1.5 s after leaving it.
5. **Motion budget**: while you type she only fixes Sheila (the burst is something you trigger yourself); within 5 s of the last key press the idle director picks only small fidgets like bubbles; big emotes only appear when you trigger them; she never walks around the screen.
6. **Line rate limits**: unprompted lines ≥ 90 s apart, ≤ 10 per hour; replies to direct interaction ≥ 8 s apart; watching video / in a meeting → zero unprompted lines; only greetings in the first 2 minutes after startup.
7. **Big action cooldowns**: big emotes ≥ 90 s apart, the same one ≥ 20 minutes apart, ≤ 8 per hour.
8. **Escalation is capped**: the poke escalation runs fully at most twice per 10 minutes, then flinch only; sulking ≤ 10 s, always ending in forgiveness.
9. **No punishment for neglect**: no hunger/dirt/sickness; however long you are away, she is only happy when you return.
10. **One-click quiet**: the tray has "Quiet for 1 hour / until tomorrow", "Hide for 1 hour", "Bubbles: on / only when I interact / off", "Size", "Exit"; a global hotkey toggles visibility (default Ctrl+Alt+R).
11. **Get out of the way**: when you press the mouse elsewhere and drag something (a window, a selection box) across her, she turns 35% transparent and fully click-through, restored on release; her position can be dragged and is remembered.
12. **Performance**: idle < 2% CPU, < 5% GPU; 15 fps asleep, 0 fps hidden; 60 fps during interaction.
13. **Privacy**: uses only key timing and key category (space/enter/backspace/other), never reads characters; window titles are classified in memory only, never logged or uploaded.
14. **First-run hint only once**: "Need me? Click the tray icon" appears once, ever.

---

## 8. Wow moments to build first (in order)

1. **Typing = fixing Sheila with her back turned**: as soon as you type she pulls out tripod Sheila and works on her, barrels unfolding and spinning with your typing speed; when your typing speed spikes she rides Sheila for a lap, and with a BOOM! drops back from the sky. (K1–K3)
2. **She's watching me**: eyes move first, head follows, she daydreams; put the cursor on her and she looks at the cursor, then at you, and raises a brow. (M1, M2 + blinking and breathing)
3. **Pick her up, throw her**: held, she is in a skydiving pose, ponytail and the Sheila on her back swinging like a pendulum; thrown, she flips / wall-surfs, lands heavy on one knee with dust, then turns around and roasts you. (M5–M9)
4. **Sleep bubble**: asleep on Sheila, the bubble gum swells and shrinks with her breath; your first key press pops it and she jolts up: "I wasn't sleeping!" (S1–S3)
5. **Photo**: double-click her and she instantly strikes a gladcard pose + wink + white flash, holding 3 seconds for your screenshot. (M11; P2 adds one-click export of a transparent PNG banner)
6. **Daily skydive**: at boot or on a new day she drops from the top of the screen onto the taskbar. (E1, S6)
7. **Music**: nodding on the beat → Sheila on her shoulder as a boombox, dancing. (A1–A3)
8. **Apex tie-in**: a ready pose before the game, and after the match she skydives back and asks if you won. (F2, F3)
9. **Late night**: yawns, falls asleep early, nags you only once a night. (T1)

---

## 9. Open questions from the original design pass

1. **Two sources of Sheila**: the `_acc_sheila` on the base model's back (driven by `def_c_turret`) and the `rig_rampart_turret_lobby` prop paired with lobby/emote clips must not show at the same time; toggle visibility from `prop_pairs.json` (the old `prop_pairs.py` has "hide the Sheila on her back" logic for reference).
2. 90° per key needs the barrel spin axis confirmed (which local axis of `def_c_barrel_base`).
3. Expression layer: take face bone deltas from `quest__*` (lips `def_*lip*`, eyelids `def_*eyelid*`, forehead `def_*forehead*`, cheeks, `def_c_jawA`); take the closed-eye pose for blinking from the closed side of `gladcard_static_wink`.
4. Whether the 18 parts of `skydive__rampart_freefall` are a direction blend; use only part 0 for now.
5. Whether `lobby__rampart_menu_select_idle` really is "sitting on Sheila" (the thumbnail suggests so); confirm on the base skin.
6. How gladcard animations look once root motion is removed (revup, gum entrance).
7. What drives Sheila while dancing (in boombox Sheila goes onto her shoulder in the prop-less reel, possibly driven by the character's own bones).
8. Being thrown / skydiving requires her to leave the taskbar anchor: either move the window or temporarily use a fullscreen click-through layer.

---

## References

- Rampart background: [Apex Legends Wiki (wiki.gg)](https://apexlegends.wiki.gg/wiki/Rampart_(character)), [Big Maude](https://apexlegends.wiki.gg/wiki/Rampart's_Big_Maude), [Problem Solver heirloom](https://www.dexerto.com/apex-legends/rampart-heirloom-apex-legends-1567319/), [voice actor Anjali Bhimani](https://win.gg/news/who-is-rampart-in-apex-legends-and-who-voices-the-character/)
- Desktop pets: [Why Bongo Cat took off](https://www.xda-developers.com/bongo-cat-taking-over-steam/), [Desktop Mate review (GIGAZINE)](https://gigazine.net/gsc_news/en/20250108-desktop-mate/), [Desktop Mate "too basic" discussion](https://steamcommunity.com/app/3301060/discussions/1/594011786520297947/), [VPet source and animation structure](https://github.com/LorisYounger/VPet), [Shimeji behavior](https://github.com/spyderweb47/Desktop-Virtual-buddy), [Desktop Goose](https://openpets.dev/alternatives/desktop-goose), [Mochi: reward, don't punish](https://dev.to/mikachu/designing-a-desktop-pet-native-to-linux-315m), [No-punishment pet design](https://www.marygeorgescu.com/blog/virtual-pets)
- Clippy: [The New Stack](https://thenewstack.io/humanity-vs-clippy-lessons-from-microsofts-failed-virtual-assistant/), [Mental Floss](https://www.mentalfloss.com/article/504767/tragic-life-clippy-worlds-most-hated-virtual-assistant)
- Animation and attention: [The Last Guardian procedural animation (Game Anim)](https://www.gameanim.com/2018/01/24/last-guardian-procedural-animation/), [Anki Vector character design](https://randym32.github.io/Anki.Vector.Documentation/guides/Vector%20character%20design%20guide.html), [Eye-head coordination (J Neurophysiol)](https://journals.physiology.org/doi/full/10.1152/jn.1997.77.5.2328), [Blink rate drops while reading (IOVS)](https://iovs.arvojournals.org/article.aspx?articleid=2785357), [Blink duration](https://www.reviewofophthalmology.com/article/breaking-down-the-blink), [Idle animation design guide](https://mocaponline.com/blogs/mocap-news/idle-animation-game-dev-guide), [Programming natural idle animations](https://dev.to/arkfuldodger/programming-natural-idle-character-animations-4l0g), [Guido Henkel on idles](https://guidohenkel.com/2014/10/isnt-it-time-we-rethink-idle-animations/)
