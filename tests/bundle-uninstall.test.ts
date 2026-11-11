import { expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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


test("uninstall preview drains a large piped file list before exiting", () => {
  const parent = resolve(import.meta.dir, "../.tmp"); mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "uninstall-preview-")), home = join(root, "home"), data = join(root, "data");
  const release = join(data, "lab-harness/releases", "b".repeat(40));
  try {
    mkdirSync(join(release, ".tmp"), { recursive: true }); mkdirSync(join(release, "scripts/bundle"), { recursive: true }); mkdirSync(home);
    for (const name of ["uninstall.ts", "common.ts"]) copyFileSync(resolve(import.meta.dir, "../scripts/bundle", name), join(release, "scripts/bundle", name));
    const manifest: Manifest = { schemaVersion: 1, version: "0.2.0", commit: "b".repeat(40), target: "linux-x64", files: {} };
    for (let i = 0; i < 1000; i++) {
      const name = "owned-" + String(i).padStart(4, "0"); writeFileSync(join(release, name), "owned");
      manifest.files[`harness/${name}`] = { sha256: digest("owned"), bytes: 5, executable: false, sourceURL: "https://example.test", license: "MIT" };
    }
    writeFileSync(join(release, ".tmp/bundle-receipt.json"), JSON.stringify(manifest));
    const r = Bun.spawnSync([process.execPath, "--no-env-file", "--no-install", join(release, "scripts/bundle/uninstall.ts")], { env: { PATH: process.env.PATH, HOME: home, XDG_DATA_HOME: data }, stdout: "pipe", stderr: "pipe", timeout: 15000 });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    const text = r.stdout.toString(); expect(text).toContain("Would remove 1000"); expect(text).toContain(join(release, "owned-0999")); expect(text.endsWith("Run with --apply to remove these files.\n")).toBe(true);
    expect(existsSync(join(release, "owned-0999"))).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
