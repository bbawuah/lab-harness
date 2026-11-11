/** Temporary CI-only upstream launch probe, fixture pages and owned roots only. */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { WindowsInterop } from '../src/browser/windows.ts';
import { verifyBrowserRuntime } from '../src/browser/runtime.ts';
const w = new WindowsInterop();
const browser = w.edge();
const server = Bun.serve({ hostname:'127.0.0.1', port:0, fetch(){ return new Response('<!doctype html><h1>fixture</h1>',{headers:{'content-type':'text/html'}}); } });
try {
  for (const mcp of [false,true]) for (const inherited of [false,true]) {
    const session='lab-'+randomUUID().replaceAll('-','').slice(0,24);
    const binary=w.prepare(session,verifyBrowserRuntime(),browser,'127.0.0.1');
    const env=w.environment(w.root(session),session);
    const url=`http://127.0.0.1:${server.port}/`;
    const args=mcp?['mcp','call','agent_browser_open',JSON.stringify({url})]:['--json','open',url];
    const start=Date.now();
    try {
      const result=await new Promise(resolve=>{
        const child=spawn(binary,args,{env:inherited?{...process.env,...env}:env,stdio:['ignore','pipe','pipe']});
        let stdout='',stderr='';
        const timer=setTimeout(()=>{child.kill('SIGKILL');resolve({timeout:true});},20000);
        child.stdout.on('data',c=>{if(stdout.length<65536)stdout+=c;});
        child.stderr.on('data',c=>{if(stderr.length<65536)stderr+=c;});
        child.on('error',()=>{clearTimeout(timer);resolve({spawnError:true});});
        child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
      });
      console.log(JSON.stringify({mcp,inherited,elapsedMs:Date.now()-start,result}));
    } finally { w.cleanup(session); }
  }
} finally { server.stop(true); }
