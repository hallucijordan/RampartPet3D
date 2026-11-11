# Changelog

The version number lives in `app/package.json` and shows in the tray tooltip and the developer build's window title. Release: `npm --prefix app run release` builds `app/release/win-unpacked` and copies it to the install folder (see `app/tools/install_release.mjs`).

## Unreleased

(Changes go here first and get a version number on release.)

## 2.5.1

Selectable look (settings panel, Display → Look): Original (default, same art style with rendering bugs fixed: crushed shadows, skin subsurface not applied, hair highlights too strong, outline color) / Apex Sticker. Self-test 61/61 on all four skins.

- Settings panel: the Display group gets a "Look" row (Original / Apex Sticker): writes the config key `look` (`fix` | `sticker`) and reloads the page; in dev mode the URL `?style=` is used instead. Panel content area 268 → 294, so the skin list shows exactly 5 tiles
- Selectable look: `config.look` = `fix` (original look + rendering fixes, default) / `sticker` (Apex sticker).
  Code in `src/looks/`; `stage.js` picks by URL `?style=` > `config.look` > default `fix` (`?style=none` = 2.4.0 unchanged), and draws nothing until decided; the release build bundles only these two (about 11 KB + 13 KB)
  - Rendering fixes (in both looks): compositing contrast / saturation moved to display space (it ran in linear space and crushed shadows to pure black: 41% of base skin pixels had a channel = 0);
    skin subsurface actually applies now (the replacement in `materials.js` never matched, so the developer panel's subsurface / wrap sliders did nothing); the cornea only adds specular (it used to be 15% black glass that darkened the eyes);
    hair cav now multiplies specular (it was baked into color, making hair highlights about 3× the game's); outline color in sRGB; contact shadow only under the feet
  - Apex sticker: die-cut border + soft stepped shading + sticker color grading; eyes stay the same as Original (painted eyeliner and catchlights looked more uncanny); the whole image moves up 6 px (sticker border sits on the ground line);
    sparks / dust drawn separately, without the sticker border; skips the unused contact shadow pass. GPU 0.30 ms per frame (0.29 unchanged), VRAM +4 MB normally, +12 MB with particles
  - Packaging: `tools/prune_dist.mjs` keeps the hair cav textures (about 0.6 MB for all four)
  - Self-test (release build): Original and Sticker each on base skin + Bear skin, 56/56 with 0 errors in all four runs

## 2.5.0

Music overhaul: sound sources are told apart per program (browser / meeting / video player / game audio doesn't count), she dances as soon as music starts, while music plays and she is idle there is a music action about every 12 s (music pool: boombox, Bollywood, look around, touch hair, gesture), and it stops within 2 s of pausing; the panic dance moves to the bored pool. Shorter idle tiers (a little idle 15 s–1 min, bored 1 min–x), and the settings panel gets "Nap after" x (lie down at x, sleep at 2x, default 5 minutes). Fixed the hitch the first time she lies down (generic warm-up queue). Self-test 61/61 on all four skins.

- Warm-up generalized into a queue (`character.js`), fixing the hitch the first time she lies down: props (lounge Sheila, bubble gum, wrench…) and clips are queued as soon as they load,
  and warmed one by one when idle: prop shaders (compiled against the HDR target) / textures / one offscreen draw each, clips get their bone bindings; starts 4 s after the typing rig's init, anything loaded later is queued as it arrives, so new props need no extra code.
  Measured (recording page, base skin): without warm-up the first lie-down took 114.7 ms (1 shader + 15 textures), the second 4 ms; now first lie-down 7.7 ms, falling asleep 5.9, getting up 7.8, entering typing 6.6, burst 6.1 ms;
  longest frame during warm-up (3.8–8.6 s after startup) 9.2 ms. Falling asleep / getting up never hitched (both < 10 ms both times), so the transitions were not too abrupt
- Settings panel: the System group of the Settings page gets "Nap after": 3 / 5 / 10 / 20 minutes, default 5, writes the config key `sleepAfter` (minutes; lie down after that much idle time, sleep after twice that). Panel content area 240 → 268, so part of a 5th skin tile peeks out (hinting that it scrolls)
- Developer panel: after running the music simulation tests alone, the volume reading returns to zero and the music state is reset through the music module's reset (before, "listening" lingered a few seconds, and forever in the browser)
- Music pool / bored pool swap: `C.dances` keeps only boombox and Bollywood; new slot `C.musicFidgets` = look left/right, touch hair, gesture (moved out of the idle fidgets); the panic dance moves to the bored pool
- Music logic rewrite + idle tiers:
  - **Per-program sound sources**: `win32.js` enumerates the audio sessions of the default output device (IAudioSessionManager2, every 0.5 s); `main.js` adds `sessions:[{exe,pid,game,peak}]` to `pet:audio` (falls back to `null` after 5 errors); API.md updated.
    Browser, meeting / voice, video player and game audio don't count; known players get a relaxed threshold; nothing counts while a video / meeting is in the foreground
  - On/off in seconds: 3 s of continuous sound turns it on, **2 s of continuous silence turns it off** (the per-frame 70% / 20% hysteresis is gone)
  - **Dances right away** when music starts (typing first: dances after Sheila is stowed; doesn't wake her when lying / asleep); while music plays and she is idle, a slot about every 12 s, 70% drawn from the music pool (`C.dances` + `C.musicFidgets`); the 10-minute cooldown and the "no key for 8 s" rule are gone; onset nods stay. New behavior name `musicFidget`, dancing is still `dance` (both idle priority, typing interrupts them)
  - Parameters: music drops `onRatio` `offRatio` `danceAfter` `danceCool` `danceNoKey`, adds `sessions` `playerLoud` `onSec` `offSec` `startCool` `danceGap` `danceP`; idle drops `lieMin` `sleepMin`, `tier2` 120 → 60 s
  - **Idle tiers**: a little idle 15 s–1 min, bored 1 min–x, lie down at x, sleep at 2x; x = new config key `config.sleepAfter` (minutes, default 5, added to `main.js` DEFAULTS)
  - Tests: the music group becomes recognized / off within 2 s of pause / dances on start / music-pool action while idle / no dance while typing, dances after stopping / browser doesn't count, plus 3 rows for loading the music fidgets; the real-sensor checks show who is making sound (classified per program), adding "pause → off within 2 s" and "music in the browser doesn't count"
  - `tools/selftest.mjs`: exits with failure when the developer window disconnects mid-run (it used to hang and then exit 0)

## 2.4.0

Apex-style in-game UI: HUD at her feet, rank XP bar above her head, rank-up animation, settings panel (skin preview / size / settings), English and Chinese; XP / rank rules; right-clicking the character no longer does anything; fixed the hitch the first time typing starts after launch. Self-test passes on the base skin.

- Bored pool gets two clips: "rev up tripod Sheila" (banner pose revup) and "fist-pump cheer" (celebration 0.5–3.9); the typing rework no longer uses them, so they were kept in the bored pool instead of deleted
- Speech bubble not enabled yet: hidden by default, the tray's "Mute bubbles" is removed; the line logic still runs (`SHOW` in bubble.js), and the developer panel's "Lines" row can temporarily tick "Show bubble"
- Developer panel z-order raised above the BOOM! comic layer (997); the bubble is explicitly placed below it
- Apex-style in-game UI (new folder `src/ui/`, entry `mountUI`):
  - HUD at her feet (modeled on the in-match top-right HUD: blunt parallelograms, white dot background, 1.5 px outline; narrow thin digits, glyph height about 0.4 of the base): time together today (no label) + menu button / BOOM! count · head pat and poke count / typing count, all for today; blocks grow as digits are added (180 ms), shows k from 100k
    The ground is raised by a HUD strip (46 px + front foot perspective drop 0.105 m × ppm + 3 px, so the soles don't cover the HUD; when the HUD is turned off it waits for the fade before dropping back to the taskbar); while held / airborne the HUD stays on the ground dimmed to 80% (no landing guide line), asleep it dims to 45%
  - Rank XP bar above her head (no frame, fading at both ends; a stable height each for standing / walking / lying instead of tracking the head bone every frame); rank-up animation: full version 3.6 s for a major rank, short version 1.5 s for a division; queued while she is airborne / in BOOM! / asleep / the panel is open / the window is hidden
  - Settings panel (v3 style; Skins / Size / Settings pages): opened only from the HUD's menu button; click outside / Esc / ✕ closes it. **Right-clicking the character no longer does anything** (it used to pop up the tray menu, which was too easy to trigger by accident)
  - Skins page: the info card uses a preview image instead of text (real model render, `assets/ui/skins/`, not in git); tile size unchanged, 4 per screen, with placeholder tiles 5–7 (locked); the scroll wheel scrolls smoothly one row per notch, with a square game-style scrollbar on the right
  - English / Chinese switch instantly, the tray menu (`electron/menu.js`) follows `config.lang`; new config keys `lang` `hud` `xpbar`, stats / XP stored in `uiStats` / `uiProgress` (written at most every 15 s). XP rules read `params.xp` (editable on the Parameters page), with the same defaults as fallback; `brain.pinned` is set while the panel is open, and the poke count prefers `brain.pokeCount`
  - `main.js`: mounts the UI, raises the ground (`setFloor` / `followFloor`), merges UI regions into click detection, calls `ui.update` every frame; recording mode does not mount the UI by default (`?ui=1` forces it on, `?ui=0` off); `window.__pet` gains `input` / `ui`; the smoke when the tripod is stowed is now positioned from the base bone (it used Box3 over every vertex, costing about 16 ms that frame)
  - Developer panel gets a "UI" row: open the three panel pages, demo a rank-up for any rank (full / short), +100 XP, +1 BOOM, reset today's stats, switch language, toggle HUD / XP bar; deterministic screenshot entry point `__pet.ui.demo({...})`
- Bored pool cooldowns are looked up by clip key: trimmed clips (like "fist-pump cheer") had no cooldown found before and could be picked back to back. Self-test 55/55 on all four skins
- XP / rank rules: new `xp` parameter group with 11 entries (company 2 per minute, first meeting of the day 60, 1 per 25 keys with at most 300 keys counted per minute, BOOM! 30, poke / head pat 3 with at most 20 per hour; level n → n+1 needs 500 + 40·n; a division every 3 levels, Master after 12 levels); XP only goes up, DESIGN §5.9.
  Also: `brain.pokeCount` (total pokes, only increases), `brain.pinned` (the UI wants her to stay put: no wandering / lying down / napping); in dev mode, key presses inside the UI don't count as typing
- Right-clicking the character does nothing: the test table drops "right-click → menu" and the matching real-sensor check; the first-run line now points to the tray icon
- Fixed the hitch the first time typing starts after launch (measured 109 / 143 ms): after the typing rig starts, it warms up while idle: clip preparation / alignment, shaders for props like the tripod and wrench
  (compiled against the character's HDR target so the variants match), textures uploaded one by one, dust sprites, mixer bone bindings, and one offscreen draw for both the main render and the contact shadow; props never appear on screen.
  The dust when the tripod appears is positioned from the base bone (Box3.setFromObject walked every vertex of the skinned mesh, 16 ms each time). Longest frame on first typing 170 → 7.8 ms, burst 25 → 4 ms
- The Bear skin's ponytail (the tuft of hair on the hood) also uses the game's jiggle bones: exported the Bear model `rampart_lgnd_v24_cosmictechno_w` from RSX and parsed its jiggle bones.
  Ponytail bones 03–06 have exactly the same parameters and bones as the base skin, so `procedural.js` now looks up a per-skin table `JIGGLE_SKINS` (base skin, Bear skin).
  Ponytail tip movement relative to the head per frame: still 1.6 mm, typing 1.5 mm, music nod 1.4 mm, no flipping during flips / falls. Heritage's ribbons and Rebecca's twin tails still use the spring chain

## 2.3.0

Typing rework: typing has only two interactions: **normal typing** (take out Sheila → fix Sheila with her back turned, barrels unfold then spin with typing speed → stow Sheila when you stop) and the **burst** (turn and slam → jump onto Sheila and ride her → muzzle sparks → BOOM! comic transition → skydive entrance). Self-test 53/53 on all four skins.

- Clip layer: slots support `rot` (an angle around the vertical axis written into the root bone and prop tracks for the whole clip) and `reverse` (play backwards);
  when horizontal root motion is cleared the prop tracks subtract the same offset (the "ready up" tripod used to be placed 2 m away with her sitting in mid-air; now she sits on the seat; 54 other clips with props, like walking/running with the wrench and finishers, are fixed too);
  export drops bad last frames that jump to another pose (42 clips, including a 69 cm jump in one frame of "get up", and 8 clips misdetected as loops because start and end matched), metadata `trimmed_last`.
  New typing rig `src/typing.js`
- `typing.js` becomes a real compositor: two copies of the fixing motion in relay (1 s per round, 0.3 s seam, entering at frame 24),
  taking out Sheila plays in reverse and keeps reversing during the fade, stowing continues from the current round; the tripod has its own skeleton, its position interpolated by clip weight, dust when it appears; the Sheila on her back is pinned to the standing base pose;
  the burst waits for the current round to finish, then turn and slam (first half at double speed) → readyup, aligned to the tripod base first, then the ride (base locked during the fade) → one more ride → muzzle sparks → BOOM! (`src/comic.js`).
  Tripod barrels `layers.js TurretSpin` (`proc.turret`): unfold into four first (45° twist on the diagonal), then spin with typing speed; brake, align and fold when you stop / when spinning is not allowed.
  Accelerations at 60 fps match the prototype's final test (tripod / barrels when stowing 8.9 / 15.3, prototype 8.9 / 15.4), the tripod base never moves during the burst; barrels 3.87 rev/s (prototype 3.9)
- The heirloom wrench is now in her hand while fixing Sheila / turning and slamming: the wrench prop animation having "only 1 frame" is correct (the wrench model carries a copy of the character skeleton, and the game follows the character's `ja_c_propGun` through a bone merge),
  so it is no longer discarded as a broken prop, and the two heirloom clips were re-exported. At runtime it is attached to the right wrist, with the relative pose computed from the track at load time (in the heirloom clips `ja_c_propGun` deviates from the right wrist by only 1.1 mm / 0.5° over the whole clip),
  so it doesn't fall to the ground when fading to another clip; the typing rig shows it past the midpoint of those two clips. The build grows by the 9.9 MB wrench model (2K textures, can be shrunk later)
- New typing slots: `typeDraw / typeLoop / typeStow` (take out / fixing loop / stow Sheila), `burstTurn / burstRide / burstRideLoop` (burst).
  Slot values gain two fields, `rot` (angle written into the tracks) and `reverse` (play backwards)
- Typing brain: typing is now only "take out Sheila → fix her with her back turned → stow when you stop" (behavior `typing`) and "burst → ride Sheila → BOOM! → skydive entrance" (behavior `burst`),
  driving the typing rig `pet.typing`; removed the per-key nod / per-key spin of the Sheila on her back, burst laugh + sparks, test spin, look-at-you + bubble when you stop, Backspace / Enter / save / undo reactions, long-focus welding and focus muting.
  `dropIn()` (the skydive animation, the only part used after a burst) split out of `entrance()`. When a key wakes her, that key doesn't count as typing, and she waits a moment after getting up (`wakeGrace`) before judging typing.
  Poke / double-click / scroll / dancing don't interrupt typing, only picking her up does; also fixed "rapid pokes during a fidget never trigger the taunt".
  Parameters: typing group drops 10 entries (backspace / undo / enter / done-typing lines / long focus / weld exit), adds `stowAfter` (how long after you stop before stowing Sheila, 3 s) and `wakeGrace` (1.5 s);
  `revupAfter` / `revupCool` now serve as the burst trigger / cooldown; 80 entries in total. Removed the stop-typing / backspace / save / undo / long-focus line categories. The keyboard test group becomes 5 rows + 2 wake rows

## 2.2.1

The cricket bat (bored pool) now sits in her hand; "favorite" removed from the bored pool.

- Cricket (bored pool) bat fixed: following the game's animation events, the bat spawns at character frame 25 and is destroyed at frame 230, played at original speed (the guessed 1.3155× stretch is gone).
  `prop_pairs.json` supports `start_frame` / `end_frame`, export writes `prop_detail[].show_s`, and the runtime hides the prop outside that range. Median bat-to-wrist distance 35 → 11.6 cm
- Removed "favorite" (myfavorite) from the bored pool: her right hand should hold a rifle spawned by an animation event; without exported weapons it is an empty fist, so it was dropped

## 2.2.0

First batch of animation polish: the base skin's ponytail moves like in the game, the bubble gum no longer hangs at her mouth all the time, the panic dance's tripod, and the animation library rebuilt on the base skin's skeleton. Self-test 57/57 on all four skins.

- The gum at her mouth hides after it hasn't moved for a while: before, it hung at her mouth even when not blowing, swaying with every motion. Decided by the world scale of the bubble core bone
  (checked frame by frame across the 12 clips with bubble gum: in the mouth / small lump ≤ 0.57, blown ≥ 0.93): shows immediately when the scale changes by more than 5% (kept for the whole blow-up-to-pop), hides only
  below 0.75 and still for 0.8 s or longer; on clip changes it starts hidden until it first moves. The sleep breathing bubble is unaffected
- Ponytail jiggle bones no longer flip and twist when flung behind her (flips, falls): angle-limit clipping always puts the tail end in front of the bone
- Base skin ponytail now uses the game's jiggle bones (port of the Source engine jigglebone, parameters from the base skin model's QC): only 03–06 are physical bones,
  03 and 04 rigid (gravity only, angle limits ±0.2 / ±0.1–0.3 rad), 05 and 06 flexible (stiffness 5, damping 2, limits ±0.2–0.3 / ±0.5–0.6 rad), 01, 02 and 07 follow the animation;
  velocity is zeroed when hitting a limit. The old fully free 7-segment spring behaved like a soft whip and the upper half lashed back and forth on nods; now the whole tail follows the head with small tip drift (tip movement relative to the head per frame: still 8.9 → 1.7 mm, typing 17.9 → 2.6 mm).
  Other skins' ponytail / ribbon parameters weren't exported, so they keep the spring chain
- Animation library rebuilt on the base skin's skeleton (`rampart_base_anims.blend`), all 687 clips re-exported: the base skin's ponytail and jacket flaps now carry the game's keyframes
  (hand-animated swings in the boombox dance, empty-handed idle, Bollywood dance), and each clip gets back the last frame dropped during extraction (490 clips +1 frame). Body motion verified bone by bone, unchanged.
  Export pipeline: `cfg.py` points to the new library; `bl_clips.py` no longer pads the last frame of loops; `build.py --only --force` recompresses only the given clips
- Panic dance (one of the music dances) hides Sheila's tripod: in the game this clip only drops the gun body on the ground, and the tripod in the data is pinned in place for the whole clip, showing up as a lonely stand.
  The clip prop fix-ups in `character.js` gain `parts` (hide prop parts by material name)

## 2.1.0

Modular reorganization so animation polish, animation replacement, GUI, and event parameters & logic can be improved in parallel. **No behavior change**: self-test 57/57 on all four skins.

- Clip table split into `src/clips.js`; the brain split into `src/brain/` (core scheduler + five domains: typing / mouse / idle / music / system); tray menu split into `electron/menu.js`
- 88 behavior parameters extracted into `src/params.js` (defaults unchanged); `tuning.json` can override any of them
- Developer panel split into `src/devpanel/`, with a new **Parameters page**: one row per parameter, changed ones highlighted in yellow, sanity-checked before saving, and a running release build picks changes up automatically
- Animation trigger tests compute counts and durations from the current parameters, so they still verify after tuning
- `tools/selftest.mjs` runs the whole self-test with one command; the developer window gets `--dev-profile` so several windows can run side by side
- **Fix**: occasional `Object has been destroyed` on exit (the window was already destroyed when the system poll ran one last time; it used to pop up an Electron error dialog)

## 2.0.0

First stable version of the real-time 3D desktop pet (the 0.1.0 in package.json before this was a development version).

- **Character**: game model + game animations + procedural layer (gaze, blinking, expressions, ponytail spring, per-key nod, Sheila's barrels), Electron transparent overlay
- **Skins**: base skin, Heritage Pride, Rebecca (collab), Bear (Bear-iccade); switched from the context menu / tray "Skins"
- **Fixes**:
  - Error on right-clicking the character (`tray.popUpContextMenu` throws on `undefined` in Electron 44)
  - After a typing burst, "look at you + blow a bubble + done-typing line" never triggered when you stopped
  - Two foreground-program classification regexes disagreed (backspace line vs window-switch line)
- **Behavior change**: idle only counts key presses / clicks / scrolling, not mouse movement (she can fall asleep while you jiggle the mouse, and moving the mouse doesn't wake her);
  clicking her while asleep goes through "poked awake"
- **Tunable parameters**: how long idle before lying down / sleeping (default 6 / 12 minutes, halved after midnight), stored in `%APPDATA%/RampartPet3D/tuning.json`; a running instance picks changes up automatically
- **Developer build** (`RampartPet3D.exe --dev`): animation trigger tests (simulated signals, 57 items all self-tested) and real-sensor checks (real sensors + a manual checklist);
  event stream, error counter, copy report, idle threshold controls
- **Error log**: `%APPDATA%/RampartPet3D/error.log`, no more Electron error dialogs
