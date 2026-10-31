"""Read-only audit of pixel LB capture source, transcripts and render identities."""
from pathlib import Path
import hashlib,json,subprocess
P=Path(__file__).resolve().parent
root=P.parents[2]
r=json.loads((P/'capture.json').read_text())
assert r['cleanAtCapture'] and r['providerRequests']==0
assert len(r['cleanup'])==3 and all(c=={'serverExited':True,'clientExited':True,'workerStopped':True,'socketsRemoved':True} for c in r['cleanup'])
mark=json.loads(subprocess.check_output(['git','show',r['sourceSHA']+':src/pi/terminal-mark.json'],cwd=root))
expected=[]
for y in range(0,mark['pixelRows'],2):
 expected.append(''.join({(False,False):' ',(True,False):'▀',(False,True):'▄',(True,True):'█'}[(a>=0,b>=0)] for a,b in zip(mark['dark'][y],mark['dark'][y+1])).rstrip())
for name,meta in r['captures'].items():
 assert hashlib.sha256((P/name).read_bytes()).hexdigest()==meta['sanitizedSHA256'],name
for name,digest in r['renderedAssets'].items():
 assert hashlib.sha256((P/name).read_bytes()).hexdigest()==digest,name
for name in ['light.txt','dark.txt','fallback.txt']:
 actual=[line[:mark['columns']].rstrip() for line in (P/name).read_text().splitlines() if any(c in line for c in '▀▄█')]
 assert actual==expected,name
# Outer workspace has the same mark inside the Pi pane's frame.
outer=[line[27:27+mark['columns']].rstrip() for line in (P/'split.txt').read_text().splitlines() if any(c in line for c in '▀▄█')]
assert outer==expected,'split.txt'
print('Pixel LB evidence: hashes, source-bound silhouette, zero provider requests and three clean exits verified.')
