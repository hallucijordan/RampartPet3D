// UI config read / write: one interface, three backends
//   Overlay (release, petAPI and not dev): petAPI.getConfig / setConfig / onConfig → %APPDATA%/RampartPet3D/config.json
//   Developer window (petAPI.dev): also petAPI, but the main process's userData is RampartPet3D-dev[-<profile>], so the release config is untouched
//   Browser (no petAPI): localStorage (settings in pet3d.ui.cfg; one key per data item, e.g. pet3d.ui.stats)
//
// Two kinds of writes:
//   set(patch)       settings (lang / hud / xpbar / size / skin / visible / openAtLogin / hideOnFullscreen), written immediately
//   save(key, val)   data (uiStats / uiProgress), throttled: at most once every 15 s, plus once on beforeunload; don't write to disk per keystroke
//   flush()          write pending data now (call before quitting or reloading for a skin change), returns a Promise
// Changes from elsewhere (tray menu changed the size) arrive via onChange(cb), cb gets the full config

const LS_CFG = 'pet3d.ui.cfg'
const LS_DATA = { uiStats: 'pet3d.ui.stats', uiProgress: 'pet3d.ui.progress' }
const THROTTLE = 15000

const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

export function createStore() {
  const api = window.petAPI || null
  let cfg = {}
  const pending = {}           // pending data writes
  let timer = null, lastWrite = 0
  const subs = []

  const writeData = () => {
    clearTimeout(timer); timer = null
    const keys = Object.keys(pending)
    if (!keys.length) return Promise.resolve()
    const patch = {}
    for (const k of keys) { patch[k] = pending[k]; delete pending[k] }
    lastWrite = performance.now()
    Object.assign(cfg, patch)
    if (api) return api.setConfig(patch).catch(e => console.warn('Failed to save UI data', e))
    for (const k in patch) lsSet(LS_DATA[k] || 'pet3d.ui.' + k, patch[k])
    return Promise.resolve()
  }

  const store = {
    // Read the full config once (in mountUI)
    async load() {
      if (api) {
        try { cfg = await api.getConfig() } catch { cfg = {} }
        api.onConfig(c => { cfg = { ...c, ...pending }; for (const f of subs) f(cfg) })
      } else {
        cfg = { ...(lsGet(LS_CFG) || {}) }
        for (const k in LS_DATA) { const v = lsGet(LS_DATA[k]); if (v != null) cfg[k] = v }
      }
      return cfg
    },
    get(key, def) { return cfg[key] ?? def },
    get all() { return cfg },
    // Settings: write immediately (the main process debounces the disk write by 500 ms and rebuilds the tray menu)
    set(patch) {
      Object.assign(cfg, patch)
      if (api) return api.setConfig(patch).catch(e => console.warn('Failed to save settings', e))
      const o = lsGet(LS_CFG) || {}
      Object.assign(o, patch)
      for (const k in patch) if (patch[k] == null) delete o[k]
      lsSet(LS_CFG, o)
      for (const f of subs) f(cfg)          // the browser has no main process pushing back, so notify ourselves
      return Promise.resolve(cfg)
    },
    // Data: throttled writes
    save(key, value) {
      pending[key] = value
      if (timer) return
      const wait = Math.max(0, THROTTLE - (performance.now() - lastWrite))
      timer = setTimeout(writeData, wait)
    },
    flush: writeData,
    onChange(f) { subs.push(f); return () => subs.splice(subs.indexOf(f), 1) },
    // Disable data writes for demos / screenshots (stats and XP changed in a demo aren't persisted)
    frozen: false,
  }
  const save0 = store.save
  store.save = (k, v) => { if (!store.frozen) save0(k, v) }
  window.addEventListener('beforeunload', () => { if (!store.frozen) writeData() })
  return store
}
