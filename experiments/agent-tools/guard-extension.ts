/** Experimental release-pinned Pi hooks. No provider registration or network proxy. */
import { appendFileSync } from 'node:fs';
import { Budget } from './budget.ts';
import { loadBaseline } from './continuation.ts';
import { callWorkspaceBridge } from '../../src/pi/workspace-extension.ts';
type API={on(event:string,handler:(event:any,ctx:any)=>unknown):void;setActiveTools(names:string[]):void;getActiveTools():string[]};
export default function guard(pi:API) {
 const path=process.env.LAB_AGENT_TOOLS_EVENTS;
 if(!path) process.exit(78);
 let size=0; let budget:Budget;
 const record=(kind:string,data:unknown)=>{
   const line=JSON.stringify({kind,data})+'\n';size+=Buffer.byteLength(line);
   if(size>64000) process.exit(79);
   try{appendFileSync(path,line,{mode:0o600});}catch{process.exit(79);}
 };
 const stop=(code:string):never=>{try{record('refused',{code});}finally{process.exit(78);}};
 try{budget=new Budget(loadBaseline(process.env.LAB_AGENT_TOOLS_PRIOR_USAGE,process.env.LAB_AGENT_TOOLS_MODE==='live'));record('budget_baseline',budget.baseline);}catch{return stop('BASELINE_REFUSED');}
 const deadline=setTimeout(()=>stop('DEADLINE'),120000);deadline.unref();
 pi.on('session_start',async (_event,ctx)=>{
  try {
   const sessionId=ctx.sessionManager.getSessionId();
   await callWorkspaceBridge({action:'relay-heartbeat',sessionId});
   pi.setActiveTools(['lab_owned_browser']);
   record('session_start',{activeTools:pi.getActiveTools(),labExtensionExplicit:true,relayHealthy:true,sessionId});
  }catch(error){const code=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'UNKNOWN';return stop('LAB_RELAY_STARTUP_FAILED_'+code);}
 });
 pi.on('before_provider_request',(event)=>{
   // Pi catches hook exceptions. Exit synchronously, never throw as a refusal.
   try {
     if(process.env.LAB_AGENT_TOOLS_MODE==='probe'){record('probe_pre_request',{dispatched:false});process.exit(78);}
     if(process.env.LAB_AGENT_TOOLS_MODE!=='live')return stop('MODE');
     if(!event.payload || typeof event.payload!=='object' || event.payload.model!=='gemma4:31b')return stop('PAYLOAD');
     const payload=budget.admit(event.payload);
     record('request_admitted',{attemptRequest:budget.attempt.requests,cumulativeRequest:budget.requests,admissionUnits:budget.admissionUnits,maxOutputTokens:400});
     return payload;
   }catch{return stop('ADMISSION_FAILED');}
 });
 pi.on('tool_execution_start',event=>{
   if(event.toolName!=='lab_owned_browser')return stop('TOOL_NOT_ALLOWED');
   record('tool_start',{tool:event.toolName,args:event.args});
 });
 pi.on('tool_execution_end',event=>record('tool_end',{tool:event.toolName,isError:event.isError===true}));
 pi.on('message_end',event=>{
   if(event.message?.role!=='assistant')return;
   try{
    budget.observe(event.message.usage);
    record('usage',{attempt:budget.attempt,cumulative:budget.cumulative,usageReports:budget.usageReports,complete:!budget.pendingUsage});
    // Text only, bounded; no provider headers, raw response payload or credentials.
    record('assistant',{stopReason:event.message.stopReason,text:(event.message.content??[]).filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n').slice(0,4000)});
   }catch{return stop('USAGE_MISSING_OR_OVER_BUDGET');}
 });
}
