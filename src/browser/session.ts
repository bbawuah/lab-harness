import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { browserURL, selectBrowser, verifyBrowserRuntime } from './runtime.ts';
import { envelope, insist, project } from './projection.ts';
export type BrowserInput = { operation: 'snapshot'|'navigate'|'fill'|'click'|'read'; url?: string; ref?: string; text?: string };
export type BrowserDescriptor = { root: string; session: string; origin: string; launchHash?: unknown };
export class BrowserSession {
  readonly binary: string; readonly descriptor: BrowserDescriptor; private queue: Promise<unknown> = Promise.resolve(); private refs = new Map<string,{role:string;name:string}>(); private closed = false; private failedInMemory = false;
  constructor(descriptor: BrowserDescriptor) {
    this.binary=verifyBrowserRuntime(); this.descriptor=descriptor;
    const s=lstatSync(descriptor.root); insist(s.isDirectory() && !s.isSymbolicLink() && s.uid===process.getuid?.() && (s.mode&0o077)===0,'LAB_BROWSER_STATE');
    insist(/^lab-[a-f0-9]{24}$/.test(descriptor.session),'LAB_BROWSER_STATE'); browserURL(descriptor.origin);
  }
  static async create(url: string, executable?: string, signal?: AbortSignal) {
    const u=browserURL(url);verifyBrowserRuntime(); const browser=selectBrowser(executable);
    // Short absolute owned socket root avoids Unix socket path-length limits.
    const root=mkdtempSync(join(tmpdir(),'lab-browser-')); const session='lab-'+randomUUID().replaceAll('-','').slice(0,24);
    for (const n of ['s','t','home','cache']) mkdirSync(join(root,n),{mode:0o700});
    writeFileSync(join(root,'config.json'),JSON.stringify({executablePath:browser,allowedDomains:[u.hostname],contentBoundaries:true,maxOutput:12000,noWebmcp:true,idleTimeout:'15m'}),{mode:0o600});
    const b=new BrowserSession({root,session,origin:u.origin});
    try { const raw=await b.call('agent_browser_open',{url:u.href},signal); const e=envelope(raw); insist(e.data.lifecycle?.effectiveLaunch?.browserLaunched===true,'LAB_BROWSER_NOT_OWNED'); b.descriptor.launchHash=e.data.lifecycle.effectiveLaunch.launchHash; await b.scope(signal); return b; }
    catch(e) { await b.close().catch(()=>{});throw e; }
  }
  static rebind(path: string) { const s=lstatSync(path);insist(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid?.()&&(s.mode&0o077)===0,'LAB_BROWSER_STATE'); return new BrowserSession(JSON.parse(readFileSync(path,'utf8'))); }
  save(path: string) {writeFileSync(path,JSON.stringify(this.descriptor),{flag:'wx',mode:0o600});}
  // A failure marker inside the owned root survives /reload rebinding. Once
  // written, model operations are refused; only cleanup (close) may retry.
  private get failedMarker() {return join(this.descriptor.root,'failed');}
  private failed() {return this.failedInMemory || !!lstatSync(this.failedMarker,{throwIfNoEntry:false});}
  // In-memory flag first so a marker write failure cannot leave this session usable.
  private markFailed() {this.failedInMemory=true;try{writeFileSync(this.failedMarker,'',{mode:0o600});}catch{}}
  status() {if(this.closed || !lstatSync(this.descriptor.root,{throwIfNoEntry:false}))return 'Browser closed. Start a new LAB run with --browser URL.';
    return this.failed() ? 'Browser stopped after a failure; actions disabled. Owned state retained; run /lab-browser close to retry cleanup.' : `Owned browser · ${this.descriptor.origin} · fresh snapshot required before actions.`;}
  private environment() {const r=this.descriptor.root;return {PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:join(r,'home'),TMPDIR:join(r,'t'),XDG_CACHE_HOME:join(r,'cache'),AGENT_BROWSER_SOCKET_DIR:join(r,'s'),AGENT_BROWSER_CONFIG:join(r,'config.json'),AGENT_BROWSER_SESSION:this.descriptor.session,NO_COLOR:'1'};}
  private run(args: string[], signal?: AbortSignal): Promise<string> {
    if(signal?.aborted) return Promise.reject(new Error('LAB_BROWSER_CANCELLED'));
    return new Promise((done,reject)=>{const child=spawn(this.binary,args,{cwd:this.descriptor.root,env:this.environment(),stdio:['ignore','pipe','pipe'],detached:true});let output='',count=0,error:Error|undefined;
      const kill=()=>{try{if(child.pid)process.kill(-child.pid,'SIGKILL');}catch{}};
      const cancel=()=>{error=new Error('LAB_BROWSER_CANCELLED');kill();}; const timer=setTimeout(()=>{error=new Error('LAB_BROWSER_TIMEOUT');kill();},20000);
      signal?.addEventListener('abort',cancel,{once:true});child.on('error',e=>{error=e;});
      child.stdout.on('data',c=>{count+=c.length;if(count>65536){error=new Error('LAB_BROWSER_OUTPUT_LIMIT');kill();}else output+=c.toString();});child.stderr.on('data',c=>{error??=new Error('LAB_BROWSER_DIAGNOSTIC: command emitted diagnostics; action outcome uncertain.');count+=c.length;if(count>65536){error=new Error('LAB_BROWSER_OUTPUT_LIMIT');kill();}});
      child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(error||code!==0)reject(error??new Error('LAB_BROWSER_REFUSED: action failed; no automatic retry.'));else done(output);});
    });
  }
  private call(tool:string,args:object,signal?:AbortSignal) {return this.run(['mcp','call',tool,JSON.stringify(args)],signal);}
  private identity(data:any) {insist(data.lifecycle?.reused===true && data.lifecycle?.launched===false && data.lifecycle?.relaunchedBrowser===false && data.lifecycle?.effectiveLaunch?.launchHash===this.descriptor.launchHash,'LAB_BROWSER_SESSION_LOST');}
  private async scope(signal?:AbortSignal) {
    const e=envelope(await this.call('agent_browser_get_url',{},signal));this.identity(e.data);browserURL(e.data.url,this.descriptor.origin);
    const tabs=envelope(await this.call('agent_browser_tab_list',{},signal));this.identity(tabs.data);
    insist(Array.isArray(tabs.data.tabs)&&tabs.data.tabs.length===1,'LAB_BROWSER_NEW_TARGET');
    browserURL(tabs.data.tabs[0].url,this.descriptor.origin);
  }
  execute(input:BrowserInput,signal?:AbortSignal):Promise<unknown> {
    const task=this.queue.then(async()=>{
      insist(!this.closed && !!lstatSync(this.descriptor.root,{throwIfNoEntry:false}),'LAB_BROWSER_CLOSED');
      insist(!this.failed(),'LAB_BROWSER_FAILED: browser stopped after an earlier failure; actions disabled until a new LAB run.');
      insist(input && typeof input==='object' && Object.keys(input).every(k=>['operation','url','ref','text'].includes(k)),'LAB_BROWSER_INPUT');
      let tool:string,args:object;
      const op=input.operation;
      if(op==='snapshot'){insist(Object.keys(input).length===1);tool='agent_browser_snapshot';args={interactive:true};}
      else if(op==='navigate'){insist(Object.keys(input).length===2&&typeof input.url==='string');tool='agent_browser_open';args={url:browserURL(input.url,this.descriptor.origin).href};}
      else {insist(['fill','click','read'].includes(op)&&typeof input.ref==='string'&&/^@e\d+$/.test(input.ref)&&this.refs.has(input.ref),'LAB_BROWSER_STALE_REF: take a fresh snapshot and use @eN.');
        insist(Object.keys(input).length===(op==='fill'?3:2));tool=op==='read'?'agent_browser_get_text':'agent_browser_'+op;args={selector:input.ref};
        if(op==='fill'){insist(typeof input.text==='string'&&Buffer.byteLength(input.text)<=4000&&!input.text.includes('\0'),'LAB_BROWSER_INPUT');args={...args,text:input.text};}
      }
      try {
        await this.scope(signal);if(op!=='snapshot'&&op!=='read')this.refs.clear();
        const raw=await this.call(tool,args,signal);const {result,lifecycle}=project(raw,op);this.identity({lifecycle});
        await this.scope(signal);if(result.boundary.origin!=='unknown')browserURL(result.boundary.origin,this.descriptor.origin);
        if(op==='snapshot')this.refs=new Map(Object.entries(result.result.refs as Record<string,{role:string;name:string}>).map(([r,v])=>['@'+r,{role:v.role,name:v.name}]));
        return {...result,verifiedOrigin:this.descriptor.origin};
      } catch(e) {this.refs.clear();this.markFailed();await this.closeNow().catch(()=>{});throw e;}
    });this.queue=task.catch(()=>{});return task;
  }
  /** Role/name of a ref from the latest snapshot (display only; page text is untrusted). */
  element(ref:unknown):{role:string;name:string}|undefined {return typeof ref==='string'?this.refs.get(ref):undefined;}
  close():Promise<void>{const task=this.queue.then(()=>this.closeNow());this.queue=task.catch(()=>{});return task;}
  private async closeNow() {
    if(this.closed)return;const r=this.descriptor.root;if(!lstatSync(r,{throwIfNoEntry:false})){this.closed=true;return;}
    this.markFailed();
    const pidfile=join(r,'s',this.descriptor.session+'.pid');let pid:number|undefined;try{pid=Number(readFileSync(pidfile,'utf8'));}catch{}
    const raw=await this.run(['--json','close']); const response=JSON.parse(raw);insist(response.success===true,'LAB_BROWSER_CLEANUP_FAILED');
    for(let n=0;n<40;n++){let alive=false;if(pid&&Number.isInteger(pid)){try{process.kill(pid,0);alive=true;}catch{}}if(!alive&&readdirSync(join(r,'t')).every(n=>!n.startsWith('agent-browser-chrome-'))){this.closed=true;rmSync(r,{recursive:true});return;}await new Promise(r=>setTimeout(r,50));}
    throw new Error('LAB_BROWSER_CLEANUP_FAILED: owned state retained; no success claimed.');
  }
}
