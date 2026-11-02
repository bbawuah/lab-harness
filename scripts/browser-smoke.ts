/** Explicit local native acceptance; synthetic fixture, no model/provider calls. */
import { BrowserSession } from '../src/browser/session.ts';
import { installBrowserExtension } from '../src/pi/browser-extension.ts';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const evidence=resolve('.tmp/browser-smoke-'+randomUUID().slice(0,8));mkdirSync(evidence,{recursive:true,mode:0o700});
let foreignHits=0;
const other=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){foreignHits++;return new Response('Other origin');}});
const fixture=`<!doctype html><title>LAB built-in browser fixture</title><style>body{font:24px system-ui;padding:50px}output{display:block;color:green;margin:20px}</style><h1>Owned browser fixture</h1><label>Name <input id="name"></label><button onclick="document.querySelector('output').textContent='Saved: '+document.querySelector('input').value">Save</button><button onclick="location.href='http://127.0.0.1:${other.port}/'">Other port</button><button onclick="window.open('/second')">New tab</button><output id="result">Not saved</output>`;
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
 events.push({test:'network boundary limitation',foreignHits,note:'Detection after mutation cannot undo site requests; not a network sandbox.'});
 writeFileSync(join(evidence,'result.json'),JSON.stringify({kind:'actual native browser plus extension-handler acceptance; no model calls',version:'0.41.0',events,screenshotSHA256:createHash('sha256').update(readFileSync(join(evidence,'browser-native.png'))).digest('hex')},null,2)+'\n');console.log(JSON.stringify({passed:true,evidence:evidence.replace(process.cwd(),'<WORKTREE>')+'/result.json'}));
}finally{delete process.env.LAB_BROWSER_REF;for(const b of sessions)await b.close();server.stop(true);other.stop(true);}
