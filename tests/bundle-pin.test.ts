import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assertNotOlder, bootstrapPin } from "../scripts/release/pin.ts";

test("release guard accepts an equal/newer bootstrap and refuses an older or unrelated pin", () => {
  const parent = resolve(import.meta.dir, "../.tmp"); mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "pin-test-"));
  const git = (...args: string[]) => {
    const r = Bun.spawnSync(["git", ...args], { cwd: root, env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.test", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.test" } });
    expect(r.exitCode, r.stderr.toString()).toBe(0); return r.stdout.toString().trim();
  };
  try {
    git("init", "-q"); writeFileSync(join(root, "source"), "first"); git("add", "."); git("commit", "-qm", "first"); const first = git("rev-parse", "HEAD");
    writeFileSync(join(root, "source"), "second"); git("commit", "-qam", "second"); const second = git("rev-parse", "HEAD");
    expect(() => assertNotOlder(root, first, second)).not.toThrow(); expect(() => assertNotOlder(root, second, second)).not.toThrow(); expect(() => assertNotOlder(root, second, first)).toThrow();
    const source = `  bootstrap_commit=${second}\n  bootstrap_sha256=${"b".repeat(64)}\n`;
    expect(bootstrapPin(source).commit).toBe(second); expect(() => bootstrapPin("unpinned")).toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
