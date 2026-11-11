# Rampart animation library curation (CLIPS)

Out of the 1771 actions in `<asset_root>/models/anims/rampart_hp_anims.blend`, all 1058 full-body character actions were measured (206-bone main skeleton;
excluding aim additive layers, empty `_light` actions, the 70-bone generic skeleton versions and prop rigs). 140 of them were rendered and reviewed, and 125 ended up in `clips.json`:
**S 15 / A 32 / B 43 / C 35**.

Paths below use `<work>` = `<asset_root>/work/pet3d`, where `asset_root` comes from `assets.json` at the repo root (see `tools/cfg.py`).

- Data: `data/clips.json` (sorted by grade, then by recommendation)
- Previews: `<work>/clips/<clip_id>.png` (12–16 tile thumbnails), `.mp4` (10 fps; 5 fps for clips over 20 s),
  `<clip_id>_timeline.png` (one tile per second for clips over 12 s), `quest__*_head.png` (expression close-ups); S/A overview `_overview_SA.png`
- Per-frame curves (angular speed, bubble scale, jaw, head yaw, hip height...): `series` in `<work>/clips/metrics/<clip_id>.json`
- The previews use the HP skin from the anims blend (hair bun); the pet itself uses the base skin (high ponytail). Skeletal animation is shared

## Summary

Her "alive" material is mostly in three places: **lobby idles** (hand on hip, chewing gum, blowing bubbles, taking Sheila down to weld it), **the long empty-handed idle** (a string of idle fidgets over 54 s),
and **ground emotes** (lounge chair, two dances, beckoning taunt). Add the 12 single-frame facial expressions, the zipline hang (as "picked up") and the updraft float (as "falling"),
and nearly every state the pet needs has a native game animation. **Missing**: sleeping, yawning, waving hello, getting hit, being downed / bleeding out / revived. These need combinations and the procedural layer.

## Behavior -> clip

| Pet behavior | First choice | Alternatives / extras | Notes |
|---|---|---|---|
| **Idle loop** | `lobby__rampart_menu_lobby_select_idle` (whole 17 s loop) | `lobby__rampart_s10e01_idle` (2 s neutral loop, still face), `move__rampart_crouch_ua` (crouching) | select_idle is how she looks in the lobby: hand on hip, chewing gum, bubbles, a glance back. s10e01 suits procedural gaze / expression overlays |
| **Idle fidgets (random)** | segments of `move__rampart_idle_ua`: bubble_big 4.4–7.9, look_around 8.0–14.8, sheila_inspect 16.2–27.6, hair_touch 28.0–32.4, point 32.6–34.6, bubble_big 35.2–40.0, gesture 41.0–48.8, look_back 48.8–50.6 | `gladcard__…_animated_gum` (unwrap gum, blow a bubble), `lobby__rampart_s10e01_action`, `emote__…_yoga` 0.4–1.6 (stretch) | idle_ua never returns to the start pose midway; cut segments need a 0.3–0.5 s crossfade. Since 2.5, look_around, hair_touch and gesture moved to the music pool (`C.musicFidgets`); the idle fidget pool `C.fidgets` no longer has these three |
| **Typing / working** (reworked 2026-09-27) | `gladcard__rampart_gladcard_animated_heirloom` frames 0–30: back turned, fixing Sheila; two copies relay as a loop, whole clip turned 150° | draw Sheila: `emote__…_turretspin` 357→372 reversed; stow Sheila: `emote__…_mechbull` 225–246 (turned +20°) | slots `typeDraw / typeLoop / typeStow`; the tripod gun's barrels first unfold into four, then spin with typing speed. The old "long focus -> weld Sheila" was replaced (weld stays only as an idle fidget) |
| **Very fast typing / burst** (reworked 2026-09-27) | heirloom 30–82 (turn at double speed, raise the wrench and slam) -> `lobby__rampart_menu_select_readyup` 12–148: rushes onto Sheila and rides it, swinging; 84–148 swings once more | then the BOOM! transition + the entrance's fall / heavy landing / getting up | slots `burstTurn / burstRide / burstRideLoop`; readyup is aligned to the fixing pose by the tripod, then turned 150°. The old Sheila test spin / fist pump is no longer triggered by typing |
| **Mouse near / clicked** | `emote__rampart_ground_emote_taunt` 0.5–1.8 (beckoning "come at me") | expression overlay `quest__…_happy_l / surprised_l / angry_l`; `gladcard__…_static_peace` (crouching peace sign), `…_static_wink` | gaze following the mouse is procedural (head / eye bones); this only picks the "reaction clip" |
| **Dragged** | `melee__rampart_ziplineidle_wrench`: loop 3.83–5.53 (0.07°), left hand over head, legs dangling | `sheila__rampart_ziplineidle_turret` | the left wrist stays fixed 1.78 m above the ground for the whole clip; pin it to the mouse; pair with the `quest__…_surprised / fearful` expressions; hide the wrench prop |
| **Falling** | `skydive__rampart_updraft` (8 s loop, upright float, arms spread) | `skydive__rampart_freefall` 2.87–7.07 (belly-down freefall, for long drops), `emote__…_freefall_emote_backflip` (midair backflip + bubble) | updraft reads best from the front |
| **Landing** | `move__medium_land_ua` (1 s knee-bend cushion) | `melee__rampart_land_wrench` (deeper crouch) | fade into idle 0.3 s after landing |
| **Jump (onto a window / along the taskbar)** | `move__medium_jump_ua_f` -> `move__medium_float_ua_f` -> `move__medium_land_ua` | `sheila__rampart_doublejump_mobilehmg_f` | the takeoff has a forward root lunge that must be removed |
| **Walk / move** | `move__rampart_crouchwalk_ua_f` 0.37–1.43 (crouched sneak, seam 0.14°) | `move__rampart_walk_ua_f` (jog, loop hitches by 8°), `sheila__rampart_walk_mobilehmg_f` | all locomotion carries root translation (along -X / -Y); strip it on playback and move the window by stride length |
| **Sleep / long time without input** | `emote__rampart_ground_emote_chillaxing` -> `…_chillaxing_loop` (Sheila as a lounge chair, hands behind her head, last frame joins the loop at 0.2°) | `execution__rampart_victim_mirage_execution_base` 3.3–5.3 (falls flat, a "dead asleep" easter egg) | no real sleep animation: lounge loop + procedural eye closing + no bubbles = napping; there is no "get up" clip, so fade back to standing |
| **Bored** | `move__rampart_crouch_ua` (crouching, bubbles, looking around) | `emote__rampart_ground_emote_cricket` (playing cricket alone), `emote__…_yoga` (stretch, then handstand), `quest__…_sad_l` expression | the current bored pool `C.bored`: cricket, mechbull, banner revup (winds up, jumps, sets Sheila down), celebration 0.5–3.9 (fist-pump cheering); the last two left typing on 2026-09-27 and moved into the bored pool; since 2.5 panicdance also moved here from the dances |
| **Music / dancing** | `emote__rampart_ground_emote_bollywood_dance`, `emote__rampart_ground_emote_boombox` (`C.dances`, one is picked whenever music starts) | music fidgets `C.musicFidgets`: `move__rampart_idle_ua` look_around 8.0–14.8, hair_touch 28.0–32.4, gesture 41.0–48.8 (since 2.5: kept separate from the idle fidgets, not shared) | neither dance loops by itself: after one ends, return to idle, then pick another. panicdance is in the bored pool since 2.5 |
| **Talking (with a speech bubble)** | `lobby__rampart_poi_mythic_weapon_flatline` (talking to the camera with gestures) | `move__rampart_idle_ua` gesture 41.0–48.8, `lobby__rampart_mythic_weapon_tease_s27` | the mouth shapes belong to the original voice line, so it only reads as "talking" |
| **Skydive entrance / jumping down from the top of the screen** | `lobby__rampart_igc_mythic_weapon_teaser` 8.4–10.6 (drops from 2 m, crouches on landing, stands up) | `gladcard__…_revup` (jump and land) | keep the vertical root motion |
| **Expressions** | 12 `quest__*` (happy / surprised / angry / sad / fearful / neutral × left/right) | | single frames; overlay only the face bones on the current clip (108 face bones, no shape keys) |

## Grades S / A (47 recommended clips, 12 of them single-frame expressions)

"Loop" column: `whole` = mean start/end angle difference < 2.5° and max < 8°, loops as is; `a–b` = recommended loop sub-range (seconds); `—` = play once only.

| # | Grade | clip_id | Role | Duration s | Loop | Props | What it looks like |
|---|---|---|---|---|---|---|---|
| 1 | S | `emote__rampart_ground_emote_chillaxing_loop` | nap | 9.5 | whole | bubblegum,turret_lobby | Uses Sheila as a lounge chair: hands behind her head, legs crossed, chewing gum, an occasional bubble (9.5 s, start/end 0.1°) |
| 2 | S | `lobby__rampart_menu_lobby_select_idle` | idle base pose | 17.0 | whole | bubblegum,turret_lobby | One hand on hip, chewing gum, two bubbles, a glance back over her shoulder midway; the 17 s loop closes perfectly (0.0°); small motion, the most in-character clip |
| 3 | S | `melee__rampart_ziplineidle_wrench` | air | 5.6 | 3.83–5.53 | heirloom_v21_wrench_w | Hangs from a zipline by one hand, legs dangling (5.6 s) |
| 4 | S | `emote__rampart_ground_emote_chillaxing` | transition | 3.8 | — | bubblegum,turret_lobby | Into the lounge chair: flips Sheila into a chair, kicks off and hops on (3.9 s); the last frame is only 0.2° from the first frame of chillaxing_loop |
| 5 | S | `lobby__rampart_menu_lobby_center_idle_weld` | work | 23.6 | 9.7–12.87 | turret_lobby,welder | Takes Sheila off the tripod, holds it upright and welds it with a welding torch, puts it back (23.6 s, start/end 0.1°) |
| 6 | S | `move__rampart_idle_ua` | idle fidget | 54.3 | whole | bubblegum | The in-game empty-handed idle long take (54 s), start/end match (0.5°); a string of fidgets: big bubble, looking around, swinging Sheila down to inspect it and putting it back, touching her hair, pointing ahead, gesturing |
| 7 | S | `emote__rampart_ground_emote_bollywood_dance` | performance | 12.2 | — | bubblegum | Bollywood dance (12.2 s): hip swings, raised-arm spins, stomps, a big bubble at 10.3–11.0 s; has facial animation |
| 8 | S | `emote__rampart_ground_emote_taunt` | reaction | 6.3 | — | — | Beckons "come at me", hand on hip, turns away (6.3 s, has facial animation) |
| 9 | S | `lobby__rampart_s10e01_idle` | idle base pose | 2.0 | whole | — | The cleanest neutral standing breathing loop (2 s, seam 0.2°); face bones do not move at all |
| 10 | S | `skydive__rampart_updraft` | air | 8.0 | whole | — | Floating in an updraft: slightly crouched, arms out for balance, legs hanging (8 s, start/end 0.5°) |
| 11 | S | `emote__rampart_ground_emote_boombox` | performance | 11.2 | — | — | Carries Sheila on her shoulder like a boombox, nodding and swaying to the beat (11.2 s), chewing gum |
| 12 | S | `move__medium_land_ua` | air | 1.0 | — | — | Landing cushion: bends the knees and stands back up (1 s) |
| 13 | S | `quest__rampart_quest_happy_l` | freeze / expression | single frame | — | — | Happy: head tilted, big grin, relaxed hands |
| 14 | S | `quest__rampart_quest_surprised_l` | freeze / expression | single frame | — | — | Surprised: wide eyes, open mouth, hands raised |
| 15 | S | `quest__rampart_quest_angry_l` | freeze / expression | single frame | — | — | Angry: frown, gritted teeth, both fists up |
| 16 | A | `move__rampart_crouch_ua` | idle base pose | 37.3 | whole | bubblegum | Deep crouch idle (37 s, start/end 0.3°): two big bubbles, looking around, one hand on the ground stretching an arm |
| 17 | A | `emote__goldenhorse_rampart_celebration` | reaction | 11.3 | 4.5–9.33 | — | Repeated fist-pump cheering (0.5–3.9 s), then stands holding Sheila |
| 18 | A | `emote__rampart_ground_emote_panicdance` | performance | 17.8 | — | turret_lobby | Drops Sheila on the ground and jumps around it in a "panic dance" (17.8 s), has facial animation |
| 19 | A | `gladcard__rampart_gladcard_animated_fixing` | work | 3.1 | — | — | Kneels on one knee tinkering, raises both arms for a stretch at 1.3–1.9 s, then picks up Sheila (3.1 s) |
| 20 | A | `gladcard__rampart_gladcard_animated_gum` | idle fidget | 4.2 | — | bubblegum,gum | Banner pose "gum": spins in place with a kick, unwraps a stick of gum and pops it in her mouth, ends with a bubble (3.6–4.2 s) |
| 21 | A | `lobby__rampart_igc_mythic_weapon_teaser` | transition | 17.5 | — | — | Entrance: for the first 8.4 s she is 2 m up (off camera); at 8.4–9.8 s she drops from the sky, lands in a crouch, stands up, then stands gesturing |
| 22 | A | `move__rampart_crouchwalk_ua_f` | locomotion | 1.6 | 0.37–1.43 | — | Sneaking forward in a crouch (1.6 s) |
| 23 | A | `lobby__rampart_menu_lobby_center_idle_gunrev` | reaction | 8.5 | whole | bubblegum,turret_lobby | Lifts Sheila off the tripod overhead, chews and blows a bubble, swings it to spin the barrels, puts it back (8.5 s, start/end 0.0°, same start as select_idle) |
| 24 | A | `emote__rampart_ground_emote_cricket` | performance | 9.0 | — | cricket_bat_01 | Cricket: swings the bat, tosses and catches it, hits the ball (9 s) |
| 25 | A | `emote__rampart_ground_emote_yoga` | idle fidget | 5.1 | — | bubblegum | Yoga: first raises both arms and lifts a knee (0.4–1.6 s, looks a lot like a stretch), then bends down into a handstand |
| 26 | A | `gladcard__rampart_gladcard_animated_myfavorite` | idle fidget | 3.9 | — | — | Looks down at the rifle in her right hand and nods, pleased ("my favorite" = this gun), has facial animation. **The gun is spawned by an RSEQ animation event and is not in the prop pairs; without it she grips an empty fist. The pet does not export weapons; dropped from the bored pool on 2026-09-26** |
| 27 | A | `gladcard__rampart_gladcard_animated_revup` | reaction | 4.3 | — | turret_lobby | Crouches holding Sheila to wind up, jumps, lands and sets Sheila down deployed (4.3 s) |
| 28 | A | `move__medium_jump_ua_f` | air | 0.3 | — | — | Jump takeoff (0.33 s, root lunges 1 m along -X and rises 0.4 m) |
| 29 | A | `quest__rampart_quest_happy_r` | freeze / expression | single frame | — | — | Happy (right-facing version), smugger smile |
| 30 | A | `quest__rampart_quest_surprised_r` | freeze / expression | single frame | — | — | Surprised (right-facing version), hands drawn to the chest |
| 31 | A | `quest__rampart_quest_angry_r` | freeze / expression | single frame | — | — | Angry (right-facing version) |
| 32 | A | `emote__rampart_ground_emote_mechbull` | performance | 8.2 | — | turret_lobby | Rides a deployed Sheila like a mechanical bull, thrown all over the place (8.2 s) |
| 33 | A | `lobby__rampart_s10e01_action` | idle fidget | 11.2 | whole | — | Light weight shifts and head turns on the same stance as s10e01_idle (11 s), start/end 0.5° |
| 34 | A | `move__medium_float_ua_f` | air | 1.6 | — | — | Airborne hang time (1.6 s), arms out, legs tucked |
| 35 | A | `sheila__rampart_idle_mobilehmg` | reaction | 11.8 | 2.8–6.97 | w_turret | Combat idle holding Sheila at the hip (11.8 s) |
| 36 | A | `skydive__rampart_freefall` | air | 8.0 | 2.87–7.07 | — | Skydive freefall: belly down, limbs spread (8 s; 2.9–7.1 s loops at 2.4°) |
| 37 | A | `quest__rampart_quest_sad_l` | freeze / expression | single frame | — | — | Sad: head down, eyes lowered, hands clasped |
| 38 | A | `quest__rampart_quest_sad_r` | freeze / expression | single frame | — | — | Sad (right-facing version) |
| 39 | A | `emote__rampart_freefall_emote_backflip` | air | 3.6 | whole | bubblegum | Midair backflip while blowing a bubble (3.6 s, bubble at 0.9–1.6 s), start/end 0.2° (both belly down) |
| 40 | A | `gladcard__rampart_gladcard_static_peace` | freeze / expression | single frame | — | — | Crouching peace sign (single-frame pose) |
| 41 | A | `gladcard__rampart_gladcard_static_wink` | freeze / expression | single frame | — | bubblegum | Standing pose blowing a bubble (single frame, with the bubblegum prop); the banner is the wink one, but the wink has to be procedural |
| 42 | A | `lobby__rampart_poi_mythic_weapon_flatline` | idle fidget | 18.8 | — | — | Standing and talking to the camera with gestures (18.8 s; mouth, brows and eyes all move), start/end 3.4° |
| 43 | A | `melee__rampart_land_wrench` | air | 1.0 | — | heirloom_v21_wrench_w | Another landing cushion (1 s, deeper crouch, hands on knees) |
| 44 | A | `quest__rampart_quest_fearful_l` | freeze / expression | single frame | — | — | Fearful: brows raised, grimace, shoulders hunched |
| 45 | A | `quest__rampart_quest_fearful_r` | freeze / expression | single frame | — | — | Fearful (right-facing version) |
| 46 | A | `quest__rampart_quest_neutral_l` | freeze / expression | single frame | — | — | Neutral: hands on hips, slight smile |
| 47 | A | `quest__rampart_quest_neutral_r` | freeze / expression | single frame | — | — | Neutral (right-facing version) |

## Grade B (usable, but flawed or too niche)

- `move__rampart_walk_ua_f`: empty-handed run loop (1.9 s, actually a jog, root speed about 4.4 m/s)
- `emote__rampart_ground_emote_turretspin`: deploys Sheila, sits on it and spins (12.4 s)
- `lobby__rampart_mythic_weapon_tease_s27`: another talk + gestures clip (18.5 s), turns to look behind midway
- `move__rampart_idleloot_ua`: empty-handed idle while looting (27.8 s, start/end 0.7°): looks at her hands, checks pockets, makes a fist
- `move__rampart_walk_rifle_f`: walking with a rifle (3.8 s), 0–3.23 s loops at 1.9°, steady gait, but both hands hold a gun that is not there
- `sheila__pilot_rampart_turret_reload.001`: stands behind a deployed Sheila and reloads it (8.7 s)
- `skydive__rampart_anticipate`: pre-skydive ready pose: crouched, one leg hanging, arms spread (4 s loop at 0.1°)
- `emote__rampart_ground_emote_yoga_loop`: holding a handstand + blowing a bubble (5.4 s, start/end 0.3°, bubble at 0.43–1.53 s)
- `move__rampart_crouchloot_ua`: rummaging while crouched (17.6 s, start/end 0.3°), leaning forward, hands reaching to the ground
- `sheila__rampart_walk_mobilehmg_f`: walking with Sheila at the hip (2.2 s), start/end 4.5°
- `skydive__rampart_anticipate_to_freefall`: leaps out of the ready pose into belly-down (1.3 s), last frame is 40° from freefall
- `emote__rampart_ground_emote_smokebomb`: ninja smoke bomb: draws a katana and strikes a stance, throws smoke, turns (9.6 s), a bubble stays on her lips throughout 2.4–7.2 s
- `execution__rampart_execution_overkill`: finisher: swings Sheila, deploys it, raises a hand and waves at 4.2–5.4 s (the only clip close to "waving hello")
- `execution__rampart_victim_mirage_execution_base`: finisher victim: kneeling, falls backward at 3.3–4.1 s, then lies still
- `gladcard__rampart_gladcard_static_lookingup`: Sheila on her shoulder, looking up at the sky (single frame)
- `lobby__rampart_confirmation_select`: hops backward and lies down on a sideways Sheila with feet up (6.6 s); the end pose floats about 0.5 m up (Sheila as a bench)
- `lobby__rampart_menu_lobby_refresh_center_idle`: freeze pose standing on one leg (other knee raised), hand on hip; 24.6 s with almost no motion, no face animation
- `move__rampart_crouch_rifle_bubble`: crouched bubble blowing (13.6 s, start/end 0.1°, two bubbles at 7.7–12.3 s), but the hands are in a rifle grip and look empty without a gun
- `move__rampart_sprint_ua_f`: sprint (1.9 s, native 23 fps), leaning forward with long strides
- `sheila__rampart_ziplineidle_turret`: same hanging motion as ziplineidle_wrench (5.7 s), start/end 2.7°, 3.87–5.57 loops at 0.01°
- `skydive__rampart_updraft_downed`: lifted by an updraft while downed: body limp, floating on her side (8 s loop at 0.6°)
- `execution__rampart_victim_revenant_execution_lurk`: finisher victim: scoots back on the ground, terrified, dragged down flat after 3.9 s
- `gladcard__rampart_gladcard_animated_fixing_idle`: end pose of fixing: kneeling with Sheila (single frame)
- `gladcard__rampart_gladcard_animated_rainingbullets`: sprays with Sheila, shell casings flying (3.4 s)
- `gladcard__rampart_gladcard_static_bigsheila`: posing with Sheila in both hands (single frame)
- `lobby__rampart_confirmation_select_idle`: end pose of the previous one (lying on Sheila), single frame
- `lobby__rampart_menu_lobby_refresh_pose01_intro`: 1.5 s: crouches, then lifts a leg into the one-legged pose above
- `melee__rampart_idle_stand_karambit`: standing idle while holding a knife (28.9 s); body motion similar to idle_ua but no bubbles and the hand is in a knife grip
- `melee__rampart_meleedoor_wrench`: door kick (1.5 s): one raised-leg kick
- `melee__rampart_meleestand_wrench_01`: swings the wrench in place (1.1 s)
- `move__rampart_slide_ua`: slide: dives forward and slides on one knee, holds the slide pose after 1.2 s
- `skydive__rampart_gravity_lift_wrench`: rising in a gravity lift (1.6 s), floating upright, wrench in hand
- `emote__rampart_freefall_emote_genericflip`: midair forward roll (3.4 s, 35 fps)
- `lobby__rampart_menu_loot_ceremony`: standing with both hands on hips (single frame), 13° from select_idle
- `lobby__rampart_menu_select_readyup`: jumps onto the seat of a deployed Sheila and spins around (6 s), overall facing turns 145°
- `melee__rampart_meleestand_wrench_02`: another wrench swing (1.1 s) with a bigger turn (facing +68°), root travels 2.8 m
- `move__medium_land_ua_f_sprinting`: landing mid-sprint (1 s), forward cushion
- `move__rampart_idle_rifle_twitch`: fidget from the rifle idle (13.3 s, shoulder rolls, tiptoes), both hands holding a gun that is not there
- `sheila__rampart_crouch_mobilehmg`: crouched with Sheila (7 s), 2.8–5.5 loops at 2.2°
- `sheila__rampart_doublejump_mobilehmg_f`: double jump holding Sheila (0.6 s), legs tucked
- `sheila__rampart_ziprailride_turret`: crouched ride on a zip rail (8.8 s), one hand raised gripping the rail, legs swinging with momentum
- `emote__rampart_freefall_emote_surfing`: surfing on a shield wall (8.6 s); she and the wall fly around within 5 m, overall turn of 360°
- `lobby__rampart_menu_lobby_left_idle`: hands on hips, facing 30° right (single frame), with the tripod prop

## Grade C (reviewed, not recommended)

- `emote__rampart_freefall_emote_booster`: rides Sheila like a jet (5.6 s); the Sheila prop is visible only in some frames, she flies around within 4 m
- `emote__rampart_freefall_emote_turretride`: rides Sheila in midair (9.3 s); the prop animation only lines up when stretched 1.1475x, and in renders the prop often separates from her
- `gladcard__rampart_gladcard_animated_gum_idle`: end pose of the gum banner (single frame)
- `gladcard__rampart_gladcard_animated_myfavorite_idle`: end pose of myfavorite (single frame)
- `gladcard__rampart_gladcard_animated_revup_idle`: end pose of revup: deployed gun (single frame)
- `lobby__rampart_menu_select`: sits in Sheila's gunner seat and grips the handles (1.5 s); needs a deployed Sheila
- `melee__rampart_jump_wrench_f`: basically the same takeoff as medium_jump_ua_f, wrench in hand
- `move__rampart_idle_rifle`: standing rifle idle (9.1 s, start/end 0.1°); natural breathing, but both hands cradle an invisible gun, which looks odd at a glance
- `skydive__rampart_freefall_to_anticipate`: from belly-down back to the ready pose (1.3 s), not very useful
- `execution__rampart_execution_begging`: finisher: smashes the opponent with Sheila, stomps, blows a bubble at the end (5.8 s)
- `gladcard__rampart_gladcard_animated_heirloom`: heirloom wrench banner (4.5 s): stands next to Sheila, then crouches
- `gladcard__rampart_gladcard_animated_heirloom_idle`: end pose of heirloom (single frame), she crouches far away
- `gladcard__rampart_gladcard_animated_rainingbullets_idle`: end pose of rainingbullets (single frame)
- `gladcard__rampart_gladcard_static_fireaway`: sitting on a deployed Sheila, firing (single frame); needs the prop
- `gladcard__rampart_gladcard_static_friend`: hiding behind a loot bin (single frame); the loot bin prop hides her completely
- `gladcard__rampart_gladcard_static_gunjump`: jumping with Sheila held up (single frame), Sheila upright above her head
- `gladcard__rampart_gladcard_static_mechanic`: lying on a shield wall fixing a drone (single frame); needs two props, the wall and Lifeline's drone
- `gladcard__rampart_gladcard_static_sittinggun`: sitting on Sheila (single frame); needs the prop, she floats in the air
- `gladcard__rampart_gladcard_static_taunting`: leaning behind a shield wall, taunting (single frame); the wall prop hides most of her
- `lobby__rampart_menu_lobby_right_idle`: leaning forward holding Sheila (single frame); the tripod prop behind her clips through
- `lobby__rampart_menu_select_idle`: hold pose of the previous one (0.3 s)
- `melee__ragold_sword_sprint_carry`: sprint carrying a big sword (2.3 s, 23 fps), root travels 11 m
- `melee__rampart_idle_crouch_karambit`: crouch idle holding a knife (37.4 s); body almost the same as crouch_ua (first frame 5.6° off), but no bubbles
- `move__rampart_crouch_rifle_twitch`: crouched rifle fidget (6 s)
- `move__rampart_crouchloot_rifle`: crouched looting with a rifle (19.6 s)
- `move__rampart_idle_pistol_twitch_ads`: fidget while aiming (7.9 s), empty gun grip
- `move__rampart_idle_rifle_ads`: aim-down-sights idle (14.6 s), also holding an empty gun grip
- `move__rampart_idleloot_rifle`: rifle idle while looting (16.7 s)
- `move__rampart_slidefloat_rifle`: airborne slide (1.8 s), rifle grip
- `sheila__pilot_rampart_turret_draw.001`: walks up behind a deployed Sheila and grips it (1.8 s); needs the prop
- `skydive__rampart_freefall_p12`: one of the freefall direction variants (one cell of the blend space), much the same as freefall
- `skydive__rampart_freefall_dive`: head-down dive (8 s); from the front only the top of the head and Sheila are visible, not good-looking
- `sheila__pilot_rampart_turret_idle_layer.001`: additive layer; played alone she lies sideways (root not upright), cannot be used on its own
- `sheila__rampart_ultimate_draw`: upper-body layer for drawing Sheila; played alone she lies sideways, skeleton data incomplete
- `sheila__rampart_ultimate_place`: upper-body layer for placing Sheila; same as above, lying sideways

These are **not in clips.json**:

- `aim/*` (408) and the various `*_fire`, `*_ads` additive layers: aim / fire additive poses, single frames, distorted when played alone.
- `sheila/pilot_rampart_turret_*` (without `.001`) and others, 26 actions in 70-bone versions: same-named actions for other legends' skeletons that drive only 70 bones and cannot be used on the Rampart skeleton.
- Heirloom wrench inspect / draw (`inspect_*`, `draw_kiss`, `draw_tada`, `meleeraise_*` etc.): only on the first-person arm skeleton (ptpov), not imported into the blend, unusable in third person.
- `gladcard/*_light`: banner light animations, no bone channels. `droppod/*`: the drop pod's own animations.
- `lobby/confirmation_camera_*`, `misc/rampart_face_hair_additive`: camera animations / a single-frame additive layer.
- `wall/rampart_idle_wall`, `wall/rampart_crouch_wall`, `wall/*walk*` etc.: body data identical to the `move/*_ua` versions (holding the shield wall), listed in the matching entries' `duplicates`.
- `melee/rampart_idle_wrench`, `melee/rampart_lootidle_wrench`, `melee/rampart_crouch_wrench`: body identical to `move/rampart_idle_ua` / `idleloot_ua` / `crouch_ua`, only the hand shape differs (wrench grip, wrists ≤ 7.5 cm apart), and no bubble gum prop paired.
- `lobby/rampart_menu_lobby_center_idle` (and `#1`, `#2`), `lobby/rampart_confirmation_select_hover`: equal to select_idle, gunrev and weld respectively, only the prop pairing differs.

## Not in the game (needs combinations / the procedural layer)

| Want | Status | Suggestion |
|---|---|---|
| Sleeping, yawning | none | chillaxing_loop + procedural eye closing, no bubbles; the raised arms in `fixing` 1.2–1.9 and `yoga` 0.4–1.6 as a stretch |
| Waving hello | only `execution__rampart_execution_overkill` 4.2–5.4 raises a hand once (violent motion around it) | cut those 1.2 s, or add a procedural arm wave |
| Getting hit, stumbling, being downed, bleeding out, revive | not in the Rampart-specific package (they are in the generic mp_pilot animations, not extracted) | flung away -> `quest__…_fearful` expression + `updraft_downed` limp float + land; playing dead -> mirage victim 3.3–5.3 |
| Laughing | none | `quest__…_happy_*` expression + taunt |
| Pointing | `move__rampart_idle_ua` 32.6–34.6 points ahead | |

## Technical notes for export / rendering

1. **Units and facing**: meters; Z up; facing yaw is 0 when "facing -Y (straight at the Blender front view)", counterclockwise seen from above is positive. Clips start with different facings
   (lobby clips about -29°, idle_ua -5°, quest expressions ±30°); `facing_start_deg` gives each clip's value; rotate the root to face the screen when rendering.
   `hip_start_m` is the starting hip position; in lobby clips she is not at the origin (select_idle hip at (-0.07, 0.21)), so translate that back too.
2. **Root translation**: in clips with `root_motion=true` (walk/run/jump, finishers, the igc entrance) the root bone `jx_c_delta` carries translation; `root_travel_m` is the start-to-end difference.
   In the pet, except for the vertical drop of the igc entrance, strip the horizontal translation and move the window procedurally.
3. **Frame rate**: each native frame in the blend = 1 Blender frame (scene at 30 fps). Clips not natively 30 fps (gum banner 31, genericflip 35, sprint 23)
   need speed adjusted by `time_scale = fps / 30`. The fps=3 for walk/run in the index is wrong (a playback rate computed from travel); play at 30.
4. **Seams**: `loop_seam_deg` = mean angle difference of the local rotations of 23 core bones (hip, spine, neck, head, limbs) between the first and last frame; `loop_seam_max_deg` is the max.
   In native loops the last frame equals the first, so `LoopRepeat` works directly.
5. **Joining clips** (`transitions` field; fewer degrees is smoother; < 6° can hard-cut, otherwise use a 0.3–0.5 s crossfade):
   - select_idle ↔ weld / gunrev: 0.5–0.7°, same family, can hard-cut
   - s10e01_idle ↔ s10e01_action: 0.1–0.5°
   - chillaxing last frame -> chillaxing_loop first frame: 0.2°
   - other standing clips are usually 12–25° apart; standing ↔ crouching about 50°; standing ↔ lounge chair / airborne 40–70° (needs a transition clip or a longer fade)
   - full matrix: `<work>/clips/transitions_raw.json` (pairwise end/start distances of 128 clips + per-frame best entry points for 12 base poses)
6. **Props** (`prop_actions` field = prop rig, prop action, attach point, time stretch, from `prop_pairs.json`):
   - `rampart_bubblegum`: bubble size = `bubblegumCore` scale × `def_c_base` scale. **When not blowing a bubble it stays as a small pink ball between her lips and moves with the chewing** (confirmed in close-ups),
     so clips paired with it should always show it. The attach point is mostly REF (`jx_c_start`); idle_ua / crouch_ua / crouch_rifle_bubble use HEADSHOT (`def_c_head`).
     `bubble_ranges_s` are the time ranges where the scale exceeds "10th percentile + 15% of the amplitude" (bubbles that really inflate).
   - `rampart_turret_lobby`: the lobby Sheila with the tripod. In select_idle it is just the tripod behind her (can be hidden); in weld / gunrev / chillaxing /
     panicdance / mechbull / revup the Sheila in her hands or under her is this prop, and the one on her back (`rampart_*_acc_sheila`) must be hidden, or there will be two.
   - `w_rampart_turret`: Sheila held at the hip (`*_mobilehmg`), attached to `ja_c_propGun`; also hide the one on her back.
   - boombox, goldenhorse and yoga have no props: the Sheila on her shoulder / in her hands is the one from her back, moved there by the `def_c_turret` bone chain.
   - In some clips where Sheila is swapped for the prop, the game moves the back Sheila's bones about 4 m underground (mechbull, heirloom, rainingbullets); `bbox_m` is recomputed from the body.
   - The heirloom wrench banner's prop action has only 1 frame (the index says 136); it was missing at extraction, so the wrench does not move.
7. **Skeleton differences**: the animations were imported on the HP skin skeleton (206 bones). The base skin adds the ponytail chain `def_c_ponytail01..07`, and **no animation drives the ponytail**,
   so it needs spring physics. The 108 face bones are animated in most lobby / expression clips (`face_anim`); the two s10e01 clips, refresh_center_idle and
   all locomotion / airborne clips have a still face and need procedural blinking.
8. **`gum_chew`**: detects a 1–4 Hz jaw rhythm and cannot tell chewing from talking; flatline / tease_s27 / igc were manually set to false (they are voice lines).
   A head close-up confirmed that select_idle is chewing (the `_face` frames are in `_frames/lobby__rampart_menu_lobby_select_idle_face/`).
9. **Multi-part rseqs** (action names with `#n`): in lobby / banner / freefall clips the `#n` are mostly copies of another standalone action (see each entry's `duplicates`);
   in locomotion the `#n` are direction / aim variants of a blend space.

## clips.json fields

| Field | Meaning |
|---|---|
| `action` / `clip_id` | action name in the blend; clip_id = `/` replaced by `__`, `#` replaced by `_p` |
| `duration_s`, `frames`, `fps`, `time_scale` | duration is computed at the native fps; `time_scale` = fps / 30 |
| `tier`, `role`, `posture`, `posture_detail` | manual grade and role; posture is one of standing / crouching / sitting / lying / airborne |
| `loop_seam_deg`, `loop_seam_max_deg`, `loopable`, `loop_range_s`, `loop_range_seam_deg` | see item 4 above |
| `root_travel_m`, `root_range_m`, `hip_travel_m`, `hip_range_m`, `root_motion`, `hip_start_m`, `facing_start_deg`, `yaw_deg` | root / hip start-to-end travel and range over the clip, whether there is root motion, start hip position, start facing, total facing change (unwrapped) |
| `bbox_m` | world bounding box of the bone key points over the clip (head top estimated at +0.2 m, fingers, feet, Sheila bones); the mesh itself extends about 0.15 m further |
| `face_anim`, `gum_chew`, `chew_ranges_s`, `bubble_ranges_s` | facial animation / chewing / bubbles |
| `props`, `prop_actions` | paired props |
| `segments` | manual segments `{name, range_s, note}` |
| `transitions` | best enter / exit times and pose differences against the 5 base poses (select_idle, s10e01_idle, idle_ua, crouch_ua, chillaxing_loop) (S/A only) |
| `duplicates` | other actions with (almost) identical data |
| `issues`, `notes` | known issues, one-line description |
| `preview` | paths of the thumbnail sheet / mp4 / one-tile-per-second timeline / expression close-up (under `<work>/clips/`) |

## Rerunning

Scripts are in `data/curate/`. Blender scripts are run as:
`<blender> -b <asset_root>/models/anims/rampart_hp_anims.blend --python <script> -- <args>`
(`<blender>` is the `blender` entry of `assets.json`.)

1. `measure_clips.py <metrics dir>`: measures all full-body actions (about 3 minutes; existing ones are skipped)
2. Edit `candidates.txt` -> `python make_render_list.py <metrics> <render_list.json>`
3. `render_clips.py <render_list.json> <frames dir>` (EEVEE, three-point lighting, front 3/4 orthographic camera; about 13 minutes for 140 clips) -> `python compose_clips.py <frames dir> <preview dir>`
4. `chain_poses.py <chain_in.json> <transitions_raw.json>`: pose differences between clips, and between clips and base poses
5. `loop_window.py <jobs.json> <out.json>`: finds a loop sub-range inside a given time window, or the times that return to a reference pose
6. After reviewing the images, edit `annotations.py`, then `python build_catalog.py <metrics> <preview dir> <transitions_raw.json>` generates `clips.json`;
   `python overview.py <frames dir> <png>` makes the overview image
