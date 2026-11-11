/** Temporary CI-only upstream launch probe, fixture pages and owned roots only. */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WindowsInterop } from '../src/browser/windows.ts';
import { verifyBrowserRuntime } from '../src/browser/runtime.ts';
const w = new WindowsInterop();
const browser = w.edge();
const server = Bun.serve({ hostname:'127.0.0.1', port:0, fetch(){ return new Response('<!doctype html><h1>fixture</h1>',{headers:{'content-type':'text/html'}}); } });
try {
  for (const normalDesktop of [false,true]) {
    const session='lab-'+randomUUID().replaceAll('-','').slice(0,24);
    const binary=w.prepare(session,verifyBrowserRuntime(),browser,'127.0.0.1');
    const env=w.environment(w.root(session),session);
    if(normalDesktop){const config=join(w.localPath(w.root(session)),'config.json');const c=JSON.parse(readFileSync(config,'utf8'));c.headed=true;c.args+=',--headless=new';writeFileSync(config,JSON.stringify(c));}
    const url=`http://127.0.0.1:${server.port}/`;
    const args=['--json','open',url];
    const start=Date.now();
    try {
      const result=await new Promise(resolve=>{
        const child=spawn(binary,args,{env,stdio:['ignore','pipe','pipe']});
        let stdout='',stderr='';
        const timer=setTimeout(()=>{child.kill('SIGKILL');resolve({timeout:true,exitCode:child.exitCode,stdout,stderr});},45000);
        child.stdout.on('data',c=>{if(stdout.length<65536)stdout+=c;});
        child.stderr.on('data',c=>{if(stderr.length<65536)stderr+=c;});
        child.on('error',()=>{clearTimeout(timer);resolve({spawnError:true});});
        child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
      });
      const root=w.root(session).replaceAll("'", "''");
      const state=w.powershell(`$r='${root}'; $p=Join-Path $r 't'; @{ daemonPidFile=(Test-Path (Join-Path $r 's\\${session}.pid')); daemonPortFile=(Test-Path (Join-Path $r 's\\${session}.port')); devtoolsFiles=@(Get-ChildItem -LiteralPath $p -Filter DevToolsActivePort -Recurse -ErrorAction SilentlyContinue).Count; edgeVersion=(Get-Item -LiteralPath '${browser.replaceAll("'","''")}').VersionInfo.ProductVersion; toolProcesses=@(Get-Process -Name agent-browser -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq (Join-Path $r 'agent-browser.exe')}).Count; edgeProcesses=@(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($p)}).Count } | ConvertTo-Json -Compress`);
      console.log(JSON.stringify({normalDesktop,elapsedMs:Date.now()-start,result,state}));
    } finally { w.cleanup(session); }
  }
} finally { server.stop(true); }
