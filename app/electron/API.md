# Electron shell: petAPI and how to run it

The shell owns the window, global input, system sensors, the tray and packaging. The renderer (`src/`, three.js) talks to it only through `window.petAPI`.

## Files

| File | Purpose |
|---|---|
| `main.js` | Main process: overlay window, click-through, IPC, config, tray, `app://` protocol, test self-checks |
| `preload.js` | Exposes `window.petAPI` (contextIsolation + sandbox) |
| `menu.js` | Tray / context menu: items, labels, order |
| `input.js` | uiohook-napi global keyboard / mouse, key classification, mouse throttled to ~60 Hz |
| `win32.js` | koffi calling Win32 directly: foreground window, fullscreen, idle, top-level windows, WASAPI volume / peak |
| `spike.html` | Technical test page (rotating gradient square + event readout), loaded when there is no `dist/` |
| `icon.ico` | Tray and exe icon |

## Running

```
npm start                  # electron .   loads dist/index.html if present, otherwise spike.html
npm run start:dev          # starts with PET_DEV_URL=http://localhost:5173 (run npm run dev in another terminal first)
npm run start:spike        # force the spike page
npm run pack               # vite build + single portable exe: release/RampartPet3D.exe (also produces release/win-unpacked/)
npm run pack:dir           # vite build + only release/win-unpacked/
npm run pack:nobuild       # skip vite and use the existing dist/ (without dist you get the spike page)
```

Command-line flags (understood by both dev and the packaged exe; the portable exe passes them through unchanged):

| Flag | Purpose |
|---|---|
| `--test-exit=<ms>` | Quit automatically after N ms (force-quit 4 s later). **Always pass this when launching for tests** |
| `--test-report=<path>` | With `--test-exit`: run the self-checks and write a JSON report on exit (click-through, lease, config round trip, injected input, CPU, GPU features) |
| `--spike` | Force the spike page |
| `--fps=<n>` | Passed to the page URL as `?fps=n` |
| `--dev` | Developer build: normal window + simulated desktop + developer panel (see the root `CLAUDE.md`) |
| `--dev-profile=<name>` | With `--dev`: separate user data directory `RampartPet3D-dev-<name>` (for running several developer windows at once) |

Environment variable `PET_DEV_URL`: if set, that URL is loaded (vite dev server), retrying every second on failure.

The page is served over a custom protocol `app://pet/` (rooted at the app directory, inside app.asar when packaged): `app://pet/dist/index.html`.
The reason is that `fetch` is unavailable under file://, and three's loaders rely on fetch. Module scripts, binary `fetch` and reads from inside asar are verified to work.
Keep vite's `base: './'` as is.

## Window model

- One transparent, frameless, always-on-top window that is not in the taskbar / Alt+Tab and **cannot take focus**, covering the **primary display's work area** (taskbar excluded),
  so the bottom edge of the window is the top of the taskbar and the character stands at `workArea.height`.
- **Click-through** by default (`setIgnoreMouseEvents(true)`, no `forward`): clicks fall through to the desktop / windows below.
  The cursor position comes from the global hook (`onMouse`), not from forwarded DOM events. At startup the `WS_EX_TRANSPARENT` bit of `GWL_EXSTYLE` is checked to confirm click-through is in effect before the window is shown.
- The renderer decides whether the cursor is over character pixels and calls `petAPI.setInteractive(hit)` **every frame**. preload de-duplicates and renews every 400 ms;
  after a true, the main process falls back to click-through if there is no renewal within 1.5 s (also when the renderer hangs / crashes / the window is hidden).
- While interactive the page receives `pointerdown / pointermove / pointerup / contextmenu` normally; dragging is done inside the page (the window itself doesn't move).
  **Keep reporting true for the whole drag**, otherwise the pointer is lost when the cursor slides off the character's pixels.
- The page never gets keyboard focus and DOM `keydown` never fires; always use `onKey` for the keyboard.
- When the foreground app is fullscreen on the primary display (for ~1 s in a row) the main process hides the window (`hideOnFullscreen`, on by default) and `onSystem` reports `hidden: true`;
  while hidden, mouse / keyboard / audio events are no longer pushed, only `onSystem`.
- Whenever the foreground window changes, the main process pushes itself back to the top of the topmost band (without activating).
- On display configuration changes the window refits the work area and pushes `onScreen`. Only the primary display is handled.

## Coordinates

- `x, y`: screen DIP coordinates (scaling already applied).
- `lx, ly`: relative to the window's top-left corner, equal to page CSS pixels (the window sits at `workArea`, page zoom 1).
- High-refresh displays (e.g. 180 Hz) fire rAF that many times per second, so the renderer has to cap its own frame rate.

## petAPI

Every `onXxx(cb)` returns an unsubscribe function.

### onKey(cb) — global keyboard

```js
{ type: 'down' | 'up',
  cls: 'letter' | 'digit' | 'punct' | 'space' | 'enter' | 'backspace' | 'tab' | 'esc' | 'modifier' | 'nav' | 'fn' | 'other',
  hand: 'L' | 'R' | 'C',          // QWERTY left-hand zone / right-hand zone / space
  repeat: boolean,                 // auto-repeat down while held
  mods: { ctrl, alt, shift, meta },
  key?: 'Enter' | 'Shift' | 'ArrowLeft' | 'F5' | ...,   // only for non-text keys (the backspace class includes Delete)
  combo?: 'save' | 'undo' | 'redo' | 'copy' | 'paste' | 'cut' | 'selectAll' | 'find' | 'closeTab' | 'newTab'
        | 'altTab' | 'close' | 'showDesktop',            // only on non-repeat downs
  t: number }                      // Date.now()
```

Privacy: letters / digits / punctuation only report class and hand, never which key; the main process doesn't record or store anything.

### onMouse(cb) — global mouse move (~60 Hz, first and last events always sent)

```js
{ x, y, lx, ly, t }
```

Also received when the cursor is over the taskbar or on another display (`ly` may fall outside the window).

### onButton(cb) — global mouse buttons

```js
{ type: 'down' | 'up', button: 1 | 2 | 3 | 4 | 5,   // left / right / middle / side buttons
  clicks, mods, x, y, lx, ly, t }
```

Also received when clicking the character itself (the page gets DOM events at the same time); use the DOM events to tell them apart.

### onWheel(cb)

```js
{ dir: 'v' | 'h', rotation,   // vertical: <0 up (away from you), >0 down; accumulates 120 per notch, small touchpad steps may be 0
  amount,                      // lines per notch from system settings
  x, y, lx, ly, t }
```

### onSystem(cb) — 2 Hz

```js
{ fg: { title, exe, cls,                         // foreground window title, process name (e.g. 'Code.exe'), window class
        rect: { x, y, width, height, lx, ly },   // visible bounds (invisible resize border removed), DIP
        maximized, isSelf } | null,
  fullscreen: boolean,     // foreground window covers the primary display (shell windows like desktop / task view excluded), or D3D exclusive fullscreen / presentation mode
  hidden: boolean,         // hidden by the main process because of fullscreen
  idleMs: number,          // system-wide idle (GetLastInputInfo), reset by any keyboard / mouse input
  quns: number,            // raw SHQueryUserNotificationState (3 = D3D fullscreen, 4 = presentation, 5 = normal)
  windows: [ { rect, exe, maximized } ],   // visible top-level windows, Z order top to bottom, at most 30 (for a future "stand on a title bar")
  t }
```

### onAudio(cb) — system output peak

```js
{ peak: 0..1,        // peak of the default output device (WASAPI IAudioMeterInformation)
  volume: 0..1,      // master volume
  muted: boolean,
  sessions: [ { exe, pid, game, peak } ] | null,   // per-app audio sessions (since 2.5): only those with peak > 0.001; null = interface unavailable, fall back to peak
  t }
```

`sessions`: one entry per app currently making sound on the default output device (WASAPI IAudioSessionManager2 → IAudioSessionControl2 for the pid → IAudioMeterInformation).
Re-enumerated every 0.5 s, each one's peak read on every send; `exe` is the process file name, `game` = the process path looks like a game (steamapps\common, Epic Games etc.; decided in memory only, the path is never sent).
System sounds sessions are not listed. Only levels are read: no audio data, no recording. After 5 enumeration errors they are disabled for the rest of the run and `null` is sent from then on.

30 Hz while there is sound; when quiet, a single 0 and then a 2 Hz heartbeat. The default device is re-acquired every 3 s (follows headphones being plugged / unplugged).
Whether `peak` already includes the master volume depends on the driver; **to decide "is music playing", use `muted ? 0 : peak`**.

### setInteractive(bool)

Call every frame; see the window model above.

### getConfig() / setConfig(patch) / onConfig(cb)

Config is stored in `%APPDATA%/RampartPet3D/config.json`, shallow-merged, written to disk with a 500 ms debounce. Keys whose value is `null` in `patch` are deleted.
The renderer may store its own keys (e.g. where the character stands). Keys the main process knows:

```js
{ visible: true,          // tray Show / Hide
  size: 's' | 'm' | 'l',  // tray Size, interpreted by the renderer
  muteBubbles: false,     // mute speech bubbles, interpreted by the renderer
  hideOnFullscreen: true,
  sleepAfter: 5,          // idle minutes before she lies down; she falls asleep at twice that (since 2.5; set in the settings panel: 3 / 5 / 10 / 20, read by the behavior brain)
  look: 'fix',            // look (render style): 'fix' original | 'sticker' Apex sticker (since 2.5; not in DEFAULTS, readers treat missing as 'fix'; written by the settings panel, read by stage.js at startup, URL ?style= takes precedence)
  lang: 'en',             // UI language (not in DEFAULTS; written by the in-game UI). The public release is English-only; a saved 'zh' also shows English
  openAtLogin: boolean }  // read from the system login items, not stored in the file; setConfig can change it
```

Both get and set return a Promise resolving to the full config; any change from either side fires `onConfig`.

### getTuning() / setTuning(patch) / onTuning(cb)

Tuning file `%APPDATA%/RampartPet3D/tuning.json`, shared by the developer build and the release (see the root `CLAUDE.md`). `setTuning` shallow-merges, `null` restores an item's default.
The main process watches the file and pushes `onTuning` whenever it changes.

### getScreen() / screen / onScreen(cb)

```js
{ workArea: { x, y, width, height }, bounds: { ... }, scaleFactor, dev }
```

`screen` is the snapshot at load time; `getScreen()` always returns the latest value. `petAPI.dev` is true in the developer build.

### showMenu()

Pops up the same menu as the tray at the cursor (for right-clicking the character).

### quit()

Quits the app.

## Tray

Show / Hide, Size (Small / Medium / Large), Skin, Launch at startup, Reload + Developer tools (dev only), Quit. Left and right click both open the menu. Single instance.
In the portable build, launch at startup registers the outer exe (`PORTABLE_EXECUTABLE_FILE`), not the temporary unpacked exe.

## Measurements (spike page, 500×600 WebGL, window 1920×1032, 16-thread CPU)

| Scenario | CPU (all Electron processes) | GPU memory (GPU process) |
|---|---|---|
| 60 fps | ~16% of one core = 1.0% of the machine | 58.6 MB dedicated + ~4 MB shared; DWM ~+15 MB |
| 30 fps | ~12% of one core = 0.74% of the machine | 58.6 MB dedicated |
| 60 fps, window shrunk to 700×650 for comparison | ~18% of one core (no difference from the full window) | 36 MB dedicated |

- GPU compositing is on (`gpu_compositing: enabled`), the window has `WS_EX_NOREDIRECTIONBITMAP` and goes through DirectComposition.
- Covering the whole work area only costs ~22 MB more GPU memory than a small window, with no visible CPU difference, so the full-screen overlay design stays.
- Main-process work: the 2 Hz poll takes ~1 ms, each 30 Hz peak read ~0.07 ms.

Note: Electron's mouse forwarding uses a low-level mouse hook on the main process UI thread, so **a stalled main process makes the mouse lag system-wide**.
That is why forwarding is off. Don't do any heavy work in the main process (file parsing, synchronous IO loops, etc.); move it to the renderer or a worker.

## Self-check results (`--test-report`)

Run on dev and on the packaged builds (win-unpacked and the portable exe), all passing:
click-through bit set before showing and still set after showing; with click-through `WindowFromPoint` lands on the window below, while interactive it lands on this window, and click-through comes back afterwards;
the 1.5 s lease expires back to click-through; config round trip over IPC; uiohook receives injected keyboard and mouse events while another app has focus;
`peak` reached 0.35 while a system sound played; the foreground process name / title / window list were all read.

Not tested: real manual dragging of the character (the mechanism is verified), hiding triggered by a real fullscreen app, multiple displays, DPI ≠ 100%.

## Packaging

- electron-builder, configured in the `build` field of `package.json`. `uiohook-napi`, `koffi` and `@koromix/koffi-win32-x64` are unpacked to `app.asar.unpacked`.
- Uses the local `node_modules/electron/dist`, keeps only the en-US locale pak, doesn't rebuild native modules (all are prebuilt N-API).
- `three` is in devDependencies (vite bundles it, it isn't needed at runtime); the package only ships koffi / uiohook-napi / node-gyp-build.
- Spike build: portable exe 93 MB, win-unpacked 325 MB. The portable exe unpacks to a temp directory on every launch (~6 s for the spike build,
  longer with the model assets); for instant startup use the win-unpacked directory (`npm run release`, then `npm run install-release`).
