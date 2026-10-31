import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { stopOwnedGroup } from './process-group.ts';
const source=`import guard from ${JSON.stringify(import.meta.dir+'/guard-extension.ts')};const handlers={};guard({on:(n,f)=>handlers[n]=f,setActiveTools:()=>{},getActiveTools:()=>[]});try{handlers.before_provider_request({payload:{model:'gemma4:31b'}},{});}catch{process.exit(9);}process.exit(10);`;
// An unavailable evidence destination must terminate, never throw/fall through to provider dispatch.
const p=spawnSync(process.execPath,['--no-env-file','--no-install','-e',source],{env:{PATH:'/usr/bin:/bin',LAB_AGENT_TOOLS_EVENTS:'/nonexistent-owned-evidence/events',LAB_AGENT_TOOLS_MODE:'probe'},stdio:'ignore'});
assert.equal(p.status,79);
let alive=true;const signals:(number|string)[]=[];
await stopOwnedGroup(456,(pid,signal)=>{assert.equal(pid,-456);signals.push(signal);if(!alive)throw Object.assign(new Error(),{code:'ESRCH'});if(signal==='SIGTERM')alive=false;},async()=>{});
assert(signals.includes('SIGTERM'));
await assert.rejects(()=>stopOwnedGroup(456,()=>{},async()=>{}),/OWNED_GROUP_REMAINS/);
console.log('Evidence failure exits closed; in-flight helper/group cleanup checks passed (mock signals only)');
