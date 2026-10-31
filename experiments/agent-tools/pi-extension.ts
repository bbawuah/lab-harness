/** PREPARED ONLY: explicit Pi extension, not loaded by the public LAB launcher. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { WorkspaceExtensionAPI } from '../../src/pi/workspace-extension.ts';
export default function experiment(pi: WorkspaceExtensionAPI) {
  pi.registerTool({
    name: 'lab_owned_browser', label: 'Owned fixture browser',
    description: 'Experimental synthetic fixture only. Snapshot before ref actions; get_result verifies the form. No arbitrary navigation, files, JavaScript or desktop access.',
    parameters: { type: 'object', properties: { operation: {type:'string',enum:['snapshot','fill','click','get_result']}, ref:{type:'string',pattern:'^@e[0-9]+$'}, text:{type:'string',maxLength:80}}, required:['operation'],additionalProperties:false },
    async execute(_id, params, signal) {
      if (!process.env.LAB_AGENT_TOOLS_SESSION || !process.env.LAB_AGENT_TOOLS_CONFIG) throw new Error('EXPERIMENT_NOT_PREPARED');
      const text = await new Promise<string>((resolve,reject) => {
        const child=spawn('/usr/bin/python3',['-B',fileURLToPath(new URL('./mcp_bridge.py',import.meta.url)),JSON.stringify(params)],{
          signal, stdio:['ignore','pipe','pipe'], env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',LAB_AGENT_TOOLS_SESSION:process.env.LAB_AGENT_TOOLS_SESSION,LAB_AGENT_TOOLS_CONFIG:process.env.LAB_AGENT_TOOLS_CONFIG}
        });
        let result='',bytes=0,failed=false;
        const stop=(message:string)=>{if(!failed){failed=true;child.kill('SIGKILL');reject(new Error(message));}};
        const timer=setTimeout(()=>stop('EXPERIMENT_TIMEOUT'),35000);
        child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>32768)stop('EXPERIMENT_OUTPUT_LIMIT');else result+=chunk.toString();});
        child.stderr.resume();
        child.on('error',()=>{clearTimeout(timer);stop('EXPERIMENT_SUBPROCESS_FAILED');});
        child.on('close',code=>{clearTimeout(timer);if(!failed){if(code!==0)reject(new Error('EXPERIMENT_REFUSED'));else resolve(result);}});
      });
      return {content:[{type:'text',text}],details:{experimental:true,transport:'official-one-shot-mcp'}};
    }
  });
}
