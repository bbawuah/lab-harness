import { expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, win32 } from 'node:path';
import { WindowsInterop, interopEnvironment, interopFailure, isWSL, windowsResponseFailure, type Interop } from '../src/browser/windows.ts';

const session = 'lab-' + 'a'.repeat(24);
const remote = 'C:\\Users\\Fixture User\\AppData\\Local\\lab-harness\\browser\\' + session;
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const decode = (args: string[]) => Buffer.from(args.at(-1)!, 'base64').toString('utf16le');

test('WSL detection uses Linux kernel or WSL markers, never changes macOS behavior', () => {
  expect(isWSL('linux', {}, '6.6.87.2-microsoft-standard-WSL2')).toBe(true);
  expect(isWSL('linux', { WSL_DISTRO_NAME: 'Ubuntu' }, 'generic')).toBe(true);
  expect(isWSL('linux', {}, 'generic')).toBe(false);
  expect(isWSL('darwin', { WSL_INTEROP: 'irrelevant' })).toBe(false);
});

test('interop converts drive and mounted paths without shell interpolation and rejects relative/UNC paths', () => {
  const calls: unknown[] = [];
  const w = new WindowsInterop((cmd, args) => { calls.push([cmd, args]); return args[0] === '-w' ? edge : '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'; }, true);
  expect(w.windowsPath(edge)).toBe(edge);
  expect(w.windowsPath('/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')).toBe(edge);
  expect(w.localPath(edge)).toStartWith('/mnt/c/Program Files');
  expect(calls).toEqual([['wslpath', ['-w', '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']], ['wslpath', ['-u', edge]]]);
  for (const p of ['relative.exe', 'C:relative.exe', '\\\\host\\share\\edge.exe', 'C:\\bad\n.exe']) expect(() => w.windowsPath(p)).toThrow('LAB_BROWSER_WINDOWS_PATH');
  expect(() => new WindowsInterop(() => '', true).localPath(edge)).toThrow('LAB_BROWSER_WINDOWS_PATH');
});

test('WSLENV explicitly carries isolated Windows config, session and temp paths without translating them twice', () => {
  const env = new WindowsInterop(() => '', true).environment(remote, session);
  expect(env.AGENT_BROWSER_CONFIG).toBe(win32.join(remote, 'config.json'));
  expect(env.AGENT_BROWSER_SOCKET_DIR).toBe(win32.join(remote, 's'));
  expect(env.AGENT_BROWSER_SESSION).toBe(session);
  expect(env.TEMP).toBe(win32.join(remote, 't'));
  expect(env.USERPROFILE).toBe(win32.join(remote, 'home'));
  expect(env.WSLENV?.split(':')).toContain('AGENT_BROWSER_CONFIG/w');
  expect(env.WSLENV).not.toContain('/p');
  expect(env).not.toHaveProperty('AZURE_API_KEY');
  expect(env).not.toHaveProperty('AGENT_BROWSER_CDP');
});

test('fake interop stages only owned Windows config/profile, checks policy first, and scopes cleanup to the private executable', () => {
  mkdirSync(resolve('.tmp'), { recursive: true });
  const fixture = mkdtempSync(resolve('.tmp/browser-wsl-test-'));
  const local = join(fixture, 'windows'); const binary = join(fixture, 'verified.exe'); writeFileSync(binary, 'fixture tool');
  const scripts: string[] = []; let policy = true;
  const fake: Interop = (cmd, args) => {
    if (cmd === 'wslpath') return args[1] === remote ? local : join(local, 'agent-browser.exe');
    const script = decode(args); scripts.push(script);
    if (script.includes('HKLM:')) { if (!policy) throw interopFailure(cmd, 'LAB_BROWSER_POLICY private diagnostic'); return ''; }
    if (script.includes("Join-Path $env:LOCALAPPDATA")) return remote;
    if (script.includes('Set-Acl')) { mkdirSync(local); for (const p of ['s', 't', 'home', 'cache']) mkdirSync(join(local, p)); }
    if (script.includes('$p.Kill()')) rmSync(local, { recursive: true });
    return '';
  };
  const w = new WindowsInterop(fake, true);
  try {
    expect(w.prepare(session, binary, edge, 'fixture.test')).toBe(join(local, 'agent-browser.exe'));
    expect(readFileSync(join(local, 'agent-browser.exe'), 'utf8')).toBe('fixture tool');
    expect(JSON.parse(readFileSync(join(local, 'config.json'), 'utf8'))).toMatchObject({ executablePath: edge, allowedDomains: ['fixture.test'], noWebmcp: true });
    expect(JSON.parse(readFileSync(join(local, 'config.json'), 'utf8'))).not.toHaveProperty('profile'); // upstream refuses persistent profile + allowlist
    w.cleanup(session); expect(existsSync(local)).toBe(false);
    const cleanup = scripts.find(s => s.includes('$p.Kill()'))!;
    expect(cleanup).toContain('$p.Path -eq $exe'); expect(cleanup).not.toContain('taskkill');
    expect(cleanup).toContain('LAB_BROWSER_CLEANUP_FAILED');
    policy = false; expect(() => w.prepare(session, binary, edge, 'fixture.test')).toThrow('LAB_BROWSER_POLICY');
    expect(existsSync(local)).toBe(false); // policy refusal precedes state creation
    expect(() => w.cleanup('../foreign')).toThrow('LAB_BROWSER_STATE');
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

test('policy, interop, path, cleanup and tool errors are actionable and redact raw diagnostics', () => {
  const secret = 'PRIVATE_FORM_VALUE';
  expect(interopFailure('powershell', 'LAB_BROWSER_POLICY ' + secret).message).toContain('RemoteDebuggingAllowed');
  expect(interopFailure('powershell', secret).message).toContain('[interop] enabled=true');
  expect(interopFailure('wslpath', secret).message).toContain('LAB_BROWSER_WINDOWS_PATH');
  expect(interopFailure('powershell', 'LAB_BROWSER_CLEANUP_FAILED').message).toContain('retained');
  expect(windowsResponseFailure(JSON.stringify({ isError: true, content: [{ text: secret }] }))?.message).toContain('DeveloperToolsAvailability');
  expect(windowsResponseFailure('{"isError":false}')).toBeUndefined();
  for (const e of [interopFailure('powershell', secret), windowsResponseFailure('{"isError":true}')]) expect(e?.message).not.toContain(secret);
});

test('Edge override accepts a Windows path and missing Edge gives an installation action', () => {
  const w = new WindowsInterop((_cmd, args) => decode(args).includes('Test-Path') ? 'True' : '', true);
  expect(w.edge(edge)).toBe(edge);
  expect(() => new WindowsInterop(() => 'False', true).edge(edge)).toThrow('LAB_BROWSER_EDGE_MISSING');
});


test('interop helper retains the WSL socket but forwards no inherited credentials or WSLENV entries', () => {
  const env = interopEnvironment({ WSL_INTEROP: '/run/WSL/fixture_interop', WSL_DISTRO_NAME: 'Ubuntu', WSLENV: 'PRIVATE_KEY/w', PRIVATE_KEY: 'secret', AGENT_BROWSER_CDP: 'foreign' }, true);
  expect(env.WSL_INTEROP).toBe('/run/WSL/fixture_interop');
  expect(env.WSLENV).toBe('');
  expect(env).not.toHaveProperty('PRIVATE_KEY');
  expect(env).not.toHaveProperty('AGENT_BROWSER_CDP');
});


test('native Windows environment resolves case-insensitive system keys and preserves required system paths only', () => {
  const env = interopEnvironment({ SYSTEMROOT: 'C:\\Windows', USERPROFILE: 'C:\\Users\\fixture', APPDATA: 'C:\\Users\\fixture\\AppData\\Roaming', PRIVATE_KEY: 'secret' }, false);
  expect(env.SystemRoot).toBe('C:\\Windows');
  expect(env.ComSpec).toBe('C:\\Windows\\System32\\cmd.exe');
  expect(env.APPDATA).toBe('C:\\Users\\fixture\\AppData\\Roaming');
  expect(env).not.toHaveProperty('PRIVATE_KEY');
});
