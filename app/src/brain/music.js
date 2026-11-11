// Brain · music (DESIGN §5.5, rewritten in 2.5): detect music playing -> dance right away ("I hear it") -> about every 12 s a music-pool move while idle; nod on onsets
//  What counts as music: per-app audio sessions (the shell's onAudio sessions). Browsers (mixed with video), meetings / voice, video players and games do not count;
//  nothing counts while the foreground app is video / a meeting (quietApp). Falls back to the endpoint peak when the session API is unavailable
//  On/off is time-based, not frame-based: sound sustained for onSec (default 3 s) turns it on, quiet for offSec (default 2 s) turns it off
//  Typing first: no dancing while fixing Sheila / burst; start right after the typing stop once Sheila is stowed; lying / asleep is not woken; with music she still lies down and falls asleep by idle time
import { clock } from '../clock.js'
import { C } from '../clips.js'
import { PRIO, pickOne, gamma3 } from './shared.js'

const BROWSER = /^(chrome|msedge|firefox|opera|brave|vivaldi|arc|iexplore|360se|360chrome|qqbrowser|sogouexplorer|2345explorer|liebao|maxthon|yandex|whale|waterfox|librewolf|thorium)\.exe$/i
const NOT_MUSIC = /^(zoom|teams|ms-teams|wemeetapp|discord|skype|weixin|wechat|dingtalk|feishu|lark|obs64|vlc|potplayermini64|potplayermini|mpv|mpc-hc64|mpc-be64|r5apex|r5apex_dx12)\.exe$/i
const PLAYER = /^(cloudmusic|qqmusic|kugou|spotify|foobar2000)\.exe$/i     // known player list is only a helper: lower threshold, not to be extended

// which kind a session is (for real-checks display): 'music' | 'player' | 'browser' | 'other' (meeting / video / game)
export function sourceKind(s) {
  if (BROWSER.test(s.exe)) return 'browser'
  if (s.game || NOT_MUSIC.test(s.exe)) return 'other'
  return PLAYER.test(s.exe) ? 'player' : 'music'
}

export function init(b) {
  b.music = { on: false, since: 0, loudT: 0, quietT: 0, level: 0, player: false, lastStart: -1e9, pending: false, nextMove: 0, otherTurn: false, lastMove: null, beatT: 0, avg: 0 }
  if (b.input) b.input.simSessions = null      // sessions injected by tests
}
export const reset = init

export const methods = {
  // loudness counted as music (0..1) and whether a known player is playing
  musicLevel() {
    const inp = this.input
    if (!this.params.music.sessions) return { level: inp.audio || 0, player: false }
    const ss = inp.simOnly ? inp.simSessions : inp.audioRaw?.sessions
    if (!Array.isArray(ss)) return { level: inp.audio || 0, player: false }      // session API unavailable (or no test injection): fall back to the total peak
    if (!inp.simOnly && inp.audioRaw?.muted) return { level: 0, player: false }
    let level = 0, player = false
    for (const s of ss) {
      const k = sourceKind(s)
      if (k === 'music' || k === 'player') { if (s.peak > level) { level = s.peak; player = k === 'player' } }
    }
    return { level, player }
  },

  // can a music move start: standing, not held, not typing (fixing / stowing Sheila and burst all count), current behavior at most idle-class
  canMusicMove() {
    return this.base === 'stand' && this.state === 'idle' && !this.isTyping() && !this.pet.typing?.busy && (!this.act || this.act.prio <= PRIO.ambient)
  },

  updateMusic(dt) {
    const M = this.music, Q = this.params.music
    const now = clock.now()
    const { level, player } = this.musicLevel()
    M.level = level; M.player = player
    const loud = !this.quietApp && level > Q.loudLevel * (player ? Q.playerLoud : 1)
    if (loud) { M.loudT += dt; M.quietT = 0 } else { M.quietT += dt; if (M.quietT > 0.4) M.loudT = 0 }   // breaths under 0.4 s do not break "sustained sound"
    if (!M.on && M.loudT >= Q.onSec) {
      M.on = true; M.since = now; M.nextMove = 0
      this.arousal = Math.min(1, this.arousal + 0.2)
      this.lines.say('music', { kind: 'auto', p: 0.3 })
      if (now - M.lastStart > Q.startCool * 1000) { M.lastStart = now; M.pending = this.base === 'stand' }   // lying / asleep is not woken
    }
    if (M.on && M.quietT >= Q.offSec) { M.on = false; M.pending = false; M.otherTurn = false }
    if (!M.on || this.base === 'sleep') return
    // onset nod: nod once when the peak is well above the short-term average
    M.avg = M.avg * 0.9 + level * 0.1
    if (level > M.avg * Q.onsetRatio + 0.02 && now - M.beatT > Q.beatGap * 1000) {
      M.beatT = now
      this.proc.bounce.nod.impulse(0.5 + level * 0.6)
      this.proc.bounce.bob.impulse(0.25)
    }
    if (this.base !== 'stand') { M.pending = false; return }
    // "I hear it": dance once at the start (if typing, wait for the typing stop and Sheila to be stowed)
    if (M.pending) {
      if (this.canMusicMove()) { M.pending = false; this.musicMove(pickOne(C.dances.filter(x => this.has(x)))) }
      return
    }
    // while idle, a beat about every danceGap s: mostly picked from the music pool, the rest left to the idle director
    if (this.act) return
    if (!M.nextMove) { M.nextMove = now + gamma3(Q.danceGap * 1000); return }
    if (now < M.nextMove || !this.canMusicMove()) return
    M.nextMove = 0
    if (Math.random() < Q.danceP) this.musicMove(this.pickMusicMove())
    else { M.otherTurn = true; this.nextFidget = now }
  },

  // music pool: dances other than the three + music fidgets, weighted pick, never the same one twice in a row
  pickMusicMove() {
    const key = (s) => typeof s === 'string' ? s : `${s.id}@${s.from}`
    const pool = [...C.dances.map(s => [s, 1]), ...(C.musicFidgets || []).map(f => [f[0], f[1] ?? 1])]
      .filter(([s]) => this.has(s) && key(s) !== this.music.lastMove)
    let r = Math.random() * pool.reduce((a, [, w]) => a + w, 0)
    for (const [s, w] of pool) if ((r -= w) <= 0) return s
    return pool[0]?.[0]
  },

  musicMove(spec) {
    if (!spec) return
    const dance = C.dances.includes(spec)
    if (dance) this.lines.say('dance', { p: 0.5 })
    this.music.lastMove = typeof spec === 'string' ? spec : `${spec.id}@${spec.from}`
    // idle-class priority: typing takes over as soon as it starts (typing first)
    this.run(dance ? 'dance' : 'musicFidget', PRIO.ambient, async (g) => { await g(this.once(spec, { fade: 0.4, exitFade: 0.4 })) })
  },
}
