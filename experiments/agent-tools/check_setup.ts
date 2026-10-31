import { strict as assert } from 'node:assert';
import { mkdirSync,mkdtempSync,writeFileSync,rmSync,readdirSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareState } from './prepare-state.ts';
const base=mkdtempSync(join(import.meta.dir,'../../.tmp/agent-tools/setup-check-'));
try{
 let removed=false;
 const fake=join(base,'fake-app');mkdirSync(fake);writeFileSync(join(fake,'runs'),'blocks directory creation');
 assert.throws(()=>prepareState(base,()=>({path:fake,remove(){removed=true;rmSync(fake,{recursive:true});}})),/SETUP_FAILED/);
 assert.equal(removed,true);
 const run=readdirSync(join(base,'model-runs'))[0];
 const result=JSON.parse(readFileSync(join(base,'model-runs',run,'result.json'),'utf8'));
 assert.equal(result.applicationStateRemoved,true);assert.equal(result.liveAcceptance,false);
 console.log('Setup failure cleanup passed; no native tools, network or normal app state accessed');
}finally{rmSync(base,{recursive:true});}
