#!/usr/bin/env python3
"""Metadata/permission preflight only; never snapshots a personal/foreground app."""
from support import *
import tempfile,shutil,signal,time

def main():
 # Exception: short private absolute socket directory, not acquisition/state.
 socket_root=Path(tempfile.mkdtemp(prefix='lab-ad-',dir='/private/tmp'))
 socket_root.chmod(0o700)
 env=clean_env();env['TMPDIR']=str(socket_root)
 rows=[];owned_hosts=[]
 try:
  for args in [['version'],['skills','get','desktop'],['skills','get','platform'],['permissions']]:
   p=subprocess.run([str(CACHE/'desktop/agent-desktop'),*args],cwd=CACHE,env=env,capture_output=True,text=True,timeout=20)
   if args[0]=='skills':
    (CACHE/('desktop-'+args[-1]+'.txt')).write_text(p.stdout)
    rows.append({'args':args,'exit':p.returncode,'stdoutBytes':len(p.stdout),'stderr':p.stderr})
   else: rows.append({'args':args,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr})
 finally:
  cleanup_ok=False
  try:
   # Runs on success AND timeout. Retain socket evidence if ownership/exit is uncertain.
   for sock in socket_root.glob('agent-desktop-host-*/*.sock'):
    q=subprocess.run(['/usr/sbin/lsof','-t',str(sock)],capture_output=True,text=True,timeout=5)
    if q.returncode not in [0,1]: raise RuntimeError('Socket owner lookup failed')
    for pid in set(int(value) for value in q.stdout.split()):
     ps=subprocess.run(['/bin/ps','-p',str(pid),'-o','command='],capture_output=True,text=True,timeout=5)
     if ps.returncode==1: continue
     if ps.returncode!=0 or ps.stdout.strip()!=str(CACHE/'desktop/agent-desktop'): raise RuntimeError('Unexpected socket owner; no signal sent')
     try: os.kill(pid,signal.SIGTERM)
     except ProcessLookupError: continue
     owned_hosts.append(pid)
     deadline=time.monotonic()+3
     while True:
      try: os.kill(pid,0)
      except ProcessLookupError: break
      if time.monotonic()>deadline: raise RuntimeError('Owned host did not terminate; socket retained')
      time.sleep(.05)
   cleanup_ok=True
  finally:
   save('desktop-trial.json',{'kind':'native-cli-permission-preflight','date':'2026-10-31','steps':rows,'socketPathException':'owned0700 short absolute temporary directory','ownedHostsTerminated':owned_hosts,'cleanupVerified':cleanup_ok,'noAppSnapshot':True,'noPermissionChanges':True})
   if cleanup_ok: shutil.rmtree(socket_root)
 for row in rows:
  if 'stdout' in row: print(json.dumps(row))
if __name__=='__main__':main()
