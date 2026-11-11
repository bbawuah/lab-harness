import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
test("lab --version works offline without initializing runtimes or a workspace", () => {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  const home = mkdtempSync(join(root, ".tmp/version-home-"));
  try {
    const r = Bun.spawnSync([join(root, "lab"), "--version"], { cwd: home, env: { HOME: home, XDG_DATA_HOME: join(home, "data"), PATH: "/usr/bin:/bin", LAB_INSTALL_OFFLINE: "1" } });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    expect(r.stdout.toString()).toMatch(/^lab-harness \d+\.\d+\.\d+ \([a-f0-9]{40}\)\n$/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
