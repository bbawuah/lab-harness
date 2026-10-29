import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const roots: string[]=[];
afterEach(()=>{for(const root of roots.splice(0)) rmSync(root,{recursive:true,force:true});});
function snapshot(root:string):unknown {
  return readdirSync(root).sort().map(name=>{
    const path=join(root,name), stat=statSync(path);
    return [name,stat.mode,stat.mtimeMs,stat.isDirectory()?snapshot(path):createHash("sha256").update(readFileSync(path)).digest("hex")];
  });
}
test("native launch uses caller or explicit project B while all startup writes stay in private app state",()=>{
  const root=realpathSync(mkdtempSync(join(tmpdir(),"lab-workspace-launch-"))); roots.push(root);
  const install=join(root,"installed release A"), project=join(root,"project B with spaces"), home=join(root,"user home");
  for(const path of [join(install,"src/pi"),join(install,"src/runtime"),join(install,"src/herdr"),join(install,"contracts"),join(install,".tmp/rg"),project,home]) mkdirSync(path,{recursive:true,mode:0o700});
  // Exercise the actual entry/config/project code in an isolated installation.
  // Only pinned dependency verification and terminal attachment are fixture adapters.
  for(const path of ["pi/workspace.ts","pi/workspace-config.ts","project.ts","util.ts"]) copyFileSync(resolve(import.meta.dir,"../src",path),join(install,"src",path));
  writeFileSync(join(install,"src/runtime/pi.ts"),'export function verifyPiRuntime(){return {command:["/verified/pi"],version:"fixture"};}\n');
  writeFileSync(join(install,"src/herdr/interactive.ts"),'import {writeFileSync} from "node:fs"; export function verifyHerdrInteractive(){} export async function runHerdrInteractive(options){writeFileSync(process.env.CAPTURE_PATH,JSON.stringify(options));return 0;}\n');
  const rg="fixture pinned binary";
  writeFileSync(join(install,".tmp/rg/rg"),rg,{mode:0o700});
  writeFileSync(join(install,"contracts/ripgrep-source.json"),JSON.stringify({artifacts:[{platform:process.platform,arch:process.arch,binarySHA256:createHash("sha256").update(rg).digest("hex")}]}));
  writeFileSync(join(project,"source.txt"),"project B\n");
  const state=join(home,".local/share/lab-harness/workspace"); mkdirSync(state,{recursive:true,mode:0o700});
  writeFileSync(join(state,"route.json"),JSON.stringify({version:1,kind:"local",endpoint:"http://127.0.0.1:9/v1",model:"fixture-no-inference"}),{mode:0o600});
  writeFileSync(join(state,"key"),"",{mode:0o600});
  const beforeInstall=snapshot(install),beforeProject=snapshot(project),capture=join(root,"launch.json");
  const env:NodeJS.ProcessEnv={...process.env,HOME:home,CAPTURE_PATH:capture}; delete env.LAB_WORKSPACE_STATE_ROOT;
  for(const explicit of [false,true]) {
    const code=`import {runInteractiveWorkspace} from ${JSON.stringify(join(install,"src/pi/workspace.ts"))}; Object.defineProperty(process.stdin,"isTTY",{value:true}); Object.defineProperty(process.stdout,"isTTY",{value:true}); process.exitCode=await runInteractiveWorkspace(${explicit?JSON.stringify({project}):"{}"});`;
    const result=Bun.spawnSync([process.execPath,"--no-env-file","--no-install","--eval",code],{cwd:explicit?install:project,env});
    expect(result.stderr.toString()).toBe(""); expect(result.exitCode).toBe(0);
    const launch=JSON.parse(readFileSync(capture,"utf8"));
    expect(launch.cwd).toBe(project);
    expect(launch.environment.LAB_WORKSPACE_ROOT).toBe(project);
    expect(JSON.parse(launch.environment.LAB_WORKSPACE_BINDING)).toMatchObject({root:project,device:statSync(project).dev,inode:statSync(project).ino});
    expect(launch.environment.LAB_INSTALL_ROOT).toBe(install);
    expect(launch.environment.LAB_WORKSPACE_USER_HOME).toBe(home);
    expect(launch.environment.PI_CODING_AGENT_DIR).toBe(join(state,"agent"));
    expect(launch.executable).toBe(join(install,".tmp/herdr/herdr"));
    expect(launch.command).toContain(join(install,"src/pi/workspace-extension.ts"));
    expect(launch.command).toContain("/verified/pi");
    expect(launch.command).not.toContain("--resume");
    expect(launch.stateRoot.startsWith(join(state,"runs/h-"))).toBe(true);
    expect(launch.command[1]).toBe(join(launch.stateRoot,"pi.sh"));
    expect(statSync(launch.command[1]).mode & 0o777).toBe(0o700);
    expect(snapshot(install)).toEqual(beforeInstall); expect(snapshot(project)).toEqual(beforeProject);
  }
});
