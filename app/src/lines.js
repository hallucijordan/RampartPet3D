// Speech bubble lines (DESIGN.md §6, original writing): one shuffle bag per category, global rate limit, no repeats of recent lines
import { clock } from './clock.js'

export const LINES = {
  greet_morning: ['Morning. Gum first, then work.'],
  greet_noon: ['Had lunch? Can\'t fight on an empty tank.'],
  greet_afternoon: ['Afternoon. What are we taking apart today?'],
  greet_evening: ['Only booting up now? Night owl. I like it.'],
  greet_first: ['Mod shop, desktop branch: open for business! Need me? Click the tray icon.'],
  greet_late: ['Booting up at this hour... another late one? Fine, I\'ll keep you company.'],
  back: ['Oi, you\'re back. Sheila was just asking about you.', 'Took you long enough. My gum lost its flavor.', 'I didn\'t touch anything while you were gone. Probably.'],
  back_day: ['New day, new ammo belt. Chalo!'],
  burst: ['Fast hands! You\'ve got Sheila spinning!', 'That RPM... got a grudge against your keyboard?', 'Faster! Let\'s see those barrels smoke!'],
  hover: ['What are you looking at? Never seen a mechanic?', 'Quit waving that cursor around, I\'m getting dizzy.'],
  pet_first: ['...Just this once. Don\'t make it a habit.'],
  pet_more: ['Fine. A bit longer, then.'],
  pet_long: ['Okay, okay, enough! You\'re wrecking my hair!'],
  poke1: ['Oi!'],
  poke: ['Poking me? Bold.', 'Go on, poke me again. I dare you.', 'Arre, itchy fingers? There\'s a cure for that.'],
  poke_warn: ['Right. You asked for it.'],
  poke_forgive: ['...Fine, you\'re forgiven. Just this once.'],
  poke_sheila: ['Hands off Sheila, she\'s shy with strangers.', 'Hands off, I just calibrated her!'],
  held: ['Hey hey hey! Put me down!'],
  held_long: ['Nice altitude. The view\'s so-so.', 'I\'m a mechanic, not a parcel.'],
  land: ['Perfect ten landing.', 'That\'s it? Go higher, I\'ll still stick it.'],
  land_hard: ['Knees still work. Lucky you.'],
  land_third: ['Next time, get me a parachute.'],
  idle: ['Bored... got anything I can take apart?', 'If Mirage were here, I could at least prank him.', 'Your desktop icons are as messy as my workbench.',
    'Sheila, you look gorgeous today.', 'Three pieces of gum left. Gotta ration them.', 'A gun I\'ve modded never jams.'],
  lounge: ['Taking a break. Need something, call me. Otherwise, don\'t.'],
  dream: ['...one more barrel...', '...Mirage... my wrench... give it back...'],
  wake: ['I wasn\'t sleeping! I was... listening to the floor.', 'Who? Who touched my wrench?'],
  wake_poke: ['...This better be important.'],
  music: ['This one\'s good. Turn it up?', 'Now that\'s a beat. Even Sheila wants to spin.'],
  dance: ['A good song needs good moves. Watch this.'],
  apex_start: ['Off to the fight? Grab my share of the kills too.', 'Set your cover up right. Don\'t embarrass me.'],
  apex_end: ['Done? Did you win? ...Got it, I won\'t ask.', 'Good to have you back. Next round I\'ll mod you a gun.'],
  code: ['You write your code, I\'ll fix my guns.'],
  late: ['Do you know what time it is? Bed!', 'Anything written at midnight gets redone in the morning. Trust me.'],
  late_sleep: ['I\'m grabbing some shut-eye. You wrap up soon too.'],
  water: ['Top of the hour. Drink some water, mate.'],
  dizzy: ['Stop spinning me! I\'m a mechanic, not a top!'],
  photo: ['Make it a good one, this jumpsuit is my trademark.', 'This angle? Perfect.', 'Screenshot all you want, just give Sheila some good lighting too.'],
}

// kind: 'auto' = she speaks up on her own (strict rate limit), 'reply' = response to an interaction (looser)
export class Lines {
  constructor(bubble, params) {
    this.bubble = bubble
    this.params = params      // the brain's parameter table (params.js); rate limits read params.lines
    this.bags = {}
    this.recent = []
    this.lastAuto = -1e9
    this.lastReply = -1e9
    this.autoTimes = []
    this.quiet = false        // watching video / in a meeting: no unprompted lines
  }
  pick(cat) {
    const pool = LINES[cat]
    if (!pool) return null
    let bag = this.bags[cat]
    if (!bag || !bag.length) {
      bag = this.bags[cat] = pool.filter(l => !this.recent.includes(l) || pool.length <= 2)
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]] }
    }
    return bag.pop() || pool[0]
  }
  say(cat, { kind = 'reply', p = 1 } = {}) {
    const now = clock.now()
    if (Math.random() > p) return false
    const Q = this.params.lines
    if (kind === 'auto') {
      this.autoTimes = this.autoTimes.filter(t => now - t < 3600e3)
      if (this.quiet || now - this.lastAuto < Q.autoGap * 1000 || this.autoTimes.length >= Q.autoPerHour) return false
    } else if (now - this.lastReply < Q.replyGap * 1000) return false
    const text = this.pick(cat)
    if (!text || !this.bubble.say(text)) return false
    if (kind === 'auto') { this.lastAuto = now; this.autoTimes.push(now) }
    this.lastReply = now
    this.recent.push(text)
    if (this.recent.length > 30) this.recent.shift()
    return true
  }
}
