// Global keyboard / mouse (uiohook-napi; the hook runs on its own thread)
// Privacy: letters / digits / punctuation only send "class + hand", never which key; nothing is written to disk or logged
const { uIOhook, UiohookKey: K } = require('uiohook-napi');

const CLS = new Map();
const put = (cls, keys) => keys.forEach((k) => CLS.set(k, cls));
put('letter', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => K[c]));
put('digit', [...'0123456789'.split('').map((c) => K[c]), ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => K['Numpad' + i])]);
put('punct', ['Semicolon', 'Equal', 'Comma', 'Minus', 'Period', 'Slash', 'Backquote', 'BracketLeft', 'Backslash',
  'BracketRight', 'Quote', 'NumpadMultiply', 'NumpadAdd', 'NumpadSubtract', 'NumpadDecimal', 'NumpadDivide'].map((n) => K[n]));
put('space', [K.Space]);
put('enter', [K.Enter, K.NumpadEnter]);
put('backspace', [K.Backspace, K.Delete]);
put('tab', [K.Tab]);
put('esc', [K.Escape]);
put('modifier', [K.Ctrl, K.CtrlRight, K.Alt, K.AltRight, K.Shift, K.ShiftRight, K.Meta, K.MetaRight, K.CapsLock]);
put('nav', ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Insert'].map((n) => K[n]));
put('fn', Array.from({ length: 24 }, (_, i) => K['F' + (i + 1)]));

// Only non-text keys get a name
const NAME = new Map();
for (const [n, code] of Object.entries(K)) {
  const c = CLS.get(code);
  if (c && c !== 'letter' && c !== 'digit' && c !== 'punct' && !NAME.has(code)) NAME.set(code, n);
}

// Left-hand zone (QWERTY); everything else is right hand, space is center
const LEFT = new Set([K.Escape, K.Backquote, K.Tab, K.CapsLock, K.Shift, K.Ctrl, K.Meta, K.Alt,
  ...'12345QWERTASDFGZXCVB'.split('').map((c) => K[c]), ...[1, 2, 3, 4, 5, 6].map((i) => K['F' + i])]);
const handOf = (code) => (code === K.Space ? 'C' : LEFT.has(code) ? 'L' : 'R');

// Shortcut meaning (Ctrl/Win + letter) without exposing the letter itself
const CTRL_COMBO = { [K.S]: 'save', [K.Z]: 'undo', [K.Y]: 'redo', [K.C]: 'copy', [K.V]: 'paste', [K.X]: 'cut',
  [K.A]: 'selectAll', [K.F]: 'find', [K.W]: 'closeTab', [K.T]: 'newTab' };
function comboOf(e) {
  if (e.altKey && e.keycode === K.Tab) return 'altTab';
  if (e.altKey && e.keycode === K.F4) return 'close';
  if (e.metaKey && e.keycode === K.D) return 'showDesktop';
  if (e.ctrlKey && !e.altKey) {
    if (e.shiftKey && e.keycode === K.Z) return 'redo';
    return CTRL_COMBO[e.keycode];
  }
  return undefined;
}

// handlers: { key, move, button, wheel }; move is throttled to ~60 Hz (first and last events are always sent)
function start(handlers, moveIntervalMs = 16) {
  const held = new Set();
  const mods = (e) => ({ ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
  const key = (type) => (e) => {
    const repeat = type === 'down' && held.has(e.keycode);
    if (type === 'down') held.add(e.keycode); else held.delete(e.keycode);
    const p = { type, cls: CLS.get(e.keycode) || 'other', hand: handOf(e.keycode), repeat, mods: mods(e), t: Date.now() };
    const name = NAME.get(e.keycode);
    if (name) p.key = name;
    if (type === 'down' && !repeat) { const c = comboOf(e); if (c) p.combo = c; }
    handlers.key(p);
  };
  uIOhook.on('keydown', key('down'));
  uIOhook.on('keyup', key('up'));

  let pending = null, timer = null;
  const flush = () => { timer = null; if (pending) { handlers.move(pending); pending = null; timer = setTimeout(flush, moveIntervalMs); } };
  uIOhook.on('mousemove', (e) => {
    pending = { x: e.x, y: e.y };
    if (!timer) flush();
  });
  const btn = (type) => (e) => handlers.button({ type, button: e.button, clicks: e.clicks, x: e.x, y: e.y, mods: mods(e) });
  uIOhook.on('mousedown', btn('down'));
  uIOhook.on('mouseup', btn('up'));
  uIOhook.on('wheel', (e) => handlers.wheel({ dir: e.direction === 4 ? 'h' : 'v', rotation: e.rotation, amount: e.amount, x: e.x, y: e.y }));
  uIOhook.start();
  return () => { clearTimeout(timer); uIOhook.removeAllListeners(); uIOhook.stop(); };
}

module.exports = { start };
