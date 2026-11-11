# Manual annotations: grade, role and segments written after watching the renders (<work>/clips/*.png|mp4).
# Numbers (duration, seam, travel, bubble ranges...) are measured by measure_clips.py and merged by build_catalog.py.
# tier: S core, must use / A worth using / B usable but flawed or too niche / C reviewed, not recommended (reason given)
# segment times are in seconds from the start of the action; loop_range_s overrides the auto-found loop range
S, A, B, C = 'S', 'A', 'B', 'C'
seg = lambda name, a, b, note='': dict(name=name, range_s=[a, b], note=note)

ANN = {
    # ============================== Idle base poses ==============================
    'lobby/rampart_menu_lobby_select_idle': dict(
        tier=S, role='idle_base', rank=100, posture='standing',
        notes='One hand on hip, chewing gum, blows two bubbles, glances back over her shoulder midway; the 17 s loop closes perfectly (0.0°). Small motion, the most in-character clip. When not blowing a bubble, the bubble gum prop stays as a small pink ball between her lips and moves with the chewing, very lively up close. First choice for the standing idle base pose.',
        segments=[seg('chew', 0.0, 1.2, 'hand on hip, chewing'), seg('bubble_small', 1.27, 3.0, 'small bubble (bubble scale peak 1.0)'),
                  seg('chew_calm', 3.0, 6.8, 'nearly still, only chewing; 3.2–5.2 loops on its own (1.7°)'),
                  seg('glance_back', 6.8, 11.3, 'turns head to look behind (head vs chest +40°→-38°→back), another bubble at 8.2–9.6'),
                  seg('settle', 11.3, 17.03, 'back to center, nearly still; 14.4–16.9 loops on its own (2.7°)')],
        issues=['The paired prop rampart_turret_lobby is only the tripod behind her; better hidden in the pet. The Sheila on her back is driven by the character bone def_c_turret and does not need the prop']),
    'lobby/rampart_s10e01_idle': dict(
        tier=S, role='idle_base', rank=90, posture='standing',
        notes='The cleanest neutral standing breathing loop (2 s, seam 0.2°); face bones do not move at all. Good base pose for the procedural layer (gaze following the mouse, blinking, expression overlays), or as a "back to neutral" pose between long clips.',
        issues=['No face animation at all; needs procedural blinking']),
    'move/rampart_idle_ua': dict(
        tier=S, role='idle_fidget', rank=95, posture='standing',
        notes='The in-game empty-handed idle long take (54 s); start and end match (0.5°). It contains a string of fidgets: big bubble, looking around, swinging Sheila down to inspect it and putting it back, touching her hair, pointing ahead, gesturing. Usable whole as an "active idle", but better cut into separate idle fidgets by the segments below and triggered at random.',
        segments=[seg('neutral', 0.0, 3.0, 'weight on one leg, arms relaxed'), seg('bubble_small', 3.07, 4.1),
                  seg('bubble_big', 4.4, 7.9, 'big bubble, largest around 7 s (scale 1.3), pops at 7.6 s'),
                  seg('look_around', 8.0, 14.8, 'shifts weight, looks left and right (head vs chest ±40°)'), seg('bubble_small', 14.87, 15.93),
                  seg('sheila_inspect', 16.2, 27.6, 'swings Sheila off her back, holds it overhead to inspect, puts it back; the biggest motion (angular speed peak 100°/s)'),
                  seg('hair_touch', 28.0, 32.4, 'raises a hand to touch / scratch her hair, small bubble at 29.2–30.2'),
                  seg('point', 32.6, 34.6, 'points ahead (usable as "look over there")'),
                  seg('bubble_big', 35.2, 40.0, 'another big bubble (largest at 37 s), a small one at 39 s'),
                  seg('gesture', 41.0, 48.8, 'one open hand gesturing, as if talking; chewing at 46–49.5 s'),
                  seg('look_back', 48.8, 50.6, 'looks back over her shoulder'), seg('settle', 50.6, 54.3, 'returns to the start pose, small bubble at 52.7–53.8')],
        issues=['Never returns to the start pose midway (except within the first 0.5 s); playing cut segments needs a 0.3–0.5 s crossfade', 'The bubble prop is attached to the head bone (HEADSHOT)']),
    'move/rampart_crouch_ua': dict(
        tier=A, role='idle_base', rank=80, posture='crouching',
        notes='Deep crouch idle (37 s, start/end 0.3°): blows two big bubbles while crouching, looks around, props one hand on the ground and stretches an arm. Good base pose for "crouching on top of a window / on the taskbar", more critter-like than standing.',
        segments=[seg('crouch_calm', 0.0, 4.5), seg('bubble_big', 4.6, 9.8, 'bubble largest around 9 s (1.3)'),
                  seg('look_around', 10.0, 16.5, 'looks left and right; 10.8–12.8 loops on its own (4.5°)'),
                  seg('fidget', 16.8, 28.5, 'one hand on the ground, raises a hand (hand above head at 24–26 s), waves'),
                  seg('bubble', 29.5, 34.0, 'small bubble at 29.7–30.6, big bubble at 32.2–33.9'), seg('settle', 34.0, 37.3)],
        issues=['The bubble prop is attached to the head bone (HEADSHOT)']),

    # ============================== Idle fidgets ==============================
    'gladcard/rampart_gladcard_animated_gum': dict(
        tier=A, role='idle_fidget', rank=70, posture='standing',
        notes='Banner pose "gum": spins in place with a kick, unwraps a stick of gum and pops it in her mouth, ends with a bubble (3.6–4.2 s). 4 s and lively, good as a "perk up" idle fidget.',
        segments=[seg('spin_kick', 0.3, 2.8), seg('gum_pop', 2.8, 4.16, 'unwraps gum (prop rampart_gum) + blows a bubble')],
        issues=['Native 31 fps: play with time_scale 1.033', 'End pose is more than 30° from the standing base pose; returning to idle needs a crossfade']),
    'gladcard/rampart_gladcard_animated_myfavorite': dict(
        tier=A, role='idle_fidget', rank=60, posture='standing',
        notes='Looks down at the rifle in her right hand and nods, pleased ("my favorite" = this gun); has facial animation. 4 s, small and quiet.',
        issues=['The rifle in her right hand is spawned by the RSEQ animation event AE_CL_CREATE_PROP (flatline_base_w, attached to R_HAND) and is not in the prop pairs; without it she grips an empty fist. The pet does not export weapons; dropped from the bored pool on 2026-09-26']),
    'lobby/rampart_s10e01_action': dict(
        tier=A, role='idle_fidget', rank=55, posture='standing',
        notes='Light weight shifts and head turns on the same stance as s10e01_idle (11 s), start/end 0.5°. Face does not move. Can alternate with s10e01_idle for a "quiet idle".'),
    'lobby/rampart_poi_mythic_weapon_flatline': dict(
        tier=A, role='idle_fidget', rank=50, posture='standing',
        notes='Standing and talking to the camera with hand gestures (18.8 s; mouth, brows and eyes all move), start/end 3.4°. Good "talking" clip for a speech bubble.',
        gum_chew=False,
        issues=['The mouth shapes belong to a specific voice line; with other lines it only reads as "talking"']),
    'lobby/rampart_mythic_weapon_tease_s27': dict(
        tier=B, role='idle_fidget', rank=40, posture='standing',
        notes='Another talk + gestures clip (18.5 s), turns to look behind midway. Seam 25°, can only play once through.', gum_chew=False),
    'move/rampart_idleloot_ua': dict(
        tier=B, role='idle_fidget', rank=40, posture='standing',
        notes='Empty-handed idle while looting (27.8 s, start/end 0.7°): looks down at her hands, checks pockets, makes a fist. Flatter than idle_ua, usable as filler.'),
    'move/rampart_crouchloot_ua': dict(
        tier=B, role='idle_fidget', rank=35, posture='crouching',
        notes='Rummaging while crouched (17.6 s, start/end 0.3°), leaning forward, hands reaching to the ground. Can be mixed in while "crouching on top of a window".'),
    'move/rampart_crouch_rifle_bubble': dict(
        tier=B, role='idle_fidget', rank=30, posture='crouching',
        notes='Crouched bubble blowing (13.6 s, start/end 0.1°, two bubbles at 7.7–12.3 s), but the hands are in a rifle grip and look empty without a gun.'),
    'melee/rampart_idle_stand_karambit': dict(
        tier=B, role='idle_fidget', rank=25, posture='standing',
        notes='Standing idle while holding a knife (28.9 s); body motion similar to idle_ua but no bubbles and the hand is in a knife grip. No knife prop, so the hand shape looks a bit off.'),
    'move/rampart_idle_rifle_twitch': dict(
        tier=B, role='idle_fidget', rank=20, posture='standing',
        notes='Fidget from the rifle idle (13.3 s, shoulder rolls, tiptoes), both hands holding a gun that is not there.'),

    # ============================== Work (while typing) ==============================
    'lobby/rampart_menu_lobby_center_idle_weld': dict(
        tier=S, role='work', rank=95, posture='standing',
        notes='Takes Sheila off the tripod, holds it upright and welds it with a welding torch, puts it back (23.6 s, start/end 0.1°). The middle 5.6–19 s is focused work: the best material for "she works while the user types / codes".',
        segments=[seg('stand', 0.0, 1.8, 'same as the select_idle start pose (0.6°), joins seamlessly'),
                  seg('grab_sheila', 1.8, 5.6, 'grabs Sheila off the tripod behind her'),
                  seg('welding', 5.6, 19.0, 'welds while holding Sheila; 9.7–12.87 loops (3.5°)'),
                  seg('put_back', 19.0, 22.3), seg('stand', 22.3, 23.6)],
        loop_range_s=[9.7, 12.87], loop_range_seam_deg=3.5,
        issues=['Needs the props rampart_turret_lobby (the Sheila in her hands is this prop) and welder; the Sheila on her back must be hidden meanwhile']),
    'gladcard/rampart_gladcard_animated_fixing': dict(
        tier=A, role='work', rank=70, posture='crouching',
        notes='Kneels on one knee tinkering, raises both arms for a stretch at 1.3–1.9 s, then picks up Sheila (3.1 s). The stretch fits "tired from work" well.',
        segments=[seg('tinker', 0.0, 1.2, 'kneeling, tinkering'), seg('stretch', 1.2, 1.9, 'arms over head, stretching'), seg('cradle_sheila', 1.9, 3.1)],
        issues=['The end pose (fixing_idle) is kneeling with Sheila, 30°+ away from the standing base pose']),
    'sheila/pilot_rampart_turret_reload.001': dict(
        tier=B, role='work', rank=40, posture='standing',
        notes='Stands behind a deployed Sheila and reloads it (8.7 s). Usable as "working", but needs an extra deployed Sheila, and the face barely moves.',
        issues=['The same-named version without .001 is on the 70-bone generic skeleton and cannot be used']),

    # ============================== Reactions ==============================
    'emote/rampart_ground_emote_taunt': dict(
        tier=S, role='reaction', rank=90, posture='standing',
        notes='Beckons "come at me", hand on hip, turns away (6.3 s, has facial animation). Fits her cheeky attitude best; good response to a click / poke.',
        segments=[seg('beckon', 0.5, 1.8, 'reaches out and beckons'), seg('smug', 1.8, 4.0, 'stands smugly'), seg('turn_away', 4.0, 6.3, 'turns away (facing -35°)')],
        issues=['Ends facing 35° off; rotate the root to compensate when returning to the base pose']),
    'emote/goldenhorse_rampart_celebration': dict(
        tier=A, role='reaction', rank=70, posture='standing',
        notes='Repeated fist-pump cheering (0.5–3.9 s), then stands holding Sheila. The first half is a great "excited / success" reaction.',
        segments=[seg('fist_pump', 0.5, 3.9, 'fist-pump celebration'), seg('stand_hold', 3.9, 11.3, 'stands holding Sheila in front of her, mostly still')],
        issues=['Facing turns -82° in the second half']),
    'lobby/rampart_menu_lobby_center_idle_gunrev': dict(
        tier=A, role='reaction', rank=65, posture='standing',
        notes='Lifts Sheila off the tripod overhead, chews and blows a bubble, swings it around to spin the barrels, puts it back (8.5 s, start/end 0.0°, same start as select_idle). A "show off" / excited reaction for very fast typing speed.',
        segments=[seg('lift', 0.8, 2.3), seg('hold_overhead', 2.3, 5.0, 'holds Sheila up, bubble at 3.8–5.0'), seg('rev_swing', 5.0, 7.4), seg('return', 7.4, 8.5)],
        issues=['Needs the rampart_turret_lobby prop; held overhead, Sheila extends about 1 m beyond the character bounding box']),
    'gladcard/rampart_gladcard_animated_revup': dict(
        tier=A, role='reaction', rank=60, posture='standing',
        notes='Crouches holding Sheila to wind up, jumps, lands and sets Sheila down deployed (4.3 s). Short and punchy, good for "let\'s go!" reactions.',
        issues=['Needs the rampart_turret_lobby prop; ends in a deployed-gun pose that does not join the standing base pose']),
    'sheila/rampart_idle_mobilehmg': dict(
        tier=A, role='reaction', rank=55, posture='standing',
        notes='Combat idle holding Sheila at the hip (11.8 s). "Enter combat mode": e.g. switch to this when the user is detected playing a game or in fullscreen. Start/end 7°, 3.8–7.0 loops (3.8°).',
        loop_range_s=[2.8, 6.97], loop_range_seam_deg=3.77,
        issues=['The Sheila in her hands is the prop w_rampart_turret (attached to ja_c_propGun); hide the one on her back or there will be two', 'Face does not move']),
    'gladcard/rampart_gladcard_static_peace': dict(
        tier=A, role='pose', rank=50, posture='crouching',
        notes='Crouching peace sign (single-frame pose). After a click: fade in 0.3 s, hold 1.5 s, fade out; a cute "photo" reaction.'),
    'gladcard/rampart_gladcard_static_wink': dict(
        tier=A, role='pose', rank=50, posture='standing',
        notes='Standing pose blowing a bubble (single frame, with the bubblegum prop). The banner is the wink one, but the wink has to be procedural. Usable as a "posing" reaction.'),
    'execution/rampart_execution_overkill': dict(
        tier=B, role='reaction', rank=30, posture='standing',
        notes='Finisher: swings Sheila, deploys it, raises a hand and waves at 4.2–5.4 s (the only clip close to "waving hello"). The rest is violent; root travels 1.2 m and turns 75°.',
        segments=[seg('deploy', 0.3, 1.6), seg('wave', 4.2, 5.4, 'raises a hand and waves; can be cut out as a greeting')]),
    'execution/rampart_victim_mirage_execution_base': dict(
        tier=B, role='reaction', rank=30, posture='lying',
        notes='Finisher victim: kneeling, falls backward at 3.3–4.1 s, then lies still. Cutting "fall + lie flat" works as a funny "knocked out / playing dead" reaction.',
        segments=[seg('kneel', 0.0, 3.3, 'kneeling'), seg('collapse', 3.3, 4.1, 'falls backward'), seg('lie_still', 4.1, 5.3, 'lies flat')],
        issues=['Originally paired with the attacker\'s animation; on its own she falls for no reason; no face animation']),
    'execution/rampart_victim_revenant_execution_lurk': dict(
        tier=B, role='reaction', rank=25, posture='sitting',
        notes='Finisher victim: scoots back on the ground, terrified, dragged down flat after 3.9 s. 0–3.9 s works as "startled and falls on her butt".',
        segments=[seg('scoot_back', 0.0, 1.5, 'scoots back while sitting'), seg('sit_scared', 1.5, 3.9), seg('collapse', 3.9, 4.5), seg('lie', 4.5, 5.63)],
        issues=['Root travels 0.9 m, facing turns 49°']),
    'melee/rampart_meleestand_wrench_01': dict(
        tier=B, role='reaction', rank=25, posture='standing',
        notes='Swings the wrench in place (1.1 s). Could be "hitting the window / the taskbar", but the root lunges forward 2.3 m and that translation must be removed.'),
    'melee/rampart_meleestand_wrench_02': dict(
        tier=B, role='reaction', rank=20, posture='standing',
        notes='Another wrench swing (1.1 s) with a bigger turn (facing +68°), root travels 2.8 m.'),
    'melee/rampart_meleedoor_wrench': dict(
        tier=B, role='reaction', rank=25, posture='standing',
        notes='Door kick (1.5 s): one raised-leg kick. Could be "kicking the window"; the 1.65 m root translation must be removed.'),
    'lobby/rampart_menu_select_readyup': dict(
        tier=B, role='reaction', rank=20, posture='sitting',
        notes='Jumps onto the seat of a deployed Sheila and spins around (6 s), overall facing turns 145°. Fun but needs a deployed Sheila, and she faces away from the camera for a long stretch.'),

    # ============================== Expression library (single frames, face bones) ==============================
    'quest/rampart_quest_happy_l': dict(tier=S, role='pose', rank=80, posture='standing',
        notes='Happy: head tilted, big grin, relaxed hands. Single-frame full body + face pose; in the pet, take only the 108 face bones and overlay them on the current clip as an expression. _l / _r are the left- and right-facing versions.'),
    'quest/rampart_quest_surprised_l': dict(tier=S, role='pose', rank=78, posture='standing',
        notes='Surprised: wide eyes, open mouth, hands raised. Expression for a sudden click / a fast mouse fling.'),
    'quest/rampart_quest_angry_l': dict(tier=S, role='pose', rank=76, posture='standing',
        notes='Angry: frown, gritted teeth, both fists up. For repeated pokes / being dragged too long.'),
    'quest/rampart_quest_happy_r': dict(tier=A, role='pose', rank=60, posture='standing', notes='Happy (right-facing version), smugger smile.'),
    'quest/rampart_quest_surprised_r': dict(tier=A, role='pose', rank=58, posture='standing', notes='Surprised (right-facing version), hands drawn to the chest.'),
    'quest/rampart_quest_angry_r': dict(tier=A, role='pose', rank=56, posture='standing', notes='Angry (right-facing version).'),
    'quest/rampart_quest_sad_l': dict(tier=A, role='pose', rank=54, posture='standing', notes='Sad: head down, eyes lowered, hands clasped. For when she has been ignored for a long time.'),
    'quest/rampart_quest_sad_r': dict(tier=A, role='pose', rank=52, posture='standing', notes='Sad (right-facing version).'),
    'quest/rampart_quest_fearful_l': dict(tier=A, role='pose', rank=50, posture='standing', notes='Fearful: brows raised, grimace, shoulders hunched. Expression for being flung / falling.'),
    'quest/rampart_quest_fearful_r': dict(tier=A, role='pose', rank=48, posture='standing', notes='Fearful (right-facing version).'),
    'quest/rampart_quest_neutral_l': dict(tier=A, role='pose', rank=46, posture='standing', notes='Neutral: hands on hips, slight smile. The "zero" reference for expression overlays.'),
    'quest/rampart_quest_neutral_r': dict(tier=A, role='pose', rank=44, posture='standing', notes='Neutral (right-facing version).'),

    # ============================== Sleep / bored ==============================
    'emote/rampart_ground_emote_chillaxing_loop': dict(
        tier=S, role='sleep', rank=100, posture='sitting',
        notes='Uses Sheila as a lounge chair: hands behind her head, legs crossed, chewing gum, an occasional bubble (9.5 s, start/end 0.1°). There is no real sleep animation; this clip plus procedural eye closing is "napping / slacking off", and the best state for long periods without input.',
        segments=[seg('chew', 0.0, 1.37), seg('bubble', 1.37, 2.03), seg('chew', 2.03, 6.4), seg('bubble', 6.4, 7.07), seg('chew', 7.07, 9.5)],
        issues=['Needs the rampart_turret_lobby prop (it is the lounge chair); the Sheila on her back is hidden meanwhile', 'Fully off the ground: hip height 1.17 m, the prop tripod touches the ground']),
    'emote/rampart_ground_emote_chillaxing': dict(
        tier=S, role='transition', rank=95, posture='sitting',
        notes='Into the lounge chair: flips Sheila into a lounge chair, kicks off and hops on to lie down (3.9 s); the last frame is only 0.2° from the first frame of chillaxing_loop.',
        segments=[seg('flip_sheila', 0.0, 1.2), seg('hop_on', 1.2, 2.4, 'jumps and rolls over'), seg('settle', 2.4, 3.87)],
        issues=['No "get up from the lounge chair" clip: crossfade back to standing (0.5 s) or play this clip in reverse']),
    'emote/rampart_ground_emote_yoga': dict(
        tier=A, role='idle_fidget', rank=60, posture='standing',
        notes='Yoga: first raises both arms and lifts a knee (0.4–1.6 s, looks a lot like a stretch), then bends down into a handstand. The opening part works on its own as a "stretch".',
        segments=[seg('stretch_up', 0.4, 1.6, 'arms up + knee lift'), seg('fold', 1.6, 2.6), seg('into_handstand', 2.6, 5.1)]),
    'emote/rampart_ground_emote_yoga_loop': dict(
        tier=B, role='idle_fidget', rank=35, posture='standing', posture_detail='handstand',
        notes='Holding a handstand + blowing a bubble (5.4 s, start/end 0.3°, bubble at 0.43–1.53 s). Full of character, but upside down her face points down and the Sheila on her back covers her; hard to read at pet size.'),
    'lobby/rampart_menu_lobby_refresh_center_idle': dict(
        tier=B, role='idle_base', rank=30, posture='standing',
        notes='Freeze pose standing on one leg (other knee raised), hand on hip; 24.6 s with almost no motion, no face animation. Cute but statue-like, only for short posing.'),
    'lobby/rampart_menu_lobby_refresh_pose01_intro': dict(
        tier=B, role='transition', rank=25, posture='standing',
        notes='1.5 s: crouches, then lifts a leg into the one-legged pose above.'),
    'lobby/rampart_confirmation_select': dict(
        tier=B, role='transition', rank=30, posture='sitting',
        notes='Hops backward and lies down on a sideways Sheila with feet up (6.6 s); the end pose floats about 0.5 m up (Sheila as a bench). Could be "lying on the top edge of a window", if the window edge is right under her.',
        issues=['Hip up to 1.3 m in the air; without a support she looks like she is floating']),
    'lobby/rampart_confirmation_select_idle': dict(
        tier=B, role='pose', rank=25, posture='sitting', notes='End pose of the previous clip (lying on Sheila), single frame.'),

    # ============================== Dragged / airborne / landing ==============================
    'melee/rampart_ziplineidle_wrench': dict(
        tier=S, role='air', rank=100, posture='airborne',
        notes='Hangs from a zipline by one hand, legs dangling (5.6 s). The 3.83–5.53 s loop seam is only 0.07°. Pin the raised hand to the mouse pointer and she looks "picked up".',
        segments=[seg('grab_swing', 0.0, 3.83, 'legs swing up and down right after grabbing'), seg('hang', 3.83, 5.53, 'hangs with a slight sway, loops forever')],
        loop_range_s=[3.83, 5.53], loop_range_seam_deg=0.07,
        issues=['The paired prop is the wrench (PROPGUN attach point); hide it while dragging', 'The raised hand is the left one: def_l_wrist stays fixed at 1.78 m above the ground for the whole clip; use it as the mouse anchor']),
    'skydive/rampart_updraft': dict(
        tier=S, role='air', rank=90, posture='airborne',
        notes='Floating in an updraft: body slightly crouched, arms out for balance, legs hanging (8 s, start/end 0.5°). Upright and easy to read; good airborne loop for "falling from up high / dropped after a drag".'),
    'move/medium_land_ua': dict(
        tier=S, role='air', rank=85, posture='crouching',
        notes='Landing cushion: bends the knees, crouches, stands back up (1 s). Play this at the end of a fall, then fade into the standing base pose.'),
    'move/medium_jump_ua_f': dict(
        tier=A, role='air', rank=60, posture='airborne',
        notes='Jump takeoff (0.33 s, root lunges 1 m along -X and rises 0.4 m). Forms a three-part jump with float_ua_f and land_ua.',
        issues=['Root translation must be removed; position is controlled procedurally']),
    'move/medium_float_ua_f': dict(
        tier=A, role='air', rank=55, posture='airborne',
        notes='Airborne hang time (1.6 s), arms out, legs tucked.',
        issues=['Does not loop (seam 32°); play once or hold the last frame']),
    'melee/rampart_land_wrench': dict(
        tier=A, role='air', rank=50, posture='crouching', notes='Another landing cushion (1 s, deeper crouch, hands on knees).'),
    'skydive/rampart_freefall': dict(
        tier=A, role='air', rank=55, posture='airborne',
        notes='Skydive freefall: belly down, limbs spread (8 s, 2.9–7.1 s loops at 2.4°). Usable for falling from the top of the screen, but the body is horizontal and seen from the front it is a top view; at pet size it reads worse than updraft.',
        loop_range_s=[2.87, 7.07], loop_range_seam_deg=2.36),
    'emote/rampart_freefall_emote_backflip': dict(
        tier=A, role='air', rank=50, posture='airborne',
        notes='Midair backflip while blowing a bubble (3.6 s, bubble at 0.9–1.6 s), start/end 0.2° (both belly down). An airborne trick for being flung.',
        issues=['The body flips 2.6 m up and down inside the bounding box; scale by the root or use only the middle part']),
    'lobby/rampart_igc_mythic_weapon_teaser': dict(
        tier=A, role='transition', rank=70, posture='standing',
        notes='Entrance: for the first 8.4 s she is 2 m up (off camera); at 8.4–9.8 s she drops from the sky, lands in a crouch and stands up, then stands gesturing. Cutting 8.4–10.6 s gives "jumps down from the top of the screen to make an entrance".',
        segments=[seg('offscreen_above', 0.0, 8.4, 'root at z=2.05 m, legs dangling at the top of the frame'), seg('drop_land', 8.4, 9.8, 'drops, cushions in a crouch'),
                  seg('stand_up', 9.8, 10.6), seg('stand_talk', 10.6, 17.47, 'stands, small hand motions')],
        gum_chew=False, issues=['Root z drops from 2.05 m to 0; keep the vertical root motion for the sense of falling', 'In the later part the mouth moves for a voice line, not chewing']),
    'skydive/rampart_anticipate': dict(
        tier=B, role='air', rank=40, posture='crouching',
        notes='Pre-skydive ready pose: crouched, one leg hanging, arms spread (4 s loop at 0.1°). Could be "standing at a window edge, about to jump down".'),
    'skydive/rampart_anticipate_to_freefall': dict(
        tier=B, role='transition', rank=35, posture='airborne', notes='Leaps out of the ready pose into belly-down (1.3 s); last frame is 40° from freefall.'),
    'skydive/rampart_freefall_to_anticipate': dict(
        tier=C, role='transition', rank=10, posture='airborne', notes='From belly-down back to the ready pose (1.3 s), not very useful.'),
    'skydive/rampart_updraft_downed': dict(
        tier=B, role='air', rank=30, posture='airborne',
        notes='Lifted by an updraft while downed: body limp, floating on her side (8 s loop at 0.6°). Could be "dazed after being flung, swaying in the air".'),
    'skydive/rampart_gravity_lift_wrench': dict(
        tier=B, role='air', rank=25, posture='airborne', notes='Rising in a gravity lift (1.6 s), floating upright, wrench in hand.'),
    'sheila/rampart_doublejump_mobilehmg_f': dict(
        tier=B, role='air', rank=20, posture='airborne', notes='Double jump holding Sheila (0.6 s), legs tucked.'),
    'emote/rampart_freefall_emote_genericflip': dict(
        tier=B, role='air', rank=20, posture='airborne', notes='Midair forward roll (3.4 s, 35 fps).', issues=['Native 35 fps, time_scale 1.167']),
    'emote/rampart_freefall_emote_surfing': dict(
        tier=B, role='air', rank=15, posture='airborne',
        notes='Surfing on a shield wall (8.6 s); she and the wall fly around within 5 m, overall turn of 360°. Great, but does not fit in a pet window.'),
    'emote/rampart_freefall_emote_booster': dict(
        tier=C, role='air', rank=10, posture='airborne', notes='Rides Sheila like a jet (5.6 s); the Sheila prop is visible only in some frames, she flies around within 4 m.'),
    'emote/rampart_freefall_emote_turretride': dict(
        tier=C, role='air', rank=10, posture='airborne',
        notes='Rides Sheila in midair (9.3 s); the prop animation only lines up when stretched 1.1475x, and in renders the prop often separates from her.'),
    'skydive/rampart_freefall_dive': dict(
        tier=C, role='air', rank=5, posture='airborne', notes='Head-down dive (8 s); from the front only the top of the head and Sheila are visible, not good-looking.'),
    'skydive/rampart_freefall#12': dict(
        tier=C, role='air', rank=5, posture='airborne', notes='One of the freefall direction variants (one cell of the blend space), much the same as freefall.'),

    # ============================== Music / dancing / excited ==============================
    'emote/rampart_ground_emote_bollywood_dance': dict(
        tier=S, role='emote', rank=90, posture='standing',
        notes='Bollywood dance (12.2 s): hip swings, raised-arm spins, stomps, a big bubble at 10.3–11.0 s; has facial animation. First choice when music playback is detected.',
        segments=[seg('dance', 0.8, 11.5, 'dancing throughout, no good loop point (best is 6.2–9.2, seam 26°)'), seg('bubble', 10.33, 11.03)],
        issues=['Does not loop: return to idle after it ends and replay, or alternate with boombox']),
    'emote/rampart_ground_emote_boombox': dict(
        tier=S, role='emote', rank=85, posture='standing',
        notes='Carries Sheila on her shoulder like a boombox, nodding and swaying to the beat (11.2 s), chewing gum. The second music dance.',
        segments=[seg('shoulder_sheila', 0.6, 1.8, 'lifts Sheila onto her shoulder'), seg('groove', 1.8, 8.8, 'sways with it; 4.6–8.7 barely loops (11°, needs a fade)'),
                  seg('put_down', 8.8, 11.17)],
        issues=['Sheila is the one from her back, moved to the shoulder by the bones; no extra prop needed']),
    'emote/rampart_ground_emote_panicdance': dict(
        tier=A, role='emote', rank=70, posture='standing',
        notes='Drops Sheila on the ground and jumps around it in a "panic dance" (17.8 s), has facial animation. A third, rowdier dance.',
        segments=[seg('drop_sheila', 0.0, 3.0), seg('dance', 3.0, 16.0, '10.6–12.6 loops (8.4°, needs a fade)'), seg('pick_up', 16.0, 17.8)],
        issues=['Needs the rampart_turret_lobby prop (the Sheila on the ground)']),
    'emote/rampart_ground_emote_cricket': dict(
        tier=A, role='emote', rank=60, posture='standing',
        notes='Cricket: swings the bat, tosses and catches it, hits the ball (9 s). Works as self-amusement when bored or as an excited reaction.',
        issues=['Needs the cricket_bat prop; the prop animation is stretched 1.3155x']),
    'emote/rampart_ground_emote_mechbull': dict(
        tier=A, role='emote', rank=55, posture='airborne',
        notes='Rides a deployed Sheila like a mechanical bull, thrown all over the place (8.2 s). A very cheerful "excited" clip.',
        issues=['Needs the rampart_turret_lobby prop; she reaches up to 2.5 m, leave room at the top of the frame']),
    'emote/rampart_ground_emote_turretspin': dict(
        tier=B, role='emote', rank=40, posture='standing',
        notes='Deploys Sheila, sits on it and spins (12.4 s). Fun, but most of the time she spins on the prop and the facing is all over the place.', issues=['The prop animation is stretched 1.2542x']),
    'emote/rampart_ground_emote_smokebomb': dict(
        tier=B, role='emote', rank=30, posture='standing',
        notes='Ninja smoke bomb: draws a katana and strikes a stance, throws smoke, turns (9.6 s), a bubble stays on her lips throughout 2.4–7.2 s. Does not quite fit her character; the blade-trail smear prop is a big black sheet and needs an effect material.'),
    'gladcard/rampart_gladcard_animated_rainingbullets': dict(
        tier=B, role='emote', rank=25, posture='standing',
        notes='Sprays with Sheila, shell casings flying (3.4 s). A shooting clip; use with care in the pet.', issues=['Facing changes 230°; shell casing prop bullets_v02_all']),

    # ============================== Locomotion ==============================
    'move/rampart_crouchwalk_ua_f': dict(
        tier=A, role='locomotion', rank=70, posture='crouching',
        notes='Sneaking forward in a crouch (1.6 s). The 0.37–1.43 s loop seam is only 0.14°, the only walk that loops cleanly. Great for "sneaking along the taskbar".',
        loop_range_s=[0.37, 1.43], loop_range_seam_deg=0.14,
        issues=['Root walks 6.5 m along -X (strip the translation on playback and move the window by stride length)', 'Facing is about -42° (the clip walks along -X; rotate the model 90° to align)']),
    'move/rampart_walk_ua_f': dict(
        tier=B, role='locomotion', rank=50, posture='standing',
        notes='Empty-handed run loop (1.9 s, actually a jog, root speed about 4.4 m/s). Start/end differ by 9.6°, the best sub-range is still 8°, so the loop hitches.',
        issues=['Root translates along -X and must be stripped', 'fps=3 in the index is wrong (a playback rate computed from travel); play at 30 fps']),
    'move/rampart_walk_rifle_f': dict(
        tier=B, role='locomotion', rank=40, posture='standing',
        notes='Walking with a rifle (3.8 s), 0–3.23 s loops at 1.9°, steady gait, but both hands hold a gun that is not there.',
        loop_range_s=[0.0, 3.23], loop_range_seam_deg=1.9, issues=['Root translates 16.9 m along -X in 3.8 s']),
    'sheila/rampart_walk_mobilehmg_f': dict(
        tier=B, role='locomotion', rank=35, posture='standing',
        notes='Walking with Sheila at the hip (2.2 s), start/end 4.5°. Locomotion for "armed mode".', issues=['Root translation must be stripped']),
    'move/rampart_sprint_ua_f': dict(
        tier=B, role='locomotion', rank=30, posture='standing',
        notes='Sprint (1.9 s, native 23 fps), leaning forward with long strides. Loop seam 10°.', issues=['Root translates 9.7 m along -Y']),
    'move/rampart_slide_ua': dict(
        tier=B, role='locomotion', rank=25, posture='sitting',
        notes='Slide: dives forward and slides on one knee, holds the slide pose after 1.2 s. Could be "sliding down off a window".'),
    'move/medium_land_ua_f_sprinting': dict(
        tier=B, role='air', rank=20, posture='crouching', notes='Landing mid-sprint (1 s), forward cushion.', issues=['Root translates 4.5 m along -Y']),
    'melee/rampart_jump_wrench_f': dict(tier=C, role='air', rank=10, posture='airborne', notes='Basically the same takeoff as medium_jump_ua_f, wrench in hand.'),
    'sheila/rampart_ziplineidle_turret': dict(
        tier=B, role='air', rank=30, posture='airborne',
        notes='Same hanging motion as ziplineidle_wrench (5.7 s), start/end 2.7°, 3.87–5.57 loops at 0.01°. The Sheila-holding version; the Sheila on her back sits differently.'),
    'sheila/rampart_ziprailride_turret': dict(
        tier=B, role='air', rank=20, posture='crouching', notes='Crouched ride on a zip rail (8.8 s), one hand raised gripping the rail, legs swinging with momentum.'),

    # ============================== Banner single frames / end poses ==============================
    'gladcard/rampart_gladcard_static_lookingup': dict(tier=B, role='pose', rank=30, posture='standing',
        notes='Sheila on her shoulder, looking up at the sky (single frame). A "sky gazing / spacing out" freeze.'),
    'gladcard/rampart_gladcard_static_bigsheila': dict(tier=B, role='pose', rank=25, posture='standing',
        notes='Posing with Sheila in both hands (single frame).'),
    'gladcard/rampart_gladcard_animated_fixing_idle': dict(tier=B, role='pose', rank=25, posture='crouching',
        notes='End pose of fixing: kneeling with Sheila (single frame).'),
    'lobby/rampart_menu_loot_ceremony': dict(tier=B, role='pose', rank=20, posture='standing',
        notes='Standing with both hands on hips (single frame), 13° from select_idle.'),
    'lobby/rampart_menu_lobby_left_idle': dict(tier=B, role='pose', rank=15, posture='standing',
        notes='Hands on hips, facing 30° right (single frame), with the tripod prop.'),
    'gladcard/rampart_gladcard_animated_gum_idle': dict(tier=C, role='pose', rank=10, posture='standing',
        notes='End pose of the gum banner (single frame).'),
    'gladcard/rampart_gladcard_animated_myfavorite_idle': dict(tier=C, role='pose', rank=10, posture='standing',
        notes='End pose of myfavorite (single frame).'),
    'gladcard/rampart_gladcard_animated_revup_idle': dict(tier=C, role='pose', rank=10, posture='standing',
        notes='End pose of revup: deployed gun (single frame).'),
    'gladcard/rampart_gladcard_static_fireaway': dict(tier=C, role='pose', rank=5, posture='sitting',
        notes='Sitting on a deployed Sheila, firing (single frame); needs the prop.'),
    'gladcard/rampart_gladcard_static_sittinggun': dict(tier=C, role='pose', rank=5, posture='sitting',
        notes='Sitting on Sheila (single frame); needs the prop, she floats in the air.'),
    'gladcard/rampart_gladcard_static_gunjump': dict(tier=C, role='pose', rank=5, posture='airborne',
        notes='Jumping with Sheila held up (single frame), Sheila upright above her head.'),
    'gladcard/rampart_gladcard_static_taunting': dict(tier=C, role='pose', rank=5, posture='standing',
        notes='Leaning behind a shield wall, taunting (single frame); the wall prop hides most of her.'),
    'gladcard/rampart_gladcard_static_mechanic': dict(tier=C, role='pose', rank=5, posture='lying',
        notes='Lying on a shield wall fixing a drone (single frame); needs two props, the wall and Lifeline\'s drone.'),
    'gladcard/rampart_gladcard_static_friend': dict(tier=C, role='pose', rank=5, posture='crouching',
        notes='Hiding behind a loot bin (single frame); the loot bin prop hides her completely.'),
    'gladcard/rampart_gladcard_animated_heirloom': dict(
        tier=C, role='emote', rank=5, posture='standing',
        notes='Heirloom wrench banner (4.5 s): stands next to Sheila, then crouches. The wrench prop animation has only 1 frame (wrench/rampartwrench_gladcard_animated_heirloom, frame range 0–0), so the wrench does not move; the binding is incomplete.',
        issues=['The prop animation has only 1 frame (the index says 136 frames); the heirloom wrench\'s first-person inspect animations are all on the ptpov skeleton and unusable in third person']),
    'gladcard/rampart_gladcard_animated_heirloom_idle': dict(tier=C, role='pose', rank=5, posture='crouching',
        notes='End pose of heirloom (single frame), she crouches far away.'),
    'gladcard/rampart_gladcard_animated_rainingbullets_idle': dict(tier=C, role='pose', rank=5, posture='airborne',
        notes='End pose of rainingbullets (single frame).'),
    'lobby/rampart_menu_lobby_right_idle': dict(tier=C, role='pose', rank=5, posture='standing',
        notes='Leaning forward holding Sheila (single frame); the tripod prop behind her clips through.'),
    'lobby/rampart_menu_select': dict(tier=C, role='transition', rank=10, posture='sitting',
        notes='Sits in Sheila\'s gunner seat and grips the handles (1.5 s); needs a deployed Sheila.'),
    'lobby/rampart_menu_select_idle': dict(tier=C, role='pose', rank=5, posture='sitting',
        notes='Hold pose of the previous clip (0.3 s).'),

    # ============================== Reviewed, not recommended ==============================
    'execution/rampart_execution_begging': dict(
        tier=C, role='emote', rank=5, posture='standing',
        notes='Finisher: smashes the opponent with Sheila, stomps, blows a bubble at the end (5.8 s). Violent, and the root walks 2.9 m along -Y.'),
    'move/rampart_idle_rifle': dict(
        tier=C, role='idle_base', rank=10, posture='standing',
        notes='Standing rifle idle (9.1 s, start/end 0.1°); natural breathing, but both hands cradle an invisible gun, which looks odd at a glance.'),
    'move/rampart_idle_rifle_ads': dict(tier=C, role='idle_base', rank=5, posture='standing', notes='Aim-down-sights idle (14.6 s), also holding an empty gun grip.'),
    'move/rampart_idle_pistol_twitch_ads': dict(tier=C, role='idle_fidget', rank=5, posture='standing', notes='Fidget while aiming (7.9 s), empty gun grip.'),
    'move/rampart_crouch_rifle_twitch': dict(tier=C, role='idle_fidget', rank=5, posture='crouching', notes='Crouched rifle fidget (6 s).'),
    'move/rampart_idleloot_rifle': dict(tier=C, role='idle_fidget', rank=5, posture='standing', notes='Rifle idle while looting (16.7 s).'),
    'move/rampart_crouchloot_rifle': dict(tier=C, role='idle_fidget', rank=5, posture='crouching', notes='Crouched looting with a rifle (19.6 s).'),
    'move/rampart_slidefloat_rifle': dict(tier=C, role='air', rank=5, posture='standing', notes='Airborne slide (1.8 s), rifle grip.'),
    'melee/rampart_idle_crouch_karambit': dict(tier=C, role='idle_base', rank=5, posture='crouching',
        notes='Crouch idle holding a knife (37.4 s); body almost the same as crouch_ua (first frame 5.6° off), but no bubbles.'),
    'melee/ragold_sword_sprint_carry': dict(tier=C, role='locomotion', rank=5, posture='standing',
        notes='Sprint carrying a big sword (2.3 s, 23 fps), root travels 11 m.'),
    'sheila/rampart_crouch_mobilehmg': dict(tier=B, role='idle_base', rank=20, posture='crouching',
        notes='Crouched with Sheila (7 s), 2.8–5.5 loops at 2.2°. The crouching version of "armed mode".'),
    'sheila/pilot_rampart_turret_draw.001': dict(tier=C, role='transition', rank=5, posture='standing',
        notes='Walks up behind a deployed Sheila and grips it (1.8 s); needs the prop.'),
    'sheila/pilot_rampart_turret_idle_layer.001': dict(tier=C, role='pose', rank=1, posture='lying',
        notes='Additive layer; played alone she lies sideways (root not upright), cannot be used on its own.'),
    'sheila/rampart_ultimate_draw': dict(tier=C, role='transition', rank=1, posture='lying',
        notes='Upper-body layer for drawing Sheila; played alone she lies sideways, skeleton data incomplete.'),
    'sheila/rampart_ultimate_place': dict(tier=C, role='transition', rank=1, posture='lying',
        notes='Upper-body layer for placing Sheila; same as above, lying sideways.'),
}
