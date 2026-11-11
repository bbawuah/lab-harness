import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const manifestPath = "docs/source-manifest.json";
export type Manifest = {
  schemaVersion: 2;
  exportSourceCommit: string;
  reviewedSourceCommit: string;
  description: string;
  /** Original exported bytes: retained even when development changes them. */
  files: Record<string, string>;
  publicationFileAllowlist: string[];
  currentFiles: Record<string, { sha256: string; status: "unchanged" | "modified" | "added"; originalSHA256?: string }>;
};
export function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
}
export function publicationFiles(base = root): string[] {
  const files: string[] = [];
  const generated = new Set([".git", ".tmp", "node_modules"]);
  function check(path: string): void {
    let ancestor = dirname(path);
    while (ancestor !== ".") {
      if (lstatSync(join(base, ancestor)).isSymbolicLink()) throw new Error(`Unexpected symlink: ${ancestor}`);
      ancestor = dirname(ancestor);
    }
    const stat = lstatSync(join(base, path));
    if (stat.isSymbolicLink()) throw new Error(`Unexpected symlink: ${path}`);
    if (!stat.isFile()) throw new Error(`Unsupported publication entry: ${path}`);
    if (/^(?:\.env.*|config\.(?:json|properties)|.*\.(?:pem|key|gguf|sqlite.*|log))$/i.test(basename(path))) throw new Error(`Sensitive publication filename: ${path}`);
    const text = readFileSync(join(base, path), "utf8");
    const homePath = new RegExp("/" + "(?:Users|home)/" + "[a-zA-Z0-9_.-]+/");
    const privateKey = new RegExp("-----BEGIN " + "(?:[A-Z]+ )?PRIVATE KEY-----");
    const token = new RegExp("(?:gh[pousr]_" + "[a-zA-Z0-9]{24,}|github_pat_" + "[a-zA-Z0-9_]{30,}|sk-" + "[a-zA-Z0-9]{24,})");
    if (homePath.test(text) || privateKey.test(text) || token.test(text)) throw new Error(`Sensitive publication content: ${path}`);
    files.push(path);
  }
  if (existsSync(join(base, ".git"))) {
    // The index includes staged additions for the explicit publication refresh.
    // Untracked files, ignored or otherwise, cannot enter git archive.
    const result = spawnSync("git", ["ls-files", "--cached", "-z"], { cwd: base, encoding: "utf8" });
    if (result.status !== 0) throw new Error("Cannot enumerate tracked publication files");
    for (const path of [...new Set(result.stdout.split("\0").filter(Boolean))]) check(path);
  } else {
    function walk(relative = ""): void {
      for (const entry of readdirSync(join(base, relative), { withFileTypes: true })) {
        if (!relative && generated.has(entry.name)) continue;
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory() && !entry.isSymbolicLink()) walk(path);
        else check(path);
      }
    }
    walk();
  }
  return files.sort();
}
export function checkRelay(allowed: Set<string>): void {
  // Exact original manifest bytes anchor all nine digests. A paired source +
  // self-declared digest edit must never become a new "pinned" dependency.
  const sourcePath = "vendor/relay/SOURCE.json";
  const originalSourceHash = "75cb2b3cbe67f2fba4495e5d03b16fc3e478230284f0e5832495641d9890f6a8";
  if (!allowed.has(sourcePath) || sha256(sourcePath) !== originalSourceHash) throw new Error("Relay manifest mismatch: original closure is immutable");
  const relay = JSON.parse(readFileSync(join(root, "vendor/relay/SOURCE.json"), "utf8")) as { sourceSHA: string; files: { path: string; sha256: string }[] };
  if (relay.sourceSHA !== "dfe1b039bab45f4055ab39467e994a2981940c02" || relay.files.length !== 9 || new Set(relay.files.map(f => f.path)).size !== 9) throw new Error("Unexpected Relay source pin or closure");
  for (const file of relay.files) {
    const path = `vendor/relay/${file.path}`;
    if (!allowed.has(path) || sha256(path) !== file.sha256) throw new Error(`Relay mismatch: ${path}`);
  }
}
