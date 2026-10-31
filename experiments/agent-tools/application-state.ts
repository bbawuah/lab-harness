import { lstatSync,mkdirSync,mkdtempSync,rmSync,realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export function freshApplicationState(){
 const home=homedir();let cursor=home;
 for(const part of ['', '.local','share','lab-harness','experiments']){
  if(part)cursor=join(cursor,part);
  let st=lstatSync(cursor,{throwIfNoEntry:false});
  if(!st){mkdirSync(cursor,{mode:0o700});st=lstatSync(cursor);}
  if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid?.()||(st.mode&0o022))throw new Error('UNSAFE_APP_STATE_ANCESTOR');
 }
 const path=mkdtempSync(join(cursor,'agent-tools-')),identity=lstatSync(path);
 return {path,remove(){const st=lstatSync(path);if(st.dev!==identity.dev||st.ino!==identity.ino||st.isSymbolicLink()||realpathSync(path)!==path)throw new Error('APP_STATE_IDENTITY_CHANGED');rmSync(path,{recursive:true});}};
}
