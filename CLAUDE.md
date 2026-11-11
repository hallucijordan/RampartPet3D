# CLAUDE.md — Rampart real-time 3D desktop pet

Developer guide for working on this repo, with Claude Code or by hand.

## What this is

A fan-made desktop pet: Rampart from Apex Legends, rendered in real time with three.js inside a transparent Electron overlay that sits on the Windows taskbar.
She uses the game's own model (base skin, high ponytail) and the game's own animations, **not pixelated and not chibi**.
The sense of life comes from a procedural layer stacked on top of the game clips (gaze following the mouse, blinking, expression overlays, ponytail spring,
a nod per keypress, Sheila's barrel spinning with your typing speed) plus a behavior brain that reacts to keyboard, mouse, music, the foreground app and the time of day.
Behavior design is in `DESIGN.md`, clip selection in `data/CLIPS.md`, release notes in `CHANGELOG.md`.

Game assets (models, animations, textures, game UI images, fonts) are **not** in the repo. Extract them from your own game install and convert them
with the tools in `tools/` (RSX → Blender → glTF, see `tools/README.md`) into `app/assets/` (gitignored).

Windows only. Electron 44 + vite + three.js; native modules uiohook-napi (global input) and koffi (Win32 calls).

## Layout

```
.
├── CLAUDE.md          this file
├── DESIGN.md          personality and behavior design (trigger table, lines, anti-annoyance rules)
├── CHANGELOG.md       release notes; new changes go under "Unreleased"
├── data/              clips.json / CLIPS.md: clip library curation (in git); curate/ holds the curation scripts
├── tools/             Blender -> glTF export (usage and conventions in README.md), outputs to app/assets/ (gitignored)
│                      config: assets.json at the repo root (copy tools/assets.example.json)
└── app/               Electron + vite + three.js
    ├── electron/      main process: overlay window, click-through lease, uiohook global input (input.js), koffi Win32 (win32.js: foreground window /
    │                  fullscreen / idle / audio peak), tray / context menu (menu.js), developer window (--dev), tuning.json; API.md is the petAPI contract
    ├── src/
    │   ├── main.js        entry: canvas follows the character across the overlay, per-pixel hit test, frame cap (high-refresh displays); applies tuning.json overrides
    │   ├── stage.js       rendering: HDR 4x MSAA × 2 supersampling → composite (PBR Neutral tone mapping, outline, contact shadow); lights in _makeLights; look extension points in setLook
    │   ├── looks/         looks (config.look / ?style=): fix = original + render fixes (default), sticker = Apex sticker; lib/fix.js shared fixes;
    │   │                  polish / illus / figure are alternative / experimental looks (not bundled, viewable in dev via ?style=)
    │   ├── character.js   model (rampart[_<skin>]_1k.glb) / props / clip trimming / seam fading / banner pose recentering / runtime prop fixes
    │   ├── materials.js   skin subsurface (game thk texture = scatter color × skin mask)
    │   ├── procedural.js  gaze (eyes lead, head follows), ponytail spring, pendulum lean, facing, sleep bubble; face.js blinking; expressions.js expression overlays
    │   ├── layers.js      per-key nod / shoulder twitch, Sheila's barrel (ratchet + flywheel)
    │   ├── clips.js       clip table C: behavior slot → game clip + trim range + display name (pure data)
    │   ├── params.js      event parameter table ([default, description, unit]), overridden by tuning.json
    │   ├── brain/         behavior brain: index.js core scheduler (run / priorities / playback / entrance / per-frame / resetForTest);
    │   │                  typing / mouse / idle / music / system are one domain each (init / reset / methods); shared.js has the priority table PRIO
    │   ├── input.js       input recognition: key classes, typing speed, idle timer (mouse movement doesn't count), simulated input entry points
    │   ├── attention.js   gaze target scoring (cursor / look at you / work window / click point / zoning out)
    │   ├── lines.js       speech bubble lines (original writing) and rate limiting; bubble.js the bubble; style.css bubble styles
    │   ├── fx.js          sparks, dust, bubble gum debris
    │   ├── ui/            in-game UI: index.js entry mountUI (config / fonts / per-frame snapshot), hud.js HUD under her feet, xpbar.js XP bar above her head,
    │   │                  rankup.js rank-up animation, panel.js settings panel, stats.js today's stats, progress.js XP and rank, i18n.js UI copy, store.js config I/O;
    │   │                  images and fonts are in assets/ui/ (not in git); demo entry __pet.ui.demo()
    │   └── devpanel/      developer panel: index.js shell / sim-tests.js ① trigger tests / real-checks.js ② real-input checklist / params-tab.js ③ parameters / look.js look
    ├── tools/
    │   ├── selftest.mjs   runs the developer panel's full self-test per skin, exit code 1 on failure
    │   ├── capture.js     offscreen capture (CAP_JOB=job.json electron tools/capture.js), per-frame log log.json
    │   ├── compose.py / compose_demo.py   composite MP4 / GIF (simulated desktop, cursor, captions)
    │   ├── prune_dist.mjs slim dist before packaging (keep only clips referenced in the source)
    │   └── install_release.mjs  mirror release/win-unpacked into $PET_INSTALL_DIR
    └── assets/        exported glb and textures (gitignored)
```

## Running

All commands from the repo root unless noted; `npm install` in `app/` first.

- Browser preview: `npm --prefix app run dev` → http://localhost:5173
  (`?clip=<id>` pins one clip, `?ppm=` scale, `?lookY= / ?lookX=` camera, `?yaw=` facing, `?hi=1` 2K textures, `?entrance=1` shows the skydive entrance,
  `?style=sticker|fix|none` look, `?skin=<skin>`)
- Desktop overlay against the dev server: run the dev server, then in `app/`: `set PET_DEV_URL=http://localhost:5173&& electron .`
  (or `npm run start:dev`). **Always pass `--test-exit=<ms>` when launching for tests**
- Developer build (normal window + simulated desktop + developer panel): `electron . --dev` in `app/` (loads `PET_DEV_URL` if set, otherwise `dist/`),
  or `RampartPet3D.exe --dev` for a packaged build
- Self-test: `cd app && npx vite build && node tools/prune_dist.mjs && node tools/selftest.mjs --skins base,bear --port 9333`
  (runs ① "Run all self-tests" in a developer window, prints per-skin results and failure details, exit code 1 on failure)
- Release: `npm --prefix app run release` → `app/release/win-unpacked/RampartPet3D.exe`. To install it into a folder:
  `cd app && set PET_INSTALL_DIR=C:\path\to\RampartPet3D&& npm run install-release` (stops instances running from that folder,
  mirrors the files, creates a "RampartPet3D Developer Build" shortcut with `--dev`)
- Asset pipeline: see `tools/README.md` (`python tools/build.py model|clips|props|pack|all`)

## Cross-cutting names

These names are used across files; renaming one means updating every user.

- **Clip slot names** `C.xxx` (clips.js): the slot contents can change freely; adding / removing / renaming slots must be mirrored in the brain and the tests
- **Behavior names and priorities** (`run('name', PRIO.xxx)`, brain/shared.js): the test table and the event log match on behavior names
- **Parameter names** `params.<group>.<item>` (params.js): the developer panel's parameter page and tuning.json are generated / stored from them, so renaming invalidates saved values
- **petAPI** (`electron/preload.js`, `electron/API.md`) and `electron/main.js`: the shared base for everything else
- **Display names** (NAMES in clips.js) are shown in the developer panel
- **Look** `config.look` (`fix` original | `sticker` Apex sticker, default `fix`): read by `stage.js` at startup (URL `?style=` takes precedence, `none` = the 2.4.0 rendering);
  the settings panel writes it and reloads the page (same as changing skin). New look: `src/looks/<name>.js` + one entry in the `LOOKS` table in `stage.js`
- When you change behavior, add a test in `sim-tests.js` / `real-checks.js`; record changes under "Unreleased" in `CHANGELOG.md`
- `tuning.json` is shared between the developer build and the release: after experimenting in the parameter page, restore defaults unless you want to keep the values

## Known issues / gotchas

- Procedural-layer bones are restored each frame to "the value the mixer wrote last frame", not to the bind pose (three's mixer doesn't write bones on frames where the value didn't change)
- `Character.play` carries a generation number: if a newer play supersedes it while loading, it is discarded (returns null, which `brain.once` treats as finished)
- Clips are trimmed with our own `subclip` (adds keyframes at both ends of the range); three's built-in one drops constant tracks that were reduced to just a first and last key
- Props load only once (in-flight Promise cache); loading twice makes the mixer bind to the hidden copy
- Sheila's barrel spin only rotates `def_c_barrel_base` on her back; the prop barrel has a different axis and is left to the animation
- Tripod prop: clips where she carries Sheila use `turret_gun` (the variant without the tripod), see "Tripod prop" in tools/README
- The standing base pose uses `center_idle` (Sheila hanging at her hip)
- Bubble gum is hidden when she isn't blowing it (fixProps) and pinned in front of her mouth by `applySleepBubble` while sleeping; the welding torch is hidden when not in hand; skins without a mouth bone (Bear) show no bubble gum
- Skins: base / hp / rebecca / bear; value x maps to `rampart_x.glb` (falls back to the base skin if missing). The procedural layer must degrade gracefully on missing bones (Bear has no facial bones: no blinking, no eye movement, no expressions)
- When a behavior is cancelled `tok.cleanup` runs (behaviors with side effects, like changing the base pose or sulking, must register their cleanup)
- Models, animations, textures and build outputs never go into git. Never use characters or props hand-built from geometric primitives (particle effects are fine)
- `tray.popUpContextMenu()` takes no arguments (Windows pops it up at the cursor by default); passing `(undefined, point)` throws in Electron 44 (this was the cause of the right-click error)
- Detect "typing stopped" with `typing.hadBurst`: when typing stops the tier steps down to steady before none, so watching only the previous frame never sees "burst → none"
- English comments, keep the code simple

## Debugging handbook

- **Developer build** (preferred): `RampartPet3D.exe --dev` (or the "RampartPet3D Developer Build" shortcut). A normal window + simulated desktop + side panel
  (`src/devpanel/`) with three tabs:
  - **③ Parameters**: one row per item in `params.js`; "Save" applies immediately and writes tuning.json (changed values highlighted, default on the right)
  - **① Triggers (sim)**: event → is the animation right. Each behavior has "Play" (calls it directly) and "Simulate" (dispatches simulated input / injects state and checks ✓✗ automatically); "Run all self-tests" takes about 2 minutes
  - **② Real input**: real action → is the event recognized. Dispatches no signals; you follow the instructions (type, Ctrl+S, play music, switch to VS Code, go fullscreen, step away 15 s,
    poke / double-click / drag / head pat…) and the panel watches the recognition results (tier, shortcut, poke count, foreground category, system idle) to judge ✓✗; live sensor readings at the top
  - The developer window still uses the real sensors (global keyboard hook, foreground app, system idle, audio peak, `petAPI.dev = true`); the mouse uses DOM events inside the window.
    It skips overlay-only behavior (no click-through, not topmost, doesn't hide on fullscreen). The browser (`npm run dev`) shows the same panel but has no sensors, so tab ② can only test mouse items
  - "Copy report" exports both tabs' results as Markdown. F12 devtools, Ctrl+R reload. Separate user data directory (`%APPDATA%/RampartPet3D-dev`);
    doesn't take the single-instance lock, so it runs alongside the release. **When you add a behavior, add a row in both `sim-tests.js` (①) and `real-checks.js` (②)**
- **Error log**: uncaught main-process exceptions and renderer console.error go to `%APPDATA%/RampartPet3D/error.log` (developer build: `RampartPet3D-dev/`)
  instead of Electron's error dialog; at most 300 entries per run, rotated to `.old` past 1 MB
- **Runtime errors in overlay mode**: release builds have no devtools. To investigate, run the dev setup:
  1. `npm --prefix app run dev` (vite, http://localhost:5173)
  2. In another terminal: `cd app && set PET_DEV_URL=http://localhost:5173&& node_modules\electron\dist\electron.exe . --test-exit=600000`
  3. The tray menu (in dev) has "Developer tools" and "Reload"; edits in src/ hot-reload through vite
- **In the browser**: http://localhost:5173/?clip=<id> pins one clip; `window.__pet` = { pet, stage, proc, brain, view, world, fx, THREE, clock, input, ui };
  parameters are at `__pet.brain.params.<group>.<item>`
- **Offscreen reproduction**: `app/tools/capture.js` (see the job.json format at the top of the file; `"script"` can define `onFrame(i, t, P)` to drive a scene).
  The output folder gets `log.json` (per frame: clip, behavior, base pose, state, cursor, typing tier, typing speed, barrel speed, expression weights) and `errors.json` (page errors / warnings);
  `"nograb": true` advances without writing images (for soak tests). `compose.py` / `compose_demo.py` turn the frames into MP4 / GIF
- **Config file**: `%APPDATA%/RampartPet3D/config.json` (petX, size, skin, muteBubbles, firstRunDone, …); delete it to restore defaults
- **Idle**: only key presses / clicks / wheel count, mouse movement doesn't (`input.lastInput`; system idle is reset by mouse movement, so it isn't used). Clicking her while asleep goes through "poked awake"
- **Tuning file**: `%APPDATA%/RampartPet3D/tuning.json`, stores items that differ from the default, grouped (`{ "idle": { "lieMin": 7 } }`), shared by the developer build and the release;
  edit and save in the developer panel's "③ Parameters". The main process watches the file, so a running release follows along. Delete it to restore all defaults. The flat lieMin / sleepMin / lateHalve of 2.0.0 are still accepted
