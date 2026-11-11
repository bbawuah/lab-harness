import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SearchService } from "../src/search/index.ts";
import { bindProjectRoot } from "../src/project.ts";

test("source command installation handles quoted paths, preserves cwd and arguments, and leaves foreign commands alone", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lab-command-"))), home = join(root,"home"), source = join(root,"source ' checkout"), cwd = join(root,"working folder");
  for (const dir of [home, join(source,"scripts"), cwd]) mkdirSync(dir,{recursive:true});
  copyFileSync(resolve(import.meta.dir,"../scripts/install-command.sh"),join(source,"scripts/install-command.sh"));
  writeFileSync(join(source,"lab"),'#!/bin/sh\npwd -P\nprintf "%s\\n" "$@"\n',{mode:0o700});
  const command = join(home,".local/bin/lab"), env = {HOME:home,PATH:join(home,".local/bin")+":/usr/bin:/bin"};
  try {
    for (let i=0;i<2;i++) {
      const installed=Bun.spawnSync(["/bin/sh",join(source,"scripts/install-command.sh")],{cwd,env});
      expect(installed.exitCode,installed.stderr.toString()).toBe(0);
      const result=Bun.spawnSync(["/bin/sh","-c",'lab --project "path with spaces"'],{cwd,env});
      expect(result.exitCode,result.stderr.toString()).toBe(0);
      expect(result.stdout.toString()).toBe(cwd+"\n--project\npath with spaces\n");
    }
    writeFileSync(command,"foreign command");
    expect(Bun.spawnSync(["/bin/sh",join(source,"scripts/install-command.sh")],{cwd,env}).exitCode).toBe(0);
    expect(readFileSync(command,"utf8")).toBe("foreign command");
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("searching an ancestor workspace excludes private LAB state", () => {
  const root=realpathSync(mkdtempSync(join(tmpdir(),"lab-state-exclusion-"))), state=join(root,"private-state");
  mkdirSync(state); writeFileSync(join(state,"key"),"PRIVATE_STATE_NEEDLE"); writeFileSync(join(root,"source.txt"),"PUBLIC_SOURCE_NEEDLE");
  try {
    const search=new SearchService(root,{projectBinding:bindProjectRoot(root),engine:"fallback",excludedRoots:[state]});
    expect(search.text("PRIVATE_STATE_NEEDLE").hits).toHaveLength(0);
    expect(search.files("key").hits).toHaveLength(0);
    expect(search.text("PUBLIC_SOURCE_NEEDLE").hits).toHaveLength(1);
  } finally {rmSync(root,{recursive:true,force:true});}
});
