import { strict as assert } from 'node:assert';
import { Budget } from './budget.ts';
import { summarizeBudget } from './budget-report.ts';
const baseline={requests:4,inputTokens:4147,outputTokens:117};
const b=new Budget(baseline),rows:{kind:string;data:any}[]=[];
const admit=()=>{b.admit({});rows.push({kind:'request_admitted',data:{}});};
admit();b.observe({input:100,output:20});rows.push({kind:'usage',data:{attempt:b.attempt,cumulative:b.cumulative,usageReports:b.usageReports}});
admit();
const missing=summarizeBudget(baseline,rows,false);
assert.equal(missing.cumulative.requests,6);assert.equal(missing.attempt.requests,2);assert.equal(missing.cumulative.inputTokens,null);assert.equal(missing.attempt.outputTokens,null);assert.equal(missing.usageComplete,false);
assert.deepEqual(missing.lastKnownReportedTokens?.cumulative,{inputTokens:4247,outputTokens:137});
try{b.observe({input:16000,output:20});}catch{rows.push({kind:'usage_refused',data:{observationRecorded:true,attempt:b.attempt,cumulative:b.cumulative,usageReports:b.usageReports}});}
const over=summarizeBudget(baseline,rows,false);
assert.equal(over.cumulative.requests,6);assert.equal(over.cumulative.inputTokens,20247);assert.equal(over.usageComplete,true);assert.equal(over.observedBudgetExceeded,true);
const empty=summarizeBudget(baseline,[],false);assert.equal(empty.usageComplete,false);assert.equal(empty.cumulative.inputTokens,null);
const probe=summarizeBudget(baseline,[],true);assert.deepEqual(probe.cumulative,baseline);assert.equal(probe.usageComplete,true);
console.log('Admitted missing-usage request counts and observed overrun totals preserved; no HTTP/model calls');
