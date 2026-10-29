import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { bindProjectRoot } from "../src/project.ts";
import type { SearchResult } from "../src/search/index.ts";
import extension, { callWorkspaceBridge, executeWorkspaceRequest } from "../src/pi/workspace-extension.ts";
const roots: string[] = [];
const environmentNames = ["LAB_WORKSPACE_ROOT", "LAB_WORKSPACE_USER_HOME", "LAB_WORKSPACE_BINDING", "LAB_INSTALL_ROOT", "LAB_WORKSPACE_BUN"] as const;
const previous = Object.fromEntries(environmentNames.map(name => [name,process.env[name]]));
afterEach(() => { for (const name of environmentNames) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } for (const root of roots.splice(0)) rmSync(root,{recursive:true,force:true}); });
function projectFixture(): string {
  const parent=realpathSync(mkdtempSync(join(tmpdir(),"lab-project-"))); roots.push(parent);
  const root=join(parent,"project B with spaces"); mkdirSync(root);
  process.env.LAB_WORKSPACE_ROOT=root;
  process.env.LAB_WORKSPACE_BINDING=JSON.stringify(bindProjectRoot(root));
  process.env.LAB_INSTALL_ROOT=resolve(import.meta.dir,"..");
  process.env.LAB_WORKSPACE_USER_HOME=join(parent,"user home");
  process.env.LAB_WORKSPACE_BUN=process.execPath;
  return root;
}
test("extension registers actual search tools and only operator commands for skills", () => {
  const tools: string[] = [], commands: string[] = [], events: string[] = [];
  extension({on(name) {events.push(name);},registerTool(tool) {tools.push(tool.name);},registerCommand(name) {commands.push(name);},sendMessage() {}});
  expect(tools).toEqual(["lab_search","lab_files"]); expect(commands).toEqual(["exit","lab-help","lab-search","lab-files","lab-skills","lab-skill"]); expect(events).toEqual(["session_start"]);
});
test("real skill API explicitly loads bytes and rejects changed identities", async () => {
  const root=projectFixture();
  const bundle=join(root,".agents/skills/example"); mkdirSync(bundle,{recursive:true});
  writeFileSync(join(bundle,"SKILL.md"),"---\nname: example\ndescription: Example fixture\n---\nOnly explicit loading reveals this body.\n");
  const inventory=await executeWorkspaceRequest({action:"skills"}) as {skills:{id:string;name:string}[]};
  const skill=inventory.skills.find(skill=>skill.name==="example"); expect(skill).toBeDefined();
  const loaded=await executeWorkspaceRequest({action:"load",query:skill!.id}); expect(loaded).toContain("Only explicit loading"); expect(loaded).toContain("SHA-256");
  writeFileSync(join(bundle,"SKILL.md"),"Changed source\n");
  await expect(executeWorkspaceRequest({action:"load",query:skill!.id})).rejects.toThrow();
});
test("bound project search returns B's byte identity and preserves source exclusions", async () => {
  const root=projectFixture(), body="Unique project B needle\n";
  writeFileSync(join(root,"source B.txt"),body);
  writeFileSync(join(root,".env.private"),body);
  mkdirSync(join(root,".tmp")); writeFileSync(join(root,".tmp/generated.txt"),body);
  symlinkSync(join(root,"source B.txt"),join(root,"linked.txt"));
  const result=await callWorkspaceBridge({action:"search",query:"Unique project B"}) as SearchResult;
  expect(result.hits).toHaveLength(1);
  expect(result.hits[0]).toMatchObject({path:"source B.txt",contentHash:createHash("sha256").update(body).digest("hex")});
  const files=await executeWorkspaceRequest({action:"files",query:"source B"}) as SearchResult;
  expect(files.hits.map(hit=>hit.path)).toEqual(["source B.txt"]);
});
test("skill origins include selected project instructions, installed examples and actual user skill roots", async () => {
  const root=projectFixture(), home=process.env.LAB_WORKSPACE_USER_HOME!;
  writeFileSync(join(root,"AGENTS.md"),"Selected project B instructions.\n");
  for (const [folder,name] of [[".codex","codex-fixture"],[".claude","claude-fixture"]]) {
    const bundle=join(home,folder!,"skills",name!); mkdirSync(bundle,{recursive:true});
    writeFileSync(join(bundle,"SKILL.md"),`---\nname: ${name}\ndescription: User skill fixture\n---\nExplicit user instructions.\n`);
  }
  const inventory=await callWorkspaceBridge({action:"skills"}) as {skills:{id:string;name:string;origins:{originId:string;path:string}[]}[]};
  for (const origin of ["repository","examples","codex","claude"]) expect(inventory.skills.some(skill=>skill.origins.some(location=>location.originId===origin))).toBe(true);
  const instructions=inventory.skills.find(skill=>skill.origins.some(origin=>origin.originId==="repository" && origin.path==="AGENTS.md"));
  expect(instructions).toBeDefined();
  expect(await callWorkspaceBridge({action:"load",query:instructions!.id})).toContain("Selected project B instructions.");
  const example=inventory.skills.find(skill=>skill.name==="terminal-evidence")!;
  expect(await callWorkspaceBridge({action:"load",query:`${example.id} examples terminal-evidence/SKILL.md`})).toContain(join(process.env.LAB_INSTALL_ROOT!,"examples/skills/terminal-evidence/SKILL.md"));
});
test("every bridge action refuses missing, mismatched, replaced and symlinked project bindings", async () => {
  const root=projectFixture(), binding=process.env.LAB_WORKSPACE_BINDING!;
  delete process.env.LAB_WORKSPACE_BINDING;
  await expect(executeWorkspaceRequest({action:"skills"})).rejects.toThrow("BINDING_REQUIRED");
  process.env.LAB_WORKSPACE_BINDING=binding;
  process.env.LAB_WORKSPACE_ROOT=resolve(root,"..");
  await expect(executeWorkspaceRequest({action:"files",query:"source"})).rejects.toThrow("MISMATCH");
  process.env.LAB_WORKSPACE_ROOT=root;
  renameSync(root,root+" old"); mkdirSync(root);
  for (const action of ["search","files","skills","load"] as const) await expect(executeWorkspaceRequest({action,query:"fixture"})).rejects.toThrow();
  rmSync(root,{recursive:true}); symlinkSync(root+" old",root);
  await expect(callWorkspaceBridge({action:"skills"})).rejects.toThrow();
});
