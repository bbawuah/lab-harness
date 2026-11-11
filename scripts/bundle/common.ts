import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export function command(program: string, args: string[], cwd?: string, maxBuffer = 256 * 1024 * 1024): Buffer {
  const r = spawnSync(program, args, { cwd, maxBuffer, timeout: 300000, env: { ...process.env, LC_ALL: "C", COPYFILE_DISABLE: "1" } });
  if (r.error || r.status !== 0) throw new Error(`${program} failed: ${r.error?.message ?? r.stderr.toString().slice(-2000)}`);
  return r.stdout;
}
export function files(root: string, relative = ""): string[] {
  return readdirSync(join(root, relative)).sort().flatMap(name => {
    const path = relative ? `${relative}/${name}` : name, stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink()) throw new Error(`Unexpected symlink: ${path}`);
    if (stat.isDirectory()) return files(root, path);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error(`Unsafe file: ${path}`);
    return [path];
  }).sort();
}
export type FileIdentity = { sha256: string; bytes: number; executable: boolean; sourceURL: string; license: string };
export type Manifest = { schemaVersion: 1; version: string; commit: string; target: string; files: Record<string, FileIdentity> };
export function verifyManifest(root: string): Manifest {
  const manifest = JSON.parse(readFileSync(join(root, "MANIFEST.json"), "utf8")) as Manifest;
  if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(manifest.commit) || !/^[\w.-]+$/.test(manifest.version)) throw new Error("Invalid bundle manifest");
  const actual = files(root).filter(p => p !== "MANIFEST.json"), expected = Object.keys(manifest.files).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Bundle file coverage mismatch");
  for (const path of expected) {
    if (path.startsWith("/") || path.split("/").some(p => p === ".." || p === "." || p === "")) throw new Error("Unsafe manifest path");
    const item = manifest.files[path]!, stat = lstatSync(join(root, path));
    if (stat.size !== item.bytes || digest(readFileSync(join(root, path))) !== item.sha256 || Boolean(stat.mode & 0o111) !== item.executable) throw new Error(`Bundle identity mismatch: ${path}`);
  }
  return manifest;
}
