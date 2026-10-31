/** Immutable first-attempt evidence binding; no caller-provided counters or ceilings. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
export type UsageBaseline=Readonly<{requests:number;inputTokens:number;outputTokens:number}>;
export const SELECTOR='first-live-72b1';
export const EVIDENCE_SHA256='c8f08e22b590369b628e67e3ebc1350e35ee21c67d312558b83d1766694d794d';
export const ORIGINAL_RESULT_SHA256='bbec342f25a292be47b11576d9955f8508fcb49fcebc339fe2d1fa81b69bae77';
const PRIOR=Object.freeze({requests:4,inputTokens:4147,outputTokens:117});
export function validateBaselineEvidence(bytes:Uint8Array):UsageBaseline{
 if(createHash('sha256').update(bytes).digest('hex')!==EVIDENCE_SHA256)throw new Error('BASELINE_HASH_MISMATCH');
 const value=JSON.parse(Buffer.from(bytes).toString('utf8'));
 const events=value.events;
 const admissions=events.filter((e:any)=>e.kind==='request_admitted');
 const usage=events.filter((e:any)=>e.kind==='usage');
 const last=usage.at(-1)?.data;
 if(value.originalResultSHA256!==ORIGINAL_RESULT_SHA256||value.liveAcceptance!==false||value.mode!=='live'||admissions.length!==4||usage.length!==4||admissions.some((e:any,i:number)=>e.data.request!==i+1)||last?.requests!==4||last.inputTokens!==4147||last.outputTokens!==117||last.usageReports!==4)throw new Error('BASELINE_CONTENT_MISMATCH');
 return PRIOR;
}
export function loadBaseline(selector:string|undefined,live:boolean):UsageBaseline{
 if(selector===undefined&&!live)return Object.freeze({requests:0,inputTokens:0,outputTokens:0});
 if(selector!==SELECTOR)throw new Error('BASELINE_SELECTOR_REQUIRED');
 return validateBaselineEvidence(readFileSync(new URL('../../docs/research/agent-tools/evidence/first-live-partial.json',import.meta.url)));
}
