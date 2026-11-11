import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { digest, verifyManifest, type Manifest } from "../scripts/bundle/common.ts";
import { pack } from "../scripts/bundle/pack.ts";

function fixture() {
  const parent = resolve(import.meta.dir, "../.tmp"); mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "bundle-test-"));
  writeFileSync(join(root, "payload"), "verified payload", { mode: 0o644 });
  const manifest: Manifest = { schemaVersion: 1, version: "0.2.0", commit: "a".repeat(40), target: "linux-x64", files: { payload: { sha256: digest("verified payload"), bytes: 16, executable: false, sourceURL: "https://example.test/payload", license: "MIT" } } };
  writeFileSync(join(root, "MANIFEST.json"), JSON.stringify(manifest));
  return { root, manifest, clean: () => rmSync(root, { recursive: true, force: true }) };
}
test("manifest verification refuses changed bytes, extra files, symlinks and mode changes", () => {
  const f = fixture();
  try {
    expect(verifyManifest(f.root).commit).toBe("a".repeat(40));
    writeFileSync(join(f.root, "payload"), "modified payload"); expect(() => verifyManifest(f.root)).toThrow("identity mismatch");
    writeFileSync(join(f.root, "payload"), "verified payload"); chmodSync(join(f.root, "payload"), 0o755); expect(() => verifyManifest(f.root)).toThrow("identity mismatch"); chmodSync(join(f.root, "payload"), 0o644);
    writeFileSync(join(f.root, "extra"), "unexpected"); expect(() => verifyManifest(f.root)).toThrow("coverage mismatch"); rmSync(join(f.root, "extra"));
    rmSync(join(f.root, "payload")); symlinkSync("MANIFEST.json", join(f.root, "payload")); expect(() => verifyManifest(f.root)).toThrow("symlink");
  } finally { f.clean(); }
});
test("packing fixes gzip metadata and repeats byte for byte", async () => {
  const f = fixture(), first = f.root + "-first.tar.gz", second = f.root + "-second.tar.gz";
  try {
    await pack(f.root, first); await pack(f.root, second);
    expect(readFileSync(first)).toEqual(readFileSync(second));
    expect([...readFileSync(first).subarray(4, 10)]).toEqual([0, 0, 0, 0, 2, 255]);
    const r = Bun.spawnSync(["tar", "-tzf", first]);
    expect(r.exitCode).toBe(0); expect(r.stdout.toString()).toBe("MANIFEST.json\npayload\n");
  } finally { f.clean(); rmSync(first, { force: true }); rmSync(second, { force: true }); }
});
