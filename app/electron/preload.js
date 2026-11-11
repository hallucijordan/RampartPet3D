// window.petAPI: the only interface between the renderer and the shell (fields documented in API.md)
const { contextBridge, ipcRenderer } = require('electron');

const on = (ch) => (cb) => {
  const h = (_e, d) => cb(d);
  ipcRenderer.on(ch, h);
  return () => ipcRenderer.removeListener(ch, h); // Returns an unsubscribe function
};

let screen = ipcRenderer.sendSync('pet:screen');
ipcRenderer.on('pet:screen', (_e, s) => { screen = s; });

// Safe to call every frame: sends immediately on change; while true, renews the lease every 400 ms (the main process falls back to click-through after 1.5 s without renewal)
let lastInteractive = null, lastSent = 0;
function setInteractive(v) {
  v = !!v;
  const now = performance.now();
  if (v === lastInteractive && (!v || now - lastSent < 400)) return;
  lastInteractive = v; lastSent = now;
  ipcRenderer.send('pet:interactive', v);
}

contextBridge.exposeInMainWorld('petAPI', {
  onKey: on('pet:key'),
  onMouse: on('pet:mouse'),
  onButton: on('pet:button'),
  onWheel: on('pet:wheel'),
  onSystem: on('pet:system'),
  onAudio: on('pet:audio'),
  onConfig: on('pet:config'),
  onScreen: on('pet:screen'),
  setInteractive,
  getConfig: () => ipcRenderer.invoke('pet:getConfig'),
  setConfig: (patch) => ipcRenderer.invoke('pet:setConfig', patch),
  // Tunable parameters (idle thresholds etc.), shared by the developer build and the release; null = restore default
  getTuning: () => ipcRenderer.invoke('pet:getTuning'),
  setTuning: (patch) => ipcRenderer.invoke('pet:setTuning', patch),
  onTuning: on('pet:tuning'),
  getScreen: () => screen,
  screen,
  dev: !!screen.dev,       // Developer build window (RampartPet3D.exe --dev): the page runs in dev mode and only borrows the real sensors
  showMenu: () => ipcRenderer.send('pet:menu'),
  quit: () => ipcRenderer.send('pet:quit'),
});
