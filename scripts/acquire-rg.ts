/** Optional test tool, downloaded only on explicit request. No global installation. */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ownedState } from "../src/ledger.ts";
import source from "../contracts/ripgrep-source.json";

const artifact = source.artifacts.find(a => a.platform === process.platform && a.arch === process.arch);
if (!artifact) throw new Error(`No pinned optional rg artifact for ${process.platform}/${process.arch}`);
const root = ownedState(resolve(import.meta.dir, "../.tmp/rg")), destination = join(root, "rg");
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const existing = lstatSync(destination, { throwIfNoEntry: false });
if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) throw new Error("Unsafe rg cache entry");
let cached = existing !== undefined && digest(readFileSync(destination)) === artifact.binarySHA256;
if (!cached) {
  const response = await fetch(artifact.url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok || !response.body) throw new Error(`rg download failed: ${response.status}`);
  const bytes = new Uint8Array(artifact.archiveBytes), reader = response.body.getReader();
  let used = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      if (used + next.value.length > bytes.length) throw new Error("rg archive exceeds pinned size");
      bytes.set(next.value, used); used += next.value.length;
    }
  } finally { await reader.cancel(); }
  if (used !== bytes.length || digest(bytes) !== artifact.archiveSHA256) throw new Error("rg archive identity mismatch");
  const archive = join(root, `.archive-${randomUUID()}.tar.gz`), temporary = join(root, `.binary-${randomUUID()}`);
  try {
    writeFileSync(archive, bytes, { flag: "wx", mode: 0o600 });
    // Extract only the named file into a bounded pipe; no archive paths are written.
    const result = spawnSync("tar", ["-xOf", archive, artifact.member], { cwd: root, timeout: 10000, maxBuffer: 16 * 1024 * 1024, shell: false });
    if (result.status !== 0 || digest(result.stdout) !== artifact.binarySHA256) throw new Error("rg extracted binary identity mismatch");
    writeFileSync(temporary, result.stdout, { flag: "wx", mode: 0o700 }); renameSync(temporary, destination);
  } finally { rmSync(archive, { force: true }); rmSync(temporary, { force: true }); }
}
chmodSync(destination, 0o700);
const version = spawnSync(destination, ["--version"], { timeout: 1000, maxBuffer: 4096, encoding: "utf8", shell: false });
if (version.status !== 0 || !version.stdout.split("\n")[0]?.startsWith(`ripgrep ${source.version} `)) throw new Error("Pinned rg version probe failed");
console.log(JSON.stringify({ tool: "ripgrep", version: source.version, binarySHA256: artifact.binarySHA256, cached, location: ".tmp/rg/rg" }));
