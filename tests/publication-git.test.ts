import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { publicationFiles } from "../scripts/publication-policy.ts";

test("Git publication scans tracked files and archives retain the complete walk", () => {
  const parent = resolve(import.meta.dir, "../.tmp"); mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "publication-git-"));
  const git = (...args: string[]) => { const r = Bun.spawnSync(["git", ...args], { cwd: root }); expect(r.exitCode, r.stderr.toString()).toBe(0); };
  try {
    git("init", "-q"); writeFileSync(join(root, ".gitignore"), "ignored/\n"); writeFileSync(join(root, "tracked.md"), "source"); git("add", ".");
    mkdirSync(join(root, ".claude")); writeFileSync(join(root, ".claude/private.key"), "private local data");
    mkdirSync(join(root, "ignored")); writeFileSync(join(root, "ignored/private.key"), "ignored data");
    expect(publicationFiles(root)).toEqual([".gitignore", "tracked.md"]);
    writeFileSync(join(root, "tracked.md"), "-----BEGIN " + "PRIVATE KEY-----"); expect(() => publicationFiles(root)).toThrow("Sensitive publication content");
    writeFileSync(join(root, "tracked.md"), "source"); rmSync(join(root, "tracked.md")); symlinkSync(".gitignore", join(root, "tracked.md")); expect(() => publicationFiles(root)).toThrow("symlink");
    rmSync(join(root, "tracked.md")); writeFileSync(join(root, "tracked.md"), "source"); rmSync(join(root, ".git"), { recursive: true });
    expect(() => publicationFiles(root)).toThrow("Sensitive publication filename");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
