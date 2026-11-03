/** Explicit local native acceptance; synthetic fixture, no model/provider calls. */
import { BrowserFailure, BrowserSession } from '../src/browser/session.ts';
import { chip, classify, recoveryText, statusLines } from '../src/browser/states.ts';
import { indicatorText } from '../src/pi/status-indicator.ts';
import { wrapColumns } from '../src/pi/display.ts';
import { renderBrowserFailure } from '../src/pi/browser-extension.ts';
import { installBrowserExtension } from '../src/pi/browser-extension.ts';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readlinkSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const evidence=resolve('.tmp/browser-smoke-'+randomUUID().slice(0,8));mkdirSync(evidence,{recursive:true,mode:0o700});
let foreignHits=0;
const other=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){foreignHits++;return new Response('Other origin');}});
const fixture=`<!doctype html><title>LAB built-in browser fixture</title><style>body{font:24px system-ui;padding:50px}output{display:block;color:green;margin:20px}</style><h1>Owned browser fixture</h1><label>Name <input id="name"></label><button onclick="document.querySelector('output').textContent='Saved: '+document.querySelector('input').value">Save</button><button onclick="location.href='http://127.0.0.1:${other.port}/'">Other port</button><button onclick="window.open('/second')">New tab</button><button onclick="const t=Date.now();while(Date.now()-t<30000){}">Busy</button><output id="result">Not saved</output>`;
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/redirect'?Response.redirect(`http://127.0.0.1:${other.port}/`):new Response(fixture,{headers:{'content-type':'text/html'}});}});
const sessions:BrowserSession[]=[];const events:any[]=[];
const assert=(c:unknown,m:string)=>{if(!c)throw new Error(m);};
const snap=async(b:BrowserSession)=>await b.execute({operation:'snapshot'}) as any;
const ref=(s:any,name:string)=>'@'+Object.entries(s.result.refs).find(([_,v]:any)=>v.name===name)![0];
async function raw(b:BrowserSession,args:string[]) {return await (b as any).run(args) as string;}
try{
 const url=`http://127.0.0.1:${server.port}/`;const a=await BrowserSession.create(url),b=await BrowserSession.create(url);sessions.push(a,b);
 assert(a.descriptor.session!==b.descriptor.session&&a.descriptor.root!==b.descriptor.root,'independent roots');
 let s=await snap(a);await a.execute({operation:'fill',ref:ref(s,'Name'),text:'Builtin Alpha'});
 try{await a.execute({operation:'click',ref:ref(s,'Save')});throw new Error('stale accepted');}catch(e){assert(String(e).includes('STALE_REF'),'stale refusal');}
 s=await snap(a);await a.execute({operation:'click',ref:ref(s,'Save')});
 const result=JSON.parse(await raw(a,['--json','get','text','#result']));assert(result.data.text==='Saved: Builtin Alpha','independent DOM');
 assert(JSON.parse(await raw(b,['--json','get','text','#result'])).data.text==='Not saved','other session unchanged');
 await raw(a,['--json','screenshot',join(evidence,'browser-native.png')]);events.push({test:'two sessions and DOM',passed:true,result:result.data.text});
 // Native extension handlers, including reload, use production adapter without inference.
 const descriptor=join(evidence,'ref.json');if(existsSync(descriptor))throw new Error('remove previous private smoke directory before rerun');a.save(descriptor);
 process.env.LAB_BROWSER_REF=descriptor;let shutdown:any,tool:any;const commands:any={};
 const api={on(n:string,f:any){if(n==='session_shutdown')shutdown=f;},registerTool(t:any){tool=t;},registerCommand(n:string,c:any){commands[n]=c;},sendMessage(){}};
 installBrowserExtension(api);await shutdown({reason:'reload'});installBrowserExtension(api);
 const reply=await tool.execute('fixture',{operation:'snapshot'});assert(!reply.isError,'reloaded tool');assert(tool.renderCall({operation:'snapshot'}).render(80)[0]==='Browser · snapshot','concise renderer');
 await commands['lab-browser'].handler('close',{ui:{notify(){}}});assert(!existsSync(a.descriptor.root),'close after reload');delete process.env.LAB_BROWSER_REF;events.push({test:'extension reload rebind and close',passed:true});
 try{await b.execute({operation:'navigate',url:`http://127.0.0.1:${other.port}/`});throw new Error('origin accepted');}catch(e){assert(String(e).includes('ORIGIN'),'origin input refused');}
 s=await snap(b);try{await b.execute({operation:'click',ref:ref(s,'Other port')});throw new Error('cross-origin accepted');}catch(e){assert(String(e).includes('ORIGIN'),'post-mutation origin refused');}assert(!existsSync(b.descriptor.root),'origin cleanup');
 for(const kind of ['redirect','popup','cancel']){
  const c=await BrowserSession.create(url);sessions.push(c);
  try{if(kind==='redirect')await c.execute({operation:'navigate',url:url+'redirect'});else if(kind==='popup'){s=await snap(c);await c.execute({operation:'click',ref:ref(s,'New tab')});}else{const ac=new AbortController();ac.abort();await c.execute({operation:'snapshot'},ac.signal);}throw new Error(kind+' accepted');}catch(e){assert(/ORIGIN|NEW_TARGET|CANCELLED/.test(String(e)),kind+' refused');}
  assert(!existsSync(c.descriptor.root),kind+' cleanup');events.push({test:kind,passed:true});
 }
 // UX states (docs/browser-ux-contract.md) from real sessions; rows are LAB renderer output at 40/80/120, not a Pi capture.
 const ux:any[]=[];const rows:string[]=[];
 const record=(name:string,b:BrowserSession,e:unknown)=>{if(!(e instanceof BrowserFailure))throw e;const recovery=recoveryText(e.info,b.descriptor.origin),state=classify(e.info),view=b.view();
  ux.push({scenario:name,state,code:e.info.code,operation:e.info.operation,ref:e.info.ref,phase:e.info.phase,cleanup:e.info.cleanup,recovery,view:view.state,chip:indicatorText(chip(view)),rootRemoved:!existsSync(b.descriptor.root)});
  for(const w of [40,80,120])rows.push(`[${name} · ${w} columns]`,...renderBrowserFailure({details:{error:e.message,operation:e.info.operation,ref:e.info.ref,state,recovery}}).render(w),...statusLines(view).flatMap(l=>wrapColumns(l,w)),'footer: '+indicatorText(chip(view)),'');};
 const expectFail=async(name:string,b:BrowserSession,act:()=>Promise<unknown>)=>{try{await act();}catch(e){record(name,b,e);return;}throw new Error(name+' accepted');};
 {const d=await BrowserSession.create(url);sessions.push(d);rows.push('[active · footer] '+indicatorText(chip(d.view())));
  s=await snap(d);await d.execute({operation:'fill',ref:ref(s,'Name'),text:'Stale Check'});
  await expectFail('stale ref',d,()=>d.execute({operation:'click',ref:ref(s,'Save')}));assert(d.view().state==='active','stale keeps browser active');
  await expectFail('unknown ref',d,()=>d.execute({operation:'read',ref:'@e999'}));
  await expectFail('cross-origin input',d,()=>d.execute({operation:'navigate',url:`http://127.0.0.1:${other.port}/`}));assert(d.view().state==='active','refusal keeps browser active');
  const after=await snap(d) as any;assert(after.verifies===true,'snapshot after change verifies');ux.push({scenario:'read back after change',verifies:after.verifies,view:d.view().state});
  for(const w of [40,80,120])rows.push(`[status · ${w} columns]`,...statusLines(d.view()).flatMap(l=>wrapColumns(l,w)),'');
  await expectFail('breach (post-click other port)',d,()=>d.execute({operation:'click',ref:ref(after,'Other port')}));}
 {const d=await BrowserSession.create(url);sessions.push(d);const pid=Number(readFileSync(join(d.descriptor.root,'s',d.descriptor.session+'.pid'),'utf8'));assert(Number.isInteger(pid)&&pid>1,'owned daemon pid');
  process.kill(pid,'SIGKILL'); // our own daemon, by its recorded pid
  await new Promise(r=>setTimeout(r,300));
  const tdir=join(d.descriptor.root,'t');const chromePid=Number(/-(\d+)$/.exec(readlinkSync(join(tdir,readdirSync(tdir).find(n=>n.startsWith('agent-browser-chrome-'))!,'SingletonLock')))?.[1]);
  const isLive=(p:number)=>{try{process.kill(p,0);return true;}catch{return false;}};const orphanBefore=isLive(chromePid);
  await expectFail('daemon exit (lost)',d,()=>d.execute({operation:'snapshot'}));Object.assign(ux.at(-1),{orphanBrowserAliveBefore:orphanBefore,orphanBrowserAliveAfter:isLive(chromePid)});assert(!isLive(chromePid),'orphan browser stopped');}
 {const d=await BrowserSession.create(url);sessions.push(d);s=await snap(d);const started=Date.now();
  await expectFail('busy page click (timeout)',d,()=>d.execute({operation:'click',ref:ref(s,'Busy')}));ux.at(-1).elapsedMs=Date.now()-started;}
 writeFileSync(join(evidence,'ux-rows.txt'),rows.join('\n').replaceAll(String(server.port),'<FIXTURE_PORT>').replaceAll(String(other.port),'<OTHER_PORT>')+'\n');
 events.push({test:'ux states',passed:true,states:ux.map(u=>u.state??u.scenario)});
 events.push({test:'network boundary limitation',foreignHits,note:'Detection after mutation cannot undo site requests; not a network sandbox.'});
 writeFileSync(join(evidence,'result.json'),JSON.stringify({kind:'actual native browser plus extension-handler acceptance; no model calls',version:'0.41.0',events,ux:JSON.parse(JSON.stringify(ux).replaceAll(String(server.port),'<FIXTURE_PORT>').replaceAll(String(other.port),'<OTHER_PORT>')),screenshotSHA256:createHash('sha256').update(readFileSync(join(evidence,'browser-native.png'))).digest('hex')},null,2)+'\n');console.log(JSON.stringify({passed:true,evidence:evidence.replace(process.cwd(),'<WORKTREE>')+'/result.json'}));
}finally{delete process.env.LAB_BROWSER_REF;for(const b of sessions)await b.close().catch(e=>console.error('cleanup retained: '+String(e)));server.stop(true);other.stop(true);}
