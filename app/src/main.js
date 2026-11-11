// Entry: stage, character, procedural layer, behavior brain and input are all wired up here
import * as THREE from 'three'
import { Stage } from './stage.js'
import { Character } from './character.js'
import { Procedural } from './procedural.js'
import { Brain } from './brain/index.js'
import { applyOverrides } from './params.js'
import { makeInput } from './input.js'
import { Bubble } from './bubble.js'
import { FX } from './fx.js'
import { clock } from './clock.js'
import { mountUI } from './ui/index.js'

// dev mode: browser (no petAPI) or the developer window (petAPI.dev, only borrows the real sensors)
const DEV = !window.petAPI || !!window.petAPI.dev
const params = new URLSearchParams(location.search)

// world area covered by the canvas (m): pixel size scales with the size setting, so a larger size does not crop her
const VIEW_W = 3.0, VIEW_H = 3.667
const SIZES = { s: 150, m: 180, l: 220 }   // pixels per meter (tray "Size")
const CANVAS_W = Math.round(VIEW_W * SIZES.m), CANVAS_H = Math.round(VIEW_H * SIZES.m)

const canvas = document.getElementById('pet')
const stage = new Stage(canvas, { cssW: CANVAS_W, cssH: CANVAS_H, ss: Number(params.get('ss') || 2) })
const pet = new Character()
// parent node for tilting: pivot at waist height (swings like a pendulum when picked up)
const tiltGroup = new THREE.Group()
tiltGroup.userData.tilt = true
tiltGroup.position.y = 1.0
pet.root.position.y = -1.0
tiltGroup.add(pet.root)
stage.scene.add(tiltGroup)

const view = {
  ppm: Number(params.get('ppm')) || SIZES.m,
  yaw: params.has('yaw') ? Number(params.get('yaw')) : -0.32,   // character turned slightly toward screen center
  lookY: Number(params.get('lookY') || 1.05),
  lookX: Number(params.get('lookX') || 0),
  pitch: 7 * Math.PI / 180,
  footX: 0, footY: 0,   // projected foot position inside the canvas
}

function setupCamera() {
  const cam = stage.camera
  const w = Math.round(VIEW_W * view.ppm), h = Math.round(VIEW_H * view.ppm)
  if (w !== stage.cssW || h !== stage.cssH || stage.dpr !== (window.devicePixelRatio || 1)) stage.resize(w, h)
  const halfFov = THREE.MathUtils.degToRad(cam.fov / 2)
  const visH = h / view.ppm
  const d = visH / (2 * Math.tan(halfFov))
  const target = new THREE.Vector3(view.lookX, view.lookY, 0)
  cam.position.set(view.lookX, target.y + Math.sin(view.pitch) * d, Math.cos(view.pitch) * d)
  cam.lookAt(target)
  cam.near = Math.max(0.05, d - 4); cam.far = d + 4
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld()
  const f = stage.project(new THREE.Vector3(0, 0, 0))
  view.footX = f.x; view.footY = f.y
}

// character position on screen (feet, CSS pixels, relative to the overlay window's top left)
const world = {
  w: window.innerWidth, h: window.innerHeight,
  floor: window.innerHeight,
  x: window.innerWidth * 0.78, y: window.innerHeight,
}

function placeCanvas() {
  // snap to device pixels, so the canvas does not land on half pixels and blur when scaling is not 100%
  const dpr = window.devicePixelRatio || 1
  const left = Math.round((world.x - view.footX) * dpr) / dpr
  const top = Math.round((world.y - view.footY) * dpr) / dpr
  canvas.style.transform = `translate(${left}px, ${top}px)`
  view.left = left; view.top = top
}

// lighting presets (for comparison; the final choice goes back into the stage.js defaults)
function applyLook(name) {
  const L = {
    B: { key: 3.0, fill: 0.5, rim: 4.0, rim2: 2.0, hemi: 0.35, env: 0.45 },
    C: { key: 3.0, fill: 0.5, rim: 4.0, rim2: 2.0, hemi: 0.35, env: 0.45, outline: 0.55 },
    D: { key: 2.3, fill: 1.0, rim: 3.0, rim2: 1.5, hemi: 0.7, env: 0.6 },
  }[name]
  if (!L) return
  stage.key.intensity = L.key; stage.fill.intensity = L.fill; stage.rim.intensity = L.rim
  stage.rim2.intensity = L.rim2; stage.hemi.intensity = L.hemi; stage.scene.environmentIntensity = L.env
  if (L.outline) stage.postMat.uniforms.outlineAlpha.value = L.outline
}

const input = makeInput({ dev: DEV })
// in-game style UI (src/ui/, GUI module): HUD / XP bar / rank up / settings panel. Not mounted in capture mode by default (?ui=1 forces on, ?ui=0 forces off)
let ui = null
const UI_ON = params.has('ui') ? params.get('ui') !== '0' : !params.get('capture')
// floor = top of the taskbar raised by one HUD band (ui.band, 0 when the HUD is off): skydive, landing and walking all use world.floor and follow automatically
const floorBase = () => DEV ? window.innerHeight - 48 : world.h
const setFloor = () => { world.floor = floorBase() - (ui ? ui.band : 0) }
const bubble = new Bubble(document.getElementById('bubble'))
const proc = new Procedural(pet, stage, view, world)
const fx = new FX(stage.scene, stage)
const brain = new Brain({ pet, proc, world, view, input, bubble, stage, fx })
// when a large prop (Sheila as a lounge chair) is suddenly hidden, puff some smoke as if she packed it away
pet.onPropHidden = (name, obj) => {
  if (name !== 'turret_lobby') return
  // position from the tripod base bone (Box3.setFromObject walks every vertex of a skinned mesh, about 16 ms, which stutters on the stow-Sheila frame)
  const base = obj.getObjectByName('turret_lobby__def_c_bot_base')
  if (!base) return
  const c = base.getWorldPosition(new THREE.Vector3())
  fx.puff(new THREE.Vector3(c.x, 0.2, c.z), 9, 0.4)
}
// overrides for event parameters (params.js): in Electron read the shared tuning.json (a save on either side is pushed here); in the browser use localStorage
async function loadTuning() {
  if (window.petAPI?.getTuning) {
    applyOverrides(brain.params, await window.petAPI.getTuning())
    window.petAPI.onTuning(t => applyOverrides(brain.params, t))
  } else {
    try { applyOverrides(brain.params, JSON.parse(localStorage.getItem('pet3d.tuning') || '{}')) } catch {}
  }
}
// photo white flash
brain.flash = () => {
  const f = document.createElement('div')
  f.style.cssText = `position:absolute;left:${view.left}px;top:${view.top}px;width:${stage.cssW}px;height:${stage.cssH}px;` +
    'background:radial-gradient(circle at 50% 45%, rgba(255,255,255,.85), rgba(255,255,255,0) 60%);pointer-events:none;transition:opacity .35s'
  document.body.appendChild(f)
  requestAnimationFrame(() => { f.style.opacity = '0' })
  setTimeout(() => f.remove(), 450)
}

async function boot() {
  if (DEV) {
    document.body.classList.add('dev', params.get('wall') ? 'wall-' + params.get('wall') : 'wall-win')
    setFloor()
    world.y = world.floor
    const bar = document.createElement('div')
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:48px;background:rgba(28,30,38,.92);backdrop-filter:blur(8px)'
    document.body.appendChild(bar)
  } else {
    const info = window.petAPI.getScreen()
    world.w = info.workArea.width; world.h = info.workArea.height
    setFloor()
    world.y = world.floor
    const cfg = await window.petAPI.getConfig()
    if (cfg.petX) world.x = Math.min(world.w - 80, Math.max(80, cfg.petX))
    if (cfg.size) view.ppm = SIZES[cfg.size] || SIZES.m
    bubble.muted = !!cfg.muteBubbles
    window.petAPI.onConfig(c => {
      bubble.muted = !!c.muteBubbles
      const ppm = SIZES[c.size] || SIZES.m
      if (ppm !== view.ppm) { view.ppm = ppm; setupCamera() }
    })
    window.petAPI.onScreen(s => {
      world.w = s.workArea.width; world.h = s.workArea.height; setFloor()
      world.x = Math.min(world.w - 80, Math.max(80, world.x))
      if (brain.walk) brain.walk.tx = Math.min(world.w - 90, Math.max(90, brain.walk.tx))
      if (brain.state === 'idle') world.y = world.floor
    })
    // monitor change / scaling change: rebuild the canvas for the new device pixel ratio
    const watchDpr = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { setupCamera(); watchDpr() }, { once: true })
    watchDpr()
    // hit-test as soon as the cursor moves (do not wait for the next frame), so it keeps up even at the low sleep frame rate
    input.on('move', () => hitTest())
  }
  if (params.get('x')) world.x = Number(params.get('x'))
  // right-clicking the character does nothing (a menu popping up on a misclick is too intrusive); the settings panel opens only from the HUD menu button, the tray menu only from the tray icon

  applyLook(params.get('look'))
  setupCamera()
  placeCanvas()
  const skin = params.get('skin') || (window.petAPI ? (await window.petAPI.getConfig()).skin : null) || 'base'
  await pet.load(params.get('base') || './', { hi: params.has('hi'), skin })
  pet.root.rotation.y = view.yaw
  proc.init()
  if (params.has('yaw')) proc.yawTarget = null
  await loadTuning()
  // mount the UI before the entrance: the floor is raised first, so the skydive lands right on the HUD band
  if (UI_ON) {
    // a UI mount failure (any exception) must not take down the pet: log an error and enter without the UI (floor back to the taskbar)
    try {
      ui = await mountUI({ pet, stage, proc, brain, view, world, fx, THREE, clock, input, hooks: {
        // size change in dev mode (the overlay goes through config -> onConfig above)
        setSize(s) { view.ppm = SIZES[s] || SIZES.m; setupCamera() },
      } })
    } catch (e) { console.error('UI mount failed', e); ui = null }
    setFloor(); world.y = world.floor
  }
  await brain.start(params.get('clip'))
  window.__pet = { pet, stage, proc, brain, view, world, fx, THREE, clock, input, ui }
  if (params.get('capture')) {
    // capture mode: an external tool steps at a fixed interval and grabs every frame (tools/capture.cjs)
    document.body.className = ''
    window.__step = (dt) => { tick(dt) }
    window.__grab = () => canvas.toDataURL('image/png')
    window.__busy = () => pet.pending.size > 0
    window.__ready = true
    return
  }
  requestAnimationFrame(loop)
  if (DEV) (await import('./devpanel/index.js')).mountDevPanel(window.__pet)
}

// main loop: own frame limiting (monitors may be 75/144/165/180 Hz; the brain lowers fps by state, 20 fps when asleep)
// measure the vsync interval vs and draw one frame every k syncs: even pacing, never below the target fps
let last = performance.now(), prev = last, vs = 1000 / 60
let hitBusy = false
function loop(now) {
  requestAnimationFrame(loop)
  const d = now - prev; prev = now
  if (d > 0 && d < vs * 1.5) vs += (d - vs) * 0.1
  const fps = brain.fps || 60
  const k = Math.max(1, Math.floor(1000 / fps / vs + 0.1))
  if (now - last < k * vs - vs / 2) return
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (input.system.hidden) return          // fullscreen: the shell has hidden the window, stop rendering
  tick(dt)
  hitTest()
  // capture the mouse when the cursor is on the character, dragging, or on the UI (HUD / settings panel); otherwise click through (the shell has a lease as fallback)
  window.petAPI?.setInteractive(input.over || brain.dragging || !!ui?.wantsMouse(input.mouse.x, input.mouse.y))
}

function tick(dt) {
  clock.advance(dt)
  brain.update(dt)
  pet.update(dt)
  proc.update(dt)
  fx.update(dt)
  placeCanvas()
  stage.wantReadback = true
  stage.render(pet.root, [fx.points, fx.dustGroup])
  bubble.follow(view, stage, pet)
  // compute the floor from this frame's band height first (so UI and floor agree on the frame the HUD toggles or the size changes), then update the UI
  if (ui) { setFloor(); ui.update(dt); followFloor(dt) }
}

// the floor moves when the HUD is shown / hidden: standing, she glides to the new floor (held / falling is left to the brain, she lands on the new floor naturally)
//  size change (floor differs by a few px with ppm): the UI snaps in one frame, so she also stands on the new floor directly without gliding
//  both setFloor calls are needed: the band height changes in ui.update on the frame the HUD finishes fading (ui.band checks whether the HUD is still visible)
//  critically damped spring (ω = 10, same as the XP bar's floor follow fl in ui/index.js): eases in at the start instead of jumping at full speed on the first frame
let floorPpm = 0, floorV = 0
function followFloor(dt) {
  const resized = floorPpm !== view.ppm
  floorPpm = view.ppm
  setFloor()
  if (brain.state !== 'idle' || world.y === world.floor) { floorV = 0; return }
  if (resized) { world.y = world.floor; floorV = 0; return }
  const W = 10, d = world.y - world.floor, e = Math.exp(-W * dt), k = (floorV + W * d) * dt
  const nd = (d + k) * e
  floorV = (floorV - W * k) * e
  if (Math.abs(nd) < 0.5 && Math.abs(floorV) < 5) { world.y = world.floor; floorV = 0 } else world.y = world.floor + nd
}

// per-pixel hit test: capture the mouse only over opaque pixels of the character, otherwise click through to the desktop
async function hitTest() {
  if (hitBusy || brain.dragging) return
  hitBusy = true
  const m = input.mouse
  const a = await stage.alphaAt(m.x - view.left, m.y - view.top)
  const onUI = !!ui?.wantsMouse(m.x, m.y)
  const over = a > 0.5 && !onUI            // when the UI covers her (e.g. a panel), it counts as the UI, not as touching her
  if (over !== input.over) input.setOver(over)
  window.petAPI?.setInteractive(over || onUI || brain.dragging)   // send as soon as the result is in, saves a frame
  hitBusy = false
}

boot().catch(e => {
  console.error(e)
  document.getElementById('debug').textContent = 'Startup failed: ' + e.message
})
