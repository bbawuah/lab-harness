from pathlib import Path
import os,subprocess,json
ROOT=Path(__file__).resolve().parents[2]
CACHE=ROOT/'.tmp/agent-tools'
EVIDENCE=ROOT/'docs/research/agent-tools/evidence'
def clean_env():
 for name in ['t','s','cache']:
  (CACHE/name).mkdir(exist_ok=True,mode=0o700);(CACHE/name).chmod(0o700)
 return {'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','TMPDIR':'./t','AGENT_DESKTOP_HOME':str(CACHE/'desktop-state'),'AGENT_BROWSER_SKILLS_DIR':str(CACHE/'agent-browser-source/skill-data'),'XDG_CACHE_HOME':str(CACHE/'cache'),'AGENT_BROWSER_SOCKET_DIR':'./s','NO_COLOR':'1'}
def run(argv,timeout=30,extra_env=None):
 p=subprocess.run([str(x) for x in argv],cwd=CACHE,env={**clean_env(),**(extra_env or {})},capture_output=True,text=True,timeout=timeout)
 return {'exit':p.returncode,'stdout':p.stdout.replace(str(ROOT),'<WORKTREE>'),'stderr':p.stderr.replace(str(ROOT),'<WORKTREE>')}
def save(name,data):
 EVIDENCE.mkdir(parents=True,exist_ok=True);(EVIDENCE/name).write_text(json.dumps(data,indent=2).replace(str(ROOT),'<WORKTREE>')+'\n')
