import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { digest, type Manifest } from "../scripts/bundle/common.ts";
import { uninstall } from "../scripts/bundle/uninstall.ts";

test("uninstall previews and removes only unchanged receipt-owned files, preserving state, foreign and changed files", () => {
  const parent = resolve(import.meta.dir, "../.tmp"); mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "uninstall-test-")), home = join(root, "home"), data = join(root, "data");
  const release = join(data, "lab-harness/releases", "a".repeat(40));
  try {
    mkdirSync(join(release, ".tmp"), { recursive: true }); mkdirSync(join(home, ".local/bin"), { recursive: true });
    const manifest: Manifest = { schemaVersion: 1, version: "0.2.0", commit: "a".repeat(40), target: "linux-x64", files: {} };
    for (const [name, text] of [["owned", "original"], ["changed", "original"]]) {
      manifest.files[`harness/${name}`] = { sha256: digest(text!), bytes: text!.length, executable: false, sourceURL: "https://example.test", license: "MIT" };
      writeFileSync(join(release, name!), name === "changed" ? "user changes" : text!);
    }
    writeFileSync(join(release, ".tmp/bundle-receipt.json"), JSON.stringify(manifest));
    writeFileSync(join(release, "foreign"), "foreign"); mkdirSync(join(release, "foreign-empty-directory"));
    writeFileSync(join(home, ".local/bin/lab"), "foreign command");
    const selected = uninstall(release, home, data);
    expect(selected).toEqual([join(release, "owned")]); expect(existsSync(join(release, "owned"))).toBe(true);
    uninstall(release, home, data, true);
    expect(existsSync(join(release, "owned"))).toBe(false);
    expect(readFileSync(join(release, "changed"), "utf8")).toBe("user changes");
    expect(readFileSync(join(release, "foreign"), "utf8")).toBe("foreign");
    expect(existsSync(join(release, "foreign-empty-directory"))).toBe(true);
    expect(readFileSync(join(home, ".local/bin/lab"), "utf8")).toBe("foreign command");
    expect(existsSync(join(release, ".tmp/bundle-receipt.json"))).toBe(true);
    rmSync(join(release, "changed")); symlinkSync(join(release, "foreign"), join(release, "changed"));
    expect(uninstall(release, home, data)).toEqual([]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
