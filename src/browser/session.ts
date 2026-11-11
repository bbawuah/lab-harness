import { WindowsInterop, windowsBrowser, windowsResponseFailure } from './windows.ts';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { browserURL, selectBrowser, verifyBrowserRuntime } from './runtime.ts';
import { envelope, insist, project } from './projection.ts';
import { codeOf, mutating, type BrowserFailureInfo, type LifecycleView } from './states.ts';
/** Error with operator-state info; message keeps the PR #23 LAB_BROWSER_* code prefix. */
export class BrowserFailure extends Error { constructor(message: string, readonly info: BrowserFailureInfo) { super(message); } }
export type BrowserInput = { operation: 'snapshot'|'navigate'|'fill'|'click'|'read'; url?: string; ref?: string; text?: string };
export type BrowserDescriptor = { root: string; session: string; origin: string; launchHash?: unknown; windows?: true };
export class BrowserSession {
  readonly binary: string; readonly descriptor: BrowserDescriptor; private queue: Promise<unknown> = Promise.resolve(); private refs = new Map<string,{role:string;name:string}>(); private generation = 0; private closed = false; private failedInMemory = false;
  // UX state (docs/browser-ux-contract.md). issued = every ref ever returned, so a retired ref reads as stale, not unknown.
  private issued = new Set<string>(); private actions = 0; private last?: string; private pendingChange = false; private lastFailure?: BrowserFailureInfo;
  constructor(descriptor: BrowserDescriptor) {
    this.binary=verifyBrowserRuntime(); this.descriptor=descriptor;
    const s=lstatSync(descriptor.root); insist(s.isDirectory() && !s.isSymbolicLink() && (process.platform==='win32'||(s.uid===process.getuid?.() && (s.mode&0o077)===0)),'LAB_BROWSER_STATE');
    insist(/^lab-[a-f0-9]{24}$/.test(descriptor.session),'LAB_BROWSER_STATE'); browserURL(descriptor.origin);
    // Activity survives /reload rebinding (display only; never used for authorization).
    try{const p=join(descriptor.root,'activity.json'),st=lstatSync(p);insist(st.isFile()&&!st.isSymbolicLink()&&st.size<=1024,'LAB_BROWSER_STATE');const a=JSON.parse(readFileSync(p,'utf8'));if(Number.isSafeInteger(a?.actions)&&a.actions>=0)this.actions=a.actions;if(typeof a?.last==='string'&&/^(snapshot|navigate|fill|click|read)( @e\d+)?$/.test(a.last))this.last=a.last;}catch{}
  }
  static async create(url: string, executable?: string, signal?: AbortSignal) {
    const u=browserURL(url);verifyBrowserRuntime(); const browser=selectBrowser(executable);
    // Short absolute owned socket root avoids Unix socket path-length limits.
    const root=mkdtempSync(join(tmpdir(),'lab-browser-')); const session='lab-'+randomUUID().replaceAll('-','').slice(0,24);
    for (const n of ['s','t','home','cache']) mkdirSync(join(root,n),{mode:0o700});
    writeFileSync(join(root,'config.json'),JSON.stringify({executablePath:browser,allowedDomains:[u.hostname],contentBoundaries:true,maxOutput:12000,noWebmcp:true,idleTimeout:'15m'}),{mode:0o600});
    const b=new BrowserSession({root,session,origin:u.origin,...(windowsBrowser()?{windows:true as const}:{})});
    try { if(b.descriptor.windows) new WindowsInterop().prepare(session,b.binary,browser,u.hostname); const raw=await b.call('agent_browser_open',{url:u.href},signal); const e=envelope(raw); insist(e.data.lifecycle?.effectiveLaunch?.browserLaunched===true,'LAB_BROWSER_NOT_OWNED'); b.descriptor.launchHash=e.data.lifecycle.effectiveLaunch.launchHash; await b.scope(signal); return b; }
    catch(e) {
      try { await b.close(); } catch {
        if(b.descriptor.windows){b.save(join(root,'recovery.json'));throw new Error('LAB_BROWSER_CLEANUP_FAILED: Windows startup failed ('+codeOf(e instanceof Error?e.message:'')+'); owned state retained in '+root+'. Retry cleanup from recovery.json; no browser action was retried.');}
      }
      throw e;
    }
  }
  static rebind(path: string) { const s=lstatSync(path);insist(s.isFile()&&!s.isSymbolicLink()&&s.uid===process.getuid?.()&&(s.mode&0o077)===0,'LAB_BROWSER_STATE'); return new BrowserSession(JSON.parse(readFileSync(path,'utf8'))); }
  save(path: string) {writeFileSync(path,JSON.stringify(this.descriptor),{flag:'wx',mode:0o600});}
  // A failure marker inside the owned root survives /reload rebinding. Once
  // written, model operations are refused; only cleanup (close) may retry.
  private get failedMarker() {return join(this.descriptor.root,'failed');}
  private failed() {return this.failedInMemory || !!lstatSync(this.failedMarker,{throwIfNoEntry:false});}
  // In-memory flag first so a marker write failure cannot leave this session usable.
  private markFailed() {this.failedInMemory=true;try{writeFileSync(this.failedMarker,'',{mode:0o600});}catch{}}
  view():LifecycleView {const origin=this.descriptor.origin;
    if(this.closed || !lstatSync(this.descriptor.root,{throwIfNoEntry:false}))return {state:'closed',origin,failure:this.lastFailure};
    if(this.failed())return {state:'cleanup-failed',origin,failure:this.lastFailure};
    return {state:'active',origin,actions:this.actions,last:this.last};}
  status() {if(this.closed || !lstatSync(this.descriptor.root,{throwIfNoEntry:false}))return 'Browser closed. Start a new LAB run with --browser URL.';
    return this.failed() ? 'Browser stopped after a failure; actions disabled. Owned state retained; run /lab-browser close to retry cleanup.' : `Owned browser · ${this.descriptor.origin} · fresh snapshot required before actions.`;}
  private environment() {if(this.descriptor.windows){const w=new WindowsInterop();return w.environment(w.root(this.descriptor.session),this.descriptor.session);}const r=this.descriptor.root;return {PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:join(r,'home'),TMPDIR:join(r,'t'),XDG_CACHE_HOME:join(r,'cache'),AGENT_BROWSER_SOCKET_DIR:join(r,'s'),AGENT_BROWSER_CONFIG:join(r,'config.json'),AGENT_BROWSER_SESSION:this.descriptor.session,NO_COLOR:'1'};}
  private run(args: string[], signal?: AbortSignal): Promise<string> {
    if(signal?.aborted) return Promise.reject(new Error('LAB_BROWSER_CANCELLED'));
    return new Promise((done,reject)=>{const binary=this.descriptor.windows?new WindowsInterop().localPath(new WindowsInterop().root(this.descriptor.session)+'\\agent-browser.exe'):this.binary;const child=spawn(binary,args,{cwd:this.descriptor.root,env:this.environment(),stdio:['ignore','pipe','pipe'],detached:true});let output='',count=0,error:Error|undefined;
      const kill=()=>{try{if(process.platform==='win32')child.kill('SIGKILL');else if(child.pid)process.kill(-child.pid,'SIGKILL');}catch{}};
      const failWindows=()=>{if(this.descriptor.windows){child.stdout.destroy();child.stderr.destroy();clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(error);}};
      const cancel=()=>{error=new Error('LAB_BROWSER_CANCELLED');kill();failWindows();}; const timer=setTimeout(()=>{error=new Error(this.descriptor.windows?'LAB_BROWSER_TIMEOUT: Windows Edge did not respond; review installed Edge, RemoteDebuggingAllowed / DeveloperToolsAvailability and target URL policies. No browser action was retried.':'LAB_BROWSER_TIMEOUT');kill();failWindows();},20000);
      signal?.addEventListener('abort',cancel,{once:true});child.on('error',()=>{error=new Error('LAB_BROWSER_SPAWN: browser tool could not start.');});
      child.stdout.on('data',c=>{count+=c.length;if(count>65536){error=new Error('LAB_BROWSER_OUTPUT_LIMIT');kill();failWindows();}else output+=c.toString();});child.stderr.on('data',c=>{error??=new Error('LAB_BROWSER_DIAGNOSTIC: command emitted diagnostics; action outcome uncertain.');count+=c.length;if(count>65536){error=new Error('LAB_BROWSER_OUTPUT_LIMIT');kill();failWindows();}});
      child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(this.descriptor.windows&&code!==0)error=windowsResponseFailure(output)??error;if(error||code!==0)reject(error??new Error('LAB_BROWSER_REFUSED: action failed; no automatic retry.'));else done(output);});
    });
  }
  private async call(tool:string,args:object,signal?:AbortSignal) {const raw=await this.run(['mcp','call',tool,JSON.stringify(args)],signal);if(this.descriptor.windows){const error=windowsResponseFailure(raw);if(error)throw error;}return raw;}
  private identity(data:any) {insist(data.lifecycle?.reused===true && data.lifecycle?.launched===false && data.lifecycle?.relaunchedBrowser===false && data.lifecycle?.effectiveLaunch?.launchHash===this.descriptor.launchHash,'LAB_BROWSER_SESSION_LOST');}
  private async scope(signal?:AbortSignal) {
    const e=envelope(await this.call('agent_browser_get_url',{},signal));this.identity(e.data);browserURL(e.data.url,this.descriptor.origin);
    const tabs=envelope(await this.call('agent_browser_tab_list',{},signal));this.identity(tabs.data);
    insist(Array.isArray(tabs.data.tabs)&&tabs.data.tabs.length===1,'LAB_BROWSER_NEW_TARGET');
    browserURL(tabs.data.tabs[0].url,this.descriptor.origin);
  }
  /**
   * `expected`: the element shown at approval (role, name, snapshot generation). A mismatch at run time,
   * or null (the ref was unknown at approval), is a stale ref. undefined skips the binding (direct callers).
   */
  execute(input:BrowserInput,signal?:AbortSignal,expected?:{role:string;name:string;generation?:number}|null):Promise<unknown> {
    const op=input?.operation;const ref=typeof input?.ref==='string'?input.ref:undefined;
    let dispatched=false;
    const fail=(e:unknown,phase:'pre'|'action',cleanup:BrowserFailureInfo['cleanup'],staleKind?:'stale'|'unknown')=>{const message=e instanceof Error?e.message:String(e);
      const info:BrowserFailureInfo={code:codeOf(message),operation:typeof op==='string'&&/^(snapshot|navigate|fill|click|read)$/.test(op)?op:undefined,...(ref&&/^@e\d+$/.test(ref)?{ref}:{}),phase,cleanup,...(staleKind?{staleKind}:{}),...(phase==='action'?{dispatched}:{})};
      if(phase==='action')this.lastFailure=info;return new BrowserFailure(message,info);};
    const task=this.queue.then(async()=>{
     let tool:string,args:object;
     try{
      insist(!this.closed && !!lstatSync(this.descriptor.root,{throwIfNoEntry:false}),'LAB_BROWSER_CLOSED');
      insist(!this.failed(),'LAB_BROWSER_FAILED: browser stopped after an earlier failure; actions disabled until a new LAB run.');
      insist(input && typeof input==='object' && Object.keys(input).every(k=>['operation','url','ref','text'].includes(k)),'LAB_BROWSER_INPUT');
      if(op==='snapshot'){insist(Object.keys(input).length===1,'LAB_BROWSER_INPUT');tool='agent_browser_snapshot';args={interactive:true};}
      else if(op==='navigate'){insist(Object.keys(input).length===2&&typeof input.url==='string','LAB_BROWSER_INPUT');tool='agent_browser_open';args={url:browserURL(input.url,this.descriptor.origin).href};}
      else {insist(['fill','click','read'].includes(op)&&typeof input.ref==='string'&&/^@e\d+$/.test(input.ref),'LAB_BROWSER_INPUT');
        insist(Object.keys(input).length===(op==='fill'?3:2),'LAB_BROWSER_INPUT');
        const current=this.refs.get(input.ref);
        // Not in the latest snapshot: stale if ever issued, else unknown. Present but not the element approved (#26 binding): stale.
        const bound=expected===undefined||(expected!==null&&!!current&&current.role===expected.role&&current.name===expected.name&&(expected.generation===undefined||expected.generation===this.generation));
        if(!current||!bound){const kind=current||this.issued.has(input.ref)?'stale':'unknown';throw fail(new Error('LAB_BROWSER_STALE_REF: take a fresh snapshot and use @eN.'),'pre','none',kind);}tool=op==='read'?'agent_browser_get_text':'agent_browser_'+op;args={selector:input.ref};
        if(op==='fill'){insist(typeof input.text==='string'&&Buffer.byteLength(input.text)<=4000&&!input.text.includes('\0'),'LAB_BROWSER_INPUT');args={...args,text:input.text};}
      }
     }catch(e){throw e instanceof BrowserFailure?e:fail(e,'pre',this.failed()?(this.closed?'done':'retained'):'none');}
      try {
        // A dead daemon must not be silently replaced by a fresh one on the next command.
        insist(this.daemonAlive(),'LAB_BROWSER_SESSION_LOST: browser daemon exited.');
        await this.scope(signal);if(op!=='snapshot'&&op!=='read')this.refs.clear();
        dispatched=true;const raw=await this.call(tool,args,signal);const {result,lifecycle}=project(raw,op);this.identity({lifecycle});
        await this.scope(signal);if(result.boundary.origin!=='unknown')browserURL(result.boundary.origin,this.descriptor.origin);
        if(op==='snapshot'){this.generation++;this.refs=new Map(Object.entries(result.result.refs as Record<string,{role:string;name:string}>).map(([r,v])=>['@'+r,{role:v.role,name:v.name}]));for(const r of this.refs.keys())this.issued.add(r);}
        this.actions++;this.last=op+(input.ref?' '+input.ref:'');this.saveActivity();
        let verifies=false;if(mutating(op))this.pendingChange=true;else if(this.pendingChange){this.pendingChange=false;verifies=true;}
        return {...result,verifiedOrigin:this.descriptor.origin,operation:op,...(input.ref?{ref:input.ref}:{}),...(verifies?{verifies:true}:{})};
      } catch(e) {this.refs.clear();this.markFailed();let cleanup:BrowserFailureInfo['cleanup']='done';await this.closeNow().catch(()=>{cleanup='retained';});throw fail(e,'action',cleanup);}
    });this.queue=task.catch(()=>{});return task;
  }
  /** Display-only counter; written to a fresh temp file then renamed, so a planted link is replaced, never followed. */
  private saveActivity(){const p=join(this.descriptor.root,'activity.json'),t=p+'.'+process.pid+'.tmp';try{writeFileSync(t,JSON.stringify({actions:this.actions,last:this.last}),{flag:'wx',mode:0o600});renameSync(t,p);}catch{try{rmSync(t,{force:true});}catch{}}}
  /** Role/name of a ref from the latest snapshot (display only; page text is untrusted). */
  element(ref:unknown):{role:string;name:string;generation:number}|undefined {const e=typeof ref==='string'?this.refs.get(ref):undefined;return e?{...e,generation:this.generation}:undefined;}
  close():Promise<void>{const task=this.queue.then(()=>this.closeNow());this.queue=task.catch(()=>{});return task;}
  /** Owned daemon liveness from its pidfile in the private socket dir (signal 0 only). */
  private daemonAlive() {if(this.descriptor.windows)return new WindowsInterop().alive(this.descriptor.session);try{const pid=Number(readFileSync(join(this.descriptor.root,'s',this.descriptor.session+'.pid'),'utf8'));if(!Number.isInteger(pid)||pid<=1)return false;process.kill(pid,0);return true;}catch{return false;}}
  private async closeNow() {
    if(this.closed)return;const r=this.descriptor.root;if(!lstatSync(r,{throwIfNoEntry:false})){this.closed=true;return;}
    this.markFailed();
    if(this.descriptor.windows){new WindowsInterop().cleanup(this.descriptor.session);rmSync(r,{recursive:true});this.closed=true;return;}
    const pidfile=join(r,'s',this.descriptor.session+'.pid');const readPid=()=>{try{const n=Number(readFileSync(pidfile,'utf8'));return Number.isInteger(n)&&n>1?n:undefined;}catch{return undefined;}};
    let pid=readPid();
    // A daemon proven dead (its pidfile names a dead pid) gets no command: the CLI could start a fresh daemon.
    // Unknown (no readable pidfile but daemon state left in s/) is treated as possibly alive: ask it to close, then re-read the pid.
    const leftovers=()=>{try{return readdirSync(join(r,'s')).some(n=>n.startsWith(this.descriptor.session));}catch{return false;}};
    if(this.daemonAlive()||(pid===undefined&&leftovers())){const raw=await this.run(['--json','close']); const response=JSON.parse(raw);insist(response.success===true,'LAB_BROWSER_CLEANUP_FAILED');pid??=readPid();}
    const alive=()=>{if(pid&&Number.isInteger(pid)){try{process.kill(pid,0);return true;}catch{}}return false;};
    const profiles=()=>readdirSync(join(r,'t')).filter(n=>n.startsWith('agent-browser-chrome-'));
    for(let n=0;n<40;n++){if(!alive()&&!profiles().length){this.closed=true;rmSync(r,{recursive:true});return;}await new Promise(r=>setTimeout(r,50));}
    // Daemon gone but its browser left behind (daemon crash/kill): stop only a browser
    // proven to run on this run's private profile, then require it to be gone.
    if(!alive()&&await reapOwnedBrowsers(join(r,'t'),profiles())){this.closed=true;rmSync(r,{recursive:true});return;}
    throw new Error('LAB_BROWSER_CLEANUP_FAILED: owned state retained; no success claimed.');
  }
}

/** Chrome's SingletonLock names its pid; signal it only if its command line uses exactly this owned profile. Returns true when none remain alive. */
export async function reapOwnedBrowsers(tdir:string,profiles:string[]):Promise<boolean>{
  const owned=(pid:number,dir:string)=>{const r=spawnSync('/bin/ps',['-o','command=','-p',String(pid)],{encoding:'utf8',env:{PATH:'/usr/bin:/bin'}});const cmd=r.status===0?r.stdout.trimEnd():'';return cmd.includes(' --user-data-dir='+dir+' ')||cmd.endsWith(' --user-data-dir='+dir);};
  const live=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
  const wait=async(pids:number[])=>{for(let n=0;n<60&&pids.some(live);n++)await new Promise(r=>setTimeout(r,50));};
  const targets=new Map<number,string>();
  for(const name of profiles){const dir=join(tdir,name);let lock='';try{lock=readlinkSync(join(dir,'SingletonLock'));}catch{continue;}
    const pid=Number(/-(\d+)$/.exec(lock)?.[1]);if(!Number.isInteger(pid)||pid<=1||!live(pid))continue;
    if(!owned(pid,dir))return false; // a live pid we cannot prove is ours: never signal, retain state
    targets.set(pid,dir);}
  for(const [pid,dir] of targets)if(owned(pid,dir))try{process.kill(pid,'SIGTERM');}catch{} // re-proved immediately before each signal (pid reuse)
  await wait([...targets.keys()]);
  for(const [pid,dir] of targets)if(live(pid)&&owned(pid,dir))try{process.kill(pid,'SIGKILL');}catch{}
  await wait([...targets.keys()]);
  return ![...targets.keys()].some(live);
}
