// After vite build, slim down dist/: keep only the clips, props and textures the behaviors use (the asset library is large, no need to ship it all in the exe)
// Usage: node tools/prune_dist.mjs
import fs from 'fs'
import path from 'path'

const app = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..')
const dist = path.join(app, 'dist')
const src = fs.readdirSync(path.join(app, 'src'), { recursive: true }).filter(f => f.endsWith('.js'))   // includes subdirectories (brain/ etc.)
  .map(f => fs.readFileSync(path.join(app, 'src', f), 'utf8')).join('\n')

// Clip ids that appear in the source (plus the concatenated gladcard static / quest expression ones)
const used = new Set(src.match(/\b(lobby|emote|move|melee|skydive|gladcard|quest|sheila|misc)__[a-z0-9_]+/g) || [])
for (const n of ['wink', 'peace', 'lookingup', 'bigsheila', 'fireaway', 'sittinggun', 'gunjump']) used.add('gladcard__rampart_gladcard_static_' + n)
for (const e of ['neutral', 'happy', 'angry', 'sad', 'surprised', 'fearful']) for (const s of ['l', 'r']) used.add(`quest__rampart_quest_${e}_${s}`)

const index = JSON.parse(fs.readFileSync(path.join(dist, 'anims', 'index.json'), 'utf8'))
const keep = index.filter(e => used.has(e.id))
const props = new Set(keep.flatMap(e => e.props || []))
let removed = 0
for (const f of fs.readdirSync(path.join(dist, 'anims'))) {
  if (f === 'index.json') continue
  if (!keep.some(e => path.basename(e.file) === f)) { fs.rmSync(path.join(dist, 'anims', f)); removed++ }
}
fs.writeFileSync(path.join(dist, 'anims', 'index.json'), JSON.stringify(keep))
for (const f of fs.readdirSync(path.join(dist, 'props'))) {
  if (!props.has(f.replace(/\.glb$/, ''))) fs.rmSync(path.join(dist, 'props', f))
}
// Keep only what the runtime needs in the texture folder: thk (skin scattering), hair cav (the looks' hair highlight fix, hairCav in src/looks/lib/fix.js, ~0.6 MB for all four skins) and the index
for (const f of fs.readdirSync(path.join(dist, 'tex'))) {
  if (f !== 'index.json' && !f.endsWith('_thk.png') && !f.endsWith('_hair_cav.png')) fs.rmSync(path.join(dist, 'tex', f))
}
for (const d of ['_quick']) fs.rmSync(path.join(dist, d), { recursive: true, force: true })
// Keep only the 1K-texture models (the runtime loads these by default)
for (const f of fs.readdirSync(dist).filter(f => /^rampart(_\w+)?\.glb$/.test(f) && !f.endsWith('_1k.glb')))
  if (fs.existsSync(path.join(dist, f.replace(/\.glb$/, '_1k.glb')))) fs.rmSync(path.join(dist, f))

const size = (p) => fs.statSync(p).isDirectory() ? fs.readdirSync(p).reduce((a, f) => a + size(path.join(p, f)), 0) : fs.statSync(p).size
const missing = [...used].filter(id => !index.some(e => e.id === id))
console.log(`Kept ${keep.length} clips, removed ${removed}; props ${[...props].join(', ')}`)
if (missing.length) console.log('Referenced in the source but missing from the assets:', missing.join(' '))
console.log('dist size', (size(dist) / 1048576).toFixed(1), 'MB')
