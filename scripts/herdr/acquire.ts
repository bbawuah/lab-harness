import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import provenance from "../../contracts/herdr-source.json";

// No install script, package manager, PATH mutation, or global installation.
const platform = { darwin: "macos", linux: "linux" }[process.platform as "darwin" | "linux"];
const arch = { arm64: "aarch64", x64: "x86_64" }[process.arch as "arm64" | "x64"];
const artifact = provenance.runtime.artifacts.find(a => a.name === `herdr-${platform}-${arch}`);
if (!platform || !arch || !artifact) throw new Error(`No pinned artifact for ${process.platform}/${process.arch}`);
const directory = resolve(import.meta.dir, "../../.tmp/herdr");
await mkdir(directory, { recursive: true, mode: 0o700 });
const destination = resolve(directory, "herdr");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
let cached = false;
try { cached = hash(await readFile(destination)) === artifact.sha256; } catch (e: any) { if (e.code !== "ENOENT") throw e; }
if (!cached) {
  const response = await fetch(artifact.url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (hash(bytes) !== artifact.sha256) throw new Error("Official artifact checksum mismatch; nothing installed");
  const temporary = resolve(directory, `.download-${randomUUID()}`);
  try {
    await writeFile(temporary, bytes, { mode: 0o700, flag: "wx" });
    await rename(temporary, destination);
  } finally { await rm(temporary, { force: true }); }
}
await chmod(destination, 0o700);
await writeFile(resolve(directory, "runtime.json"), JSON.stringify({ ...provenance.runtime, selectedArtifact: artifact, verifiedSha256: artifact.sha256 }, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ executable: destination, version: provenance.runtime.version, sha256: artifact.sha256, cached, sourcePinMatch: false }));
