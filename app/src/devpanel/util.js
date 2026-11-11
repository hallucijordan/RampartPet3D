// Small helpers shared by the developer panel
export const sleep = (sec) => new Promise(r => setTimeout(r, sec * 1000))
// Check pred every 50 ms; return true if it holds within sec seconds
export async function until(pred, sec) {
  const end = performance.now() + sec * 1000
  for (;;) {
    try { if (pred()) return true } catch {}
    if (performance.now() > end) return false
    await sleep(0.05)
  }
}
export const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
