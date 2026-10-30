import { constants, closeSync, fstatSync, lstatSync, openSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { verifyProjectBinding } from "../project.ts";
import { AppearanceError, type AppearanceErrorCode, type Draft, type Scope, type Snapshot } from "./appearance.ts";

const codes: AppearanceErrorCode[] = ["INVALID_INPUT","INVALID_COLOR","BAD_CONTRAST","INVALID_STORE","PRIVATE_PATH","PROJECT_CHANGED","CONFLICT","IO"];
function fail(code:AppearanceErrorCode): never { throw new AppearanceError(code); }
function binding(scope: Scope): void {
 if (!scope || typeof scope !== "object") fail("INVALID_INPUT");
 if (scope.kind === "user" && Object.keys(scope).join(",") === "kind") return;
 if (scope.kind !== "project" || Object.keys(scope).sort().join(",") !== "binding,kind") fail("INVALID_INPUT");
 try {verifyProjectBinding(scope.binding);} catch {fail("PROJECT_CHANGED");}
}
function run(options:{stateRoot:string;installRoot:string;scope:Scope;draft?:Draft}):Snapshot {
 try {
  if (Object.keys(process.env).some(k=>k.startsWith("DYLD_") || ["LD_LIBRARY_PATH","LD_PRELOAD","LD_AUDIT","LD_ORIGIN_PATH"].includes(k))) fail("IO");
  binding(options.scope);
  const home=resolve(homedir()), state=options.stateRoot, install=options.installRoot;
  const inside=(p:string,root:string)=>{const rel=relative(root,p); return rel==="" || (rel!==".." && !rel.startsWith(".."+sep) && !isAbsolute(rel));};
  if(typeof state!=="string" || typeof install!=="string" || !isAbsolute(state) || resolve(state)!==state || !isAbsolute(install) || resolve(install)!==install || state.includes("\0") || install.includes("\0") || !inside(state,home) || state===home || inside(state,install) || (options.scope.kind==="project" && inside(state,options.scope.binding.root))) fail("PRIVATE_PATH");
  // Installation must itself be canonical: a symlink alias must not hide containment.
  let installCursor=install; for(;;) {const entry=lstatSync(installCursor); if(!entry.isDirectory() || entry.isSymbolicLink()) fail("PRIVATE_PATH"); if(dirname(installCursor)===installCursor) break; installCursor=dirname(installCursor);}
  const realInstall=realpathSync(install); const realState=realpathSync(state);
  if(realInstall!==install || realState!==state || inside(realState,realInstall)) fail("PRIVATE_PATH");
  let cursor=state; for(;;) { const st=lstatSync(cursor); if(!st.isDirectory() || st.isSymbolicLink() || (inside(cursor,home) && (st.uid!==process.getuid?.() || (cursor!==home && (st.mode&0o022)!==0)))) fail("PRIVATE_PATH"); if(dirname(cursor)===cursor) break; cursor=dirname(cursor); }
  const before=lstatSync(state); if((before.mode&0o077)!==0) fail("PRIVATE_PATH");
  const fd=openSync(state,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  try {
   const st=fstatSync(fd); if(!st.isDirectory() || st.uid!==process.getuid?.() || (st.mode&0o077)!==0 || st.dev!==before.dev || st.ino!==before.ino) fail("PRIVATE_PATH");
   const input=JSON.stringify({scope:options.scope,...(options.draft ? {draft:options.draft} : {})}); if(Buffer.byteLength(input)>65536) fail("INVALID_INPUT");
   if(!process.versions.bun) fail("IO");
   const helper=fileURLToPath(new URL("./appearance-store-helper.ts",import.meta.url));
   const result=spawnSync(process.execPath,["--no-env-file","--no-install",helper],{input,stdio:["pipe","pipe","pipe",fd],env:{PATH:"/usr/bin:/bin",HOME:home},encoding:"utf8",timeout:5000,maxBuffer:131072});
   if(result.error || result.status!==0 || result.signal) fail("IO");
   let response:unknown; try {response=JSON.parse(result.stdout);} catch {return fail("IO");}
   const v=response as {ok?:boolean;code?:AppearanceErrorCode;snapshot?:Snapshot};
   if(v?.ok===false && codes.includes(v.code!)) fail(v.code!); if(v?.ok!==true || !v.snapshot) fail("IO");
   return v.snapshot;
  } finally {closeSync(fd);}
 } catch(e) {if(e instanceof AppearanceError) throw e; return fail("IO");}
}
export function loadAppearance(options:{stateRoot:string;installRoot:string;scope:Scope}): Snapshot { return run(options); }
export function applyAppearance(options:{stateRoot:string;installRoot:string;draft:Draft}): Snapshot { if(!options.draft?.base) return fail("INVALID_INPUT"); return run({...options,scope:options.draft.base.scope}); }
