/** Admission units are serialized UTF-8 bytes + margin, NOT exact model tokens. */
import type { UsageBaseline } from './continuation.ts';
export class Budget {
 readonly baseline:UsageBaseline;
 requests:number;inputTokens:number;outputTokens:number;
 admissionUnits=0;usageReports=0;pendingUsage=false;
 constructor(baseline:UsageBaseline={requests:0,inputTokens:0,outputTokens:0}){
  if(Object.keys(baseline).sort().join(',')!=='inputTokens,outputTokens,requests'||Object.values(baseline).some(v=>!Number.isSafeInteger(v)||v<0)||baseline.requests>10||baseline.inputTokens>20000||baseline.outputTokens>4000)throw new Error('INVALID_BASELINE');
  this.baseline=Object.freeze({...baseline});this.requests=baseline.requests;this.inputTokens=baseline.inputTokens;this.outputTokens=baseline.outputTokens;
 }
 get attempt(){return {requests:this.requests-this.baseline.requests,inputTokens:this.inputTokens-this.baseline.inputTokens,outputTokens:this.outputTokens-this.baseline.outputTokens};}
 get cumulative(){return {requests:this.requests,inputTokens:this.inputTokens,outputTokens:this.outputTokens};}
 admit(payload: Record<string,unknown>) {
  const bounded={...payload,max_tokens:400};delete (bounded as Record<string,unknown>).max_completion_tokens;
  const units=Buffer.byteLength(JSON.stringify(bounded))+512;
  if(this.pendingUsage||this.requests>=10||this.admissionUnits+units>20000||this.inputTokens+units>20000||this.outputTokens+400>4000)throw new Error('BUDGET_REFUSED');
  this.requests++;this.admissionUnits+=units;this.pendingUsage=true;return bounded;
 }
 observe(usage:{input?:number;output?:number;cacheRead?:number;cacheWrite?:number}){
  if(!this.pendingUsage||!usage)throw new Error('USAGE_UNAVAILABLE');
  const values=[usage.input,usage.output,usage.cacheRead??0,usage.cacheWrite??0];
  if(values.some(v=>typeof v!=='number'||!Number.isSafeInteger(v)||v<0)||((usage.input??0)+(usage.cacheRead??0)+(usage.cacheWrite??0))===0)throw new Error('USAGE_UNAVAILABLE');
  this.inputTokens+=usage.input!+(usage.cacheRead??0)+(usage.cacheWrite??0);this.outputTokens+=usage.output!;this.usageReports++;this.pendingUsage=false;
  if(this.inputTokens>20000||this.outputTokens>4000)throw new Error('OBSERVED_TOKEN_BUDGET_EXCEEDED');
 }
}
