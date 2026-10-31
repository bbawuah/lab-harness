/** Owned Pi child wrapper: bounded output/time; exit marker for native Herdr cleanup. */
import { spawn } from 'node:child_process';
import { stopOwnedGroup } from './process-group.ts';
import { writeFileSync } from 'node:fs';
const [exitFile,...command]=process.argv.slice(2);
if(!exitFile || !command.length) process.exit(2);
const child=spawn(command[0],command.slice(1),{env:process.env,detached:true,stdio:['ignore','pipe','ignore']});
let groupCleanup:Promise<void>|undefined;
const cleanupGroup=()=>groupCleanup??=stopOwnedGroup(child.pid!);
try{writeFileSync(exitFile+'.process.json',JSON.stringify({pid:child.pid,exited:false}),{mode:0o600});}catch{try{await cleanupGroup();}finally{process.exit(79);}}
let bytes=0,reason:number|undefined;
const stop=(code:number)=>{reason=code;void cleanupGroup().catch(()=>{reason=79;});};
// Native JSON stdout is not persisted: guarded synthetic events are the evidence.
child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>256000)stop(79);});
const timer=setTimeout(()=>stop(124),130000);
child.on('error',()=>{clearTimeout(timer);writeFileSync(exitFile,'127\n',{mode:0o600});process.exitCode=127;});
child.on('close',async code=>{
 clearTimeout(timer);let groupStopped=false;
 try{await cleanupGroup();groupStopped=true;}catch{reason=79;}
 writeFileSync(exitFile+'.process.json',JSON.stringify({pid:child.pid,processGroup:child.pid,exited:true,groupStopped}),{mode:0o600});
 const status=reason??code??128;writeFileSync(exitFile,String(status)+'\n',{mode:0o600});process.exitCode=status;
});
process.on('SIGTERM',()=>stop(143));process.on('SIGHUP',()=>stop(129));
