/** Explicit optional acquisition only (`lab --setup-desktop`); never called by normal LAB launch or install. */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, lstatSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ownedState } from "../src/ledger.ts";
import { desktopArtifact, desktopDirectory, digest, verifyDesktopRuntime } from "../src/desktop/runtime.ts";
import { runDesktopSetup } from "../src/desktop/setup.ts";

export async function acquireDesktop(offline: boolean): Promise<{ cached: boolean }> {
  const artifact = desktopArtifact();
  try { verifyDesktopRuntime(); return { cached: true }; } catch {}
  if (offline) throw new Error("LAB_DESKTOP_MISSING: pinned agent-desktop is missing or corrupt; stage a verified cache before offline setup. Nothing was downloaded.");
  const root = ownedState(desktopDirectory);
  for (const member of artifact.members) {
    const existing = lstatSync(join(root, member.name), { throwIfNoEntry: false });
    if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) throw new Error("LAB_DESKTOP_CACHE: unsafe cache entry " + member.name);
  }
  const response = await fetch(artifact.url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok || !response.body) throw new Error("LAB_DESKTOP_DOWNLOAD: pinned agent-desktop download failed (HTTP " + response.status + ").");
  const bytes = new Uint8Array(artifact.archiveBytes), reader = response.body.getReader(); let used = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; if (used + next.value.length > bytes.length) throw new Error("LAB_DESKTOP_DOWNLOAD: archive exceeds pinned size"); bytes.set(next.value, used); used += next.value.length; } }
  finally { await reader.cancel(); }
  if (used !== bytes.length || digest(bytes) !== artifact.archiveSHA256) throw new Error("LAB_DESKTOP_DOWNLOAD: archive identity mismatch");
  const archive = join(root, `.archive-${randomUUID()}.tar.gz`);
  const staged: string[] = [];
  try {
    writeFileSync(archive, bytes, { flag: "wx", mode: 0o600 });
    for (const member of artifact.members) {
      // Extract one named member to a bounded pipe; archive paths are never written.
      const out = spawnSync("/usr/bin/tar", ["-xOf", archive, member.name], { cwd: root, timeout: 10000, maxBuffer: 16 * 1024 * 1024, shell: false });
      if (out.status !== 0 || out.stdout.length !== member.bytes || digest(out.stdout) !== member.sha256) throw new Error("LAB_DESKTOP_DOWNLOAD: extracted " + member.name + " identity mismatch");
      const temporary = join(root, `.member-${randomUUID()}`); staged.push(temporary);
      writeFileSync(temporary, out.stdout, { flag: "wx", mode: 0o700 }); chmodSync(temporary, 0o700);
      renameSync(temporary, join(root, member.name));
    }
  } finally { rmSync(archive, { force: true }); for (const path of staged) rmSync(path, { force: true }); }
  verifyDesktopRuntime();
  return { cached: false };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.some(a => a !== "--offline")) throw new Error("Usage: acquire-desktop.ts [--offline]");
  const { cached } = await acquireDesktop(args.includes("--offline") || process.env.LAB_INSTALL_OFFLINE === "1");
  // Non-prompting status only: no --request/--guide, no app or window access.
  const { lines } = await runDesktopSetup(cached);
  console.log(lines.join("\n"));
}
