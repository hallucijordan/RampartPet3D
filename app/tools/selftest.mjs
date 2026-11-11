// One command to run the developer panel's "① Run all self-tests": starts the developer window (using this directory's dist/), runs each skin in turn, prints results; exit code 1 on any failure
// Usage (from app/):
//   npx vite build && node tools/prune_dist.mjs        # build first (rebuild after changing src/)
//   node tools/selftest.mjs                            # default: Standard skin
//   node tools/selftest.mjs --skins base,bear --port 9334
// The developer window stays on screen for a few minutes (a normal window, doesn't block the mouse) and closes when done; when several sessions run at once, give each its own --port
import { spawn } from 'node:child_process'
import path from 'node:path'

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const SKINS = arg('skins', 'base').split(',')
const PORT = Number(arg('port', 9333))
const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..')
const NAMES = { base: 'Standard', hp: 'Heritage', rebecca: 'Rebecca', bear: 'Bear' }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const exe = path.join(APP, 'node_modules', 'electron', 'dist', 'electron.exe')
const child = spawn(exe, ['.', '--dev', `--dev-profile=selftest-${PORT}`, `--test-exit=${(SKINS.length * 200 + 60) * 1000}`, `--remote-debugging-port=${PORT}`], { cwd: APP, stdio: 'ignore' })
child.on('exit', () => { if (ws) ws.onclose?.() })

let ws, id = 0
const pend = new Map()
async function connect() {
  let t
  for (let i = 0; i < 120 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(x => x.type === 'page') } catch {} ; if (!t) await sleep(500) }
  if (!t) throw new Error('Cannot connect to the developer window (port ' + PORT + ')')
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r)
  ws.onmessage = (m) => { const d = JSON.parse(m.data); const p = pend.get(d.id); if (p) { pend.delete(d.id); p.res(d) } }
  // Developer window dropped mid-run (closed / crashed / exited early): fail all pending requests, otherwise the script hangs and exits 0, counting failure as a pass
  const fail = (why) => { for (const p of pend.values()) p.rej(new Error(why)); pend.clear() }
  ws.onclose = () => fail('Developer window disconnected (closed, crashed or exited early)')
  ws.onerror = () => fail('Connection to the developer window failed')
}
const ev = (expression) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); if (ws.readyState !== 1) { pend.delete(i); return rej(new Error('Developer window disconnected')) } ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } })) })
  .then(d => d.result?.result?.value ?? d.result?.exceptionDetails?.exception?.description)
const ready = async () => { for (let i = 0; i < 120 && !(await ev(`!!window.__pet?.brain && !!document.querySelector('#dp [data-k="all"]')`)); i++) await sleep(500); await sleep(1500) }

let failed = 0
try {
  await connect(); await ready()
  for (const skin of SKINS) {
    const cur = await ev(`new URLSearchParams(location.search).get('skin') || 'base'`)
    if (cur !== skin) {
      await ev(`[...document.querySelectorAll('#dp .tools button')].find(b => b.textContent === ${JSON.stringify(NAMES[skin] || skin)}).click(), 1`)
      await sleep(1500); ws.close(); await connect(); await ready()
    }
    await ev(`document.querySelector('#dp [data-k="all"]').click(), 1`)
    const t0 = Date.now(); await sleep(3000)
    while (!(await ev(`!document.querySelector('#dp [data-k="all"]').disabled`))) await sleep(2000)
    const res = await ev(`(() => {
      const rows = [...document.querySelector('#dp .body').children[0].querySelectorAll('.row')]
      return { pass: rows.filter(r => r.classList.contains('pass')).length, fail: rows.filter(r => r.classList.contains('fail')).map(r => r.querySelector('.nm').textContent + '\\n    ' + r.querySelector('.res').textContent.split('\\n').join('\\n    ')),
        errors: document.querySelector('#dp .err').textContent }
    })()`)
    console.log(`\n== ${NAMES[skin] || skin} (${skin}): ${res.pass} / ${res.pass + res.fail.length} passed, ${res.errors}, took ${((Date.now() - t0) / 1000).toFixed(0)} s`)
    for (const f of res.fail) console.log('  ✗ ' + f)
    failed += res.fail.length + (res.errors !== 'Errors 0' ? 1 : 0)
  }
} catch (e) { console.error('Self-test did not finish:', e.message); failed++ }
ws?.close(); child.kill()
process.exit(failed ? 1 : 0)
