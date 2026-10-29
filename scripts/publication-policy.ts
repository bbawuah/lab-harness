import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
export function publicationFiles(): string[] {
  const files: string[] = [];
  const generated = new Set([".git", ".tmp", "node_modules"]);
  function walk(relative = ""): void {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      if (!relative && generated.has(entry.name)) continue;
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${path}`);
      if (entry.isDirectory()) { walk(path); continue; }
      if (!entry.isFile()) throw new Error(`Unsupported publication entry: ${path}`);
      if (/^(?:\.env.*|config\.(?:json|properties)|.*\.(?:pem|key|gguf|sqlite.*|log))$/i.test(entry.name)) throw new Error(`Sensitive publication filename: ${path}`);
      const text = readFileSync(join(root, path), "utf8");
      const homePath = new RegExp("/" + "(?:Users|home)/" + "[a-zA-Z0-9_.-]+/");
      const privateKey = new RegExp("-----BEGIN " + "(?:[A-Z]+ )?PRIVATE KEY-----");
      const token = new RegExp("(?:gh[pousr]_" + "[a-zA-Z0-9]{24,}|github_pat_" + "[a-zA-Z0-9_]{30,}|sk-" + "[a-zA-Z0-9]{24,})");
      if (homePath.test(text) || privateKey.test(text) || token.test(text)) throw new Error(`Sensitive publication content: ${path}`);
      files.push(path);
    }
  }
  walk();
  return files.sort();
}
export function checkRelay(allowed: Set<string>): void {
  const relay = JSON.parse(readFileSync(join(root, "vendor/relay/SOURCE.json"), "utf8")) as { sourceSHA: string; files: { path: string; sha256: string }[] };
  if (relay.sourceSHA !== "dfe1b039bab45f4055ab39467e994a2981940c02" || relay.files.length !== 9 || new Set(relay.files.map(f => f.path)).size !== 9) throw new Error("Unexpected Relay source pin or closure");
  for (const file of relay.files) {
    const path = `vendor/relay/${file.path}`;
    if (!allowed.has(path) || sha256(path) !== file.sha256) throw new Error(`Relay mismatch: ${path}`);
  }
}
