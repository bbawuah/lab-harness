import { mkdirSync,mkdtempSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshApplicationState } from './application-state.ts';
/** No process is started here. Setup failure removes only the fresh app subtree. */
export function prepareState(cache:string,createApp=freshApplicationState){
 let run:string|undefined,app:ReturnType<typeof freshApplicationState>|undefined;
 try{
  const runs=join(cache,'model-runs');mkdirSync(runs,{recursive:true,mode:0o700});
  run=mkdtempSync(join(runs,'run-'));app=createApp();
  const project=join(run,'project'),agent=join(app.path,'agent'),relayRuns=join(app.path,'runs'),relayRun=join(relayRuns,'trial');
  writeFileSync(join(run,'private-state-location.json'),JSON.stringify({path:app.path}),{mode:0o600});
  for(const path of [relayRuns,relayRun,project,agent,join(run,'herdr'),join(cache,'s'),join(cache,'t'),join(cache,'cache')])mkdirSync(path,{recursive:true,mode:0o700});
  return {run,app,project,agent,relayRun};
 }catch{
  let removed=false;try{if(app){app.remove();removed=true;}}catch{/* retain uncertain ownership */}
  if(run)writeFileSync(join(run,'result.json'),JSON.stringify({failure:'SETUP_FAILED',liveAcceptance:false,applicationStateRemoved:removed,stateRetained:!!app&&!removed})+'\n',{mode:0o600});
  throw new Error('SETUP_FAILED_SEE_OWNED_RUN_RESULT');
 }
}
