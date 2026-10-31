import type { UsageBaseline } from './continuation.ts';
/** Admission count is authoritative even when provider usage is missing or rejected. */
export function summarizeBudget(baseline:UsageBaseline,rows:{kind:string;data:any}[],probe:boolean){
 const admitted=rows.filter(x=>x.kind==='request_admitted').length;
 const observations=rows.filter(x=>x.kind==='usage'||x.kind==='usage_refused'&&x.data.observationRecorded===true);
 const latest=observations.at(-1)?.data;
 const complete=probe&&admitted===0||!!latest&&observations.length===admitted&&latest.usageReports===admitted&&latest.attempt.requests===admitted&&latest.cumulative.requests===baseline.requests+admitted;
 const attemptTokens=probe&&admitted===0?{inputTokens:0,outputTokens:0}:latest?.attempt;
 const cumulativeTokens=probe&&admitted===0?baseline:latest?.cumulative;
 return {
  baseline,
  attempt:{requests:admitted,inputTokens:complete?attemptTokens.inputTokens:null,outputTokens:complete?attemptTokens.outputTokens:null},
  cumulative:{requests:baseline.requests+admitted,inputTokens:complete?cumulativeTokens.inputTokens:null,outputTokens:complete?cumulativeTokens.outputTokens:null},
  usageComplete:complete,
  observedBudgetExceeded:rows.some(x=>x.kind==='usage_refused'&&x.data.observationRecorded===true),
  ...(!complete&&latest?{lastKnownReportedTokens:{attempt:{inputTokens:latest.attempt.inputTokens,outputTokens:latest.attempt.outputTokens},cumulative:{inputTokens:latest.cumulative.inputTokens,outputTokens:latest.cumulative.outputTokens}}}:{}),
 };
}
