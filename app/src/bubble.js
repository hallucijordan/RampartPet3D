// Speech bubble: follows the top of her head, typewriter effect, can be muted
//  Not enabled yet: hidden by default, with no user toggle; the line logic still runs (rate limits, say()'s return value and test observations are unchanged).
//  The "Lines" row in the developer panel can turn it on temporarily. To enable it for real, set SHOW to true
import * as THREE from 'three'
import { clock } from './clock.js'

const tmp = new THREE.Vector3()
const SHOW = false

export class Bubble {
  constructor(el) {
    this.el = el
    this.show = SHOW
    this.muted = false
    this.until = 0
    this.text = ''
    this.shown = 0
    this.lastSay = -1e9
  }
  say(text, { ms = 0, force = false } = {}) {
    const now = clock.now()
    if (this.muted && !force) return false
    this.text = text
    this.shown = 0
    this.start = now
    this.until = now + (ms || 1600 + text.length * 110)
    this.lastSay = now
    this.el.textContent = ''
    this.el.classList.add('show')
    return true
  }
  hide() { this.until = 0; this.el.classList.remove('show') }
  // Display toggle: when off the bubble is not rendered at all; the logic is unaffected
  get show() { return !this.el.classList.contains('off') }
  set show(v) { this.el.classList.toggle('off', !v) }
  get visible() { return clock.now() < this.until }
  follow(view, stage, pet) {
    const now = clock.now()
    if (!this.text) return
    if (now > this.until) { this.el.classList.remove('show'); this.text = ''; return }
    const n = Math.min(this.text.length, Math.floor((now - this.start) / 32))
    if (n !== this.shown) { this.shown = n; this.el.textContent = this.text.slice(0, n) }
    const head = pet.bones.def_c_head
    if (!head) return
    head.getWorldPosition(tmp)
    tmp.y += 0.42
    const p = stage.project(tmp)
    // Pull it back inside near the screen edges; the tail still points at her head
    const hx = view.left + p.x, hy = view.top + p.y
    const bw = this.el.offsetWidth, bh = this.el.offsetHeight, pad = 8
    const x = Math.min(innerWidth - bw / 2 - pad, Math.max(bw / 2 + pad, hx))
    const y = Math.max(bh + pad, hy)
    const tail = Math.max(-bw / 2 + 16, Math.min(bw / 2 - 16, hx - x))
    this.el.style.setProperty('--tail', tail + 'px')
    this.el.style.left = Math.round(x) + 'px'
    this.el.style.top = Math.round(y) + 'px'
  }
}
