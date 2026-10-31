#!/usr/bin/env python3
"""Metadata/permission preflight only; never snapshots a personal/foreground app."""
from support import *
import tempfile,shutil,signal

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
  # Own socket only. Never enumerate desktop apps or kill by executable name.
  for sock in socket_root.glob('agent-desktop-host-*/*.sock'):
   q=subprocess.run(['/usr/sbin/lsof','-t',str(sock)],capture_output=True,text=True)
   for value in q.stdout.split():
    pid=int(value)
    ps=subprocess.run(['/bin/ps','-p',str(pid),'-o','command='],capture_output=True,text=True)
    if ps.stdout.strip()!=str(CACHE/'desktop/agent-desktop'): raise RuntimeError('Unexpected socket owner; no signal sent')
    os.kill(pid,signal.SIGTERM);owned_hosts.append(pid)
 finally:
  # Unix host exits on permission denial; otherwise the exact own socket owner above is stopped.
  save('desktop-trial.json',{'kind':'native-cli-permission-preflight','date':'2026-10-31','steps':rows,'socketPathException':'owned0700 short absolute temporary directory','ownedHostsTerminated':owned_hosts,'noAppSnapshot':True,'noPermissionChanges':True})
  shutil.rmtree(socket_root)
 for row in rows:
  if 'stdout' in row: print(json.dumps(row))
if __name__=='__main__':main()
