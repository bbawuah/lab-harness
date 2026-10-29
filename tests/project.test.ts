import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bindProjectRoot, verifyProjectBinding } from "../src/project.ts";
import { SearchService } from "../src/search/index.ts";

test("explicit unrelated project with spaces retains source guards and refuses root replacement", () => {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), "lab-project-")), project = join(parent, "project B with spaces");
  mkdirSync(project);
  try {
    writeFileSync(join(project, "notes.md"), "EXTERNAL_PROJECT_NEEDLE\n");
    writeFileSync(join(project, ".env"), "EXTERNAL_PROJECT_NEEDLE private\n");
    symlinkSync(join(parent, "outside"), join(project, "escape")); writeFileSync(join(parent, "outside"), "EXTERNAL_PROJECT_NEEDLE outside");
    const binding = bindProjectRoot(project); expect(verifyProjectBinding(binding)).toEqual(binding);
    expect(() => new SearchService(project)).toThrow("STATE_OUTSIDE_CONCEPT");
    const search = new SearchService(project, { projectBinding: binding });
    const hits = search.text("EXTERNAL_PROJECT_NEEDLE").hits;
    expect(hits.map(hit => hit.path)).toEqual(["notes.md"]); expect(search.verify(hits[0]!)).toBe(true);
    expect(() => new SearchService(parent, { projectBinding: binding })).toThrow("PROJECT_ROOT_BINDING_MISMATCH");
    renameSync(project, join(parent, "old")); mkdirSync(project);
    expect(() => verifyProjectBinding(binding)).toThrow("PROJECT_DIRECTORY_CHANGED");
    expect(() => search.text("EXTERNAL_PROJECT_NEEDLE")).toThrow("UNSAFE_SEARCH_ROOT");
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("project binding never creates missing roots or accepts filesystem roots, symlink roots or forged identity", () => {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), "lab-project-invalid-"));
  try {
    expect(() => bindProjectRoot(join(parent, "missing"))).toThrow();
    expect(() => bindProjectRoot("/")).toThrow("PROJECT_FILESYSTEM_ROOT_REFUSED");
    symlinkSync(parent, join(parent, "alias")); expect(() => bindProjectRoot(join(parent, "alias"))).toThrow("INVALID_PROJECT_DIRECTORY");
    const binding = bindProjectRoot(parent); expect(() => verifyProjectBinding({ ...binding, inode: binding.inode + 1 })).toThrow("PROJECT_DIRECTORY_CHANGED");
    expect(() => verifyProjectBinding({ ...binding, extra: true })).toThrow("INVALID_PROJECT_BINDING");
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
