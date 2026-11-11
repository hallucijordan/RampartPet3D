// Tray / context menu (GUI): items, labels and order live here; the actual actions are passed in by main.js via ctx
//  Left- and right-clicking the tray both pop up this menu (right-clicking the character now opens the in-game settings panel and only falls back to this menu when the UI isn't mounted)
//  Labels are English only (as in src/ui/i18n.js); main.js rebuilds the menu after every setConfig
const { Menu, app } = require('electron');

// Skins: value x maps to assets/rampart_x.glb (base skin = rampart.glb); export via SKINS in tools/cfg.py.
// Keep the skin lists in the developer panel (src/devpanel) and the settings panel (src/ui/panel.js) in sync
const SKINS = ['base', 'hp', 'rebecca', 'bear'];
const SIZES = ['s', 'm', 'l'];

const T = {
  en: {
    show: 'Show', hide: 'Hide', size: 'Size', skin: 'Skin', autostart: 'Launch at startup', reload: 'Reload', devtools: 'Developer tools', quit: 'Quit',
    s: 'Small', m: 'Medium', l: 'Large',
    base: 'Standard', hp: 'Heritage Pride', rebecca: 'Rebecca (collab)', bear: 'Bear-iccade',
  },
};

// ctx: { config, setConfig(patch), getLogin(), isDev, reload(), reloadHard(), devtools(), quit() }
function trayMenu(ctx) {
  const { config, setConfig } = ctx;
  const t = T.en;
  return Menu.buildFromTemplate([
    { label: config.visible ? t.hide : t.show, click: () => setConfig({ visible: !config.visible }) },
    { label: t.size, submenu: SIZES.map((v) => ({ label: t[v], type: 'radio', checked: config.size === v, click: () => setConfig({ size: v }) })) },
    { label: t.skin, submenu: SKINS.map((v) => ({
      label: t[v], type: 'radio', checked: (config.skin || 'base') === v,
      click: () => { setConfig({ skin: v }); ctx.reload() },   // Changing skin simply reloads the page
    })) },
    // "Mute speech bubbles" removed for now: bubbles are disabled (SHOW in src/bubble.js); the renderer still honors config.muteBubbles
    { label: t.autostart, type: 'checkbox', checked: ctx.getLogin(), click: (mi) => setConfig({ openAtLogin: mi.checked }) },
    ...(ctx.isDev ? [
      { label: t.reload, click: ctx.reloadHard },
      { label: t.devtools, click: ctx.devtools },
    ] : []),
    { type: 'separator' },
    { label: t.quit, click: ctx.quit },
  ]);
}

module.exports = { trayMenu, SKINS };
