import { strict as assert } from 'node:assert';
import { Budget } from './budget.ts';
const small=new Budget();
for(let i=0;i<10;i++){assert.equal(small.admit({model:'gemma4:31b',max_tokens:9000}).max_tokens,400);small.observe({input:1,output:1});}
assert.throws(()=>small.admit({}),/BUDGET_REFUSED/);
const large=new Budget();assert.throws(()=>large.admit({messages:'x'.repeat(20000)}),/BUDGET_REFUSED/);assert.equal(large.requests,0);
const fresh=()=>{const b=new Budget();b.admit({});return b;};
assert.throws(()=>fresh().observe({}),/USAGE_UNAVAILABLE/);
assert.throws(()=>fresh().observe({input:20001,output:1}),/OBSERVED_TOKEN_BUDGET_EXCEEDED/);
assert.throws(()=>fresh().observe({input:1,output:4001}),/OBSERVED_TOKEN_BUDGET_EXCEEDED/);
assert.throws(()=>fresh().observe({input:0,output:0,cacheRead:0,cacheWrite:0}),/USAGE_UNAVAILABLE/);
const used=fresh();used.observe({input:10,output:2,cacheRead:4,cacheWrite:1});assert.equal(used.inputTokens,15);
assert.throws(()=>used.observe({input:10,output:2}),/USAGE_UNAVAILABLE/);
assert.throws(()=>fresh().admit({}),/BUDGET_REFUSED/);
console.log('Budget refusal/usage checks passed; HTTP/model calls: 0');
