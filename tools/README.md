# tools: Blender → glTF asset pipeline

Converts the extracted game assets (`<asset_root>/models/`) into the glb files used at runtime, written to `app/assets/` (gitignored, **never committed**).
Intermediates (converted textures, uncompressed clip glb, logs, verification renders) go to `<asset_root>/work/pet3d/`.
`asset_root` and the Blender path come from `assets.json` at the repo root: copy `tools/assets.example.json` there and edit it.

## Running

Needs system Python 3.10+ (Pillow, numpy), Blender 5.1 (path in `assets.json`) and `app/node_modules` (gltf-transform, three; `npm install` in `app/`).

```bash
python tools/build.py model                 # base skin → assets/rampart.glb (+ assets/tex/)
python tools/build.py model --skin hp       # Heritage Pride → assets/rampart_hp.glb
python tools/build.py model --skin rebecca  # Rebecca collab skin / --skin bear for Bear-iccade (skin table in cfg.py SKINS)
# Every model run also writes <name>_1k.glb (textures downsized to 1024, what the runtime loads by default). New skin: extract its blend → add a line to cfg.SKINS → this command
# → add an entry to the skin lists in electron/menu.js and src/devpanel/index.js → switch to it in the developer build and run the full self-test
python tools/build.py clips --set m1        # 3 trial clips
python tools/build.py clips --set m2 --jobs 4   # all selected clips (about 800, 4 Blender processes in parallel)
python tools/build.py clips --only lobby__rampart_menu_lobby_center_idle --force   # re-export some clips (ids or action names, comma separated)
python tools/build.py props                 # props used by the exported clips → assets/props/<short name>.glb
python tools/build.py pack [--force]        # only redo compression and anims/index.json
python tools/build.py all                   # all of the above
```

Options: `--no-eyes` leaves out the cornea / eye-shadow shells; `--max 1024` maximum texture edge; `--force` ignores existing results and redoes them.
Clips are incremental: a clip is skipped if `clips_raw/meta/<id>.json` exists; clips Blender decides not to export are recorded in `clips_raw/skipped/`.

Verification tools:

```bash
# Blender re-imports the glb, poses it by node name and renders with EEVEE three-point lighting (full body / --close close-up, --yaw rotates the camera)
blender -b --factory-startup --python tools/bl_verify.py -- <out dir> <model.glb> <clip_id> 0,8.5 [--close] [--yaw 30]
node tools/check_three.mjs all --t 3        # three.js decode + bind by name + bone world positions
python tools/glbinfo.py <file.glb>          # structure overview; glbpose.py <clip.glb> <seconds> <nodes…> computes world positions directly
```

## Outputs

| Path | Contents |
|---|---|
| `rampart.glb` | Base skin. All 212 bones kept under the skeleton node `rig`; meshes `body` `head` `hair` `gear` `sheila` `eye_cornea` `eye_shadow`; no animation |
| `rampart_rebecca.glb` | Rebecca collab skin (icon_v25_clockup). 180 bones, ponytail only 01–04; jacket / hair trim are emissive (ilm → emissive) |
| `rampart_bear.glb` | Bear-iccade (lgnd_v24_cosmictechno). 93 bones: **no facial bones** (mouth, eyeballs, eyelids); the bear head mask is the head mesh, rigidly following `def_c_head`; one extra emissive visor `glass` |
| `rampart_hp.glb` | HP skin, same conventions. 206 bones: no 7 ponytail bones, no coat front/back tails, no `def_l_elbowB/shoulderPad/sleeve`; 6 extra ribbon bones `def_c_upper/lowerRibbon1..3` |
| `anims/<clip_id>.glb` | Animation only: the character skeleton node hierarchy + the skeletons of the props this clip uses, no meshes. One glTF animation |
| `anims/index.json` | One entry per clip, fields below |
| `props/<short name>.glb` | Prop mesh + prefixed skeleton (`bubblegum__def_c_base`); the skeleton object node is called `<short name>__rig` |
| `tex/<material>_<map>.png` + `tex/index.json` | Raw spec-gloss textures dumped for the custom shaders, indexed by glTF material name |

clip_id = action name with `/` replaced by `__` and `#` by `_p` (`move/medium_jump_pistol_b#1` → `move__medium_jump_pistol_b_p1`).

`anims/index.json` fields: `id action category frames fps duration_s loop loop_gap_deg props prop_detail dropped_props hide root_motion{dx,dy,dz,yaw_deg}
hip_start hip_end hip_max_travel_m bones_animated additive src_frames part file bytes raw_bytes`.
`hide: ["sheila"]` means the prop Sheila appears in this clip, so the character's mesh named `sheila` must be hidden (the game does the same).

## Conventions

- **Coordinates**: meters, +Y up (standard glTF). The character faces **+Z**, feet at y≈0, top of the head about 1.88 m. Root bone `jx_c_delta`, hips `def_c_hip`, head `def_c_head`
- **Materials** (glTF metal-rough, `tex.py`):
  - baseColor = game col (the diffuse of spec-gloss) + spc via the standard KHR spec-gloss → metal-rough conversion, then multiplied by `lerp(1, cav, 0.4)`
  - metallic comes from the same conversion; roughness = 1 − gls; occlusion = ao; the three are packed into ORM (R=AO, G=roughness, B=metallic)
  - normal: the game uses BC5 two-channel, **DirectX (G down)**. B is rebuilt as z=√(1−x²−y²) and G is flipped to OpenGL. Confirmed by statistics and by render comparisons
  - materials whose col alpha really has cut-outs inside the UV area (hair, gear tassels, eyelashes…) → `MASK` (cutoff 0.5, double-sided); everything else `OPAQUE`
  - `eye_cornea`: a nearly transparent (alpha 0.15) black glossy shell that only contributes eye highlights; `eye_shadow`: the game's eyeball occlusion shell, `BLEND`
  - sources are never upscaled: head / hair are only 1024
- **Clips** (`bl_clips.py`):
  - The action library `rampart_base_anims.blend` (built on the base-skin skeleton; the older `rampart_hp_anims.blend` is built on the HP skeleton, has no ponytail and is kept as a fallback)
    has the skeleton exactly as in the game (Y up, inches, root bone rest = identity, standing up via the +90°X root rotation in the actions);
    the base-skin blend's skeleton is already converted to Z up, meters. So locations are ×0.0254, the root bone basis is left-multiplied by `inv(base-skin root rest matrix)`, other bones as is
  - Export uses a "union skeleton": the base skin's 212 bones + the 6 HP ribbons, so one clip works for both skins. The base-skin model reports "No target node" for the ribbon tracks;
    filter after loading: `clip.tracks = clip.tracks.filter(t => root.getObjectByName(t.name.split('.')[0]))`
  - All three T/R/S tracks of every bone are kept (constant ones too), so nothing snaps back to the A-pose
  - The base skin's ponytail `def_c_ponytail01–07` and coat tails have game keyframes (large hand-keyed motion in the speaker dance, empty-handed idle and Bollywood dance; almost static in the standing idle and panic dance,
    where the game relies on runtime jigglebones). `def_l_sleeve/shoulderPad` have no data in the actions and stay at rest
  - The action library has the last frame of every clip restored (the old library lacked one frame per clip, and looping clips got the first frame appended here; that no longer happens). Clips whose ends meet (body only; facial bones such as lips often don't loop along)
    are marked `loop: true`; this is metadata only, whether a clip loops at runtime is up to the behavior
  - Bad last frame: if a body bone's last step is more than 3× its largest earlier step and rotates > 30° / moves > 10 cm (a transition frame jumping to another pose), it is dropped before the loop test;
    metadata `trimmed_last: true` (42 clips across the library, including the "get up" clip `refresh_pose01_intro`)
  - Root motion: in walk / run / jump clips the motion is on the root bone `jx_c_delta` (up to a dozen meters per cycle, direction varies per clip); `root_motion` is the motion per clip / per cycle.
    For the last frame appended to looping clips the root bone is extrapolated from the last two frames (no jump back to the origin), so on wraparound the root jumps back to the start; for in-place playback pin the x and z of the `jx_c_delta.position` track to the first frame
  - Prop actions broken at extraction (the heirloom wrench banner pose, only a 1-frame placeholder in the blend) are exported without the prop and listed in `dropped_props`
  - Single-frame static poses (banner pose statics, quest expressions) are padded to two frames, duration 1/30 s
  - Exported sampled at 30 fps, then `gltf-transform resample` (tolerance 1e-4) + `meshopt --level high` (EXT_meshopt_compression;
    three.js needs `loader.setMeshoptDecoder(MeshoptDecoder)`). Measured bone position error averages 0.25 mm, size is about 1/7 of the original
- **Props**:
  - Prop skeleton object = attach bone × local −90° about X (`REF`→`jx_c_start`, `HEADSHOT`→`def_c_head`, `PROPGUN`→`ja_c_propGun`);
    this trajectory is baked per frame into the T/R/S of the `<short name>__rig` node in the clip file; prop bone actions are resampled on the character's timeline (those with `time_scale` ≠ 1 are already stretched)
  - Runtime: the prop glb's scene sits **side by side** with the character scene under the same root and is driven by the same `AnimationMixer(root)`; props not in this clip's `props` are hidden
  - Clip files also have (constant) tracks on skeleton object nodes such as `rig` and `<short name>__rig`: to place the character move their parent (the shared root), never `rig` directly
  - Props with `prop_detail[].animated: false` (e.g. `wrench_w`, `wall_held`) are also held still in the hand in the game
  - Prop visibility range: pairs in `prop_pairs.json` may carry `start_frame` / `end_frame` (character frame numbers, from the game's animation events AE_CL_CREATE_PROP / DESTROY_PROP).
    Prop frame = (character frame − start_frame) ÷ time_scale, held at the first frame before start; the metadata gets `prop_detail[].show_s = [start s, end s]`,
    and at runtime (`character.js fixProps`) the prop is hidden outside that range. Currently only the cricket bat (`cricket_bat`) uses it (25 / 230)
- Minimal runtime example:

```js
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const model = await loader.loadAsync('assets/rampart.glb')
const gum = await loader.loadAsync('assets/props/bubblegum.glb')
const root = new THREE.Group(); root.add(model.scene, gum.scene)
const clip = (await loader.loadAsync('assets/anims/lobby__rampart_menu_lobby_center_idle.glb')).animations[0]
clip.tracks = clip.tracks.filter(t => root.getObjectByName(t.name.split('.')[0]))
const mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play()
```

## Files

| File | Runs in | Purpose |
|---|---|---|
| `cfg.py` | both | Paths (reads `assets.json` at the repo root), naming conventions, prop short-name table |
| `assets.example.json` | — | Template for `assets.json`: `asset_root` (extracted asset library) and `blender` (path to blender.exe) |
| `build.py` | system Python | Entry point: scan → textures → export → compress → index |
| `bl_scan.py` | Blender | Lists materials, absolute texture paths, col alpha cut-out ratio |
| `tex.py` | system Python | spec-gloss → metal-rough textures; raw texture dump |
| `bl_model.py` | Blender | Skin / prop model glb |
| `bl_clips.py` | Blender | Clip glb + metadata |
| `glbfix.py` | system Python | Fixes the zero-length tangents MikkTSpace produces at degenerate UVs (otherwise the shader gets NaN) |
| `bl_verify.py` `check_three.mjs` `glbinfo.py` `glbpose.py` `report.py` | — | Verification, clip library overview |

## Tripod prop turret_lobby (turretfix)

Symptom: in clips such as gunrev / weld / select_idle / revup, Sheila and the tripod parts drifted apart, weren't in her hands, and the feet sank into the floor. It turned out to be four things stacked together:

1. **Runtime (the main cause, fixed in `loadProp` in `character.js`)**: on startup the brain preloads several clips concurrently, and `loadProp` only checked `this.props[name]`,
   so the same prop could load twice with both copies attached to the root; `AnimationMixer` bound by name to the copy **added first and hidden**, while the visible one stayed in its bind pose
   (bind pose = prop lying down: leg ends y≈+0.56, center post end y≈−0.46, gun body z≈−1.16). Whether it hit depended on load order, which is why chillaxing was "sometimes right".
   Fix: `loadProp` caches the in-flight Promise (each name loads only once)
2. **Export (`bl_clips.prep_prop`)**: the root chain `jx_c_origin∘jx_c_start` of lobby prop actions carries a static scene offset. In gunrev only `jx_c_start`
   has it (−128 inches + 180° about Y), dropping the prop 3.25 m behind her; in weld / select_idle / left_pose the offsets of the two bones cancel out exactly.
   anims.blend has it exactly like that (three.js and Blender match bone by bone to 1 mm), so it isn't a glTF conversion issue. In the game the prop aligns with the character on `jx_c_ref`,
   so for `ROOT_STD_PROPS` (turret_lobby) a static root chain is always normalized (origin = +90°X, start = identity).
   After normalizing, the gun body in the first frame of gunrev coincides with the character's own Sheila bone `def_c_turret` to 1 cm, and the grip is 12 cm from her hand when she raises the gun
3. **Export (`bl_clips.tripod_mode`)**: checks the height of the three feet (`def_l/r_leg_end`, `def_c_leg_bot_end`) frame by frame
   - `lift`: all three feet at the same height and static for the whole clip, but not on the floor (banner pose statics fireaway −0.22 m, sittinggun −0.18 m; the banner scenes' floor isn't at 0)
     → the character root bone and all props are raised together (`prop_detail[].lift_m`: 0.281 / 0.24), so the tripod is on the floor and she stands on the footrest / sits on the gun
   - `gun_only`: the foot ends go more than 8 cm below the floor (gunrev, weld, select_idle, left_idle, revup, revup_idle: she carries Sheila,
     the tripod is rigidly attached to the gun body without its own animation, rigid deviation 2 mm in select_idle) → switch to the prop variant **`turret_gun`** (same skeleton,
     bone prefix `turret_gun__`, only the gun body and screen meshes, `cfg.PROP_VARIANTS`). `bl_model.py prop` and `build.py props --models` accept variant short names
   - Everything else (chillaxing, mechbull, panicdance, turretspin, menu_select…) already has the tripod standing on the floor; data unchanged
   - `turret/prop_rampart_turret_gladcard_animated_heirloom_idle` is a placeholder (gun bones all at the origin) and is in `BROKEN_PROP_ACTIONS`
4. **Runtime (`fixProps`, fixed)**: `stripRootMotion` / `recenter` only moved the character's root bone tracks and left the prop tracks in place (0.23 m off in lobby clips,
   1.2 m in fireaway). `fixProps` now moves the scene node of every visible prop to the root bone's current horizontal position each frame (prop clips are all in-place, so that is exactly the correction).
   The old fix that "pressed the tripod center post end back onto the floor" was a symptom of the bind pose problem and was removed

Re-export: `build.py clips --only <the 23 turret clips> --force` (or delete their meta and rerun) + `build.py props --models rampart_turret_lobby turret_gun`.
