/** Explicit operator-driven native TUI fixture. Local protocol responses, no model inference. */
import { Database } from 'bun:sqlite';
import { request } from '../src/herdr/protocol.ts';
import { BrowserSession } from '../src/browser/session.ts';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { privateDirectory } from '../src/pi/workspace-config.ts';
const base=join(homedir(),'.local/share/lab-harness/experiments');privateDirectory(base);
const state=mkdtempSync(join(base,'builtin-browser-'));const project=join(state,'fixture-project');mkdirSync(project,{mode:0o700});
// Selected project must not contain app-state: use a separate owned project under .tmp.
const fixtureProject=mkdtempSync(join(tmpdir(),'lab-browser-project-'));
const evidence=mkdtempSync(resolve('.tmp/browser-native-'));
let requests=0;const events:any[]=[];
const html=`<!doctype html><title>LAB native browser fixture</title><h1>Normal LAB fixture</h1><label>Name <input></label><button onclick="document.querySelector('output').textContent='Saved: '+document.querySelector('input').value">Save</button><output>Not saved</output>`;
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){
 if(req.method==='GET')return new Response(html,{headers:{'content-type':'text/html'}});
 const body=await req.json() as any;requests++;if(requests>8)return new Response('fixture cap',{status:429});
 const messages=body.messages??[];const results=messages.filter((m:any)=>m.role==='tool').map((m:any)=>{try{return JSON.parse(m.content)}catch{return null}}).filter(Boolean);
 const lastSnapshot=[...results].reverse().find((r:any)=>r.result?.refs);const refs=lastSnapshot?.result.refs??{};
 const nameRef='@'+Object.keys(refs).find(k=>refs[k].name==='Name');const saveRef='@'+Object.keys(refs).find(k=>refs[k].name==='Save');
 const operations=[{operation:'snapshot'},{operation:'fill',ref:nameRef,text:'Native Fixture'},{operation:'snapshot'},{operation:'click',ref:saveRef},{operation:'snapshot'}];
 const step=results.length;const args=operations[step];events.push({request:requests,toolAvailable:body.tools?.some((t:any)=>t.function?.name==='lab_browser'),operation:args??'final',priorToolError:results.some((r:any)=>typeof r==='string')});
 const delta=args?{role:'assistant',tool_calls:[{index:0,id:'fixture_'+requests,type:'function',function:{name:'lab_browser',arguments:JSON.stringify(args)}}]}:{role:'assistant',content:'Deterministic local protocol fixture completed. This is not a model response.'};
 const chunk=(d:any,reason:any)=>({id:'fixture',object:'chat.completion.chunk',created:1,model:'browser-fixture',choices:[{index:0,delta:d,finish_reason:reason}]});
 return new Response('data: '+JSON.stringify(chunk(delta,null))+'\n\ndata: '+JSON.stringify({...chunk({},args?'tool_calls':'stop'),usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
}});
writeFileSync(join(state,'route.json'),JSON.stringify({version:1,kind:'local',endpoint:`http://127.0.0.1:${server.port}/v1`,model:'browser-fixture'}),{mode:0o600});writeFileSync(join(state,'key'),'',{mode:0o600});
writeFileSync(join(evidence,'private-state-pointer'),state,{mode:0o600});
console.log('Native fixture: enter a short prompt, then /lab-browser status, /reload, /lab-browser status, /exit. No inference.');
const child=spawn(resolve('lab'),['--offline','--single-pane','--project',fixtureProject,'--browser',`http://127.0.0.1:${server.port}/`],{stdio:'inherit',env:{PATH:process.env.PATH,HOME:homedir(),TERM:'xterm-256color',SHELL:'/bin/sh',LAB_WORKSPACE_STATE_ROOT:state}});
const deadline=setTimeout(()=>child.kill('SIGTERM'),120000);
const delay=(n:number)=>new Promise(r=>setTimeout(r,n));
let automationError:string|undefined;
const automate=(async()=>{
 let socket='';let run='';
 for(let n=0;n<100;n++){
  const runs=existsSync(join(state,'runs'))?readdirSync(join(state,'runs')):[];
  if(runs.length){run=join(state,'runs',runs[0]!);const logs=Array.from(new Bun.Glob('cfg/herdr/sessions/*/herdr-server.log').scanSync({cwd:run}));
   if(logs[0])socket=/api server listening path=(\S+)/.exec(readFileSync(join(run,logs[0]),'utf8'))?.[1]??'';
  }
  if(socket)break;await delay(100);
 }
 if(!socket)throw new Error('owned socket not found');
 const pane='w1:p2';
 const read=async()=>{const r=await request(socket,'pane.read',{pane_id:pane,source:'visible',lines:100,format:'text',strip_ansi:true});return JSON.stringify(r);};
 const wait=async(text:string)=>{for(let n=0;n<100;n++){const r=await read().catch(()=> '');if(r.includes(text))return r;await delay(100);}throw new Error('native output missing: '+text);};
 const send=async(text:string)=>{await request(socket,'pane.send_text',{pane_id:pane,text});await request(socket,'pane.send_keys',{pane_id:pane,keys:['enter']});};
 await wait('Relay ready');await send('fixture run');await wait('not a model');
 const desc=JSON.parse(readFileSync(join(run,'browser-ref.json'),'utf8'));const b=new BrowserSession(desc);
 const observed=JSON.parse(await (b as any).run(['--json','get','text','output']));
 if(observed.data.text!=='Saved: Native Fixture')throw new Error('native independent DOM mismatch');
 await (b as any).run(['--json','screenshot',join(evidence,'browser-native.png')]);
 writeFileSync(join(evidence,'tui-tools.txt'),(await read()).replaceAll(fixtureProject,'<OWNED_PROJECT>'));
 await send('/reload');await wait('Reloaded keybindings');await send('/lab-browser status');await wait('Owned browser');
 writeFileSync(join(evidence,'tui-reload.txt'),(await read()).replaceAll(fixtureProject,'<OWNED_PROJECT>'));
 const after=JSON.parse(await (b as any).run(['--json','get','text','output']));if(after.data.text!==observed.data.text)throw new Error('reload changed browser');
 await send('/exit');
})().catch(e=>{automationError=String(e);child.kill('SIGTERM');});
try{const code=await new Promise<number>((done,reject)=>{child.on('error',reject);child.on('exit',c=>done(c??1));});
 await automate;
 const runs=readdirSync(join(state,'runs'));const run=join(state,'runs',runs[0]!);const attachment=JSON.parse(readFileSync(join(run,'attachment.json'),'utf8'));
 const descriptor=JSON.parse(readFileSync(join(run,'browser-ref.json'),'utf8'));
 const cleanup=attachment.cleanup;const ok=!automationError&&code===0&&requests===6&&events.every(e=>e.toolAvailable)&&!existsSync(descriptor.root)&&Object.values(cleanup).every(v=>v===true);
 writeFileSync(join(evidence,'result.json'),JSON.stringify({kind:'normal lab native Pi/Herdr with local deterministic protocol fixture, no inference',ok,code,automationError,requests,events,cleanup,browserRootRemoved:!existsSync(descriptor.root)},null,2)+'\n');
 console.log(JSON.stringify({ok,evidence:evidence.replace(process.cwd(),'<WORKTREE>')}));if(!ok)process.exitCode=1;
 const databases=Array.from(new Bun.Glob('relay/**/control.sqlite').scanSync({cwd:state}));
 for(const f of databases){const db=new Database(join(state,f),{readonly:true});try{const rows=db.query("SELECT phase FROM sessions").all() as any[];if(rows.some(r=>r.phase!=='released'))throw new Error('Relay not released; state retained');}finally{db.close();}}
 if(!existsSync(descriptor.root)&&Object.values(cleanup).every(v=>v===true)){rmSync(state,{recursive:true});rmSync(fixtureProject,{recursive:true});}
}finally{clearTimeout(deadline);server.stop(true);}
