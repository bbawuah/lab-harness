import { createHash } from "node:crypto";
import { accessSync, constants, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import source from "../../contracts/agent-browser-source.json";
export const browserInstallRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const browserBinary = join(browserInstallRoot, ".tmp/browser/agent-browser");
export const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export function verifyBrowserRuntime(): string {
  const artifact = source.artifacts.find(a => a.platform === process.platform && a.arch === process.arch);
  if (!artifact) throw new Error("LAB_BROWSER_UNSUPPORTED: use same-OS macOS or Linux x64; Windows/WSL Edge attach is unsupported.");
  const s = lstatSync(browserBinary, { throwIfNoEntry: false });
  if (!s?.isFile() || s.isSymbolicLink() || s.nlink !== 1 || s.size !== artifact.bytes || digest(readFileSync(browserBinary)) !== artifact.sha256) throw new Error("LAB_BROWSER_MISSING: run lab --setup-browser (or --setup-browser --offline with a verified cache).");
  return browserBinary;
}
export function selectBrowser(explicit?: string): string {
  const candidates = explicit ? [explicit] : process.platform === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Chromium.app/Contents/MacOS/Chromium"] : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"];
  for (const p of candidates) { if (!isAbsolute(p)) break; try { accessSync(p, constants.X_OK); return p; } catch {} }
  throw new Error("LAB_BROWSER_EXECUTABLE: install an approved Chrome/Chromium/Edge separately or use --browser-executable /absolute/path.");
}
export function browserURL(value: string, origin?: string): URL {
  let u: URL; try { u = new URL(value); } catch { throw new Error("LAB_BROWSER_URL: provide an absolute HTTP(S) URL."); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || value.length > 4096 || (origin && u.origin !== origin)) throw new Error("LAB_BROWSER_ORIGIN: URL must use the operator-selected HTTP(S) origin without credentials.");
  return u;
}
