import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "docs/source-manifest.json"), "utf8")) as {
  schemaVersion: number;
  files: Record<string, string>;
  publicationFileAllowlist: string[];
};
if (manifest.schemaVersion !== 1) throw new Error("Unknown publication manifest");
const allowed = new Set(manifest.publicationFileAllowlist);
if (allowed.size !== manifest.publicationFileAllowlist.length) throw new Error("Duplicate allowlist entry");
const seen = new Set<string>();
const generated = new Set([".git", ".tmp", "node_modules"]);
function walk(relative = ""): void {
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    if (!relative && generated.has(entry.name)) continue;
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${path}`);
    if (entry.isDirectory()) { walk(path); continue; }
    if (!entry.isFile() || !allowed.has(path)) throw new Error(`File outside publication allowlist: ${path}`);
    seen.add(path);
  }
}
walk();
for (const path of allowed) if (!seen.has(path)) throw new Error(`Missing publication file: ${path}`);
function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
}
for (const [path, expected] of Object.entries(manifest.files)) {
  if (!allowed.has(path) || sha256(path) !== expected) throw new Error(`Reviewed source mismatch: ${path}`);
}
const relay = JSON.parse(readFileSync(join(root, "vendor/relay/SOURCE.json"), "utf8")) as {
  sourceSHA: string;
  files: { path: string; sha256: string }[];
};
if (relay.sourceSHA !== "dfe1b039bab45f4055ab39467e994a2981940c02" || relay.files.length !== 9) {
  throw new Error("Unexpected Relay source pin or closure");
}
for (const file of relay.files) {
  const path = `vendor/relay/${file.path}`;
  if (!allowed.has(path) || sha256(path) !== file.sha256) throw new Error(`Relay mismatch: ${path}`);
}
console.log(`Publication integrity: ${allowed.size} allowed files; ${Object.keys(manifest.files).length} unchanged source files; 9 pinned Relay files.`);
