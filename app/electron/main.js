// Pet shell: transparent always-on-top overlay (covers the primary work area) + global keyboard/mouse + Win32 sensors + system audio peak + tray
// The renderer only draws and decides "is the cursor over the character"; everything window / system related lives here
const { app, BrowserWindow, ipcMain, screen, Tray, protocol, net } = require('electron');
const { trayMenu } = require('./menu');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// ---------- Command line ----------
const arg = (name) => {
  const a = process.argv.find((s) => s === `--${name}` || s.startsWith(`--${name}=`));
  return a === undefined ? null : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true;
};
const TEST_EXIT = Number(arg('test-exit')) || 0;   // Testing: quit automatically after N ms
const TEST_REPORT = arg('test-report');            // Testing: write the self-check results as JSON on exit
const FORCE_SPIKE = !!arg('spike');                // Force-load spike.html
const FPS = arg('fps');                            // Passed through to the page (?fps=)
const DEV_WINDOW = !!arg('dev');                   // Developer build: normal window + behavior panel (src/devpanel/), no tray
const DEV_URL = process.env.PET_DEV_URL;
const IS_DEV = !app.isPackaged || !!DEV_URL;
const ROOT = path.join(__dirname, '..');           // Root of app:// (inside app.asar when packaged)
const DIST = path.join(ROOT, 'dist', 'index.html');

// Hook up auto-exit first, so an error anywhere later can't leave a test window on the desktop
if (TEST_EXIT) {
  setTimeout(() => app.quit(), TEST_EXIT);
  setTimeout(() => app.exit(0), TEST_EXIT + 4000);
}

// Errors go to userData/error.log (release builds have no devtools); main-process exceptions don't pop Electron's default error box, the pet keeps running
let logCount = 0;
function logError(msg) {
  if (++logCount > 300) return;   // Don't fill the disk when something errors every frame
  try {
    const p = path.join(app.getPath('userData'), 'error.log');
    if (logCount === 1 && fs.existsSync(p) && fs.statSync(p).size > 1 << 20) fs.renameSync(p, p + '.old');
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

// fetch doesn't work under file:// (three's loaders rely on fetch), so the page uses a custom app://pet/ protocol
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// The developer build has its own user data and doesn't take the single-instance lock, so it never interferes with a running release;
// when several developer windows run at once, give each --dev-profile=<name> so their caches don't clash (tuning.json is still shared)
if (DEV_WINDOW) {
  const prof = arg('dev-profile');
  app.setPath('userData', path.join(app.getPath('appData'), 'RampartPet3D-dev' + (prof && prof !== true ? '-' + prof : '')));
  app.whenReady().then(bootDevWindow);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => setConfig({ visible: true }));
  app.whenReady().then(boot);
}

// Native modules load lazily: no need to load them if the single-instance check fails
let w32, input;

let win = null, selfHwnd = 0n, tray = null;
let interactive = false, leaseTimer = null, fsHidden = false, fsStreak = 0;
let stopInput = null, meter = null;
const T = TEST_EXIT && TEST_REPORT ? { checks: {}, counts: { key: 0, mouse: 0, button: 0, wheel: 0, system: 0, audio: 0 }, audioMax: 0, cpu: [], errors: [] } : null;
process.on('uncaughtException', (e) => { console.error(e); logError('main: ' + (e?.stack || e)); if (T) T.errors.push('main: ' + e?.message); });
process.on('unhandledRejection', (e) => { console.error(e); logError('main (promise): ' + (e?.stack || e)); if (T) T.errors.push('main (promise): ' + e?.message); });

// ---------- Tuning ----------
// Tunable parameters (idle thresholds etc.): the developer build and the release share one %APPDATA%/RampartPet3D/tuning.json
// (the developer build's userData is a different directory, so this can't live in config.json)
// Whenever the file changes (saved by either side) it is pushed to the page; a running release picks it up without a restart
const TUNING_PATH = path.join(app.getPath('appData'), 'RampartPet3D', 'tuning.json');
const readTuning = () => { try { return JSON.parse(fs.readFileSync(TUNING_PATH, 'utf8')); } catch { return {}; } };
function writeTuning(patch) {
  if (!patch || typeof patch !== 'object') return readTuning();
  const t = { ...readTuning(), ...patch };
  for (const k in patch) if (patch[k] === null) delete t[k];   // null = restore this item's default
  fs.mkdirSync(path.dirname(TUNING_PATH), { recursive: true });
  fs.writeFileSync(TUNING_PATH + '.tmp', JSON.stringify(t, null, 2));
  fs.renameSync(TUNING_PATH + '.tmp', TUNING_PATH);
  return t;
}

// ---------- Config ----------
const DEFAULTS = { visible: true, size: 'm', muteBubbles: false, hideOnFullscreen: true, sleepAfter: 5 };   // sleepAfter: idle minutes before she lies down (falls asleep at twice that); set in the in-game settings panel
let config = { ...DEFAULTS };
const cfgPath = () => path.join(app.getPath('userData'), 'config.json');
function loadConfig() {
  try { config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgPath(), 'utf8')) }; } catch { config = { ...DEFAULTS }; }
}
let saveTimer = null;
function saveConfig() {
  clearTimeout(saveTimer); saveTimer = null;
  try {
    const p = cfgPath();
    fs.writeFileSync(p + '.tmp', JSON.stringify(config, null, 2));
    fs.renameSync(p + '.tmp', p);
  } catch (e) { console.error('Failed to save config', e); }
}
function setConfig(patch) {
  if (!patch || typeof patch !== 'object') return fullConfig();
  if ('openAtLogin' in patch) { setLogin(!!patch.openAtLogin); patch = { ...patch }; delete patch.openAtLogin; }
  config = { ...config, ...patch };
  for (const k in patch) if (patch[k] === null) delete config[k]; // null = delete this key
  clearTimeout(saveTimer); saveTimer = setTimeout(saveConfig, 500);
  applyVisibility();
  send('pet:config', fullConfig());
  buildTrayMenu();
  return fullConfig();
}
const fullConfig = () => ({ ...config, openAtLogin: getLogin() });

// Launch at startup: the portable build must register the outer exe, not the one unpacked to a temp directory
const loginOpts = () => ({
  path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
  args: app.isPackaged ? [] : [app.getAppPath()],
});
const getLogin = () => app.getLoginItemSettings(loginOpts()).openAtLogin;
const setLogin = (on) => app.setLoginItemSettings({ ...loginOpts(), openAtLogin: on });

// ---------- Window ----------
function screenInfo() {
  const d = screen.getPrimaryDisplay();
  return { workArea: d.workArea, bounds: d.bounds, scaleFactor: d.scaleFactor, dev: DEV_WINDOW };
}
const send = (ch, payload) => { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); };

// Click-through; this is the default state and anything unexpected falls back to it. Cursor position comes from uiohook; forward is off
// (it installs a low-level mouse hook in the main process, so any main-process stall would freeze the mouse system-wide)
function setIgnore(ignore) {
  if (!win || win.isDestroyed()) return;
  if (ignore) win.setIgnoreMouseEvents(true);
  else win.setIgnoreMouseEvents(false);
}
const ignoreVerified = () => (w32.exStyle(selfHwnd) & w32.WS_EX_TRANSPARENT) !== 0;

// The renderer reports its hit test every frame; true is a 1.5 s lease, so a hung / crashed renderer falls back to click-through
function setInteractive(v) {
  clearTimeout(leaseTimer);
  if (v) leaseTimer = setTimeout(() => setInteractive(false), 1500);
  if (v === interactive) return;
  interactive = v;
  setIgnore(!v);
}

function applyVisibility() {
  if (!win || win.isDestroyed()) return;
  const show = config.visible && !fsHidden;
  if (show && !win.isVisible()) { win.showInactive(); setIgnore(!interactive); }
  if (!show && win.isVisible()) { setInteractive(false); win.hide(); }
}

function fitToWorkArea() {
  const wa = screen.getPrimaryDisplay().workArea;
  win.setBounds(wa);
  send('pet:screen', screenInfo());
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    ...wa, show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    type: 'toolbar',            // WS_EX_TOOLWINDOW: not in Alt+Tab
    focusable: false,           // WS_EX_NOACTIVATE: clicking the character doesn't steal focus
    skipTaskbar: true, hasShadow: false, alwaysOnTop: true, thickFrame: false,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  selfHwnd = w32.hwndOf(win.getNativeWindowHandle());

  // First thing: confirm click-through is in effect, otherwise don't show the window
  setIgnore(true);
  if (!ignoreVerified()) { setIgnore(true); }
  const ok = ignoreVerified();
  if (T) T.checks.ignoreBeforeShow = ok;
  if (!ok) { console.error('Click-through did not take effect, not showing the overlay'); app.exit(1); return; }

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setBounds(wa);
  win.on('always-on-top-changed', (_e, top) => { if (!top) win.setAlwaysOnTop(true, 'screen-saver'); });
  win.once('ready-to-show', () => {
    applyVisibility();
    if (!ignoreVerified()) setIgnore(true);
    if (T) { T.checks.ignoreAfterShow = ignoreVerified(); T.exStyle = '0x' + w32.exStyle(selfHwnd).toString(16); setTimeout(testProbes, 1500); }
  });

  const wc = win.webContents;
  wc.on('will-navigate', (e, url) => { if (!url.startsWith('app://pet/') && !(DEV_URL && url.startsWith(DEV_URL))) e.preventDefault(); });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('unresponsive', () => setInteractive(false));
  wc.on('did-start-loading', () => setInteractive(false));
  wc.on('render-process-gone', (_e, d) => {
    setInteractive(false);
    if (T) T.errors.push('render-process-gone ' + d.reason);
    if (d.reason !== 'clean-exit') setTimeout(load, 1000);
  });
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain && DEV_URL) setTimeout(load, 1000); });
  wc.on('console-message', (e) => {
    if (e.level !== 'error' && e.level !== 'warning') return;
    if (T && e.level === 'error') T.errors.push('renderer: ' + e.message);
    if (e.level === 'error') logError(`renderer: ${e.message} (${e.sourceId}:${e.lineNumber})`);
    if (IS_DEV) console.log(`[renderer ${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });
  load();
}

function load() {
  const q = FPS ? `?fps=${FPS}` : '';
  if (DEV_URL && !FORCE_SPIKE) win.loadURL(DEV_URL + q);
  else if (!FORCE_SPIKE && fs.existsSync(DIST)) win.loadURL('app://pet/dist/index.html' + q);
  else win.loadURL('app://pet/electron/spike.html' + q);
}

function serveApp() {
  protocol.handle('app', (req) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url).pathname));
    if (!file.startsWith(ROOT + path.sep)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ---------- Sensors ----------
const dipPoint = (x, y) => screen.screenToDipPoint({ x, y });
function withLocal(p) {
  const b = win.getContentBounds();
  p.lx = p.x - b.x; p.ly = p.y - b.y;
  return p;
}
function rectPayload(r) {
  if (!r) return null;
  const d = screen.screenToDipRect(null, r), b = win.getContentBounds();
  return { ...d, lx: d.x - b.x, ly: d.y - b.y };
}
const live = () => win && !win.isDestroyed() && win.isVisible();

function startInput() {
  stopInput = input.start({
    key: (p) => { if (T) T.counts.key++; if (live()) send('pet:key', p); },
    move: (p) => {
      if (T) T.counts.mouse++;
      if (!live()) return;
      const d = dipPoint(p.x, p.y);
      send('pet:mouse', withLocal({ x: d.x, y: d.y, t: Date.now() }));
    },
    button: (p) => {
      if (T) T.counts.button++;
      if (!live()) return;
      const d = dipPoint(p.x, p.y);
      send('pet:button', withLocal({ ...p, x: d.x, y: d.y, t: Date.now() }));
    },
    wheel: (p) => {
      if (T) T.counts.wheel++;
      if (!live()) return;
      const d = dipPoint(p.x, p.y);
      send('pet:wheel', withLocal({ ...p, x: d.x, y: d.y, t: Date.now() }));
    },
  });
}

let lastFg = 0n;
function pollSystem() {
  if (!win || win.isDestroyed()) return;   // On exit the window is destroyed first and the timer fires once more (reading its bounds would throw "Object has been destroyed")
  let s;
  try { s = w32.poll(selfHwnd); } catch (e) { if (T) T.errors.push('poll ' + e.message); return; }
  // Hide when something is fullscreen on the primary display (two polls in a row, ~1 s), so we don't cover games / videos
  fsStreak = s.fullscreen ? fsStreak + 1 : 0;
  const hide = !DEV_WINDOW && config.hideOnFullscreen && fsStreak >= 2;   // The developer window never hides
  if (hide !== fsHidden) { fsHidden = hide; applyVisibility(); }
  // When the foreground window changes, push ourselves back to the top of the topmost band (without activating)
  if (s.hwnd !== lastFg) { lastFg = s.hwnd; if (live() && !s.fullscreen && !DEV_WINDOW) w32.bringTopmost(selfHwnd); }   // Don't jump above a fullscreen app
  delete s.hwnd;
  if (s.fg) { s.fg.rect = rectPayload(s.fg.rect); delete s.fg.pid; }
  s.windows = live() ? w32.topWindows(selfHwnd).map((w) => ({ ...w, rect: rectPayload(w.rect) })) : [];
  s.hidden = fsHidden;
  s.t = Date.now();
  if (T) { T.counts.system++; if (s.fg && !s.fg.isSelf) T.fg = { exe: s.fg.exe, titleLen: s.fg.title.length, cls: s.fg.cls }; T.idleMs = s.idleMs; T.windows = s.windows.length; }
  send('pet:system', s);
}

function startAudio() {
  try { meter = new w32.AudioMeter(); } catch (e) { console.error('Audio peak meter unavailable', e.message); if (T) T.errors.push('audio ' + e.message); return; }
  let tick = 0, lastPeak = 0, vol = meter.volume();
  // Per-app audio sessions (the brain uses them to tell who is making sound: browser / meeting / game audio doesn't count as music).
  //  Only levels are read, never audio data; after 5 errors they are disabled for this run, sessions is sent as null and the brain falls back to the endpoint peak
  let sessOK = true, sessFail = 0;
  const sessGuard = (f) => { if (!sessOK) return null; try { return f(); } catch (e) { if (++sessFail >= 5) { sessOK = false; console.error('Per-app audio sessions unavailable, falling back to the total peak', e.message); } return null; } };
  sessGuard(() => meter.enumSessions());
  setInterval(() => {
    if (!live()) return;
    tick++;
    if (tick % 90 === 0) meter.reacquire();             // Every 3 s, to follow default-device changes
    if (tick % 15 === 0) { vol = meter.volume() || vol; if (sessGuard(() => meter.enumSessions()) === -1 && ++sessFail >= 5) sessOK = false; }   // Every 0.5 s: volume, re-enumerate sessions
    let peak = meter.peak();
    if (peak < 0) { if (tick % 30 === 0) meter.reacquire(); peak = 0; }
    if (T) { T.counts.audio++; T.audioMax = Math.max(T.audioMax, peak); }
    // 30 Hz while there is sound; when quiet, send a single 0 plus a 2 Hz heartbeat
    if (peak > 0.001 || lastPeak > 0.001 || tick % 15 === 0) {
      const ss = sessGuard(() => meter.sessionPeaks().filter((x) => x.peak > 0.001));
      send('pet:audio', { peak, volume: vol ? vol.volume : 1, muted: vol ? vol.muted : false, sessions: sessOK ? ss || [] : null, t: Date.now() });
    }
    lastPeak = peak;
  }, 33);
}

// ---------- Tray ----------
// Menu contents live in menu.js (GUI); this only wires up the actions
function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(trayMenu({
    config, setConfig, getLogin, isDev: IS_DEV,
    reload: () => win?.webContents.reload(),
    reloadHard: () => win.webContents.reloadIgnoringCache(),
    devtools: () => win.webContents.openDevTools({ mode: 'detach' }),
    quit: () => app.quit(),
  }));
}

// ---------- IPC ----------
function setupIpc() {
  const fromPet = (e) => win && e.sender === win.webContents;
  ipcMain.on('pet:screen', (e) => { e.returnValue = screenInfo(); });
  ipcMain.on('pet:interactive', (e, v) => { if (fromPet(e) && !DEV_WINDOW) setInteractive(!!v && live()); });   // The developer window has no click-through
  ipcMain.handle('pet:getConfig', () => fullConfig());
  ipcMain.handle('pet:setConfig', (_e, patch) => setConfig(patch));
  ipcMain.handle('pet:getTuning', () => readTuning());
  ipcMain.handle('pet:setTuning', (_e, patch) => writeTuning(patch));
  fs.watchFile(TUNING_PATH, { interval: 1000 }, () => send('pet:tuning', readTuning()));
  ipcMain.on('pet:quit', (e) => { if (fromPet(e)) app.quit(); });
  // Right-clicking the character pops up the same menu as the tray (through the tray's hidden window, so clicking elsewhere closes it)
  // No arguments: on Windows it pops up at the cursor by default; passing (undefined, point) throws "conversion failure from undefined"
  ipcMain.on('pet:menu', (e) => { if (fromPet(e) && tray) tray.popUpContextMenu(); });
}

// ---------- Startup / exit ----------
function boot() {
  w32 = require('./win32');
  input = require('./input');
  loadConfig();
  serveApp();
  setupIpc();
  createWindow();
  if (!win || win.isDestroyed()) return;
  startInput();
  setInterval(pollSystem, 500);
  startAudio();
  tray = new Tray(path.join(__dirname, 'icon.ico'));
  tray.setToolTip(`Rampart ${app.getVersion()}`);
  tray.on('click', () => tray.popUpContextMenu());
  buildTrayMenu();
  const refit = () => { if (win && !win.isDestroyed()) fitToWorkArea(); };
  screen.on('display-metrics-changed', refit);
  screen.on('display-added', refit);
  screen.on('display-removed', refit);
  if (T) { const d = screen.getPrimaryDisplay(); T.display = { bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor, hz: d.displayFrequency }; startCpuSampling(); }
}

// ---------- Developer build ----------
// A normal framed window; the page runs in dev mode (simulated desktop + developer panel, petAPI.dev = true).
// Real sensors are still connected (global keyboard, foreground app, system idle, audio peak) since the panel's "real-input checks" rely on them; the mouse uses DOM events inside the window
function bootDevWindow() {
  w32 = require('./win32');
  input = require('./input');
  loadConfig();
  serveApp();
  setupIpc();
  const w = win = new BrowserWindow({
    width: 1600, height: 960, title: `Rampart Developer Build ${app.getVersion()}`, icon: path.join(__dirname, 'icon.ico'), backgroundColor: '#0b1a3d',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: false, backgroundThrottling: false },
  });
  selfHwnd = w32.hwndOf(w.getNativeWindowHandle());
  startInput();
  setInterval(pollSystem, 500);
  startAudio();
  w.removeMenu();
  w.on('page-title-updated', (e) => e.preventDefault());
  const wc = w.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  // F12 devtools, Ctrl+R / F5 reload
  wc.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F12') { wc.toggleDevTools(); e.preventDefault(); }
    else if (i.key === 'F5' || (i.control && i.key.toLowerCase() === 'r')) { wc.reloadIgnoringCache(); e.preventDefault(); }
  });
  wc.on('console-message', (e) => { if (e.level === 'error') logError(`renderer(dev): ${e.message} (${e.sourceId}:${e.lineNumber})`); });
  w.loadURL(DEV_URL || 'app://pet/dist/index.html');
}

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  if (stopInput) { stopInput(); stopInput = null; }
  if (meter) { meter.drop(); meter = null; }
  if (saveTimer) saveConfig();
  if (tray) { tray.destroy(); tray = null; }
});

// ---------- Test self-checks (only run with --test-exit + --test-report) ----------
function testProbes() {
  const wa = screen.getPrimaryDisplay().workArea;
  const probe = screen.dipToScreenPoint({ x: wa.x + 200, y: wa.y + 200 }); // Far from the spike canvas
  const at = () => w32.rootWindowAt(probe.x, probe.y) === selfHwnd;
  T.checks.clickThroughOutside = !at();                       // With click-through, the mouse at this point lands on the window below
  setInteractive(true);
  T.checks.interactiveCapturesMouse = at() && !ignoreVerified(); // When interactive, it lands on us
  setInteractive(false);
  T.checks.clickThroughRestored = !at() && ignoreVerified();
  T.countsBeforeInject = { ...T.counts };
  const cur = screen.getCursorScreenPoint();
  T.checks.injected = w32.injectProbeInput();
  setTimeout(() => {
    T.countsAfterInject = { ...T.counts };
    const c2 = screen.getCursorScreenPoint();
    T.checks.cursorUnchanged = c2.x === cur.x && c2.y === cur.y;
    testLease();
  }, 500);
  // One config round trip over IPC (write a test key, then delete it)
  win.webContents.executeJavaScript(`new Promise((ok) => {
    const off = petAPI.onConfig((c) => { off(); ok(c._selftest === 1); });
    petAPI.setConfig({ _selftest: 1 }).then((c) => { if (c._selftest !== 1) ok(false); });
  })`).then(async (pushed) => {
    const back = await win.webContents.executeJavaScript('petAPI.setConfig({ _selftest: null })');
    T.checks.configRoundTrip = pushed && !('_selftest' in back);
  }, (e) => T.errors.push('config ' + e.message));
}

// Without lease renewal from the renderer we fall back to click-through within 1.5 s; the window is hidden for this test so it can't eat the user's clicks
function testLease() {
  win.hide();
  setInteractive(true);
  const on = !ignoreVerified();
  setTimeout(() => {
    T.checks.leaseExpires = on && ignoreVerified() && !interactive;
    applyVisibility();
    T.checks.ignoreAfterReshow = ignoreVerified();
  }, 1700);
}

function startCpuSampling() {
  app.getAppMetrics(); // The first call only establishes a baseline
  setTimeout(() => {
    app.getAppMetrics();
    const iv = setInterval(() => {
      const m = app.getAppMetrics();
      T.cpu.push({ total: m.reduce((a, p) => a + p.cpu.percentCPUUsage, 0), byType: Object.fromEntries(m.map((p) => [p.type + ':' + p.pid, +p.cpu.percentCPUUsage.toFixed(2)])) });
      T.mem = Object.fromEntries(m.map((p) => [p.type + ':' + p.pid, Math.round(p.memory.workingSetSize / 1024)]));
    }, 2000);
    app.once('before-quit', () => clearInterval(iv));
  }, 6000);
}

if (T) {
  app.once('before-quit', (e) => {
    if (T.done) return;
    e.preventDefault();
    T.done = true;
    let finished = false;
    const finish = (stats) => {
      if (finished) return;
      finished = true;
      const cpu = T.cpu.map((s) => s.total);
      T.cpuAvg = cpu.length ? +(cpu.reduce((a, b) => a + b, 0) / cpu.length).toFixed(2) : null;
      T.renderer = stats;
      T.gpu = app.getGPUFeatureStatus();
      T.pids = app.getAppMetrics().map((p) => ({ pid: p.pid, type: p.type }));
      T.interactiveAtExit = interactive;
      try { fs.writeFileSync(TEST_REPORT, JSON.stringify(T, null, 2)); } catch (err) { console.error(err); }
      app.quit();
    };
    if (win && !win.isDestroyed())
      win.webContents.executeJavaScript('window.__spikeStats || null').then(finish, () => finish(null));
    else finish(null);
    setTimeout(() => finish(null), 2000);
  });
}
