import { WindowsInterop, windowsBrowser } from './windows.ts';
import { createHash } from "node:crypto";
import { accessSync, constants, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import source from "../../contracts/agent-browser-source.json";
export const browserInstallRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const browserBinary = join(browserInstallRoot, windowsBrowser() ? ".tmp/browser/agent-browser-win32-x64.exe" : ".tmp/browser/agent-browser");
export const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export const browserArtifact = () => source.artifacts.find(a => a.platform === (windowsBrowser() ? "win32" : process.platform) && a.arch === process.arch);
export function verifyBrowserRuntime(): string {
  const artifact = browserArtifact();
  if (!artifact) throw new Error("LAB_BROWSER_UNSUPPORTED: use macOS, Linux x64, or WSL x64 with Windows Edge.");
  const s = lstatSync(browserBinary, { throwIfNoEntry: false });
  if (!s?.isFile() || s.isSymbolicLink() || s.nlink !== 1 || s.size !== artifact.bytes || digest(readFileSync(browserBinary)) !== artifact.sha256) throw new Error("LAB_BROWSER_MISSING: run lab --setup-browser (or --setup-browser --offline with a verified cache).");
  return browserBinary;
}
export function selectBrowser(explicit?: string): string {
  if (windowsBrowser()) return new WindowsInterop().edge(explicit);
  const candidates = explicit ? [explicit] : process.platform === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Chromium.app/Contents/MacOS/Chromium"] : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"];
  for (const p of candidates) { if (!isAbsolute(p)) break; try { accessSync(p, constants.X_OK); return p; } catch {} }
  throw new Error("LAB_BROWSER_EXECUTABLE: install an approved Chrome/Chromium/Edge separately or use --browser-executable /absolute/path.");
}
export function browserURL(value: string, origin?: string): URL {
  let u: URL; try { u = new URL(value); } catch { throw new Error("LAB_BROWSER_URL: provide an absolute HTTP(S) URL."); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || value.length > 4096 || (origin && u.origin !== origin)) throw new Error("LAB_BROWSER_ORIGIN: URL must use the operator-selected HTTP(S) origin without credentials.");
  return u;
}
/** `lab --setup-browser` summary; ends with the next command (board 5). The URL is an example, labelled as such. */
export function setupSummary(version: string, cached: boolean, browser?: string): string {
  return [`✓ agent-browser ${version} verified${cached ? " (already cached)" : ""} · no browser downloaded`,
    browser ? `✓ browser found: ${browser}` : "! no approved browser found: install Chrome, Chromium or Edge, or pass --browser-executable PATH",
    "Next:  lab --browser http://localhost:3000/   (example; use your app's URL)"].join("\n");
}
