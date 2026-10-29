import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONCEPT_ROOT } from "../src/ledger.ts";

/** Real checker subprocess in an owned copy, never mutates this checkout's source. */
test("publication checker keeps provenance, exact allowlist, current hashes, secrets and Relay fences", () => {
  mkdirSync(join(CONCEPT_ROOT, ".tmp"), { recursive: true });
  const root = mkdtempSync(join(CONCEPT_ROOT, ".tmp/publication-"));
  const original = JSON.parse(readFileSync(join(CONCEPT_ROOT, "docs/source-manifest.json"), "utf8"));
  const run = (script = "check-publication.ts", args: string[] = []) => Bun.spawnSync([process.execPath, "--no-env-file", "--no-install", join(root, "scripts", script), ...args], { cwd: root, env: { PATH: process.env.PATH ?? "" }, stdout: "pipe", stderr: "pipe" });
  const putManifest = (value: unknown) => writeFileSync(join(root, "docs/source-manifest.json"), JSON.stringify(value));
  try {
    for (const file of original.publicationFileAllowlist as string[]) {
      mkdirSync(dirname(join(root, file)), { recursive: true }); copyFileSync(join(CONCEPT_ROOT, file), join(root, file));
    }
    expect(run().exitCode).toBe(0);
    const changed = structuredClone(original); changed.files["src/ledger.ts"] = "0".repeat(64); putManifest(changed);
    expect(run().stderr.toString()).toContain("Original concept provenance changed"); putManifest(original);
    writeFileSync(join(root, "src/cli.ts"), "changed source");
    expect(run().stderr.toString()).toContain("Current source mismatch"); copyFileSync(join(CONCEPT_ROOT, "src/cli.ts"), join(root, "src/cli.ts"));
    writeFileSync(join(root, "unlisted.txt"), "extra");
    expect(run().exitCode).not.toBe(0); rmSync(join(root, "unlisted.txt"));
    symlinkSync("README.md", join(root, "link"));
    expect(run().stderr.toString()).toContain("Unexpected symlink"); rmSync(join(root, "link"));
    writeFileSync(join(root, "README.md"), "/" + "Users/" + "private-owner/private-content");
    expect(run("refresh-publication.ts", ["--reviewed-files"]).stderr.toString()).toContain("Sensitive publication content"); copyFileSync(join(CONCEPT_ROOT, "README.md"), join(root, "README.md"));
    writeFileSync(join(root, "README.md"), "-----BEGIN " + "PRIVATE KEY-----");
    expect(run().stderr.toString()).toContain("Sensitive publication content"); copyFileSync(join(CONCEPT_ROOT, "README.md"), join(root, "README.md"));
    writeFileSync(join(root, "vendor/relay/src/storage/store.ts"), "changed Relay");
    expect(run("refresh-publication.ts", ["--reviewed-files"]).stderr.toString()).toContain("Relay mismatch");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
