// small helpers shared by the brain domains
export const CANCEL = Symbol('cancel')
// behavior priority: higher interrupts lower (compared in run). Behavior names and priorities are a contract; developer panel tests match behavior names
export const PRIO = { idle: 0, ambient: 1, typing: 2, event: 3, direct: 4, held: 5 }
export const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)]
// Γ(3) random number with mean `mean`: gaps are neither too short nor too long
export const gamma3 = (mean) => { let s = 0; for (let i = 0; i < 3; i++) s -= Math.log(1 - Math.random()); return s / 3 * mean }
