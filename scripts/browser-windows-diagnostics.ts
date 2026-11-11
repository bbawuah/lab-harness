/** Temporary CI-only static probe: no browser, user data or inherited values are printed. */
import { spawnSync } from 'node:child_process';
import { win32 } from 'node:path';
import { interopEnvironment } from '../src/browser/windows.ts';
const exe = win32.join(interopEnvironment().SystemRoot!, 'System32/WindowsPowerShell/v1.0/powershell.exe');
const command = Buffer.from("[Console]::WriteLine('LAB_POWERSHELL_OK')", 'utf16le').toString('base64');
for (const clean of [true, false]) for (const ignore of [true, false]) {
  const start = Date.now();
  const r = spawnSync(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', command], {
    encoding: 'utf8', timeout: 15000, maxBuffer: 4096, env: clean ? interopEnvironment() : undefined,
    stdio: [ignore ? 'ignore' : 'pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  console.log(JSON.stringify({ clean, ignore, elapsedMs: Date.now()-start, status: r.status, error: (r.error as NodeJS.ErrnoException)?.code, expectedOutput: r.stdout.trim() === 'LAB_POWERSHELL_OK' }));
}
