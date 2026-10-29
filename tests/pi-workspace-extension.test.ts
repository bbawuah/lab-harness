import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import extension, { executeWorkspaceRequest, type WorkspaceExtensionAPI } from "../src/pi/workspace-extension.ts";
const roots: string[] = [];
const previousRoot = process.env.LAB_WORKSPACE_ROOT, previousHome = process.env.LAB_WORKSPACE_USER_HOME;
afterEach(() => { if (previousRoot === undefined) delete process.env.LAB_WORKSPACE_ROOT; else process.env.LAB_WORKSPACE_ROOT = previousRoot; if (previousHome === undefined) delete process.env.LAB_WORKSPACE_USER_HOME; else process.env.LAB_WORKSPACE_USER_HOME = previousHome; for (const root of roots.splice(0)) rmSync(root,{recursive:true,force:true}); });
test("extension registers actual search tools and only operator commands for skills", () => {
  const tools: string[] = [], commands: string[] = [], events: string[] = [];
  extension({on(name) {events.push(name);},registerTool(tool) {tools.push(tool.name);},registerCommand(name) {commands.push(name);},sendMessage() {}});
  expect(tools).toEqual(["lab_search","lab_files"]); expect(commands).toEqual(["lab-search","lab-files","lab-skills","lab-skill"]); expect(events).toEqual(["session_start"]);
});
test("real skill API explicitly loads bytes and rejects changed identities", async () => {
  mkdirSync(resolve(".tmp"),{recursive:true}); const root=mkdtempSync(resolve(".tmp/skills-workspace-")); roots.push(root);
  const bundle=join(root,".agents/skills/example"); mkdirSync(bundle,{recursive:true});
  writeFileSync(join(bundle,"SKILL.md"),"---\nname: example\ndescription: Example fixture\n---\nOnly explicit loading reveals this body.\n");
  process.env.LAB_WORKSPACE_ROOT=root; process.env.LAB_WORKSPACE_USER_HOME=join(root,"absent-home");
  const inventory=await executeWorkspaceRequest({action:"skills"}) as {skills:{id:string;name:string}[]};
  const skill=inventory.skills.find(skill=>skill.name==="example"); expect(skill).toBeDefined();
  const loaded=await executeWorkspaceRequest({action:"load",query:skill!.id}); expect(loaded).toContain("Only explicit loading"); expect(loaded).toContain("SHA-256");
  writeFileSync(join(bundle,"SKILL.md"),"Changed source\n");
  await expect(executeWorkspaceRequest({action:"load",query:skill!.id})).rejects.toThrow();
});
