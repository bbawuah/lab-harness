import { expect, test } from 'bun:test';
import { browserURL, selectBrowser } from '../src/browser/runtime.ts';
import { project } from '../src/browser/projection.ts';
import { installBrowserExtension } from '../src/pi/browser-extension.ts';
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
