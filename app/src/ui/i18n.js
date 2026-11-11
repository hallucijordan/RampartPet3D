// UI copy: one English table, keys grouped by part (hud. / xp. / rank. / rankup. / panel. / skins. / skin. / rarity. / size. / set.)
//  t(key, vars): placeholders like '{lv}' are replaced from vars; a missing key falls back to the key itself (a missing entry is obvious during development)
//  Uppercase labels (OWNED, EQUIP) are written in uppercase directly, not via text-transform (letter spacing is tuned for caps)
//  The tray menu lives in the main process (electron/menu.js) and has its own small table
//  Change copy only here
//  English only: any other saved language value (e.g. 'zh' from older versions) falls back to English

export const LANGS = ['en']

const en = {
  'app.name': 'RAMPART',
  'app.tag': '',


  'xp.lv': 'LV',
  'xp.unit': 'XP',
  'xp.full': 'LV {lv} · {cur} / {next} XP',

  'rank.rookie': 'ROOKIE',
  'rank.bronze': 'BRONZE',
  'rank.silver': 'SILVER',
  'rank.gold': 'GOLD',
  'rank.platinum': 'PLATINUM',
  'rank.diamond': 'DIAMOND',
  'rank.master': 'MASTER',
  'rank.apex': 'APEX PREDATOR',

  'rankup.title': 'RANK UP',
  'rankup.division': 'DIVISION UP',

  'panel.tab.skins': 'SKINS',
  'panel.tab.size': 'SIZE',
  'panel.tab.settings': 'SETTINGS',
  'panel.close': 'CLOSE',
  'panel.hint': 'RampartPet3D',
  'panel.version': 'v{v}',

  'skins.owned': 'OWNED',
  'skins.count': '{n} / {m}',
  'skins.equip': 'EQUIP',
  'skins.equipped': 'EQUIPPED',
  'skins.reload': 'EQUIPPING…',
  'skins.dblclick': 'Double-click a skin to equip it',
  'skin.soon': 'Coming Soon',
  'skins.locked': 'LOCKED',
  'skins.soon.hint': 'More skins in the works',
  'skin.base': 'Standard',
  'skin.hp': 'Heritage Pride',
  'skin.rebecca': 'Rebecca',
  'skin.bear': 'Bear-iccade',
  'rarity.common': 'COMMON',
  'rarity.rare': 'RARE',
  'rarity.epic': 'EPIC',
  'rarity.legendary': 'LEGENDARY',
  'rarity.collab': 'COLLAB',

  'size.s.name': 'SMALL',
  'size.m.name': 'MEDIUM',
  'size.l.name': 'LARGE',
  'size.hint': 'Applies instantly',
  'size.title': 'CHARACTER SIZE',

  'set.display': 'DISPLAY',
  'set.system': 'SYSTEM',
  'set.hud': 'Show HUD',
  'set.hud.hint': 'Today’s stats at her feet',
  'set.xpbar': 'Show XP bar',
  'set.xpbar.hint': 'Rank and XP above her head',
  'set.autostart': 'Launch at startup',
  'set.autostart.hint': 'Start with Windows',
  'set.desktopOnly': 'Desktop app only',
  'set.hideFullscreen': 'Hide in fullscreen',
  'set.hideFullscreen.hint': 'She steps aside for fullscreen games and videos',
  'set.look': 'Art style',
  'set.look.hint': 'Reloads to apply',
  'set.look.fix': 'ORIGINAL',
  'set.look.sticker': 'APEX STICKER',
  'set.sleepAfter': 'Nap after',
  'set.sleepAfter.hint': 'Idle this long and she lies down; twice as long and she falls asleep',
  'set.minutes': '{n} MIN',
  'set.hidePet': 'HIDE PET',
  'set.hidePet.hint': 'Bring her back from the tray icon',
  'set.quit': 'QUIT',
  'set.quit.hint': 'Close RampartPet3D',
  'set.quit.confirm': 'CONFIRM',
  'set.quit.confirm.hint': 'Click again within 3 s to quit',
  'set.on': 'ON',
  'set.off': 'OFF',
}

const TABLES = { en }

export function createI18n(lang) {
  const i = {
    lang: LANGS.includes(lang) ? lang : 'en',
    t(key, vars) {
      let s = TABLES[i.lang][key] ?? key
      if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m)
      return s
    },
    set(l) { if (LANGS.includes(l)) i.lang = l; return i.lang },
  }
  return i
}

// For font preloading: every character the UI can show (MiSans is split by character range; only the needed slices are fetched)
export const allText = () => Object.values(en).join('') + '0123456789:/·.,kKMXPLVIV'
