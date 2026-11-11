/** Explicit optional acquisition only; never called by normal LAB launch. */
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { ownedState } from "../src/ledger.ts";
import { browserArtifact, browserBinary, digest, selectBrowser, setupSummary, verifyBrowserRuntime } from "../src/browser/runtime.ts";
import source from "../contracts/agent-browser-source.json";
const args = process.argv.slice(2);
if (args.some(a => a !== '--offline')) throw new Error('Usage: acquire-browser.ts [--offline]');
const artifact = browserArtifact();
if (!artifact) throw new Error('No pinned agent-browser artifact for this platform');
let cached = false; try { verifyBrowserRuntime(); cached = true; } catch {}
if (!cached) {
  if (args.includes('--offline') || process.env.LAB_INSTALL_OFFLINE === '1') throw new Error('Pinned agent-browser missing/corrupt; stage verified cache before offline setup. No browser is downloaded.');
  const root = process.platform === 'win32' ? dirname(browserBinary) : ownedState(dirname(browserBinary));
  if (process.platform === 'win32') {
    for (const p of [dirname(root), root]) {
      const st = lstatSync(p, {throwIfNoEntry:false});
      if (st && (!st.isDirectory() || st.isSymbolicLink())) throw new Error('Unsafe browser cache');
      mkdirSync(p, {recursive:true});
    }
  } const existing = lstatSync(browserBinary, {throwIfNoEntry:false});
  if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) throw new Error('Unsafe browser cache');
  const response = await fetch(artifact.url, {signal:AbortSignal.timeout(60000)});
  if (!response.ok || !response.body) throw new Error('Pinned browser-tool download failed');
  const bytes = new Uint8Array(artifact.bytes), reader = response.body.getReader(); let n = 0;
  try { for (;;) { const v = await reader.read(); if (v.done) break; if (n + v.value.length > bytes.length) throw new Error('Artifact too large'); bytes.set(v.value,n); n += v.value.length; } } finally { await reader.cancel(); }
  if (n !== bytes.length || digest(bytes) !== artifact.sha256) throw new Error('Browser-tool artifact hash mismatch');
  const temporary = join(root, '.download-'+randomUUID());
  try { writeFileSync(temporary,bytes,{flag:'wx',mode:0o700}); renameSync(temporary,browserBinary); } finally { rmSync(temporary,{force:true}); }
}
verifyBrowserRuntime();
let found: string | undefined; try { found = selectBrowser(); } catch {}
console.log(setupSummary(source.version, cached, found));
