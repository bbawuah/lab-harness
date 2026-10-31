/** POSIX-only: PID is the detached child/group created by this wrapper, never discovered globally. */
export async function stopOwnedGroup(pid:number,kill:(pid:number,signal:number|string)=>unknown=process.kill,wait:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms))){
 if(!Number.isSafeInteger(pid)||pid<=1)throw new Error('INVALID_OWNED_GROUP');
 const alive=()=>{try{kill(-pid,0);return true;}catch(error:any){if(error.code==='ESRCH')return false;throw error;}};
 if(!alive())return;
 try{kill(-pid,'SIGTERM');}catch(error:any){if(error.code!=='ESRCH')throw error;}
 for(let i=0;i<20&&alive();i++)await wait(50);
 if(alive())try{kill(-pid,'SIGKILL');}catch(error:any){if(error.code!=='ESRCH')throw error;}
 for(let i=0;i<20&&alive();i++)await wait(50);
 if(alive())throw new Error('OWNED_GROUP_REMAINS');
}
