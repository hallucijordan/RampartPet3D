// Clip table (clip replacement only edits this file): behavior slot -> game animation clip + trim range + display name
//  Frame numbers are at 30 fps; candidate clips and selection notes are in data/CLIPS.md
//  Slot names (C.xxx) are a contract: the brain and the developer panel tests use slot names; renaming means updating them too; swapping a clip only changes the value
//  At packaging, tools/prune_dist.mjs scans the source for clip ids and packs only the used animations into the exe
//  Custom trimmed clips: S(clip id, start s, end s), or { id, from: start frame, to: end frame }

const IDLE = 'lobby__rampart_menu_lobby_center_idle'       // standing base pose: Sheila hangs at her hip, consistent with the fidgets
// (select_idle 'lobby__rampart_menu_lobby_select_idle' is a 17 s seamless loop, hands on hips chewing gum, but it swaps Sheila for the tripod prop, so it is not used)
const UA = 'move__rampart_idle_ua'                          // 54 s empty-handed idle, cut into fidgets
const S = (id, a, b) => ({ id, from: Math.round(a * 30), to: Math.round(b * 30) })
const HEIR = 'gladcard__rampart_gladcard_animated_heirloom'  // fixing Sheila facing away (heirloom banner pose)
const READY = 'lobby__rampart_menu_select_readyup'
const REVUP = 'gladcard__rampart_gladcard_animated_revup'    // hug Sheila to charge, jump, land and set up
const CHEER = S('emote__goldenhorse_rampart_celebration', 0.5, 3.9)   // repeated fist-pump cheer

export const C = {
  hub: IDLE,
  hubAlt: { id: IDLE, from: 0, to: 124 },
  // idle fidgets: [clip, pick weight, category, display name]
  fidgets: [
    [S(UA, 4.4, 7.9), 3, 'bubble', 'Big bubble'],
    [S(UA, 16.2, 27.6), 1, 'sheila', 'Swing Sheila down, inspect'],
    [S(UA, 32.6, 34.6), 1, 'point', 'Point ahead'],
    [S(UA, 35.2, 40.0), 2, 'bubble', 'Another big bubble'],
    [{ id: IDLE, from: 195, to: 365 }, 2, 'bubble', 'Leaning bubble'],
  ],
  // fidgets while music plays (decided in 2.5: separate from the idle fidgets, not shared): [clip, pick weight, category, display name]
  musicFidgets: [
    [S(UA, 8.0, 14.8), 2, 'look', 'Look around'],
    [S(UA, 28.0, 32.4), 1.5, 'hair', 'Touch hair'],
    [S(UA, 41.0, 48.8), 1.5, 'gesture', 'Gesture'],
  ],
  bubble: S(UA, 4.4, 7.9),                                     // bubble during typing pauses / after the burst typing stop
  gunrev: 'lobby__rampart_menu_lobby_center_idle_gunrev',
  weld: S('lobby__rampart_menu_lobby_center_idle_weld', 0, 23.6),
  weldLoop: S('lobby__rampart_menu_lobby_center_idle_weld', 5.6, 19.0),
  stances: ['move__rampart_crouch_ua', 'lobby__rampart_s10e01_idle'],
  lieDown: 'emote__rampart_ground_emote_chillaxing',
  lounge: 'emote__rampart_ground_emote_chillaxing_loop',
  getUp: 'lobby__rampart_menu_lobby_refresh_pose01_intro',
  grab: S('melee__rampart_ziplineidle_wrench', 0, 3.83),       // just picked up: legs swing up
  hang: S('melee__rampart_ziplineidle_wrench', 3.83, 5.53),    // hanging by one hand, swaying slightly
  fall: 'skydive__rampart_updraft',                            // falling: upright, arms out for balance
  held: 'skydive__rampart_freefall',
  flips: ['emote__rampart_freefall_emote_backflip', 'emote__rampart_freefall_emote_genericflip'],
  landLight: 'move__medium_land_ua',
  landHeavy: 'melee__rampart_land_wrench',
  revup: REVUP,
  cheer: CHEER,
  taunt: 'emote__rampart_ground_emote_taunt',
  yoga: 'emote__rampart_ground_emote_yoga',
  yogaLoop: 'emote__rampart_ground_emote_yoga_loop',
  stretch: S('gladcard__rampart_gladcard_animated_fixing', 0, 3.1),
  sneak: S('move__rampart_crouchwalk_ua_f', 0.37, 1.43),      // crouched sneak (root bone moves along -X at 4.1 m/s)
  dances: ['emote__rampart_ground_emote_boombox', 'emote__rampart_ground_emote_bollywood_dance'],   // 2.5: panic dance moved to the bored pool
  // (the myfavorite banner pose holds a parallel rifle spawned by an animation event in the right hand; the pet does not export weapons, dropped 2026-09-26, see CLIPS.md)
  // 2026-09-27: keep the gun spin and cheer, moved into the bored pool (typing no longer uses them after the typing refactor)
  bored: ['emote__rampart_ground_emote_cricket', 'emote__rampart_ground_emote_mechbull', REVUP, CHEER, 'emote__rampart_ground_emote_panicdance'],
  photos: ['wink', 'peace', 'lookingup', 'bigsheila', 'fireaway', 'sittinggun', 'gunjump'].map(n => 'gladcard__rampart_gladcard_static_' + n),
  readyup: READY,
  entrance: S('lobby__rampart_igc_mythic_weapon_teaser', 8.4, 10.6),
  // typing (refactored 2026-09-27: typing = take out Sheila -> fix Sheila facing away loop -> stow Sheila; burst = turn and slam -> ride and swing Sheila -> BOOM! -> skydive C.fall / landHeavy / getUp)
  //  rot: degrees to rotate the whole clip around the prop point, baked into the tracks (aligns with the fixing-Sheila facing); reverse: play backward. Both fields need runtime support (motion module)
  typeDraw: { id: 'emote__rampart_ground_emote_turretspin', from: 357, to: 372, reverse: true },  // take out Sheila: end of the spin played backward
  typeLoop: { id: HEIR, from: 0, to: 30, rot: 150 },            // fix Sheila facing away: two copies relay-loop (period 0.7 s, seam 0.3 s, joins at frame 24)
  typeStow: { id: 'emote__rampart_ground_emote_mechbull', from: 225, to: 246, rot: 20 },         // stow Sheila: the part of mech bull that packs up the tripod
  burstTurn: { id: HEIR, from: 30, to: 82, rot: 150 },          // burst: quick turn (30->66 at double speed), raise the wrench and slam down
  burstRide: { id: READY, from: 12, to: 148, rot: 150 },        // burst: jump on Sheila, ride and swing (aligned to typeLoop by the tripod first, then rotated)
  burstRideLoop: { id: READY, from: 84, to: 148, rot: 150 },    // burst: one more swing, then muzzle sparks -> BOOM!
}

// clip id (a trimmed clip takes its source clip's id); trimmed clips are named id@from-to at runtime
export const idOf = (s) => typeof s === 'string' ? s : s.id
export const keyOf = (s) => typeof s === 'string' ? s : `${s.id}@${s.from}-${s.to}`

// display names: used by the developer panel event stream and test table
const NAMES = new Map([
  [C.hub, 'Standing base pose'], [C.gunrev, 'Sheila test spin'], [C.weld, 'Weld Sheila'], [C.weldLoop, 'Weld Sheila (loop)'],
  [C.lieDown, 'Lie down'], [C.lounge, 'Lying (loop)'], [C.getUp, 'Get up'], [C.grab, 'Picked up'], [C.hang, 'Hanging sway'],
  [C.fall, 'Falling'], [C.held, 'Free fall'], [C.landLight, 'Light landing'], [C.landHeavy, 'Heavy landing'],
  [C.revup, 'Banner pose: gun spin'], [C.cheer, 'Cheer'], [C.taunt, 'Taunt'], [C.yoga, 'Yoga'], [C.yogaLoop, 'Yoga (loop)'],
  [C.stretch, 'Stretch'], [C.sneak, 'Crouched sneak'], [C.readyup, 'Ready up'], [C.entrance, 'Entrance'],
  [C.typeDraw, 'Typing: take out Sheila'], [C.typeLoop, 'Typing: fix Sheila (loop)'], [C.typeStow, 'Typing: stow Sheila'],
  [C.burstTurn, 'Burst: turn and slam'], [C.burstRide, 'Burst: ride Sheila'], [C.burstRideLoop, 'Burst: one more swing'],
  ...C.fidgets.map(f => [f[0], f[3]]),
  ...C.stances.map((s, i) => [s, ['Crouch', 'Alt stance'][i]]),
  ...C.flips.map((s, i) => [s, ['Backflip', 'Flip'][i]]),
  ...C.dances.map((s, i) => [s, ['Dance: boombox', 'Dance: Bollywood'][i]]),
  ...C.musicFidgets.map(f => [f[0], f[3]]),
  ...C.bored.map((s, i) => [s, ['Bored: cricket', 'Bored: mech bull', 'Bored: rev-up Sheila', 'Bored: fist-pump cheer', 'Bored: panic dance'][i]]),
  ...C.photos.map(s => [s, 'Photo: ' + s.split('_').pop()]),
].map(([s, n]) => [keyOf(s), n]))
// clip (or runtime clip name, trimmed clip object) -> display name; unregistered ones show the raw name without the prefix
export const clipName = (k) => { if (k && typeof k === 'object') k = keyOf(k); return k ? (NAMES.get(k.replace('#twin', '')) || k.replace(/^[a-z]+__rampart_/, '')) : '—' }
