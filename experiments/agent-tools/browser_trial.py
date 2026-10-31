#!/usr/bin/env python3
"""Deterministic owned fixture trial; never attaches to an existing browser."""
from support import *
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import threading,uuid,re,hashlib,plistlib,time
CHROME=Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  body=(ROOT/'experiments/agent-tools/fixture.html').read_bytes() if self.path=='/' else b'<!doctype html><title>Second fixture</title><h1>Second owned page</h1>'
  self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def log_message(self,*args): pass

def require_cleanup(close,profiles):
 if close.get("exit")!=0 or profiles: raise RuntimeError("Owned browser cleanup incomplete; inspect retained evidence")

def main():
 if not CHROME.is_file(): raise RuntimeError('Approved installed Chrome binary missing; no automatic acquisition')
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
 session='lab-'+uuid.uuid4().hex[:10]
 config=CACHE/'trial-config.json'
 config.write_text(json.dumps({'executablePath':str(CHROME),'allowedDomains':['127.0.0.1'],'contentBoundaries':True,'maxOutput':8000,'noWebmcp':True,'idleTimeout':'60s'}))
 base=[CACHE/'agent-browser','--config',config,'--session',session,'--json']
 rows=[]
 def command(*args,expected=0):
  r=run([*base,*args],extra_env={'AGENT_BROWSER_CONFIG':str(config),'AGENT_BROWSER_SESSION':session});rows.append({'args':[a.replace(str(ROOT),'<WORKTREE>') for a in args],**r});print([a.replace(str(ROOT),'<WORKTREE>') for a in args[:2]],r['exit'],r['stdout'][:220],r['stderr'][:100],flush=True)
  if expected is not None: assert r['exit']==expected,r
  return r
 try:
  command('open',f'http://127.0.0.1:{server.server_port}/')
  snap=command('snapshot','-i'); d=json.loads(snap['stdout'])['data'];print(json.dumps(d),flush=True)
  refs=d['refs']
  ref=lambda label:'@'+next(k for k,v in refs.items() if v.get('name')==label)
  command('fill',ref('Fixture name'),'Fixture Alpha')
  command('click',ref('Save fixture'))
  actual=command('get','text','#result');assert 'Saved: Fixture Alpha' in actual['stdout']
  command('screenshot',str(EVIDENCE/'browser-native.png'))
  stale=ref('Remove this control');command('click',stale)
  command('click',stale,expected=1)
  command('snapshot','-i')
  command('open',f'http://127.0.0.1:{server.server_port}/second')
  command('get','title')
  mcp=command('mcp','call','agent_browser_get_title','{}');assert 'Second fixture' in mcp['stdout']
  assert json.loads(mcp['stdout'])['structuredContent']['response']['data']['lifecycle']['reused'] is True
  command('mcp','call','agent_browser_open',json.dumps({'url':'https://example.invalid'}),expected=1)
  # Refuse a denied hostname before any network request.
  command('open','https://example.invalid',expected=1)
 finally:
  close={'exit':None}
  try: close=command('close',expected=None)
  except Exception as error: rows.append({'cleanupException':type(error).__name__})
  finally: server.shutdown();server.server_close()
  plist=plistlib.loads(Path('/Applications/Google Chrome.app/Contents/Info.plist').read_bytes())
  profiles=[x.name for x in (CACHE/'t').glob('agent-browser-chrome-*')]
  save('browser-trial.json',{'kind':'deterministic-cli-and-one-shot-mcp','date':'2026-10-31','agentBrowser':'0.41.0','chromeVersion':plist['CFBundleShortVersionString'],'chromeExecutableSHA256':hashlib.sha256(CHROME.read_bytes()).hexdigest(),'session':session,'steps':rows,'modelCalls':0,'serverClosed':True,'temporaryProfilesRemaining':profiles})
  require_cleanup(close,profiles)
if __name__=='__main__': main()
