import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Workspace, type Operation } from "../src/workspace.ts";
import { fresh } from "./helpers.ts";

test("bounded exact search excludes sensitive paths and refreshes working-byte hashes", () => {
  const f = fresh(), w = new Workspace(join(f.root, "workspace"));
  writeFileSync(join(w.root, "safe.txt"), "needle\nneedle"); writeFileSync(join(w.root, "config.json"), "needle SECRET"); writeFileSync(join(w.root, ".env.fixture"), "needle SECRET");
  const before = w.search("needle", 1); expect(before).toHaveLength(1); expect(before[0]!.text).toBe("needle");
  writeFileSync(join(w.root, "safe.txt"), "needle edited"); expect(w.search("needle")[0]!.contentHash).not.toBe(before[0]!.contentHash);
  unlinkSync(join(w.root, "safe.txt")); expect(w.search("needle")).toEqual([]);
  expect(() => w.read("config.json")).toThrow("EXCLUDED_PATH"); expect(() => w.read("../lab/ledger.sqlite")).toThrow("EXCLUDED_PATH");
});
test("symlink escapes are refused for explicit paths and omitted from search", () => {
  const f = fresh(), w = new Workspace(join(f.root, "workspace")); writeFileSync(join(f.root, "outside.txt"), "needle"); symlinkSync(join(f.root, "outside.txt"), join(w.root, "escape.txt"));
  expect(() => w.read("escape.txt")).toThrow("UNSAFE_WORKSPACE_PATH"); expect(w.search("needle")).toEqual([]);
});
test("structured operation does not interpret inert command examples", () => {
  const f = fresh(), w = new Workspace(join(f.root, "workspace")), body = "Examples only: rg needle /private; $(not-executed); rm -rf /not-executed";
  expect(w.applyOperation({ kind: "write-document", path: "notes/guide.md", body })).toHaveProperty("written", "notes/guide.md");
  expect(w.read("notes/guide.md").text).toBe(body);
  expect(() => w.applyOperation({ kind: "shell", body } as unknown as Operation)).toThrow("UNSUPPORTED_OPERATION");
});
test("dangling symlink cannot turn document write into an outside write", () => {
  const f = fresh(), w = new Workspace(join(f.root, "workspace")); symlinkSync(join(f.root, "absent-target"), join(w.root, "dangling.txt"));
  expect(() => w.applyOperation({ kind: "write-document", path: "dangling.txt", body: "data" })).toThrow("UNSAFE_WORKSPACE_PATH");
});
test("skill metadata is progressive body inspection, not qualification of scripts", () => {
  const f = fresh(), w = new Workspace(join(f.root, "workspace")); mkdirSync(join(w.root, "skills", "review"), { recursive: true });
  writeFileSync(join(w.root, "skills/review/SKILL.md"), "---\nname: review\ndescription: Review source evidence.\n---\nRead references first.");
  expect(w.skill("skills/review/SKILL.md")).toMatchObject({ id: "review", resourcesQualified: false });
});

test("UTF8 BOM changes working-byte identity and stays in snippet text", () => {
  const f = fresh(), w = new Workspace(join(f.root, "workspace"));
  writeFileSync(join(w.root, "source.txt"), "needle"); const plain = w.read("source.txt");
  writeFileSync(join(w.root, "source.txt"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("needle")]));
  const withBOM = w.read("source.txt"); expect(withBOM.contentHash).not.toBe(plain.contentHash);
  expect(withBOM.text.charCodeAt(0)).toBe(0xfeff); expect(w.search("needle")[0]!.contentHash).toBe(withBOM.contentHash);
});
