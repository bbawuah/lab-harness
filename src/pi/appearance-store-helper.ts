/** Isolated helper: all storage names below are fixed relative to a pinned cwd. */
import { dlopen, FFIType } from "bun:ffi";
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, parse } from "node:path";
import { createHash } from "node:crypto";
import { readAppearanceBytes } from "./appearance-read.ts";
import { verifyProjectBinding, type ProjectBinding } from "../project.ts";
import { AppearanceError, normalizePreferences, type AppearanceErrorCode, type Draft, type Preferences, type Scope, type Snapshot } from "./appearance.ts";

type Store={version:1;user:Preferences|null;projects:Record<string,{binding:ProjectBinding;preferences:Preferences}>};
function fail(code:AppearanceErrorCode): never {throw new AppearanceError(code);}
function library(): string {
 if(Object.keys(process.env).some(k=>k.startsWith("DYLD_") || ["LD_LIBRARY_PATH","LD_PRELOAD","LD_AUDIT","LD_ORIGIN_PATH"].includes(k))) fail("IO");
 if(!["x64","arm64"].includes(process.arch)) fail("IO");
 if(process.platform==="darwin") return "/usr/lib/libSystem.B.dylib";
 if(process.platform!=="linux") return fail("IO");
 const arch=process.arch==="x64"?"x86_64":"aarch64";
 for(const candidate of [`/lib/${arch}-linux-gnu/libc.so.6`,"/lib64/libc.so.6","/usr/lib64/libc.so.6"]) {
  let resolved:string; try {resolved=realpathSync(candidate);} catch(e) {if((e as NodeJS.ErrnoException).code==="ENOENT") continue; return fail("IO");}
  if(!["/lib/","/lib64/","/usr/lib/","/usr/lib64/"].some(root=>resolved.startsWith(root))) fail("IO");
  let current=parse(resolved).root; for(const part of resolved.slice(current.length).split("/")) {current=join(current,part); const st=lstatSync(current); if(st.uid!==0 || (st.mode&0o022)!==0 || st.isSymbolicLink()) fail("IO");}
  if(!lstatSync(resolved).isFile()) fail("IO"); return resolved;
 }
 return fail("IO");
}
function object(v:unknown,keys:string[]):Record<string,unknown> {if(!v || typeof v!=="object" || Array.isArray(v) || Object.keys(v).sort().join(",")!==keys.sort().join(",")) return fail("INVALID_STORE"); return v as Record<string,unknown>;}
function parseJSON(text:string):unknown {
 if(Buffer.byteLength(text)>65536) return fail("INVALID_STORE");
 try {
  const value=JSON.parse(text); let i=0;
  const ws=()=>{while(i<text.length && /\s/.test(text[i]!)) i++;};
  const string=():string=>{const start=i++; while(i<text.length) {if(text[i]==="\\") {i+=2;continue;} if(text[i++]==='"') return JSON.parse(text.slice(start,i));} throw 0;};
  const scan=(depth:number):void=>{if(depth>16) throw 0; ws(); const ch=text[i]; if(ch==='"') {string();return;} if(ch==='{'||ch==='[') {i++;ws();const seen=new Set<string>();if(text[i]===(ch==='{'?'}':']')) {i++;return;} for(;;) {if(ch==='{') {ws();if(text[i]!=='"') throw 0;const k=string();if(seen.has(k)) throw 0;seen.add(k);ws();if(text[i++]!==':') throw 0;}scan(depth+1);ws();const end=text[i++];if(end===(ch==='{'?'}':']'))return;if(end!==',')throw 0;}}while(i<text.length && !/[\s,}\]]/.test(text[i]!))i++;};
  scan(0);ws();if(i!==text.length)throw 0;return value;
 } catch {return fail("INVALID_STORE");}
}
function hash(s:string):string {return createHash("sha256").update(s).digest("hex");}
function key(b:ProjectBinding):string {return hash(JSON.stringify([b.root,b.device,b.inode]));}
function verify(scope:Scope):void {if(scope?.kind==="user" && Object.keys(scope).join(",")==="kind")return; if(scope?.kind!=="project" || Object.keys(scope).sort().join(",")!=="binding,kind")fail("INVALID_INPUT");try{verifyProjectBinding(scope.binding);}catch{fail("PROJECT_CHANGED");}}
function privateFile(name:string): boolean {
 const s=lstatSync(name,{throwIfNoEntry:false}); if(!s)return false;
 if(!s.isFile() || s.isSymbolicLink() || s.uid!==process.getuid?.() || s.nlink!==1 || (s.mode&0o077)!==0 || s.size>65536)fail("PRIVATE_PATH");return true;
}
function read():{store:Store;revision:string} {
 if(!privateFile("preferences.json"))return {store:{version:1,user:null,projects:{}},revision:"absent"};
 const fd=openSync("preferences.json",constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 let text:string; try {const s=fstatSync(fd);if(!s.isFile() || s.uid!==process.getuid?.() || s.nlink!==1 || (s.mode&0o077)!==0 || s.size>65536)fail("PRIVATE_PATH");text=readAppearanceBytes(fd).toString("utf8");}finally{closeSync(fd);}
 const v=object(parseJSON(text),["version","user","projects"]); if(v.version!==1 || !v.projects || typeof v.projects!=="object" || Array.isArray(v.projects)) fail("INVALID_STORE");
 const projects:Store["projects"]={};
 try {for(const [k,value] of Object.entries(v.projects as Record<string,unknown>)) {const entry=object(value,["binding","preferences"]), b=object(entry.binding,["root","device","inode"]); if(typeof b.root!=="string" || !b.root.startsWith("/") || !Number.isSafeInteger(b.device) || !Number.isSafeInteger(b.inode))fail("INVALID_STORE"); const bind=b as ProjectBinding; if(k!==key(bind))fail("INVALID_STORE"); projects[k]={binding:bind,preferences:normalizePreferences(entry.preferences)};} return {store:{version:1,user:v.user===null?null:normalizePreferences(v.user),projects},revision:hash(text)};}
 catch(e){if(e instanceof AppearanceError && e.code==="INVALID_STORE")throw e;return fail("INVALID_STORE");}
}
function view(store:Store,revision:string,scope:Scope):Snapshot {let project:Preferences|null=null;if(scope.kind==="project") {for(const entry of Object.values(store.projects)) {if(entry.binding.root===scope.binding.root && (entry.binding.device!==scope.binding.device || entry.binding.inode!==scope.binding.inode)) fail("PROJECT_CHANGED");} const p=store.projects[key(scope.binding)];if(p) {if(p.binding.root!==scope.binding.root || p.binding.device!==scope.binding.device || p.binding.inode!==scope.binding.inode)fail("PROJECT_CHANGED"); project=p.preferences;}}return {revision,user:store.user,project,scope};}
function run():Snapshot {
 let input=Buffer.alloc(65537), total=0; for(;;){const n=readSync(0,input,total,input.length-total,null);if(!n)break; total+=n;if(total===input.length)fail("INVALID_INPUT");} const parsed=parseJSON(input.subarray(0,total).toString("utf8")); const payload=object(parsed,["scope",...(parsed && typeof parsed==="object" && Object.hasOwn(parsed,"draft")?["draft"]:[])]); const scope=payload.scope as Scope; verify(scope); const draft=payload.draft as Draft|undefined; if(draft) { try { object(draft,["base","value"]); } catch { fail("INVALID_INPUT"); } }
 const lib=dlopen(library(),{fchdir:{args:[FFIType.i32],returns:FFIType.i32}}); const cd=(fd:number)=>{if(lib.symbols.fchdir(fd)!==0)fail("IO");}; cd(3);
 let st=lstatSync("appearance",{throwIfNoEntry:false}); if(!st && !draft)return view({version:1,user:null,projects:{}},"absent",scope); if(!st) {mkdirSync("appearance",{mode:0o700}); st=lstatSync("appearance");}
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid?.()||(st.mode&0o077)!==0)fail("PRIVATE_PATH");
 const dir=openSync("appearance",constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW); try {
  const actual=fstatSync(dir);if(!actual.isDirectory()||actual.uid!==process.getuid?.()||(actual.mode&0o077)!==0||actual.dev!==st.dev||actual.ino!==st.ino)fail("PRIVATE_PATH");cd(dir);
  if(!draft){const current=read();verify(scope);return view(current.store,current.revision,scope);}
  let lock:number; try {lock=openSync(".lock",constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch(e){if((e as NodeJS.ErrnoException).code==="EEXIST")fail("CONFLICT");throw e;}
  const lockStat=fstatSync(lock); let temp=false;
  try {
   const current=read(), expected=view(current.store,current.revision,scope); if(JSON.stringify(expected)!==JSON.stringify(draft.base))fail("CONFLICT");
   const value=draft.value===null?null:normalizePreferences(draft.value);verify(scope);
   if(scope.kind==="user")current.store.user=value;else if(value===null)delete current.store.projects[key(scope.binding)];else current.store.projects[key(scope.binding)]={binding:scope.binding,preferences:value};
   const content=JSON.stringify(current.store)+"\n";if(Buffer.byteLength(content)>65536)fail("INVALID_STORE");
   let out:number;try{out=openSync(".preferences.tmp",constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch(e){if((e as NodeJS.ErrnoException).code==="EEXIST")fail("CONFLICT");throw e;} temp=true;
   try {writeFileSync(out,content);fsyncSync(out);}finally{closeSync(out);}
   verify(scope);if(read().revision!==current.revision)fail("CONFLICT");renameSync(".preferences.tmp","preferences.json");temp=false;fsyncSync(dir);return view(current.store,hash(content),scope);
  } finally {if(temp)try{unlinkSync(".preferences.tmp");}catch{}closeSync(lock);const now=lstatSync(".lock",{throwIfNoEntry:false});if(now && now.dev===lockStat.dev && now.ino===lockStat.ino)unlinkSync(".lock");}
 }finally{closeSync(dir);lib.close();}
}
try {const snapshot=run();process.stdout.write(JSON.stringify({ok:true,snapshot}));}catch(e){const code=e instanceof AppearanceError?e.code:"IO";process.stdout.write(JSON.stringify({ok:false,code}));}
