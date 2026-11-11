/** Windows-side ownership and WSL interop. No user browser discovery or attachment. */
import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { win32, join } from 'node:path';

export type Interop = (command: string, args: string[]) => string;
export function isWSL(platform = process.platform, env = process.env, release?: string): boolean {
  if (platform !== 'linux') return false;
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return true;
  try { return /microsoft|wsl/i.test(release ?? readFileSync('/proc/sys/kernel/osrelease', 'utf8')); } catch { return false; }
}
export const windowsBrowser = () => process.platform === 'win32' || isWSL();
export function interopFailure(command: string, diagnostic: string): Error {
  if (diagnostic.includes('LAB_BROWSER_POLICY')) return new Error(policyError);
  if (diagnostic.includes('LAB_BROWSER_EDGE_MISSING')) return new Error(edgeError);
  if (diagnostic.includes('LAB_BROWSER_CLEANUP_FAILED')) return new Error('LAB_BROWSER_CLEANUP_FAILED: Windows owned state retained; retry /lab-browser close.');
  if (command === 'wslpath') return new Error('LAB_BROWSER_WINDOWS_PATH: wslpath could not resolve the Windows path; check the drive mount and use a drive-absolute Windows path or /mnt/c path.');
  const kind = /LAB_BROWSER_WINDOWS_([A-Za-z]{1,60})/.exec(diagnostic)?.[1];
  return new Error('LAB_BROWSER_INTEROP: Windows command failed'+(kind?' ('+kind+')':'')+'. Check WSL [interop] enabled=true, Windows PowerShell availability and organisation application-control rules.');
}
export function interopEnvironment(env = process.env, wsl = isWSL()): NodeJS.ProcessEnv {
  if (wsl) return { PATH: '/usr/bin:/bin', WSL_INTEROP: env.WSL_INTEROP, WSL_DISTRO_NAME: env.WSL_DISTRO_NAME, WSLENV: '' };
  return { SystemRoot: env.SystemRoot, WINDIR: env.WINDIR, LOCALAPPDATA: env.LOCALAPPDATA,
    ProgramFiles: env.ProgramFiles, 'ProgramFiles(x86)': env['ProgramFiles(x86)'], USERPROFILE: env.USERPROFILE,
    TEMP: env.TEMP, TMP: env.TMP, PATH: win32.join(env.SystemRoot ?? 'C:\\Windows', 'System32') };
}
export const systemInterop: Interop = (command, args) => {
  const r = spawnSync(command, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 65536, windowsHide: true, env: interopEnvironment() });
  if (r.error || r.status !== 0) {
    throw interopFailure(command, String(r.stderr ?? ''));
  }
  return r.stdout.trim().replace(/^\uFEFF/, '');
};
const psQuote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
export const policyError = 'LAB_BROWSER_POLICY: Edge remote debugging is blocked. Ask the policy owner to review effective RemoteDebuggingAllowed and DeveloperToolsAvailability (plus target URL restrictions) in edge://policy; LAB does not change policy.';
export const edgeError = 'LAB_BROWSER_EDGE_MISSING: organisation Edge was not found. Install approved Windows Edge or pass --browser-executable "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" (a /mnt/c path also works).';

export class WindowsInterop {
  constructor(readonly run: Interop = systemInterop, readonly wsl = isWSL()) {}
  powershell(script: string) {
    return this.run(this.wsl ? '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' : win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from("$ErrorActionPreference='Stop';$env:PSModulePath=Join-Path $PSHOME 'Modules';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);try {" + script + "} catch { if($_.Exception.Message -match '^LAB_BROWSER_[A-Z_]+$'){[Console]::Error.WriteLine($_.Exception.Message)};[Console]::Error.WriteLine('LAB_BROWSER_WINDOWS_'+$_.Exception.GetType().Name); exit 1 }", 'utf16le').toString('base64')]);
  }
  windowsPath(value: string): string {
    const p = value.startsWith('/') && this.wsl ? this.run('wslpath', ['-w', value]) : value;
    if (!/^[A-Za-z]:[\\/]/.test(p) || /[\x00-\x1f]/.test(p)) throw new Error('LAB_BROWSER_WINDOWS_PATH: use a drive-absolute Windows path or a mounted /mnt/c path.');
    return win32.normalize(p);
  }
  localPath(value: string) {
    if (!this.wsl) return this.windowsPath(value);
    const p = this.run('wslpath', ['-u', this.windowsPath(value)]);
    if (!p.startsWith('/') || /[\x00-\x1f]/.test(p)) throw new Error('LAB_BROWSER_WINDOWS_PATH: wslpath did not return an absolute mounted path.');
    return p;
  }
  edge(explicit?: string) {
    const candidates = explicit ? [this.windowsPath(explicit)] : JSON.parse(this.powershell(
      `@(@($env:ProgramFiles,\u0024{env:ProgramFiles(x86)},$env:LOCALAPPDATA) | Where-Object { $_ } | ForEach-Object { Join-Path $_ 'Microsoft\\Edge\\Application\\msedge.exe' }) | ConvertTo-Json -Compress`)) as string[];
    for (const p of candidates) if (this.powershell(`Test-Path -LiteralPath ${psQuote(p)} -PathType Leaf`) === 'True') return p;
    throw new Error(edgeError);
  }
  policy() {
    this.powershell(`foreach($key in @('HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge','HKCU:\\SOFTWARE\\Policies\\Microsoft\\Edge')) { if(Test-Path $key) { $p=Get-ItemProperty -LiteralPath $key; if(($null -ne $p.RemoteDebuggingAllowed -and $p.RemoteDebuggingAllowed -eq 0) -or ($null -ne $p.DeveloperToolsAvailability -and $p.DeveloperToolsAvailability -eq 2)) { throw 'LAB_BROWSER_POLICY' } } }`);
  }
  root(session: string) {
    if (!/^lab-[a-f0-9]{24}$/.test(session)) throw new Error('LAB_BROWSER_STATE');
    return this.windowsPath(this.powershell(`Join-Path $env:LOCALAPPDATA 'lab-harness\\browser\\${session}'`));
  }
  environment(root: string, session: string): NodeJS.ProcessEnv {
    // Values are already Windows paths, so WSLENV must NOT apply /p conversion.
    const env: NodeJS.ProcessEnv = {
      AGENT_BROWSER_CONFIG: win32.join(root, 'config.json'), AGENT_BROWSER_SOCKET_DIR: win32.join(root, 's'),
      AGENT_BROWSER_SESSION: session, HOME: win32.join(root, 'home'), USERPROFILE: win32.join(root, 'home'),
      TEMP: win32.join(root, 't'), TMP: win32.join(root, 't'), LOCALAPPDATA: win32.join(root, 'cache'), NO_COLOR: '1',
    };
    if (this.wsl) return { ...env, PATH: '/usr/bin:/bin', WSL_INTEROP: process.env.WSL_INTEROP, WSL_DISTRO_NAME: process.env.WSL_DISTRO_NAME, WSLENV: Object.keys(env).map(k => k + '/w').join(':') };
    // Windows needs system DLL and utility paths; do not inherit agent-browser or credential variables.
    return { ...env, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.SystemRoot + '\\System32' };
  }
  prepare(session: string, binary: string, executable: string, hostname: string) {
    this.policy(); const root = this.root(session);
    this.powershell(`$r=${psQuote(root)}; if(Test-Path -LiteralPath $r){throw 'LAB_BROWSER_STATE'}; [void][IO.Directory]::CreateDirectory($r); $acl=[Security.AccessControl.DirectorySecurity]::new(); $acl.SetOwner([Security.Principal.WindowsIdentity]::GetCurrent().User); $acl.SetAccessRuleProtection($true,$false); $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule); Set-Acl -LiteralPath $r -AclObject $acl; foreach($d in @('s','t','home','cache','profile')){[void][IO.Directory]::CreateDirectory((Join-Path $r $d))}`);
    const local = this.localPath(root);
    try {
      copyFileSync(binary, join(local, 'agent-browser.exe'));
      writeFileSync(join(local, 'config.json'), JSON.stringify({ executablePath: executable, profile: win32.join(root, 'profile'), allowedDomains: [hostname], contentBoundaries: true, maxOutput: 12000, noWebmcp: true, idleTimeout: '15m' }));
    } catch (e) { this.cleanup(session); throw e; }
    return this.localPath(win32.join(root, 'agent-browser.exe'));
  }
  alive(session: string) {
    const root = this.root(session);
    return this.powershell(`$r=${psQuote(root)}; $f=Join-Path $r 's\\${session}.pid'; if(!(Test-Path -LiteralPath $f)){ 'False'; exit }; $n=0; if(![int]::TryParse((Get-Content -LiteralPath $f -Raw).Trim(),[ref]$n)){ 'False'; exit }; $p=Get-Process -Id $n -ErrorAction SilentlyContinue; [bool]($p -and $p.Path -eq (Join-Path $r 'agent-browser.exe'))`) === 'True';
  }
  cleanup(session: string) {
    const root = this.root(session);
    // Get-Process objects hold the process handle. Recheck Path on that object before Kill,
    // never taskkill by image name or a pid read from a file. Upstream's daemon owns the
    // Edge Job Object (KILL_ON_JOB_CLOSE), including grandchildren and startup failures.
    this.powershell(`$r=${psQuote(root)}; $exe=Join-Path $r 'agent-browser.exe';
      for($i=0;$i -lt 40;$i++) {
        $owned=@(Get-Process -Name 'agent-browser' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe });
        foreach($p in $owned){ if(!$p.HasExited -and $p.Path -eq $exe){$p.Kill(); [void]$p.WaitForExit(1000)} };
        $edge=@(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -and (($_.CommandLine.Contains('--user-data-dir='+ (Join-Path $r 'profile')+' ') -or $_.CommandLine.Contains('--user-data-dir='+ (Join-Path $r 'profile')+'"') -or $_.CommandLine.EndsWith('--user-data-dir='+ (Join-Path $r 'profile'))) -or $_.CommandLine.Contains('--user-data-dir="'+(Join-Path $r 'profile')+'"')) });
        if($owned.Count -eq 0 -and $edge.Count -eq 0){try {if(Test-Path -LiteralPath $r){Remove-Item -LiteralPath $r -Recurse -Force}; if(!(Test-Path -LiteralPath $r)){exit}} catch {}};
        Start-Sleep -Milliseconds 100
      }; throw 'LAB_BROWSER_CLEANUP_FAILED'`);
  }
}

/** Sanitized hint only; tool/page diagnostics can contain form values and are never echoed. */
export function windowsResponseFailure(raw: string): Error | undefined {
  try {
    const o = JSON.parse(raw);
    if (o?.isError === true || o?.structuredContent?.response?.success === false) {
      return new Error('LAB_BROWSER_EDGE_START: Windows Edge action failed; outcome may be unknown. Check installed Edge and effective RemoteDebuggingAllowed / DeveloperToolsAvailability / target URL policies in edge://policy. No action was retried.');
    }
  } catch {}
}
