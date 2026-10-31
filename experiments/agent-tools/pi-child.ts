/** Owned Pi child wrapper: bounded output/time; exit marker for native Herdr cleanup. */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [exitFile,...command]=process.argv.slice(2);
if(!exitFile || !command.length) process.exit(2);
const child=spawn(command[0],command.slice(1),{env:process.env,stdio:['ignore','pipe','ignore']});
writeFileSync(exitFile+'.process.json',JSON.stringify({pid:child.pid,exited:false}),{mode:0o600});
let bytes=0,reason:number|undefined;
const stop=(code:number)=>{reason=code;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),1000).unref();};
// Native JSON stdout is not persisted: guarded synthetic events are the evidence.
child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>256000)stop(79);});
const timer=setTimeout(()=>stop(124),130000);
child.on('error',()=>{clearTimeout(timer);writeFileSync(exitFile,'127\n',{mode:0o600});process.exitCode=127;});
child.on('close',code=>{writeFileSync(exitFile+'.process.json',JSON.stringify({pid:child.pid,exited:true}),{mode:0o600});clearTimeout(timer);const status=reason??code??128;writeFileSync(exitFile,String(status)+'\n',{mode:0o600});process.exitCode=status;});
process.on('SIGTERM',()=>stop(143));process.on('SIGHUP',()=>stop(129));
