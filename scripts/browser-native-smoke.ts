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
let foreignHits=0;const other=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){foreignHits++;return new Response('Other origin');}});
const html=`<!doctype html><title>LAB native browser fixture</title><h1>Normal LAB fixture</h1><label>Name <input></label><button onclick="document.querySelector('output').textContent='Saved: '+document.querySelector('input').value">Save</button><button onclick="location.href='http://127.0.0.1:${other.port}/'">Other port</button><output>Not saved</output>`;
// Two scripted prompts (no inference): 'fixture run' = snapshot, fill, stale click (refused before dispatch), fresh snapshot, click, read-back snapshot;
// 'fixture leave' (after /reload) = snapshot, click to another port (breach closes the browser).
const scriptFor=(prompt:string,refs:(name:string,first?:boolean)=>string)=>prompt.includes('fixture leave')
 ?[{operation:'snapshot'},{operation:'click',ref:refs('Other port')}]
 :[{operation:'snapshot'},{operation:'fill',ref:refs('Name',true),text:'Native Fixture'},{operation:'click',ref:refs('Save',true)},{operation:'snapshot'},{operation:'click',ref:refs('Save')},{operation:'snapshot'}];
const text=(c:any)=>typeof c==='string'?c:Array.isArray(c)?c.map((p:any)=>p?.text??'').join(''):'';
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){
 if(req.method==='GET')return new Response(html,{headers:{'content-type':'text/html'}});
 const body=await req.json() as any;requests++;if(requests>12)return new Response('fixture cap',{status:429});
 const messages:any[]=body.messages??[];const lastUser=messages.map(m=>m.role).lastIndexOf('user');const prompt=text(messages[lastUser]?.content);
 const tools=messages.slice(lastUser+1).filter(m=>m.role==='tool');const results=tools.map(m=>{try{return JSON.parse(text(m.content))}catch{return text(m.content)}});
 const snapshots=results.filter((r:any)=>r?.result?.refs);
 const refs=(name:string,first=false)=>{const r=(first?snapshots[0]:snapshots.at(-1))?.result.refs??{};return '@'+Object.keys(r).find(k=>r[k].name===name);};
 const operations=scriptFor(prompt,refs);const args=operations[tools.length];
 events.push({request:requests,prompt:prompt.includes('leave')?'fixture leave':'fixture run',toolAvailable:body.tools?.some((t:any)=>t.function?.name==='lab_browser'),operation:args??'final',lastToolError:typeof results.at(-1)==='string'?String(results.at(-1)).split(':')[0]:undefined});
 const delta=args?{role:'assistant',tool_calls:[{index:0,id:'fixture_'+requests,type:'function',function:{name:'lab_browser',arguments:JSON.stringify(args)}}]}:{role:'assistant',content:`Deterministic local protocol fixture completed (${prompt.includes('leave')?'leave':'run'}). This is not a model response.`};
 const chunk=(d:any,reason:any)=>({id:'fixture',object:'chat.completion.chunk',created:1,model:'browser-fixture',choices:[{index:0,delta:d,finish_reason:reason}]});
 return new Response('data: '+JSON.stringify(chunk(delta,null))+'\n\ndata: '+JSON.stringify({...chunk({},args?'tool_calls':'stop'),usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
}});
writeFileSync(join(state,'route.json'),JSON.stringify({version:1,kind:'local',endpoint:`http://127.0.0.1:${server.port}/v1`,model:'browser-fixture'}),{mode:0o600});writeFileSync(join(state,'key'),'',{mode:0o600});
writeFileSync(join(evidence,'private-state-pointer'),state,{mode:0o600});
console.log('Native fixture: scripted prompts and slash commands are sent through Herdr. No inference.');
const child=spawn(resolve('lab'),['--offline','--single-pane','--project',fixtureProject,'--browser',`http://127.0.0.1:${server.port}/`],{stdio:'inherit',env:{PATH:process.env.PATH,HOME:homedir(),TERM:'xterm-256color',SHELL:'/bin/sh',LAB_WORKSPACE_STATE_ROOT:state}});
const deadline=setTimeout(()=>child.kill('SIGTERM'),120000);
const delay=(n:number)=>new Promise(r=>setTimeout(r,n));
let automationError:string|undefined;let approvals=0;
// Footer-only run (LAB_SMOKE_FOOTER=1): launch, capture the combined mode + web footer at the terminal width, exit.
const footerOnly=process.env.LAB_SMOKE_FOOTER==='1',cols=process.stdout.columns??0;
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
 // Default permission mode is ask (#26): answer each browser approval with "Allow once", the operator's normal path.
 const wait=async(text:string)=>{for(let n=0;n<150;n++){const r=await read().catch(()=> '');if(r.includes(text))return r;
   if(r.includes('→ Allow once')){approvals++;await request(socket,'pane.send_keys',{pane_id:pane,keys:['enter']});for(let m=0;m<50&&(await read().catch(()=> '')).includes('→ Allow once');m++)await delay(100);continue;}
   await delay(100);}throw new Error('native output missing: '+text);};
 const W='(?:\\\\n *)?';
 const capture=async(name:string)=>writeFileSync(join(evidence,name),guard((await read()).replaceAll('/private'+fixtureProject,'<OWNED_PROJECT>').replaceAll(fixtureProject,'<OWNED_PROJECT>').replace(/\/(?:private\/)?var\/folders\/[^\s"\\]*/g,'<OWNED_PROJECT>'). /* narrow panes truncate the project path */replace(wrapped(server.port!),'<FIXTURE_PORT>').replace(wrapped(other.port!),'<OTHER_PORT>')
   .replace(new RegExp('(lab-browser-project-)[A-Za-z0-9]+/(?:[0-9a-f-]'+W+')*[0-9a-f]','g'),'$1<ID>/<RELAY_SESSION>').replace(new RegExp('pi-(?:[0-9a-f]'+W+'){63}[0-9a-f]','g'),'<RELAY_PEER>')));
 // Wrapped text: an escaped newline plus indent may split any id or path; fail the run rather than publish a leftover.
 const guard=(t:string)=>{if(/pi-[0-9a-f]{6}|folders\/|\/T\/lab-|lab-browser-project-(?!<ID>)/.test(t))throw new Error('capture sanitization incomplete');return t;};
 // Ports may be split by TUI wrapping: allow an escaped newline plus indent between digits.
 function wrapped(port:number){return new RegExp(String(port).split('').join('(?:\\\\n *)?'),'g');}
 const send=async(text:string)=>{await request(socket,'pane.send_text',{pane_id:pane,text});await request(socket,'pane.send_keys',{pane_id:pane,keys:['enter']});};
 await wait('Relay ready');
 if(footerOnly){await wait('mode: ask');await wait('● web');await capture(`tui-footer-${cols}.txt`);await send('/exit');return;}
 await wait('● web 127.0.0.1');await send('fixture run');await wait('completed (run)');await wait('✓ browser');
 const desc=JSON.parse(readFileSync(join(run,'browser-ref.json'),'utf8'));const b=new BrowserSession(desc);
 const observed=JSON.parse(await (b as any).run(['--json','get','text','output']));
 if(observed.data.text!=='Saved: Native Fixture')throw new Error('native independent DOM mismatch');
 await (b as any).run(['--json','screenshot',join(evidence,'browser-native.png')]);
 await capture('tui-tools.txt');
 await send('/lab-browser status');await wait('private profile');await capture('tui-status.txt');
 await send('/reload');await wait('Reloaded keybindings');await send('/lab-browser status');await wait('5 actions');await wait('● web 127.0.0.1');
 await capture('tui-reload.txt');
 const after=JSON.parse(await (b as any).run(['--json','get','text','output']));if(after.data.text!==observed.data.text)throw new Error('reload changed browser');
 await send('fixture leave');await wait('completed (leave)');await wait('○ web closed · left origin');await wait('✗ browser');
 await send('/lab-browser status');await wait('Start a new run');await capture('tui-breach.txt');
 await send('/exit');
})().catch(e=>{automationError=String(e);child.kill('SIGTERM');});
try{const code=await new Promise<number>((done,reject)=>{child.on('error',reject);child.on('exit',c=>done(c??1));});
 await automate;
 const runs=readdirSync(join(state,'runs'));const run=join(state,'runs',runs[0]!);const attachment=JSON.parse(readFileSync(join(run,'attachment.json'),'utf8'));
 const descriptor=JSON.parse(readFileSync(join(run,'browser-ref.json'),'utf8'));
 const cleanup=attachment.cleanup;const ok=!automationError&&code===0&&(footerOnly?requests===0:requests===10&&approvals===4 /* one per approval-required call in the two scripted prompts */)&&events.every(e=>e.toolAvailable)&&!existsSync(descriptor.root)&&Object.values(cleanup).every(v=>v===true);
 writeFileSync(join(evidence,'result.json'),JSON.stringify({kind:'normal lab native Pi/Herdr with local deterministic protocol fixture, no inference',mode:'ask (default)',footerOnly,cols,ok,code,automationError,requests,approvals,events,foreignHits,cleanup,browserRootRemoved:!existsSync(descriptor.root)},null,2)+'\n');
 console.log(JSON.stringify({ok,evidence:evidence.replace(process.cwd(),'<WORKTREE>')}));if(!ok)process.exitCode=1;
 const databases=Array.from(new Bun.Glob('relay/**/control.sqlite').scanSync({cwd:state}));
 for(const f of databases){const db=new Database(join(state,f),{readonly:true});try{const rows=db.query("SELECT phase FROM sessions").all() as any[];if(rows.some(r=>r.phase!=='released'))throw new Error('Relay not released; state retained');}finally{db.close();}}
 if(!existsSync(descriptor.root)&&Object.values(cleanup).every(v=>v===true)){rmSync(state,{recursive:true});rmSync(fixtureProject,{recursive:true});}
}finally{clearTimeout(deadline);server.stop(true);other.stop(true);}
