// Win32 sensors (koffi calling user32 / kernel32 / dwmapi / shell32 / ole32 directly)
// All coordinates are physical pixels; conversion to DIP happens in main.js
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');
const dwmapi = koffi.load('dwmapi.dll');
const shell32 = koffi.load('shell32.dll');
const ole32 = koffi.load('ole32.dll');

koffi.pointer('HWND', koffi.opaque());
koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
koffi.struct('POINT', { x: 'int32', y: 'int32' });
koffi.struct('MONITORINFO', { cbSize: 'uint32', rcMonitor: 'RECT', rcWork: 'RECT', dwFlags: 'uint32' });
koffi.struct('LASTINPUTINFO', { cbSize: 'uint32', dwTime: 'uint32' });
const WNDENUMPROC = koffi.proto('bool __stdcall WNDENUMPROC(HWND h, intptr_t lp)');

const W = {
  GetForegroundWindow: user32.func('HWND __stdcall GetForegroundWindow()'),
  GetWindowTextW: user32.func('int __stdcall GetWindowTextW(HWND h, void *buf, int n)'),
  GetClassNameW: user32.func('int __stdcall GetClassNameW(HWND h, void *buf, int n)'),
  GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(HWND h, _Out_ uint32_t *pid)'),
  GetWindowRect: user32.func('bool __stdcall GetWindowRect(HWND h, _Out_ RECT *r)'),
  GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(HWND h, int idx)'),
  IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(HWND h)'),
  IsIconic: user32.func('bool __stdcall IsIconic(HWND h)'),
  IsZoomed: user32.func('bool __stdcall IsZoomed(HWND h)'),
  MonitorFromPoint: user32.func('void * __stdcall MonitorFromPoint(POINT pt, uint32_t flags)'),
  GetMonitorInfoW: user32.func('bool __stdcall GetMonitorInfoW(void *m, _Inout_ MONITORINFO *mi)'),
  GetLastInputInfo: user32.func('bool __stdcall GetLastInputInfo(_Inout_ LASTINPUTINFO *li)'),
  EnumWindows: user32.func('bool __stdcall EnumWindows(WNDENUMPROC *cb, intptr_t lp)'),
  WindowFromPoint: user32.func('HWND __stdcall WindowFromPoint(POINT pt)'),
  GetAncestor: user32.func('HWND __stdcall GetAncestor(HWND h, uint32_t flags)'),
  SetWindowPos: user32.func('bool __stdcall SetWindowPos(HWND h, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
  GetTickCount: kernel32.func('uint32_t __stdcall GetTickCount()'),
  OpenProcess: kernel32.func('void * __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)'),
  QueryFullProcessImageNameW: kernel32.func('bool __stdcall QueryFullProcessImageNameW(void *h, uint32_t flags, void *buf, _Inout_ uint32_t *size)'),
  CloseHandle: kernel32.func('bool __stdcall CloseHandle(void *h)'),
  DwmGetWindowAttribute: dwmapi.func('int32_t __stdcall DwmGetWindowAttribute(HWND h, uint32_t attr, void *pv, uint32_t cb)'),
  SHQueryUserNotificationState: shell32.func('int32_t __stdcall SHQueryUserNotificationState(_Out_ int32_t *state)'),
  CoInitializeEx: ole32.func('int32_t __stdcall CoInitializeEx(void *r, uint32_t flags)'),
  CoCreateInstance: ole32.func('int32_t __stdcall CoCreateInstance(void *clsid, void *outer, uint32_t ctx, void *iid, _Out_ void **ppv)'),
};

const GWL_EXSTYLE = -20;
const WS_EX_TRANSPARENT = 0x20, WS_EX_TOOLWINDOW = 0x80, WS_EX_LAYERED = 0x80000;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9, DWMWA_CLOAKED = 14;
// These shell windows cover the screen but don't count as "fullscreen apps"
const SHELL_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd',
  'XamlExplorerHostIslandWindow', 'Windows.UI.Core.CoreWindow', 'MultitaskingViewFrame', 'ForegroundStaging']);

const buf = Buffer.alloc(1024);
const rectBuf = Buffer.alloc(16);
const u32Buf = Buffer.alloc(4);

// HWND is a BigInt in koffi 3; Electron's getNativeWindowHandle() returns a Buffer
const hwndOf = (b) => b.readBigUInt64LE(0);

function text(fn, h) {
  const n = fn(h, buf, 512);
  return n > 0 ? buf.toString('utf16le', 0, n * 2) : '';
}

function exStyle(h) { return Number(W.GetWindowLongPtrW(h, GWL_EXSTYLE)); }

// Visible bounds (without the invisible Win10/11 resize border); falls back to GetWindowRect
function frameRect(h) {
  if (W.DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, rectBuf, 16) === 0) {
    const [l, t, r, b] = [0, 4, 8, 12].map((o) => rectBuf.readInt32LE(o));
    return { x: l, y: t, width: r - l, height: b - t };
  }
  const r = {};
  if (!W.GetWindowRect(h, r)) return null;
  return { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
}

function cloaked(h) {
  return W.DwmGetWindowAttribute(h, DWMWA_CLOAKED, u32Buf, 4) === 0 && u32Buf.readUInt32LE(0) !== 0;
}

// pid -> exe file name, cached for a minute
let exeCache = new Map(), gameCache = new Map(), exeCacheAt = 0;   // gameCache: whether the process path looks like a game (decided in memory only, paths are not stored)
const GAME_PATH = /\\steamapps\\common\\|\\epic games\\|\\riot games\\|\\wegame\\|\\ea games\\|\\xboxgames\\|\\ubisoft game launcher\\games\\/i;
function exeOf(pid) {
  if (!pid) return '';
  const now = Date.now();
  if (now - exeCacheAt > 60000) { exeCache = new Map(); gameCache = new Map(); exeCacheAt = now; }
  let exe = exeCache.get(pid);
  if (exe !== undefined) return exe;
  exe = '';
  const hp = W.OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid);
  if (hp) {
    const size = [512];
    if (W.QueryFullProcessImageNameW(hp, 0, buf, size)) {
      const full = buf.toString('utf16le', 0, size[0] * 2);
      exe = full.slice(full.lastIndexOf('\\') + 1);
      gameCache.set(pid, GAME_PATH.test(full));
    }
    W.CloseHandle(hp);
  }
  exeCache.set(pid, exe);
  return exe;
}

function pidOf(h) { const p = [0]; W.GetWindowThreadProcessId(h, p); return p[0]; }

function primaryMonitor() {
  const m = W.MonitorFromPoint({ x: 0, y: 0 }, 1 /* MONITOR_DEFAULTTOPRIMARY */);
  const mi = { cbSize: 40 };
  if (!W.GetMonitorInfoW(m, mi)) return null;
  return mi.rcMonitor;
}

// Foreground window + whether something is fullscreen on the primary display + system idle
function poll(selfHwnd) {
  const h = W.GetForegroundWindow();
  const li = { cbSize: 8 };
  W.GetLastInputInfo(li);
  const idleMs = (W.GetTickCount() - li.dwTime) >>> 0;
  const qs = [0];
  W.SHQueryUserNotificationState(qs);
  const quns = qs[0]; // 3 = D3D exclusive fullscreen, 4 = presentation mode
  if (!h) return { hwnd: 0n, fg: null, fullscreen: quns === 3 || quns === 4, idleMs, quns };

  const cls = text(W.GetClassNameW, h);
  const pid = pidOf(h);
  const rect = frameRect(h);
  const isSelf = h === selfHwnd;
  let fullscreen = quns === 3 || quns === 4;
  if (!isSelf && !SHELL_CLASSES.has(cls)) {
    // A maximized window with a caption / resizable frame isn't fullscreen (with an auto-hiding taskbar its rect also covers the whole screen)
    const style = Number(W.GetWindowLongPtrW(h, -16));   // GWL_STYLE
    const framedMax = W.IsZoomed(h) && (style & (0x00C00000 | 0x00040000)) !== 0;   // WS_CAPTION | WS_THICKFRAME
    const r = {}, m = primaryMonitor();
    if (!framedMax && m && W.GetWindowRect(h, r))
      fullscreen ||= r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom;
  }
  return {
    hwnd: h,
    fg: { title: text(W.GetWindowTextW, h), exe: exeOf(pid), pid, cls, rect, maximized: W.IsZoomed(h), isSelf },
    fullscreen, idleMs, quns,
  };
}

// Visible top-level windows (Z order, top to bottom), for a future "stand on a title bar" feature
function topWindows(selfHwnd, max = 30) {
  const out = [];
  W.EnumWindows((h) => {
    if (h === selfHwnd || !W.IsWindowVisible(h) || W.IsIconic(h)) return true;
    if (exStyle(h) & WS_EX_TOOLWINDOW || cloaked(h)) return true;
    if (W.GetWindowTextW(h, buf, 2) === 0) return true; // Untitled ones are mostly popups / helper windows
    if (SHELL_CLASSES.has(text(W.GetClassNameW, h))) return true;
    const rect = frameRect(h);
    if (!rect || rect.width < 50 || rect.height < 30) return true;
    out.push({ rect, exe: exeOf(pidOf(h)), maximized: W.IsZoomed(h) });
    return out.length < max;
  }, 0);
  return out;
}

// For self-checks: which top-level window the mouse would land on at a screen point
function rootWindowAt(x, y) {
  const h = W.WindowFromPoint({ x, y });
  return h ? W.GetAncestor(h, 2 /* GA_ROOT */) : null;
}

// Push back to the top of the topmost band, without activating
function bringTopmost(h) {
  W.SetWindowPos(h, -1 /* HWND_TOPMOST */, 0, 0, 0, 0, 0x1 | 0x2 | 0x10 | 0x200);
}

// For self-checks: move the mouse 1 px right and back + an unassigned virtual key 0x97 (produces no character), to verify the hook chain
const SendInput = user32.func('uint32_t __stdcall SendInput(uint32_t n, void *inputs, int cb)');
function injectProbeInput() {
  const b = Buffer.alloc(40 * 4); // INPUT is 40 bytes on x64
  b.writeUInt32LE(0, 0); b.writeInt32LE(1, 8); b.writeUInt32LE(0x1, 20);    // INPUT_MOUSE dx=+1, MOUSEEVENTF_MOVE
  b.writeUInt32LE(0, 40); b.writeInt32LE(-1, 48); b.writeUInt32LE(0x1, 60); // dx=-1
  b.writeUInt32LE(1, 80); b.writeUInt16LE(0x97, 88);                        // INPUT_KEYBOARD down
  b.writeUInt32LE(1, 120); b.writeUInt16LE(0x97, 128); b.writeUInt32LE(2, 132); // up
  return SendInput(4, b, 40);
}

// ---------------- System audio peak: WASAPI IAudioMeterInformation ----------------
function guid(s) {
  const h = s.replace(/-/g, '');
  const b = Buffer.alloc(16);
  b.writeUInt32LE(parseInt(h.slice(0, 8), 16), 0);
  b.writeUInt16LE(parseInt(h.slice(8, 12), 16), 4);
  b.writeUInt16LE(parseInt(h.slice(12, 16), 16), 6);
  Buffer.from(h.slice(16), 'hex').copy(b, 8);
  return b;
}
const CLSID_MMDeviceEnumerator = guid('BCDE0395-E52F-467C-8E3D-C4579291692E');
const IID_IMMDeviceEnumerator = guid('A95664D2-9614-4F35-A746-DE8DB63617E6');
const IID_IAudioMeterInformation = guid('C02216F6-8C67-4B5B-9D00-D008E73E0064');
const IID_IAudioEndpointVolume = guid('5CDF2C82-841E-4546-9722-0CF74078229A');
const IID_IAudioSessionManager2 = guid('77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F');
const IID_IAudioSessionControl2 = guid('BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D');
const P = {
  Release: koffi.proto('uint32_t __stdcall Release(void *self)'),
  GetDefaultAudioEndpoint: koffi.proto('int32_t __stdcall GetDefaultAudioEndpoint(void *self, int flow, int role, _Out_ void **dev)'),
  Activate: koffi.proto('int32_t __stdcall Activate(void *self, void *iid, uint32_t ctx, void *params, _Out_ void **out)'),
  GetFloat: koffi.proto('int32_t __stdcall GetFloat(void *self, _Out_ float *v)'),
  GetBool: koffi.proto('int32_t __stdcall GetBool(void *self, _Out_ int32_t *v)'),
  QueryInterface: koffi.proto('int32_t __stdcall QueryInterface(void *self, void *iid, _Out_ void **out)'),
  GetPtr: koffi.proto('int32_t __stdcall GetPtr(void *self, _Out_ void **out)'),
  GetInt: koffi.proto('int32_t __stdcall GetInt(void *self, _Out_ int32_t *v)'),
  GetIndexed: koffi.proto('int32_t __stdcall GetIndexed(void *self, int i, _Out_ void **out)'),
  GetU32: koffi.proto('int32_t __stdcall GetU32(void *self, _Out_ uint32_t *v)'),
  IsSystem: koffi.proto('int32_t __stdcall IsSystem(void *self)'),
};
// i-th method of a COM vtable
const vfn = (obj, i) => koffi.decode(koffi.decode(obj, 'void *'), i * 8, 'void *');
const call = (obj, i, proto, ...a) => koffi.call(vfn(obj, i), proto, obj, ...a);
const release = (obj) => { if (obj) call(obj, 2, P.Release); };

// The default output device can change (headphones plugged in), so the caller runs reacquire() periodically
class AudioMeter {
  constructor() {
    W.CoInitializeEx(null, 2); // Doesn't matter if already STA / MTA; return value ignored
    const out = [null];
    const hr = W.CoCreateInstance(CLSID_MMDeviceEnumerator, null, 23 /* CLSCTX_ALL */, IID_IMMDeviceEnumerator, out);
    if (hr < 0) throw new Error(`CoCreateInstance(MMDeviceEnumerator) 0x${(hr >>> 0).toString(16)}`);
    this.enumerator = out[0];
    this.dev = this.meter = this.vol = this.mgr = null;
    this.sess = [];      // Per-app audio sessions: [{ pid, exe, game, meter }]
    this.reacquire();
  }
  reacquire() {
    this.drop();
    const out = [null];
    if (call(this.enumerator, 4, P.GetDefaultAudioEndpoint, 0 /* eRender */, 1 /* eMultimedia */, out) < 0) return false;
    this.dev = out[0];
    if (call(this.dev, 3, P.Activate, IID_IAudioMeterInformation, 23, null, out) >= 0) {
      this.meter = out[0];
      this.peakFn = vfn(this.meter, 3); // GetPeakValue; function pointer cached for the hot path
    }
    if (call(this.dev, 3, P.Activate, IID_IAudioEndpointVolume, 23, null, out) >= 0) this.vol = out[0];
    if (call(this.dev, 3, P.Activate, IID_IAudioSessionManager2, 23, null, out) >= 0) this.mgr = out[0];
    return !!this.meter;
  }
  // 0..1, -1 on failure (device gone; the caller should reacquire)
  peak() {
    if (!this.meter) return -1;
    const v = [0];
    return koffi.call(this.peakFn, P.GetFloat, this.meter, v) < 0 ? -1 : v[0];
  }
  // Master volume scalar 0..1 and mute
  volume() {
    if (!this.vol) return null;
    const v = [0], m = [0];
    call(this.vol, 9, P.GetFloat, v);   // GetMasterVolumeLevelScalar
    call(this.vol, 15, P.GetBool, m);   // GetMute
    return { volume: v[0], muted: !!m[0] };
  }
  // Re-enumerate the audio sessions on the default output device (one per app; the caller runs this at 1-2 Hz). Only pid / exe name / level meter, never audio data
  //  Returns the session count; -1 if the interface is unavailable (the caller falls back to the endpoint peak)
  enumSessions() {
    this.dropSessions();
    if (!this.mgr) return -1;
    const out = [null];
    if (call(this.mgr, 5, P.GetPtr, out) < 0) return -1;               // IAudioSessionManager2::GetSessionEnumerator
    const en = out[0], n = [0];
    try {
      if (call(en, 3, P.GetInt, n) < 0) return -1;                     // IAudioSessionEnumerator::GetCount
      for (let i = 0; i < n[0]; i++) {
        if (call(en, 4, P.GetIndexed, i, out) < 0) continue;           // GetSession → IAudioSessionControl
        const ctl = out[0], st = [0];
        try {
          if (call(ctl, 3, P.GetInt, st) < 0 || st[0] !== 1) continue; // Only AudioSessionStateActive
          if (call(ctl, 0, P.QueryInterface, IID_IAudioSessionControl2, out) < 0) continue;
          const c2 = out[0], pid = [0];
          const sys = call(c2, 15, P.IsSystem) === 0;                   // IsSystemSoundsSession: S_OK = system sounds
          call(c2, 14, P.GetU32, pid);                                  // GetProcessId
          release(c2);
          if (sys || !pid[0]) continue;
          if (call(ctl, 0, P.QueryInterface, IID_IAudioMeterInformation, out) < 0) continue;
          const exe = exeOf(pid[0]);
          this.sess.push({ pid: pid[0], exe, game: !!gameCache.get(pid[0]), meter: out[0] });
        } finally { release(ctl); }
      }
    } finally { release(en); }
    return this.sess.length;
  }
  // Current peak per session: [{ exe, pid, game, peak }]; sessions that fail to read get peak = 0
  sessionPeaks() {
    return this.sess.map((x) => {
      const v = [0];
      return { exe: x.exe, pid: x.pid, game: x.game, peak: call(x.meter, 3, P.GetFloat, v) < 0 ? 0 : v[0] };
    });
  }
  dropSessions() { for (const x of this.sess) release(x.meter); this.sess = []; }
  drop() {
    this.dropSessions();
    release(this.meter); release(this.vol); release(this.mgr); release(this.dev);
    this.meter = this.vol = this.mgr = this.dev = null;
  }
}

module.exports = {
  hwndOf, poll, topWindows, rootWindowAt, bringTopmost, injectProbeInput, AudioMeter,
  exStyle, WS_EX_TRANSPARENT, WS_EX_LAYERED, WS_EX_TOOLWINDOW,
};
