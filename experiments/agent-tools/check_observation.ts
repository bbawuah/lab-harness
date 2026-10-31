import { strict as assert } from 'node:assert';
import { observeFixture } from './fixture-observation.ts';
const origin='http://127.0.0.1:12345/';
const good={success:true,error:null,data:{origin,text:'Saved: Fixture Model',lifecycle:{reused:true,relaunchedBrowser:false}}};
const result=await observeFixture(async()=>good,origin);assert.equal(result.notModelConfirmation,true);assert.equal(result.text,'Saved: Fixture Model');
for(const bad of [{...good,success:false},{...good,error:'failed'},{...good,data:{...good.data,origin:'about:blank'}},{...good,data:{...good.data,text:'x'.repeat(1001)}},{...good,data:{...good.data,text:'[truncated: showing 1 of 2 chars]'}},{...good,data:{...good.data,lifecycle:{reused:false,relaunchedBrowser:true}}}])await assert.rejects(()=>observeFixture(async()=>bad,origin),/UNAVAILABLE/);
await assert.rejects(()=>observeFixture(async()=>{throw new Error('timeout');},origin));
console.log('Independent observation guards pass; no browser/model requests');
