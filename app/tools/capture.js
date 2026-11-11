// Offscreen capture: open the dev page's capture mode in Electron, advance in fixed steps and grab a PNG per frame
// Usage (arguments go through a JSON file; a URL on the command line would be grabbed by Electron's default app):
//   CAP_JOB=job.json electron tools/capture.js
//   job.json: { "url": "http://localhost:5173/?capture=1&clip=...", "out": "out/frames", "frames": 90, "fps": 30,
//               "size": "540x660", "warm": 20, "script": "optional: js run in the page, defines function onFrame(i, t, P)" }
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

const logFile = path.join(os.tmpdir(), 'pet_capture.log')
const LOG = (...m) => fs.appendFileSync(logFile, m.join(' ') + '\n')

const args = JSON.parse(fs.readFileSync(process.env.CAP_JOB, 'utf8'))
const frames = Number(args.frames || 60)
const fps = Number(args.fps || 30)
const warm = Number(args.warm ?? 20)
const [W, H] = (args.size || '1280x720').split('x').map(Number)

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
process.on('uncaughtException', e => { LOG('UNCAUGHT', e.stack); app.exit(3) })

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W, height: H, show: !!args.page, transparent: true, frame: false, x: -W - 100, y: 0,
    skipTaskbar: true, focusable: false,
    webPreferences: { backgroundThrottling: false },
  })
  win.webContents.on('render-process-gone', (e, d) => { LOG('renderer gone', JSON.stringify(d)); app.exit(4) })
  win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) LOG('console', e.message) })
  await win.loadURL(args.url)
  const js = (code) => win.webContents.executeJavaScript(code)
  for (let i = 0; i < 600 && !(await js('!!window.__ready')); i++) await new Promise(r => setTimeout(r, 100))
  if (!(await js('!!window.__ready'))) { LOG('page not ready'); app.exit(1) }
  await js(`window.__errors = []; window.addEventListener('error', e => __errors.push(String(e.message))); window.addEventListener('unhandledrejection', e => __errors.push('reject: ' + String(e.reason && (e.reason.stack || e.reason))));
    const _w = console.warn; console.warn = (...a) => { __errors.push('warn: ' + a.map(String).join(' ').slice(0, 300)); _w(...a) }; 0`)
  if (args.script) await js(fs.readFileSync(args.script, 'utf8'))
  fs.mkdirSync(args.out, { recursive: true })
  const dt = 1 / fps
  const step = (i) => `window.onFrame && onFrame(${i}, ${i * dt}, window.__pet); __step(${dt}); (window.__frameLog ||= []).push([${i}, window.__pet.pet.current?.key, window.__pet.brain.act?.name, window.__pet.brain.base, window.__pet.brain.state, [Math.round(window.__pet.brain.input.mouse.x), Math.round(window.__pet.brain.input.mouse.y), window.__cursorDown ? 1 : 0], window.__pet.brain.typing.level, +window.__pet.brain.input.rate(2000).toFixed(1), +window.__pet.proc.sheila.flyV.toFixed(1), Object.fromEntries(Object.entries(window.__pet.proc.expr.w).map(([k,v])=>[k,+v.toFixed(2)]))]);`
  // Wait while clips / props are still loading, so we don't record the A-pose
  const settle = async () => { for (let k = 0; k < 200 && await js('window.__busy && window.__busy()'); k++) await new Promise(r => setTimeout(r, 50)) }
  for (let i = -warm; i < 0; i++) { await js(step(i)); await settle() }
  for (let i = 0; i < frames; i++) {
    const file = path.join(args.out, `f_${String(i).padStart(4, '0')}.png`)
    await settle()
    if (args.nograb) {
      // Advance without writing images (for soak tests)
      await js(step(i) + ' 0')
    } else if (args.page) {
      // Full-page screenshot (includes canvas offset and speech bubbles)
      await js(step(i) + ' 0')
      await new Promise(r => setTimeout(r, 30))
      const img = await win.webContents.capturePage()
      fs.writeFileSync(file, img.toPNG())
    } else {
      const data = await js(step(i) + ' __grab()')
      fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'))
    }
  }
  // Per-frame log of the current clip and behavior (for debugging)
  const log = await js('JSON.stringify(window.__frameLog || [])')
  fs.writeFileSync(path.join(args.out, 'log.json'), log)
  fs.writeFileSync(path.join(args.out, 'errors.json'), await js('JSON.stringify(window.__errors || [])'))
  LOG('frames written', frames, args.out)
  app.exit(0)
})
