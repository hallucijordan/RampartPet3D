// global clock: all logic follows the time advanced by tick (deterministic in capture mode), in milliseconds
export const clock = {
  ms: 0,
  now() { return this.ms },
  advance(dt) { this.ms += dt * 1000 },
}
