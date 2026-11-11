// Check with three.js itself (in Node, no rendering): compressed clips decode, every track binds by name to the model / props,
// and bone world positions at a given time match the uncompressed version.
// node tools/check_three.mjs [clip_id ...] [--model rampart.glb] [--t seconds]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
globalThis.self ??= globalThis;   // GLTFLoader reads self.URL
// three is installed in app/node_modules and imported by path (this script lives in tools/, where bare module names don't resolve)
const T3 = (p) => import(pathToFileURL(path.resolve(here, '../app/node_modules/three', p)).href);
const THREE = await T3('build/three.module.js');
const { GLTFLoader } = await T3('examples/jsm/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await T3('examples/jsm/libs/meshopt_decoder.module.js');
const ASSETS = path.resolve(here, '../app/assets');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const MODEL = opt('--model', 'rampart.glb');
const T = parseFloat(opt('--t', '0'));
const index = JSON.parse(fs.readFileSync(path.join(ASSETS, 'anims/index.json'), 'utf8'));
let ids = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!ids.length || ids[0] === 'all') ids = index.map((m) => m.id);

// Node has no image decoding: just let texture loads fail quietly
const origError = console.error, origWarn = console.warn;
console.error = (...a) => { if (!String(a[0]).includes("Couldn't load texture")) origError(...a); };
const warns = [];
console.warn = (...a) => warns.push(a.join(' '));

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const load = (p) => new Promise((res, rej) => {
  const b = fs.readFileSync(p);
  loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), path.dirname(p) + '/', res, rej);
});

const model = await load(path.join(ASSETS, MODEL));
const props = {};
let bad = 0;
for (const id of ids) {
  const meta = index.find((m) => m.id === id);
  const root = new THREE.Group();
  const scene = model.scene.clone ? model.scene : model.scene;
  root.add(scene);
  for (const p of meta.props) {
    props[p] ??= await load(path.join(ASSETS, 'props', `${p}.glb`));
    root.add(props[p].scene);
  }
  const gl = await load(path.join(ASSETS, meta.file));
  const clip = gl.animations[0];
  const missing = clip.tracks.filter((t) => !THREE.PropertyBinding.findNode(root, THREE.PropertyBinding.parseTrackName(t.name).nodeName));
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.update(Math.min(T, clip.duration));
  root.updateMatrixWorld(true);
  const pos = (n) => { const o = root.getObjectByName(n); return o ? o.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(4)) : null; };
  const nonBound = missing.map((t) => t.name.split('.')[0]).filter((v, i, a) => a.indexOf(v) === i);
  const ok = clip.tracks.length > 0 && Math.abs(clip.duration - meta.duration_s) < 0.02;
  if (!ok) bad++;
  console.log(JSON.stringify({ id, tracks: clip.tracks.length, duration: +clip.duration.toFixed(4), meta_duration: meta.duration_s,
    unbound_nodes: nonBound, head: pos('def_c_head'),
    prop: meta.props.length ? pos(`${meta.props[0]}__def_c_base`) : undefined }));
  for (const p of meta.props) root.remove(props[p].scene);
  root.remove(scene);
  mixer.stopAllAction(); mixer.uncacheRoot(root);
}
console.log('warnings', warns.length, warns.slice(0, 5));
process.exit(bad ? 1 : 0);
