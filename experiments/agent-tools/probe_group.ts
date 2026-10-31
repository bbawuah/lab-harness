/** Actual owned POSIX process-group failure probe; no browser, model or user app. */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { stopOwnedGroup } from './process-group.ts';
const helperCode='setInterval(()=>{},1000)';
const code=`const p=Bun.spawn([process.execPath,'-e',${JSON.stringify(helperCode)}],{stdout:'ignore',stderr:'ignore',env:{PATH:'/usr/bin:/bin'}});console.log(JSON.stringify({helper:p.pid}));setInterval(()=>{},1000);`;
const child=spawn(process.execPath,['--no-env-file','--no-install','-e',code],{detached:true,env:{PATH:'/usr/bin:/bin'},stdio:['ignore','pipe','ignore']});
let helper:number|undefined;
try{
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('HELPER_START_TIMEOUT')),5000);child.stdout.on('data',chunk=>{try{helper=JSON.parse(chunk.toString()).helper;clearTimeout(timer);resolve();}catch{}});child.on('error',reject);});
 // Failure path while the helper is in-flight: stop the owned group, not only its leader.
 await stopOwnedGroup(child.pid!);
 for(const pid of [child.pid!,helper!])try{process.kill(pid,0);throw new Error('OWNED_PROCESS_REMAINS');}catch(error:any){if(error.code!=='ESRCH')throw error;}
 writeFileSync(new URL('../../.tmp/agent-tools/group-probe.json',import.meta.url),JSON.stringify({kind:'actual-owned-process-group-failure-probe',leader:child.pid,helper,groupStopped:true,leaderStopped:true,helperStopped:true,modelCalls:0},null,2)+'\n',{mode:0o600});
 console.log('Actual owned group and in-flight helper stopped; model calls: 0');
}finally{await stopOwnedGroup(child.pid!);}
