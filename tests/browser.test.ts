import { expect, test } from 'bun:test';
import { browserURL, selectBrowser } from '../src/browser/runtime.ts';
import { project } from '../src/browser/projection.ts';
import { installBrowserExtension, wrapColumns } from '../src/pi/browser-extension.ts';
import { BrowserSession } from '../src/browser/session.ts';
import { guardBrowserLifecycle } from '../src/browser/lifecycle.ts';
import { mkdirSync, mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// Independent oracle: Bun's terminal width, not the production table.
const cols=(row:string)=>Bun.stringWidth(row);
// Builds a session object without the pinned binary; only private transport is faked.
function fakeSession(run:(args:string[])=>Promise<string>) {
 const root=mkdtempSync(join(tmpdir(),'lab-browser-test-'));for(const n of ['s','t'])mkdirSync(join(root,n),{mode:0o700});
 const s:any=Object.create(BrowserSession.prototype);Object.assign(s,{descriptor:{root,session:'lab-'+'a'.repeat(24),origin:'http://example.test',launchHash:'h'},queue:Promise.resolve(),refs:new Set(),closed:false,binary:'/nonexistent'});
 s.run=run;return {s,root};
}
function response(data:any,content?:string) {const r={_boundary:{nonce:'a'.repeat(32),origin:'http://example.test/'},data:{...data,lifecycle:{reused:true}},error:null,success:true};return JSON.stringify({_meta:{agentBrowserVersion:'0.41.0'},content:[{type:'text',text:content??JSON.stringify(r)}],isError:false,structuredContent:{exitCode:0,response:r,stdout:JSON.stringify(r),stderr:''}});}
test('origin validation excludes credentials, protocols and other ports/schemes',()=>{
 expect(browserURL('https://example.test/a','https://example.test').pathname).toBe('/a');
 for(const u of ['file:///tmp/a','https://user:pass@example.test/','http://example.test','https://example.test:444','https://other.test'])expect(()=>browserURL(u,'https://example.test')).toThrow();
 expect(()=>selectBrowser('/nonexistent/approved-browser')).toThrow('LAB_BROWSER_EXECUTABLE');
});
test('semantic projection preserves refs/boundary and rejects unknown/malformed/duplicated errors',()=>{
 const data={origin:'http://example.test/',refs:{e1:{name:'Name',role:'textbox'}},removedRefs:[],snapshot:'- textbox Name [ref=e1]'};
 const raw=response(data,data.snapshot);const p=project(raw,'snapshot');expect(p.result.result).toEqual(data);expect(p.result.pageContent).toContain('UNTRUSTED');
 for(const mutate of [(o:any)=>o.isError=true,(o:any)=>o._meta.agentBrowserVersion='latest',(o:any)=>o.structuredContent.exitCode=1,(o:any)=>o.structuredContent.stdout='{}',(o:any)=>o.content[0].text+='[truncated:'] ){const o=JSON.parse(raw);mutate(o);expect(()=>project(JSON.stringify(o),'snapshot')).toThrow();}
 expect(()=>project(response({...data,refs:{}},data.snapshot),'snapshot')).toThrow();
 expect(()=>project(response({...data,extra:1},data.snapshot),'snapshot')).toThrow();
 expect(()=>project(response({text:'x'.repeat(13000),origin:data.origin},'x'.repeat(13000)),'read')).toThrow('LIMIT');
});
test('inactive browser has actionable command and no model tool',async()=>{
 const saved=process.env.LAB_BROWSER_REF;delete process.env.LAB_BROWSER_REF;let command:any;const tools:any[]=[];
 try{installBrowserExtension({on(){},registerCommand(_n,c){command=c;},registerTool(t){tools.push(t);},sendMessage(){}});expect(tools).toHaveLength(0);let message='';await command.handler('status',{ui:{notify(m:string){message=m;}}});expect(message).toContain('--browser URL');}finally{if(saved)process.env.LAB_BROWSER_REF=saved;}
});

test('failed action with failed cleanup disables further actions, survives rebind, and allows cleanup retry only',async()=>{
 let closeWorks=false;const calls:string[][]=[];
 const {s,root}=fakeSession(async args=>{calls.push(args);if(args[1]==='close'){if(!closeWorks)throw new Error('LAB_BROWSER_TIMEOUT');return JSON.stringify({success:true});}throw new Error('LAB_BROWSER_TIMEOUT');});
 try{
  await expect(s.execute({operation:'snapshot'})).rejects.toThrow('LAB_BROWSER_TIMEOUT');
  const before=calls.length;
  await expect(s.execute({operation:'snapshot'})).rejects.toThrow('LAB_BROWSER_FAILED');
  expect(calls.length).toBe(before); // refused before any browser command
  expect(s.status()).toContain('actions disabled');
  const {s:rebound,root:unused}=fakeSession(async()=>{throw new Error('unexpected');});rmSync(unused,{recursive:true});rebound.descriptor=s.descriptor; // same owned root after /reload
  await expect(rebound.execute({operation:'snapshot'})).rejects.toThrow('LAB_BROWSER_FAILED');
  await expect(s.close()).rejects.toThrow();expect(existsSync(root)).toBe(true);
  closeWorks=true;await s.close();expect(existsSync(root)).toBe(false);expect(s.status()).toContain('closed');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('lifecycle guard absorbs startup/cleanup signals, defers to Herdr, and releases listeners',()=>{
 const counts=()=>['SIGINT','SIGTERM','SIGHUP'].map(n=>process.listenerCount(n as any));const base=counts();
 const g=guardBrowserLifecycle();expect(counts()).toEqual(base.map(n=>n+1));
 g.state.phase='herdr';process.emit('SIGINT' as any);expect(g.signal.aborted).toBe(false);expect(g.state.signalled).toBe(0);
 g.state.phase='startup';process.emit('SIGTERM' as any);expect(g.signal.aborted).toBe(true);expect(g.state.signalled).toBe(15);
 g.state.phase='cleanup';process.emit('SIGHUP' as any);expect(g.state.signalled).toBe(15);
 g.release();g.release();expect(counts()).toEqual(base);
});
test('renderer wraps by terminal columns and escapes hostile controls in calls, results and errors',()=>{
 const saved=process.env.LAB_BROWSER_REF;const tools:any[]=[];const root=mkdtempSync(join(tmpdir(),'lab-browser-ref-'));
 const ref=join(root,'ref.json');writeFileSync(ref,JSON.stringify({root,session:'lab-'+'b'.repeat(24),origin:'http://example.test'}),{mode:0o600});process.env.LAB_BROWSER_REF=ref;
 const orig=(BrowserSession as any).rebind;(BrowserSession as any).rebind=()=>({descriptor:{origin:'http://example.test'},element:()=>undefined,status(){return'';},close:async()=>{},execute:async()=>({})});
 try{
  installBrowserExtension({on(){},registerCommand(){},registerTool(t:any){tools.push(t);},sendMessage(){}} as any);const tool=tools[0];
  const hostile='\"✅⭐⌚🀄🇳🇱1️⃣❤️👨‍👩‍👧'+'界'.repeat(7)+'\u202e\u2066x\u001b[31m\u0007e\u0301👍🏽\ud800';
  for(const width of [1,2,3,8,13,40]){
   const rows=[...tool.renderCall({operation:hostile}).render(width),...tool.renderResult({details:{text:hostile}},{expanded:true}).render(width),...tool.renderResult({content:[{type:'text',text:hostile}],details:{}},{},undefined,{isError:true}).render(width)];
   for(const row of rows){expect(cols(row)).toBeLessThanOrEqual(width);expect(Bun.stringWidth(row)).toBeLessThanOrEqual(width);expect(row).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/);}
  }
  expect(wrapColumns('a\u001bb',10)).toEqual(['a\\u{1b}b']); // escape kept whole on one row
  expect(wrapColumns('✅'.repeat(10),10)).toEqual(['✅'.repeat(5),'✅'.repeat(5)]); // emoji presentation = 2 columns
  const err=tool.renderResult({content:[{type:'text',text:'Validation failed: operation'}],details:{}},{expanded:true},undefined,{isError:true}).render(80).join('');
  expect(err).toContain('Browser refused');expect(err).toContain('Validation failed');expect(err).not.toContain('completed');
  expect(tool.renderResult({details:{verifiedOrigin:'x'}},{}).render(80).join('')).toContain('completed');
 }finally{(BrowserSession as any).rebind=orig;if(saved)process.env.LAB_BROWSER_REF=saved;else delete process.env.LAB_BROWSER_REF;rmSync(root,{recursive:true,force:true});}
});
