import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import source from "../../contracts/pi-runtime.json";

export interface PiRuntime { command: string[]; version: string }

const root = resolve(import.meta.dir, "../..");
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
type Artifact = (typeof source.artifacts)[number];
function selected(): Artifact {
  const artifact = source.artifacts.find(a => a.platform === process.platform && a.arch === process.arch);
  if (!artifact) throw new Error(`No pinned Pi runtime for ${process.platform}/${process.arch}; supported: macOS arm64/x64 and Linux x64 (WSL unverified)`);
  return artifact;
}
function paths(artifact: Artifact) {
  const cache = join(root, ".tmp/pi"), parent = join(cache, source.version);
  return { cache, parent, destination: join(parent, `${artifact.platform}-${artifact.arch}`) };
}
function directory(path: string, create = false): void {
  if (create) {
    try { mkdirSync(path, { mode: 0o700 }); } catch (error: any) { if (error.code !== "EEXIST") throw error; }
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe Pi cache directory: ${path}`);
}
function ancestors(artifact: Artifact, create = false): void {
  const p = paths(artifact);
  for (const path of [join(root, ".tmp"), p.cache, p.parent]) directory(path, create);
}

/** Check every bundled asset as well as the executable; no cache metadata is trusted. */
function verifyTree(bundle: string, artifact: Artifact): PiRuntime {
  directory(bundle);
  const entries: { path: string; line: string }[] = [];
  let files = 0, bytes = 0;
  const visit = (relative: string) => {
    for (const name of readdirSync(join(bundle, relative)).sort()) {
      if (!/^[\x20-\x7e]+$/.test(name) || name.includes("\\") || name.includes("\n")) throw new Error("Unsafe Pi bundle path");
      const path = relative ? `${relative}/${name}` : name;
      const stat = lstatSync(join(bundle, path));
      if (stat.isSymbolicLink()) throw new Error(`Unsafe Pi bundle link: ${path}`);
      if (stat.isDirectory()) {
        entries.push({ path, line: `D ${path}\n` });
        if (entries.length > artifact.entryCount) throw new Error("Pi bundle has extra entries");
        visit(path);
      } else {
        if (!stat.isFile() || stat.nlink !== 1) throw new Error(`Unsafe Pi bundle file: ${path}`);
        files++; bytes += stat.size;
        if (files > artifact.fileCount || bytes > artifact.unpackedBytes) throw new Error("Pi bundle exceeds pinned size");
        entries.push({ path, line: `F ${path} ${stat.size} ${digest(readFileSync(join(bundle, path)))}\n` });
      }
    }
  };
  visit("");
  const identity = entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(e => e.line).join("");
  if (entries.length !== artifact.entryCount || files !== artifact.fileCount || bytes !== artifact.unpackedBytes || digest(identity) !== artifact.treeSHA256) {
    throw new Error("Pi bundle identity mismatch; run scripts/pi/acquire.ts to repair");
  }
  const executable = join(bundle, "pi");
  if (!(lstatSync(executable).mode & 0o100) || digest(readFileSync(executable)) !== artifact.binarySHA256) throw new Error("Pinned Pi executable is missing, changed or not executable");
  return { command: [executable], version: source.version };
}

function probeVersion(bundle: string, staging: string): void {
  // Pi 1.4.0 initializes settings before parsing --version. Probe only during
  // acquisition, in disposable isolated state, never during read-only verify.
  const home = join(staging, ".probe");
  mkdirSync(home, { mode: 0o700 });
  try {
    const result = spawnSync(join(bundle, "pi"), ["--version"], {
      cwd: home, shell: false, timeout: 10000, maxBuffer: 4096, encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C", HOME: home, TMPDIR: home,
        PI_CODING_AGENT_DIR: join(home, "agent"), PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1",
        XDG_CONFIG_HOME: join(home, "config"), XDG_CACHE_HOME: join(home, "cache"), XDG_DATA_HOME: join(home, "data"), XDG_STATE_HOME: join(home, "state") },
    });
    if (result.error || result.status !== 0 || result.stdout.trim() !== source.version) throw new Error(`Pinned Pi version probe failed (expected ${source.version}, status ${result.status}): ${result.error?.message ?? result.stderr.slice(0, 512)}`);
  } finally { rmSync(home, { recursive: true, force: true }); }
}

/** Read-only: never downloads, repairs, creates files or changes permissions. */
export function verifyPiRuntime(): PiRuntime {
  const artifact = selected();
  try {
    ancestors(artifact);
    directory(paths(artifact).destination);
    return verifyTree(join(paths(artifact).destination, "pi"), artifact);
  } catch (error: any) {
    throw new Error(`Project-local Pi runtime unavailable: ${error.message}. Run scripts/pi/acquire.ts${error.code === "ENOENT" ? " to install" : ""}.`, { cause: error });
  }
}

/** Explicit acquisition; verified staging is published by directory rename. */
export async function acquirePiRuntime(options?: { offline?: boolean }): Promise<PiRuntime> {
  const artifact = selected(), p = paths(artifact);
  try { return verifyPiRuntime(); } catch (error) { if (options?.offline) throw new Error("Offline Pi acquisition requires an intact verified project-local bundle", { cause: error }); }
  ancestors(artifact, true);
  // Refuse structural redirections rather than repairing through a symlink.
  const old = lstatSync(p.destination, { throwIfNoEntry: false });
  if (old && (!old.isDirectory() || old.isSymbolicLink())) throw new Error("Unsafe Pi cache destination");
  const lock = join(p.parent, `.${artifact.platform}-${artifact.arch}.acquire.lock`);
  try { mkdirSync(lock, { mode: 0o700 }); } catch (error: any) {
    if (error.code === "EEXIST") throw new Error(`Pi acquisition is locked: ${lock}. If an installation was interrupted, ensure no acquisition is running before removing this lock.`);
    throw error;
  }
  const staging = join(p.parent, `.stage-${randomUUID()}`), backup = join(p.parent, `.previous-${randomUUID()}`);
  let movedOld = false;
  try {
    // Another installer may have completed before this process acquired the lock.
    try { return verifyPiRuntime(); } catch { /* repair using verified download */ }
    mkdirSync(staging, { mode: 0o700 });
    const response = await fetch(artifact.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) throw new Error(`Pi download failed: HTTP ${response.status}`);
    const data = new Uint8Array(artifact.archiveBytes), reader = response.body.getReader();
    let used = 0;
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        if (used + next.value.length > data.length) throw new Error("Pi archive exceeds pinned size");
        data.set(next.value, used); used += next.value.length;
      }
    } finally { await reader.cancel(); }
    if (used !== data.length || digest(data) !== artifact.archiveSHA256) throw new Error("Pi archive identity mismatch; cache unchanged");
    const archive = join(staging, "archive.tar.gz");
    writeFileSync(archive, data, { flag: "wx", mode: 0o600 });
    // Only an exact checksum-pinned official archive is passed to the system tar.
    // It was inspected to contain only regular files and directories under pi/.
    const result = spawnSync("tar", ["-xzf", archive, "-C", staging], { shell: false, timeout: 30000, maxBuffer: 4096, env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" } });
    if (result.error || result.status !== 0) throw new Error(`Pi archive extraction failed: ${result.error?.message ?? result.stderr.toString().slice(0, 512)}`);
    rmSync(archive);
    const bundle = join(staging, "pi");
    chmodSync(join(bundle, "pi"), 0o700);
    verifyTree(bundle, artifact);
    probeVersion(bundle, staging);
    verifyTree(bundle, artifact);
    // No await during publication. Keep the previous tree for rollback on failure.
    if (lstatSync(p.destination, { throwIfNoEntry: false })) { renameSync(p.destination, backup); movedOld = true; }
    try { renameSync(staging, p.destination); } catch (error) {
      if (movedOld) { renameSync(backup, p.destination); movedOld = false; }
      throw error;
    }
    return { command: [join(p.destination, "pi/pi")], version: source.version };
  } finally {
    rmSync(staging, { recursive: true, force: true });
    if (movedOld) rmSync(backup, { recursive: true, force: true });
    rmSync(lock, { recursive: true, force: true });
  }
}
