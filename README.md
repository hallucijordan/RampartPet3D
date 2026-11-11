# RampartPet3D

A real-time 3D desktop pet for Windows. Rampart sits on your taskbar and reacts to what you do: she nods along as you type, spins up Sheila when you type fast, follows your cursor with her eyes, reacts to music and to the app in front, and dozes off with a bubble-gum bubble when you leave.

**Demo video:** VIDEO_URL

> **Fan project.** Not affiliated with, endorsed by, or sponsored by Electronic Arts Inc. or Respawn Entertainment. Apex Legends, Rampart and all related names, characters and assets belong to their owners. This repository contains **no game files**: no models, animations, textures, sounds, UI art or fonts. To run the pet you extract the assets yourself from your own copy of the game, for personal, non-commercial use.

## Features

- Transparent, always-on-top overlay. Clicks pass through everywhere except on her.
- Plays animations from the game's own library, with a procedural layer on top: eyes-then-head gaze, blinking, facial expressions, ponytail spring, a nod per key press and Sheila's barrel spin.
- A behavior brain driven by global keyboard and mouse input, typing speed, system idle time, audio peaks, the foreground app, fullscreen apps and the time of day.
- Interactions: poke, double-click, drag, head pat, wake her up.
- Idle cycle: fidgets, lies down, falls asleep.
- Skydive entrance on startup.
- Four skins (if you extract them) and two looks: original with render fixes, and a flat "sticker" style.
- In-game style UI: HUD, XP bar, rank-ups, daily stats and a settings panel.
- Developer build (`--dev`): a normal window with a simulated desktop, a parameter editor, simulated-signal self-tests and a real-input checklist.

## Requirements

- Windows 10 or 11
- Node.js 22 or newer
- Python 3.10 or newer, Blender 5.x and an Apex Legends asset extractor (RSX). These are only needed to build the assets.
- An installed copy of Apex Legends to extract assets from

## Getting the assets

The app loads its character from `app/assets/`. This folder is gitignored and starts empty. The pipeline goes RSX export, then Blender, then glTF:

1. Export the Rampart models and animations with RSX.
2. Copy `tools/assets.example.json` to `assets.json` at the repo root, then set the paths to your asset folder and Blender.
3. Run the export tools.

Step 3 is described in detail in [tools/README.md](tools/README.md). The data in `data/` (clip catalog and curation notes) records which game clips the pet uses and why.

The in-game UI art (rank badges, HUD icons, frames) is optional. Without it the UI still runs, just without that art. The expected file names are listed in `app/src/ui/assets.js`.

## Running

```bash
cd app
npm install
npm run dev            # browser preview at http://localhost:5173
```

Desktop overlay against the dev server (in a second terminal):

```bash
cd app
npm run start:dev
```

Build a standalone app into `app/release/win-unpacked/`:

```bash
cd app
npm run release
```

To copy the build to an install folder, set `PET_INSTALL_DIR` and run `npm run install-release`. Run the build with `--dev` to open the developer build.

## Repository layout

```
app/        Electron + vite + three.js app
  electron/   main process: overlay window, click-through, global input hooks, Win32 sensors, tray menu
  src/        renderer: character, procedural layer, behavior brain, looks, UI, developer panel
  tools/      offscreen capture, self-test runner, release helpers
tools/      asset pipeline (Blender scripts, glTF build, texture conversion)
data/       animation clip catalog and curation scripts
DESIGN.md   behavior and personality design
CLAUDE.md   developer guide (architecture, debugging, gotchas)
```

This project was built with the help of [Claude Code](https://claude.com/claude-code).

## License

The source code is released under the [MIT License](LICENSE). The license does not cover any game names, characters or assets.
