import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { Budget } from './budget.ts';
import { loadBaseline,validateBaselineEvidence,SELECTOR } from './continuation.ts';
const baseline=loadBaseline(SELECTOR,true);
assert.deepEqual(baseline,{requests:4,inputTokens:4147,outputTokens:117});
for(const bad of [undefined,'','reset','first-live-72b1 '])assert.throws(()=>loadBaseline(bad,true),/BASELINE_SELECTOR_REQUIRED/);
const original=readFileSync(new URL('../../docs/research/agent-tools/evidence/first-live-partial.json',import.meta.url));
for(const bad of [Buffer.from('{'),Buffer.from('{}'),Buffer.concat([original,Buffer.from('\n')]),Buffer.from(original.toString().replace('4147','0'))])assert.throws(()=>validateBaselineEvidence(bad),/BASELINE_HASH_MISMATCH/);
const b=new Budget(baseline);assert.equal(b.admissionUnits,0);
for(let i=0;i<6;i++){b.admit({});b.observe({input:100,output:20});}
assert.throws(()=>b.admit({}),/BUDGET_REFUSED/);
assert.deepEqual(b.attempt,{requests:6,inputTokens:600,outputTokens:120});
assert.deepEqual(b.cumulative,{requests:10,inputTokens:4747,outputTokens:237});
const remaining=new Budget(baseline);assert.throws(()=>remaining.admit({messages:'x'.repeat(15853)}),/BUDGET_REFUSED/);
const observed=new Budget(baseline);observed.admit({});assert.throws(()=>observed.observe({input:15854,output:1}),/OBSERVED_TOKEN_BUDGET_EXCEEDED/);
const output=new Budget(baseline);output.admit({});assert.throws(()=>output.observe({input:1,output:3884}),/OBSERVED_TOKEN_BUDGET_EXCEEDED/);
for(const bad of [{requests:-1,inputTokens:0,outputTokens:0},{requests:11,inputTokens:0,outputTokens:0},{requests:4,inputTokens:NaN,outputTokens:117},{requests:4,inputTokens:4147,outputTokens:117,maxRequests:99}])assert.throws(()=>new Budget(bad),/INVALID_BASELINE/);
console.log('Evidence-bound baseline, six remaining, exhaustion, malformed/hash and no-double-count checks pass; HTTP/model calls: 0');
