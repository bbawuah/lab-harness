import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { discoverSkills, loadSkill, selectSkill, verifySkill, type SkillSelection, type SkillSource } from "../src/skills/index.ts";
import { buildContext, verifyContext } from "../src/context.ts";
import { fresh } from "./helpers.ts";
import { Workspace } from "../src/workspace.ts";

const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lab-owned-skills-")); temporary.push(root);
  const origins: SkillSource[] = ["first", "second"].map(id => ({ id, root: join(root, id) }));
  for (const origin of origins) mkdirSync(origin.root);
  const put = (path: string, text = "resource") => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
  const skill = (name: string, body: string, origin = origins[0]!) => put(join(origin.root, name, "SKILL.md"), `---\nname: ${name}\nversion: 1.2.3\n---\n${body}`);
  return { root, origins, put, skill };
}
test("discovery includes hidden system skills, hashes resources, and keeps bodies/root paths private", () => {
  const f = fixture(); f.skill(".system/sample", "PRIVATE INERT BODY");
  f.put(join(f.origins[0]!.root, ".system/sample/scripts/no-run.sh"), "touch NEVER_EXECUTED");
  const inventory = discoverSkills(f.origins), skill = inventory.skills[0]!;
  expect(inventory.complete).toBe(true); expect(skill.resources.map(r => r.path)).toEqual(["scripts", "scripts/no-run.sh", "SKILL.md"]);
  expect(skill.contentHash).toHaveLength(64); expect(skill.bundleHash).toHaveLength(64);
  expect(skill.provenance.declaredVersion).toBe("1.2.3");
  expect(JSON.stringify(inventory)).not.toContain(f.root); expect(JSON.stringify(inventory)).not.toContain("PRIVATE INERT BODY");
  expect(existsSync(join(f.origins[0]!.root, ".system/sample/NEVER_EXECUTED"))).toBe(false);
  const loaded = loadSkill(selectSkill(skill), f.origins, inventory);
  expect(loaded.text).toContain("PRIVATE INERT BODY"); expect(verifySkill(loaded.selection, f.origins)).toBe(true);
});
test("identical origins deduplicate, same-body resource conflicts and differing bodies remain selectable", () => {
  const f = fixture(); f.skill("same", "instructions"); f.skill("same", "instructions", f.origins[1]);
  let inventory = discoverSkills(f.origins);
  expect(inventory.skills).toHaveLength(1); expect(inventory.skills[0]!.origins).toHaveLength(2);
  expect(inventory.coverage.origins).toBe(2); expect(inventory.duplicateBodies[0]!.origins).toBe(2);
  expect(() => loadSkill({ id: inventory.skills[0]!.id, contentHash: inventory.skills[0]!.contentHash! }, f.origins, inventory)).toThrow("AMBIGUOUS_SKILL_ORIGIN");
  f.put(join(f.origins[1]!.root, "same/extra.txt")); inventory = discoverSkills(f.origins);
  expect(inventory.skills).toHaveLength(2); expect(inventory.conflicts[0]!.reason).toBe("different-bundles");
  expect(inventory.duplicateBodies[0]!.ids).toHaveLength(2);
  f.skill("same", "other instructions", f.origins[1]); inventory = discoverSkills(f.origins);
  expect(inventory.conflicts[0]!.reason).toBe("different-instructions");
});
for (const mutation of ["instruction", "script", "resource", "delete", "rename", "add"] as const) test(`explicit load and context verification reject ${mutation} mutation`, () => {
  const f = fixture(); f.skill("sample", "same instructions");
  f.put(join(f.origins[0]!.root, "sample/scripts/run.py"), "print('inert')");
  f.put(join(f.origins[0]!.root, "sample/references/info.md"));
  const inventory = discoverSkills(f.origins), selection = selectSkill(inventory.skills[0]!);
  const verify = (selected: typeof selection) => verifySkill(selected, f.origins, inventory);
  expect(verify(selection)).toBe(true);
  const base = join(f.origins[0]!.root, "sample");
  if (mutation === "instruction") f.skill("sample", "changed instructions");
  if (mutation === "script") f.put(join(base, "scripts/run.py"), "print('changed')");
  if (mutation === "resource") f.put(join(base, "references/info.md"), "changed");
  if (mutation === "delete") unlinkSync(join(base, "references/info.md"));
  if (mutation === "rename") renameSync(join(base, "references/info.md"), join(base, "references/renamed.md"));
  if (mutation === "add") f.put(join(base, "new.md"));
  expect(verify(selection)).toBe(false);
  expect(verifySkill(selection, f.origins)).toBe(false);
  expect(() => loadSkill(selection, f.origins, inventory)).toThrow();
});
test("selection stays bound to its original origin when a duplicate remains unchanged", () => {
  const f = fixture(); f.skill("same", "body"); f.skill("same", "body", f.origins[1]);
  const inventory = discoverSkills(f.origins), selection = selectSkill(inventory.skills[0]!, inventory.skills[0]!.origins.find(o => o.originId === "first")!);
  f.skill("same", "changed"); expect(verifySkill(selection, f.origins, inventory)).toBe(false);
});
test("resource links inside bundles are hashed and external links never followed", () => {
  const f = fixture(); f.skill("sample", "body"); const base = join(f.origins[0]!.root, "sample");
  f.put(join(base, "target.txt"), "local"); symlinkSync("target.txt", join(base, "alias.txt"));
  let inventory = discoverSkills(f.origins);
  expect(inventory.complete).toBe(true); expect(inventory.skills[0]!.resources.find(r => r.path === "alias.txt")).toMatchObject({ kind: "symlink", status: "available" });
  expect(loadSkill(selectSkill(inventory.skills[0]!), f.origins, inventory).text).toContain("body");
  f.put(join(f.root, "outside.txt"), "NEVER EXPOSE OUTSIDE"); symlinkSync(join(f.root, "outside.txt"), join(base, "outside.txt"));
  inventory = discoverSkills(f.origins);
  expect(inventory.complete).toBe(false); expect(inventory.skills[0]!.loadable).toBe(false);
  expect(inventory.skills[0]!.resources.find(r => r.path === "outside.txt")).toMatchObject({ reason: "SYMLINK_OUTSIDE_BUNDLE", status: "blocked" });
  expect(JSON.stringify(inventory)).not.toContain("NEVER EXPOSE OUTSIDE"); expect(JSON.stringify(inventory)).not.toContain(f.root);
});
test("approved skill/instruction links deduplicate and load; broken links retain coverage", () => {
  const f = fixture(); f.skill("target", "body", f.origins[1]);
  symlinkSync(join(f.origins[1]!.root, "target"), join(f.origins[0]!.root, "proprietary"));
  symlinkSync(join(f.root, "not-there"), join(f.origins[0]!.root, "broken"));
  mkdirSync(join(f.origins[0]!.root, "linked"));
  symlinkSync(join(f.origins[1]!.root, "target/SKILL.md"), join(f.origins[0]!.root, "linked/SKILL.md"));
  const inventory = discoverSkills(f.origins);
  expect(inventory.coverage.origins).toBe(4); expect(inventory.coverage.unavailable).toBe(1);
  expect(inventory.skills.filter(s => s.compatibility === "proprietary-unavailable")).toHaveLength(1);
  expect(inventory.coverageComplete).toBe(true); expect(inventory.contentComplete).toBe(false);
  const record = inventory.skills.find(s => s.loadable)!;
  expect(record.origins).toHaveLength(3);
  for (const origin of record.origins) expect(loadSkill(selectSkill(record, origin), f.origins, inventory).text).toContain("body");
});
test("instruction links outside all selected roots are retained without following contents", () => {
  const f = fixture(); f.put(join(f.root, "outside/SKILL.md"), "UNSELECTED CONTENT");
  mkdirSync(join(f.origins[0]!.root, "sample")); symlinkSync(join(f.root, "outside/SKILL.md"), join(f.origins[0]!.root, "sample/SKILL.md"));
  const inventory = discoverSkills(f.origins);
  expect(inventory.coverageComplete).toBe(true); expect(inventory.contentComplete).toBe(false);
  expect(inventory.diagnostics[0]!.code).toBe("INSTRUCTION_SYMLINK_OUTSIDE_SELECTED_ROOTS");
  expect(inventory.skills[0]!.contentHash).toBeUndefined(); expect(JSON.stringify(inventory)).not.toContain("UNSELECTED CONTENT");
});
test("discovery and explicit load never execute bundled scripts or instruction commands", () => {
  const f = fixture(), marker = join(f.root, "executed"); f.skill("inert", `Run this now: touch ${marker}`);
  f.put(join(f.origins[0]!.root, "inert/scripts/run.sh"), `#!/bin/sh\ntouch '${marker}'\n`);
  const inventory = discoverSkills(f.origins); loadSkill(selectSkill(inventory.skills[0]!), f.origins, inventory);
  expect(existsSync(marker)).toBe(false);
});
test("non-text instructions and symlinks to sensitive resources are unavailable", () => {
  const f = fixture(); f.skill("sample", "body");
  f.put(join(f.origins[0]!.root, "sample/.env"), "PRIVATE");
  symlinkSync(".env", join(f.origins[0]!.root, "sample/ordinary.txt"));
  f.put(join(f.origins[1]!.root, "binary/SKILL.md"), "\x00binary");
  const inventory = discoverSkills(f.origins);
  expect(inventory.skills.every(s => !s.loadable)).toBe(true);
  expect(inventory.diagnostics.some(d => d.code === "INVALID_INSTRUCTION_TEXT")).toBe(true);
  const alias = inventory.skills.find(s => s.name === "sample")!.resources.find(r => r.path === "ordinary.txt")!;
  expect(alias.reason).toBe("SENSITIVE_PATH_NOT_READ"); expect(alias.contentHash).toBeUndefined();
});
test("directory symlinks cannot escape or loop", () => {
  const f = fixture(); f.skill("sample", "body"); const base = join(f.origins[0]!.root, "sample");
  symlinkSync(".", join(base, "loop")); const inventory = discoverSkills(f.origins);
  expect(inventory.skills[0]!.loadable).toBe(false);
  expect(inventory.diagnostics.some(d => d.code === "DIRECTORY_SYMLINK_NOT_FOLLOWED")).toBe(true);
});
test("path traversal, invalid aliases and unsealed body-only selections fail closed", () => {
  const f = fixture(); f.skill("sample", "body"); const inventory = discoverSkills(f.origins), selection = selectSkill(inventory.skills[0]!);
  for (const path of ["../sample/SKILL.md", "/absolute", "sample/../../outside", "sample\\SKILL.md", "./sample/SKILL.md", "sample//SKILL.md"]) expect(verifySkill({ ...selection, path }, f.origins, inventory)).toBe(false);
  expect(() => discoverSkills([{ id: "private/alias", root: f.root }])).toThrow("INVALID_SKILL_ORIGIN");
  expect(() => discoverSkills([...f.origins, f.origins[0]!])).toThrow("INVALID_SKILL_ORIGIN");
  expect(() => loadSkill({ id: selection.id, contentHash: selection.contentHash }, f.origins)).toThrow("UNSEALED_SKILL_SELECTION");
});
test("missing roots, entry/file/depth limits and bounded diagnostics cannot claim completeness", () => {
  const f = fixture(); f.skill("sample", "x".repeat(100)); f.skill("other", "body");
  for (const options of [{ maxEntries: 1 }, { maxFileBytes: 8 }, { maxFilesPerBundle: 1 }, { maxDepth: 1 }]) {
    f.put(join(f.origins[0]!.root, "sample/deep/more/file.md"));
    const inventory = discoverSkills(f.origins, { ...options, maxDiagnostics: 1 });
    expect(inventory.complete).toBe(false); expect(inventory.truncated).toBe(true); expect(inventory.diagnostics.length).toBeLessThanOrEqual(1);
  }
  const missing = discoverSkills([{ id: "absent", root: join(f.root, "absent") }]);
  expect(missing.roots[0]!.status).toBe("unavailable"); expect(missing.complete).toBe(false);
});
test("sensitive resource names are retained as unread omissions and block loading", () => {
  const f = fixture(); f.skill("sample", "body"); f.put(join(f.origins[0]!.root, "sample/.env.local"), "SENSITIVE NEVER PUBLISH");
  const inventory = discoverSkills(f.origins), record = inventory.skills[0]!;
  expect(record.resources.find(r => r.path === ".env.local")).toMatchObject({ reason: "SENSITIVE_PATH_NOT_READ", status: "blocked" });
  expect(record.loadable).toBe(false); expect(JSON.stringify(inventory)).not.toContain("SENSITIVE NEVER PUBLISH");
});
test("repository guidance, standalone agents and portable skills are inventoried; worktrees are excluded", () => {
  const f = fixture(); f.origins[0]!.kind = "repository";
  f.put(join(f.origins[0]!.root, "AGENTS.md"), "Local repository guidance");
  f.put(join(f.origins[0]!.root, "apps/example/CLAUDE.md"), "App guidance");
  f.put(join(f.origins[0]!.root, ".claude/agents/reviewer.md"), "Review instructions");
  f.skill("agents/skills/interview", "Interview the operator");
  f.skill(".claude/worktrees/unowned/hidden", "NEVER READ SESSION");
  f.skill(".tmp/runtime/hidden", "NEVER READ RUNTIME");
  f.skill(".lab/state/hidden", "NEVER READ STATE");
  const inventory = discoverSkills(f.origins);
  expect(inventory.skills).toHaveLength(4); expect(inventory.skills.filter(s => s.kind === "agent-instructions")).toHaveLength(3);
  expect(inventory.roots[0]!.exclusions).toContain(".claude/worktrees");
  expect(inventory.roots[0]!.exclusions).toContain(".tmp");
  expect(inventory.roots[0]!.exclusions).toContain(".lab");
  expect(JSON.stringify(inventory)).not.toContain("unowned");
});
test("service and proprietary classification describe dependencies, never grant availability", () => {
  const f = fixture(); f.skill("portable", "Ask questions and summarize answers."); f.skill("local", "Read ~/vault using python.");
  f.skill("service", "Use Kibana API key with MCP connector."); f.skill("proprietary", "Proprietary. Requires Claude Desktop.");
  const inventory = discoverSkills(f.origins), byName = Object.fromEntries(inventory.skills.map(s => [s.name, s]));
  expect(byName.portable!.compatibility).toBe("portable"); expect(byName.local!.compatibility).toBe("local-dependency");
  expect(byName.service!.compatibility).toBe("connected-service"); expect(byName.service!.dependencyReasons).toContain("connected-tool-or-credentials");
  expect(byName.proprietary!.compatibility).toBe("proprietary-unavailable");
  expect(byName.service!.provenance.redistribution).toBe("not-established");
});
test("context accepts verified skills and invalidates a script edit", () => {
  const f = fixture(); f.skill("sample", "body"); f.put(join(f.origins[0]!.root, "sample/script.py"));
  const inventory = discoverSkills(f.origins), selection = selectSkill(inventory.skills[0]!);
  const runtime = fresh(), workspace = new Workspace(join(runtime.root, "workspace"));
  writeFileSync(join(workspace.root, "source.ts"), "owned source\n");
  const source = workspace.read("source.ts"), verify = (s: SkillSelection) => verifySkill(s, f.origins, inventory);
  const result = buildContext(workspace.root, { candidateSHA: runtime.contract.candidateSHA, dirtyHash: runtime.contract.dirtyHash, requirements: runtime.contract.requirements, sources: [{ path: "source.ts", contentHash: source.contentHash, lineStart: 1, lineEnd: 1, text: "preview" }], skills: [selection] }, verify);
  verifyContext(workspace.root, result.pack, verify);
  f.put(join(f.origins[0]!.root, "sample/script.py"), "changed");
  expect(() => verifyContext(workspace.root, result.pack, verify)).toThrow("STALE_OR_UNVERIFIED_SKILL");
});
