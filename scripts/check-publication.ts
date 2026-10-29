import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkRelay, manifestPath, publicationFiles, root, sha256, type Manifest } from "./publication-policy.ts";

const manifest = JSON.parse(readFileSync(join(root, manifestPath), "utf8")) as Manifest;
if (manifest.schemaVersion !== 2) throw new Error("Unknown publication manifest");
// Original concept provenance has a separate identity from current development.
const originalIdentity = createHash("sha256").update(JSON.stringify({ exportSourceCommit: manifest.exportSourceCommit, reviewedSourceCommit: manifest.reviewedSourceCommit, files: manifest.files })).digest("hex");
if (originalIdentity !== "09a0dbbd498068e958101cfc4ff5531c9f530034ef6fa94830f5892b5c9557f1") throw new Error("Original concept provenance changed");
const actual = publicationFiles(), allowed = new Set(manifest.publicationFileAllowlist);
if (allowed.size !== manifest.publicationFileAllowlist.length) throw new Error("Duplicate allowlist entry");
if (actual.length !== allowed.size || actual.some(path => !allowed.has(path))) throw new Error("Publication allowlist differs from working files; inspect changes before explicit refresh");
for (const path of Object.keys(manifest.files)) if (!allowed.has(path)) throw new Error(`Original source removed: ${path}`);
const currentPaths = actual.filter(path => path !== manifestPath);
if (Object.keys(manifest.currentFiles).length !== currentPaths.length) throw new Error("Current source hash coverage mismatch");
for (const path of currentPaths) {
  const item = manifest.currentFiles[path], original = manifest.files[path];
  if (!item || item.sha256 !== sha256(path)) throw new Error(`Current source mismatch: ${path}`);
  if (original) {
    if (item.originalSHA256 !== original || item.status !== (item.sha256 === original ? "unchanged" : "modified")) throw new Error(`Source change provenance mismatch: ${path}`);
  } else if (item.status !== "added" || item.originalSHA256 !== undefined) throw new Error(`New source provenance mismatch: ${path}`);
}
checkRelay(allowed);
console.log(`Publication integrity: ${allowed.size} allowed files; original concept provenance retained; ${currentPaths.length} current hashes; 9 pinned Relay files.`);
