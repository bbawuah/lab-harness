import { expect, test } from "bun:test";
import { renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildContext, verifyContext } from "../src/context.ts";
import { Workspace } from "../src/workspace.ts";
import { hash } from "../src/util.ts";
import { fresh } from "./helpers.ts";

function selected() {
  const f = fresh(), workspace = new Workspace(join(f.root, "workspace"));
  writeFileSync(join(workspace.root, "module.ts"), "first line\nconst needle = 42;\nlast line");
  const data = workspace.read("module.ts");
  const selection = { candidateSHA: f.contract.candidateSHA, dirtyHash: f.contract.dirtyHash, requirements: f.contract.requirements, corrections: ["Keep every obligation."], sources: [{ path: "module.ts", contentHash: data.contentHash, lineStart: 2, lineEnd: 2, text: "preview" }] };
  return { f, workspace, selection };
}
test("selected context rehydrates source and retains byte hash, lines, obligations and candidate", () => {
  const { f, workspace, selection } = selected(), result = buildContext(workspace.root, selection);
  expect(result.pack.snippets[0]!.text).toBe("const needle = 42;");
  expect(result.pack.sourceProvenance[0]).toMatchObject({ contentHash: selection.sources[0]!.contentHash, lineStart: 2, lineEnd: 2 });
  expect(result.pack.requirements).toEqual(f.contract.requirements);
  expect(result.contextHash).toBe(hash(result.pack)); expect(f.ledger.context(result.pack)).toBe(result.contextHash);
  verifyContext(workspace.root, result.pack);
  selection.requirements[0]!.text = "changed outside";
  expect(result.pack.requirements[0]!.text).not.toBe("changed outside");
});
for (const change of ["edit", "rename", "delete"] as const) test(`context refuses stale source after ${change}`, () => {
  const { workspace, selection } = selected(), result = buildContext(workspace.root, selection), source = join(workspace.root, "module.ts");
  if (change === "edit") writeFileSync(source, "first line\nchanged\nlast line");
  else if (change === "rename") renameSync(source, join(workspace.root, "renamed.ts"));
  else unlinkSync(source);
  expect(() => verifyContext(workspace.root, result.pack)).toThrow();
  expect(() => buildContext(workspace.root, selection)).toThrow();
});
test("context detects tampered snippet, line provenance and missing skill verifier", () => {
  const { workspace, selection } = selected(), result = buildContext(workspace.root, selection);
  const changed = structuredClone(result.pack); changed.sourceProvenance[0]!.lineStart = 1;
  expect(() => verifyContext(workspace.root, changed)).toThrow("CONTEXT_PROVENANCE_MISMATCH");
  result.pack.snippets[0]!.text = "invented content";
  expect(() => verifyContext(workspace.root, result.pack)).toThrow("CONTEXT_PROVENANCE_MISMATCH");
  const skills = [{ id: "fixture", contentHash: "a".repeat(64), bundleHash: "b".repeat(64) }];
  expect(() => buildContext(workspace.root, { ...selection, skills })).toThrow("STALE_OR_UNVERIFIED_SKILL");
  const loaded = buildContext(workspace.root, { ...selection, skills }, () => true);
  expect(() => verifyContext(workspace.root, loaded.pack, () => false)).toThrow("STALE_OR_UNVERIFIED_SKILL");
});
test("context refuses a different workspace even when its selected bytes are identical", () => {
  const { workspace, selection, f } = selected(), result = buildContext(workspace.root, selection);
  const other = new Workspace(join(f.root, "other"));
  writeFileSync(join(other.root, "module.ts"), workspace.read("module.ts").text);
  expect(() => verifyContext(other.root, result.pack)).toThrow("CONTEXT_WORKSPACE_MISMATCH");
});
