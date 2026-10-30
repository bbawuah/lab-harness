import type { AppearanceErrorCode } from "../src/pi/appearance.ts";
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { appendFileSync, chmodSync, closeSync, constants, fstatSync, lstatSync, openSync, readSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync, linkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readAppearanceBytes } from "../src/pi/appearance-read.ts";
import { bindProjectRoot } from "../src/project.ts";
import { AppearanceError, applyAppearance, beginAppearance, loadAppearance, resetAppearance, stageAppearance, type Scope } from "../src/pi/appearance.ts";
const pref={mode:"light",palette:{kind:"preset",name:"standard"},editorPaddingX:2,outputPad:0};
function error(fn:()=>unknown,code:AppearanceErrorCode) {try{fn();throw new Error("expected error");}catch(e){expect(e).toBeInstanceOf(AppearanceError);expect((e as AppearanceError).code).toBe(code);expect((e as Error).message).toBe(code);}}
if(process.env.LAB_APPEARANCE_TEST_HOME!=="1") {
 test("storage fixtures run in synthetic HOME",()=>{const home=mkdtempSync(join(realpathSync(tmpdir()),"appearance-home-"));try{const p=spawnSync(process.execPath,["--no-env-file","--no-install","test",import.meta.path],{env:{...process.env,HOME:home,LAB_APPEARANCE_TEST_HOME:"1"},encoding:"utf8",timeout:30000}); if(p.status!==0) throw new Error(`Synthetic tests failed: ${p.stderr}`);expect(p.stderr).toContain("0 fail");}finally{rmSync(home,{recursive:true,force:true});}});
} else {
function fixture(fn:(o:{stateRoot:string;installRoot:string;project:string})=>void) {const root=mkdtempSync(join(homedir(),"case-")); const stateRoot=join(root,"state"),installRoot=join(root,"install"),project=join(root,"project");for(const p of [stateRoot,installRoot,project])mkdirSync(p,{mode:0o700});try{fn({stateRoot,installRoot,project});}finally{rmSync(root,{recursive:true,force:true});}}
test("persistence, inheritance, cancel, reset and revision conflict",()=>fixture(({stateRoot,installRoot,project})=>{
 const user={kind:"user"} as const, scoped={kind:"project",binding:bindProjectRoot(project)} as const; const load=(scope:Scope)=>loadAppearance({stateRoot,installRoot,scope});const before=load(user), draft=stageAppearance(beginAppearance(before),pref);expect(load(user)).toEqual(before);
 const saved=applyAppearance({stateRoot,installRoot,draft});expect(saved.user?.mode).toBe("light");expect(lstatSync(join(stateRoot,"appearance","preferences.json")).mode&0o777).toBe(0o600);error(()=>applyAppearance({stateRoot,installRoot,draft}),"CONFLICT");
 const projectBefore=load(scoped);expect(projectBefore.project).toBeNull();const projectSaved=applyAppearance({stateRoot,installRoot,draft:stageAppearance(beginAppearance(projectBefore),{...pref,mode:"dark"})});expect(projectSaved.project?.mode).toBe("dark");applyAppearance({stateRoot,installRoot,draft:resetAppearance(beginAppearance(projectSaved))});expect(load(scoped).project).toBeNull();expect(load(user).user?.mode).toBe("light");
 renameSync(project,project+"-old");mkdirSync(project);error(()=>load(scoped),"PROJECT_CHANGED");
}));
test("invalid files, duplicates, permissions, links and contention fail without overwriting",()=>fixture(({stateRoot,installRoot})=>{
 const scope={kind:"user"} as const; const load=()=>loadAppearance({stateRoot,installRoot,scope});applyAppearance({stateRoot,installRoot,draft:stageAppearance(beginAppearance(load()),pref)});const dir=join(stateRoot,"appearance"),file=join(dir,"preferences.json"), lock=join(dir,".lock");
 const saved=load();writeFileSync(lock,"",{mode:0o600});const before=readFileSync(file,"utf8");error(()=>applyAppearance({stateRoot,installRoot,draft:beginAppearance(saved)}),"CONFLICT");expect(readFileSync(file,"utf8")).toBe(before);rmSync(lock);
 writeFileSync(file,'{"version":1,"user":null,"user":null,"projects":{}}');error(load,"INVALID_STORE");rmSync(file);symlinkSync("missing",file);error(load,"PRIVATE_PATH");rmSync(file);writeFileSync(file,"{}",{mode:0o600});linkSync(file,join(dir,"other"));error(load,"PRIVATE_PATH");rmSync(join(dir,"other"));chmodSync(file,0o644);error(load,"PRIVATE_PATH");
}));
test("inherited root FD pins writes after the directory name is replaced",()=>fixture(({stateRoot,installRoot})=>{
 const scope={kind:"user"} as const, base=loadAppearance({stateRoot,installRoot,scope}); const draft=stageAppearance(beginAppearance(base),pref);
 const fd=openSync(stateRoot,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW); const moved=stateRoot+"-moved";
 try {
  renameSync(stateRoot,moved); mkdirSync(stateRoot,{mode:0o700});
  const helper=fileURLToPath(new URL("../src/pi/appearance-store-helper.ts",import.meta.url));
  const child=spawnSync(process.execPath,["--no-env-file","--no-install",helper],{stdio:["pipe","pipe","pipe",fd],input:JSON.stringify({scope,draft}),encoding:"utf8",env:{HOME:homedir(),PATH:"/usr/bin:/bin"},timeout:5000});
  expect(child.status).toBe(0); expect(JSON.parse(child.stdout).ok).toBe(true);
  expect(lstatSync(join(moved,"appearance","preferences.json")).isFile()).toBe(true);
  expect(lstatSync(join(stateRoot,"appearance"),{throwIfNoEntry:false})).toBeUndefined();
 } finally {closeSync(fd);}
}));
test("stale temporary file refuses a commit without touching existing bytes",()=>fixture(({stateRoot,installRoot})=>{
 const scope={kind:"user"} as const;const load=()=>loadAppearance({stateRoot,installRoot,scope});applyAppearance({stateRoot,installRoot,draft:stageAppearance(beginAppearance(load()),pref)});
 const saved=load(),dir=join(stateRoot,"appearance"),file=join(dir,"preferences.json"),before=readFileSync(file,"utf8");writeFileSync(join(dir,".preferences.tmp"),"sentinel",{mode:0o600});
 error(()=>applyAppearance({stateRoot,installRoot,draft:resetAppearance(beginAppearance(saved))}),"CONFLICT");expect(readFileSync(file,"utf8")).toBe(before);expect(readFileSync(join(dir,".preferences.tmp"),"utf8")).toBe("sentinel");
}));

test("loader redirection is refused before spawning the helper",()=>fixture(({stateRoot,installRoot})=>{
 const prior=process.env.DYLD_SYNTHETIC;process.env.DYLD_SYNTHETIC="fixture";
 try {error(()=>loadAppearance({stateRoot,installRoot,scope:{kind:"user"}}),"IO");expect(lstatSync(join(stateRoot,"appearance"),{throwIfNoEntry:false})).toBeUndefined();} finally {if(prior===undefined)delete process.env.DYLD_SYNTHETIC;else process.env.DYLD_SYNTHETIC=prior;}
}));

test("user reset persists inheritance, and corrupt records cannot replace the store",()=>fixture(({stateRoot,installRoot})=>{
 const scope={kind:"user"} as const;const load=()=>loadAppearance({stateRoot,installRoot,scope});const saved=applyAppearance({stateRoot,installRoot,draft:stageAppearance(beginAppearance(load()),pref)});
 applyAppearance({stateRoot,installRoot,draft:resetAppearance(beginAppearance(saved))});expect(load().user).toBeNull();
 const file=join(stateRoot,"appearance","preferences.json"), bad='{"version":1,"user":null,"projects":{},"extra":true}';writeFileSync(file,bad);error(load,"INVALID_STORE");expect(readFileSync(file,"utf8")).toBe(bad);
}));

test("new binding for a replaced project refuses the old saved override",()=>fixture(({stateRoot,installRoot,project})=>{
 const oldScope={kind:"project",binding:bindProjectRoot(project)} as const;
 const saved=applyAppearance({stateRoot,installRoot,draft:stageAppearance(beginAppearance(loadAppearance({stateRoot,installRoot,scope:oldScope})),pref)});
 expect(saved.project?.mode).toBe("light"); renameSync(project,project+"-old"); mkdirSync(project,{mode:0o700});
 const newScope={kind:"project",binding:bindProjectRoot(project)} as const; expect(newScope.binding.inode).not.toBe(oldScope.binding.inode);
 error(()=>loadAppearance({stateRoot,installRoot,scope:newScope}),"PROJECT_CHANGED");
}));
test("bounded fd reader rejects growth after the initial stat",()=>fixture(({stateRoot})=>{
 const file=join(stateRoot,"synthetic");writeFileSync(file,"{}",{mode:0o600});const fd=openSync(file,constants.O_RDONLY);
 try {expect(fstatSync(fd).size).toBe(2);let calls=0;const reader:NonNullable<Parameters<typeof readAppearanceBytes>[1]>=(fileDescriptor,buffer,offset,length,position)=>{calls++; if(calls===1)appendFileSync(file,Buffer.alloc(65536,32));return readSync(fileDescriptor,buffer,offset,length,position);}; error(()=>readAppearanceBytes(fd,reader),"INVALID_STORE");expect(calls).toBe(1);}finally{closeSync(fd);}
}));
test("refuses symlinked installation aliases and state within the resolved installation",()=>fixture(({stateRoot,installRoot})=>{
 const alias=join(stateRoot,"alias");symlinkSync(installRoot,alias);const scope={kind:"user"} as const;
 error(()=>loadAppearance({stateRoot,installRoot:alias,scope}),"PRIVATE_PATH");
 const nested=join(installRoot,"state");mkdirSync(nested,{mode:0o700});const aliasParent=join(stateRoot,"install-alias");symlinkSync(installRoot,aliasParent);
 error(()=>loadAppearance({stateRoot:nested,installRoot:aliasParent,scope}),"PRIVATE_PATH");expect(lstatSync(join(nested,"appearance"),{throwIfNoEntry:false})).toBeUndefined();
}));

test("filesystem root installation contains the synthetic state directory",()=>fixture(({stateRoot})=>{
 const scope={kind:"user"} as const; error(()=>loadAppearance({stateRoot,installRoot:"/",scope}),"PRIVATE_PATH");
 expect(lstatSync(join(stateRoot,"appearance"),{throwIfNoEntry:false})).toBeUndefined();
}));

}
