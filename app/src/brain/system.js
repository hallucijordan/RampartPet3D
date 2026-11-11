// Brain · system: foreground app (look over on window switch, code / video / meeting / Apex classification), time (glance at the clock on the hour, late-night nudge to sleep) (DESIGN §5.6, §5.7)
import { clock } from '../clock.js'

// foreground app classification: process name / title only, kept in memory only
const CODE_RE = /code|cursor|devenv|idea|pycharm|rider|sublime|notepad\+\+|terminal/i
const QUIET_EXE = /zoom|teams|wemeet|obs64|vlc|potplayer|mpv/
const QUIET_TITLE = /youtube|bilibili|\u54d4\u54e9\u54d4\u54e9|netflix|\u7231\u5947\u827a|\u4f18\u9177|\u817e\u8baf\u89c6\u9891|twitch|\u6597\u9c7c|\u864e\u7259/i   // video site titles; the \u escapes are the Chinese names, matching window titles of Bilibili, iQIYI, Youku, Tencent Video, Douyu, Huya

export function init(b) {
  b.apexOn = false; b.saidCode = false; b.quietApp = false; b.fgCode = false; b.fgKey = undefined
  b.lastHour = new Date().getHours()
  b.activeSince = 0; b.saidLate = false
}
export function reset(b) {
  b.apexOn = false; b.saidCode = false; b.quietApp = false; b.fgCode = false; b.fgKey = undefined
}

export const methods = {
  onSystem(s) {
    // window hidden by a fullscreen app while dragging: the release event gets lost, treat it as a release
    if (s.hidden && this.dragging && this.cursor) this.onUp({ clientX: this.cursor.x, clientY: this.cursor.y })
    const exe = (s.fg?.exe || '').toLowerCase(), Q = this.params.system
    const key = (s.fg?.exe || '') + '|' + (s.fg?.title || '')
    if (this.fgKey && key !== this.fgKey && s.fg?.rect && !s.fg.isSelf && this.state === 'idle' && Math.random() < Q.fgLook) {
      const r = s.fg.rect
      this.attn.onClick(r.lx + r.width / 2, r.ly + Math.min(r.height / 2, 300))
    }
    this.fgKey = key
    const title = s.fg?.title || ''
    this.quietApp = QUIET_EXE.test(exe) || QUIET_TITLE.test(title)
    this.fgCode = CODE_RE.test(exe)
    const apex = /r5apex/.test(exe)
    if (apex && !this.apexOn) { this.apexOn = true; this.lines.say('apex_start') }
    if (!apex && this.apexOn && !s.fullscreen) { this.apexOn = false; this.lines.say('apex_end'); if (!this.busy && this.state === 'idle') this.entrance() }
    if (this.fgCode && !this.saidCode) {
      this.saidCode = true
      this.lines.say('code', { kind: 'auto', p: Q.codeLine })
    }
  },

  // ---------- time: glance at the clock on the hour, nudge to sleep late at night ----------
  updateClock() {
    const d = new Date(), h = d.getHours(), Q = this.params.system
    if (h !== this.lastHour) {
      this.lastHour = h
      if (this.state === 'idle' && this.base === 'stand') this.attn.onClick(this.world.w - 60, this.world.h + 24)   // the clock is at the bottom right of the taskbar
    }
    const active = this.input.idleMs() < 60e3
    if (active && !this.activeSince) this.activeSince = clock.now()
    if (!active) this.activeSince = 0
    if (h >= Q.lateFrom && h < Q.lateTo && active && clock.now() - this.activeSince > Q.lateActive * 60e3 && !this.saidLate) {
      this.saidLate = true
      this.lines.say('late', { kind: 'auto' })
    }
    if (h >= 6 && h < 12) this.saidLate = false
  },
}
