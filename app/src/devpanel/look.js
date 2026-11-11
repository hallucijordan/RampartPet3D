// Developer panel · look: wallpaper, facing, post-processing, lights, skin subsurface, gaze (the former lil-gui panel)
import GUI from 'three/addons/libs/lil-gui.module.min.js'
import { skinParams, setSkin } from '../materials.js'

export function mountLookGui(container, ctx) {
  const { stage, view, pet, proc } = ctx
  const gui = new GUI({ container, title: 'Look / lights / post' })
  const st = { wall: [...document.body.classList].find(c => c.startsWith('wall-'))?.slice(5) || 'win' }
  gui.add(st, 'wall', ['win', 'light', 'dark']).name('Wallpaper').onChange(w => {
    document.body.classList.remove('wall-win', 'wall-light', 'wall-dark')
    document.body.classList.add('wall-' + w)
  })
  gui.add(view, 'yaw', -1.6, 1.6, 0.01).name('Facing').onChange(v => { pet.root.rotation.y = v })
  const u = stage.postMat.uniforms
  const post = gui.addFolder('Post-processing')
  post.add(u.exposure, 'value', 0.3, 2.5, 0.01).name('Exposure')
  post.add(u.saturation, 'value', 0, 2, 0.01).name('Saturation')
  post.add(u.contrast, 'value', 0.7, 1.4, 0.01).name('Contrast')
  post.add(u.outlineAlpha, 'value', 0, 1, 0.01).name('Outline')
  post.add(u.outlineWidth, 'value', 0.5, 3, 0.1).name('Outline width')
  post.add(u.shadowAlpha, 'value', 0, 1, 0.01).name('Shadow')
  const lights = gui.addFolder('Lights')
  lights.add(stage.key, 'intensity', 0, 6, 0.05).name('Key')
  lights.add(stage.fill, 'intensity', 0, 3, 0.05).name('Fill')
  lights.add(stage.rim, 'intensity', 0, 6, 0.05).name('Rim')
  lights.add(stage.rim2, 'intensity', 0, 4, 0.05).name('Rim 2')
  lights.add(stage.hemi, 'intensity', 0, 2, 0.05).name('Sky')
  lights.add(stage.scene, 'environmentIntensity', 0, 2, 0.05).name('Environment')
  const skin = gui.addFolder('Skin shading')
  skin.add(skinParams, 'sss', 0, 3, 0.05).name('Subsurface').onChange(() => setSkin({}))
  skin.add(skinParams, 'wrap', 0, 1.5, 0.05).name('Wrap').onChange(() => setSkin({}))
  const look = gui.addFolder('Gaze / springs')
  look.add(proc.look, 'mode', ['cursor', 'camera', 'none']).name('Mode')
  look.add(proc.look, 'weight', 0, 1, 0.01).name('Weight')
  look.add(proc, 'physWeight', 0, 1, 0.01).name('Ponytail spring')
  for (const f of [post, lights, skin, look]) f.close()
  gui.close()
}
