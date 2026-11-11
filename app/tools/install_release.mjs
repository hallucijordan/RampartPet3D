// Mirror the packaged release/win-unpacked into the folder named by PET_INSTALL_DIR (running instances there are stopped first)
// Usage (in app/, after npm run release):  set PET_INSTALL_DIR=C:\path\to\RampartPet3D&& npm run install-release
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
if (!process.env.PET_INSTALL_DIR) {
  console.error('PET_INSTALL_DIR is not set. Set it to the folder to install into, e.g.  set PET_INSTALL_DIR=C:\\path\\to\\RampartPet3D&& npm run install-release')
  process.exit(1)
}
const src = path.resolve('release', 'win-unpacked'), dst = path.resolve(process.env.PET_INSTALL_DIR)
// Only stop instances running from the install folder
const kill = `Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith('${dst.replace(/'/g, "''")}') } | Stop-Process -Force`
try { execFileSync('powershell', ['-NoProfile', '-Command', kill], { stdio: 'ignore' }) } catch {}
try { execFileSync('robocopy', [src, dst, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { stdio: 'inherit' }) } catch (e) { if (e.status >= 8) throw e }
const exe = path.join(dst, 'RampartPet3D.exe')
console.log('Installed:', exe, fs.existsSync(exe) ? 'OK' : 'MISSING')
// Developer build shortcut (the same exe with --dev; the /MIR above deletes it, so it is recreated every time)
const lnk = path.join(dst, 'RampartPet3D Developer Build.lnk'), q = (s) => s.replace(/'/g, "''")
execFileSync('powershell', ['-NoProfile', '-Command',
  `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${q(lnk)}');$s.TargetPath='${q(exe)}';$s.Arguments='--dev';$s.WorkingDirectory='${q(dst)}';$s.IconLocation='${q(exe)},0';$s.Save()`])
console.log('Developer build:', lnk, fs.existsSync(lnk) ? 'OK' : 'MISSING')
