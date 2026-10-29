/** Explicit authoring step. Never invoked by check or CI; inspect the manifest diff. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkRelay, manifestPath, publicationFiles, root, sha256, type Manifest } from "./publication-policy.ts";

if (process.argv[2] !== "--reviewed-files") throw new Error("Inspect publishable files, then pass --reviewed-files");
const manifest = JSON.parse(readFileSync(join(root, manifestPath), "utf8")) as Manifest;
const files = publicationFiles();
checkRelay(new Set(files));
for (const path of Object.keys(manifest.files)) if (!files.includes(path)) throw new Error(`Original source removed: ${path}`);
manifest.schemaVersion = 2;
manifest.description = "Original exported concept hashes retained; current development files explicitly allowlisted and hashed separately. No private reports, skill bodies, runtime artifacts or new license grant.";
manifest.publicationFileAllowlist = files;
manifest.currentFiles = Object.fromEntries(files.filter(path => path !== manifestPath).map(path => {
  const digest = sha256(path), original = manifest.files[path];
  return [path, original ? { sha256: digest, status: digest === original ? "unchanged" : "modified", originalSHA256: original } : { sha256: digest, status: "added" }];
})) as Manifest["currentFiles"];
writeFileSync(join(root, manifestPath), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Refreshed explicit publication identities for ${files.length} files. Review the diff before commit.`);
