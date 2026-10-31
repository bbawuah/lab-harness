"""Actual deterministic owned-fixture bridge replay; no Pi/provider/auth invocation."""
from support import *
from browser_trial import Handler,CHROME,require_cleanup
from http.server import ThreadingHTTPServer
import threading,uuid,tempfile,hashlib

def main():
 if not CHROME.is_file():raise RuntimeError('Approved browser missing')
 runs=CACHE/'model-runs';runs.mkdir(exist_ok=True)
 directory=Path(tempfile.mkdtemp(prefix='run-',dir=runs));config=directory/'browser.json'
 session='lab-'+uuid.uuid4().hex[:10]
 config.write_text(json.dumps({'executablePath':str(CHROME),'allowedDomains':['127.0.0.1'],'contentBoundaries':True,'maxOutput':8000,'noWebmcp':True,'idleTimeout':'60s'}))
 env={'AGENT_BROWSER_CONFIG':str(config),'AGENT_BROWSER_SESSION':session}
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 rows=[];close={'exit':None};success=False
 def bridge(params,expected=0):
  before=set((directory/'mcp-diagnostics').glob('*.json'))
  result=run(['/usr/bin/python3','-B',ROOT/'experiments/agent-tools/mcp_bridge.py',json.dumps(params)],extra_env={'LAB_AGENT_TOOLS_CONFIG':str(config),'LAB_AGENT_TOOLS_SESSION':session})
  assert result['exit']==expected
  row={'operation':params,'exit':result['exit']}
  if expected==0:
   value=json.loads(result['stdout']);row['projected']=value
   added=set((directory/'mcp-diagnostics').glob('*.json'))-before;assert len(added)==1
   diagnostic=json.loads(added.pop().read_text());raw=diagnostic['stdout']
   row.update(rawTransportBytes=len(raw.encode()),projectedBytes=len(result['stdout'].strip().encode()),rawTransportSHA256=hashlib.sha256(raw.encode()).hexdigest())
  rows.append(row)
  return row.get('projected')
 try:
  assert run([CACHE/'agent-browser','--json','open',f'http://127.0.0.1:{server.server_port}/'],extra_env=env)['exit']==0
  snapshot=bridge({'operation':'snapshot'})['result'];refs=snapshot['refs']
  ref=lambda name:'@'+next(k for k,v in refs.items() if v['name']==name)
  bridge({'operation':'fill','ref':ref('Fixture name')[1:],'text':'Fixture Model'},expected=1)
  bridge({'operation':'fill','ref':ref('Fixture name'),'text':'Fixture Model'})
  bridge({'operation':'click','ref':ref('Save fixture')})
  observed=bridge({'operation':'get_result'})
  assert observed['result']['text']=='Saved: Fixture Model'
  success=True
 finally:
  try:close=run([CACHE/'agent-browser','--json','close'],extra_env=env)
  finally:server.shutdown();server.server_close()
  profiles=[x.name for x in (CACHE/'t').glob('agent-browser-chrome-*')]
  save('projection-replay.json',{'kind':'deterministic-native-bridge-replay','date':'2026-10-31','agentBrowser':'0.41.0','modelCalls':0,'notFirstLiveRun':True,'assertionPassed':success,'steps':rows,'closeExit':close['exit'],'temporaryProfilesRemaining':profiles,'listenerStopped':True})
  require_cleanup(close,profiles)
 print('Owned native bridge replay passed; model calls: 0')
if __name__=='__main__':main()
