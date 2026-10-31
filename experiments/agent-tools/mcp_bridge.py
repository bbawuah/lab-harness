#!/usr/bin/env python3
"""Prepared experimental Pi boundary; no model requests. Trusted operator prepares session."""
from support import *
import re,sys,uuid
from mcp_projection import project

def translate(p):
 if not isinstance(p,dict) or set(p)-{'operation','ref','text'}: raise ValueError('invalid keys')
 op=p.get('operation')
 if op=='snapshot' and set(p)=={'operation'}: return 'agent_browser_snapshot',{'interactive':True}
 if op=='get_result' and set(p)=={'operation'}: return 'agent_browser_get_text',{'selector':'#result'}
 if op not in ['fill','click'] or not re.fullmatch(r'@e[0-9]+',str(p.get('ref',''))): raise ValueError('invalid action/ref')
 expected={'operation','ref','text'} if op=='fill' else {'operation','ref'}
 if set(p)!=expected: raise ValueError('invalid fields')
 args={'selector':p['ref']}
 if op=='fill':
  if not isinstance(p['text'],str) or not re.fullmatch(r'[A-Za-z0-9 ._-]{1,80}',p['text']): raise ValueError('synthetic text only')
  args['text']=p['text']
 return 'agent_browser_'+op,args

def main():
 tool,args=translate(json.loads(sys.argv[1]))
 session=os.environ.get('LAB_AGENT_TOOLS_SESSION','')
 if not re.fullmatch(r'lab-[a-f0-9]{10}',session): raise ValueError('owned session required')
 config=Path(os.environ.get('LAB_AGENT_TOOLS_CONFIG','')).resolve()
 if config!=CACHE/'trial-config.json' and not (config.name=='browser.json' and config.parent.parent==CACHE/'model-runs' and config.parent.name.startswith('run-')): raise ValueError('trusted config required')
 cfg=json.loads(config.read_text())
 if cfg.get('allowedDomains')!=['127.0.0.1'] or cfg.get('noWebmcp') is not True or cfg.get('maxOutput')!=8000: raise ValueError('trusted limits required')
 # Exact fixture/session must be prepared by the operator. This is not an ownership sandbox.
 result=run([CACHE/'agent-browser','mcp','call',tool,json.dumps(args)],extra_env={'AGENT_BROWSER_CONFIG':str(config),'AGENT_BROWSER_SESSION':session})
 # Diagnostics remain private and out of model context. Fail on overflow; never slice results.
 diagnostics=config.parent/'mcp-diagnostics'
 if diagnostics.is_symlink(): raise RuntimeError('Unsafe diagnostics directory')
 diagnostics.mkdir(mode=0o700,exist_ok=True)
 raw=json.dumps({'tool':tool,**result})
 if len(raw.encode())>65536 or len(list(diagnostics.glob('*.json')))>=64: raise RuntimeError('Diagnostics limit')
 path=diagnostics/(uuid.uuid4().hex+'.json')
 with path.open('x') as output:
  os.chmod(path,0o600);output.write(raw)
 print(project(tool,result))
if __name__=='__main__':main()
