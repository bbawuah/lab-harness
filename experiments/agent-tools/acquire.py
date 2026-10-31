#!/usr/bin/env python3
"""Explicit pinned local acquisition. No package manager or installer execution."""
from pathlib import Path
import hashlib, io, json, tarfile, urllib.request, platform
if (platform.system(), platform.machine()) != ("Darwin", "arm64"):
 raise SystemExit("This pinned acquisition supports macOS arm64 only")
ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.tmp/agent-tools'
ASSETS = {
 'agent-browser': ('https://github.com/vercel-labs/agent-browser/releases/download/v0.41.0/agent-browser-darwin-arm64', 'a402fef2489c221b17522aa21f103ca5dc47f00ff5879d4a72c39881544730ab'),
 'agent-desktop.tar.gz': ('https://github.com/vercel-labs/agent-desktop/releases/download/v1.0.2/agent-desktop-v1.0.2-aarch64-apple-darwin.tar.gz', '7bee385196d7b478de80cf05ca4304aaa38f0eba593b3406ad3c247c1773be19'),
}
def main():
 CACHE.mkdir(parents=True, exist_ok=True)
 rows=[]
 for name,(url,expected) in ASSETS.items():
  p=CACHE/name
  data=p.read_bytes() if p.exists() else urllib.request.urlopen(url, timeout=60).read()
  digest=hashlib.sha256(data).hexdigest()
  if digest!=expected: raise RuntimeError('Artifact hash mismatch: '+name)
  p.write_bytes(data)
  if name.endswith('.gz'):
   dest=CACHE/'desktop';dest.mkdir(exist_ok=True)
   with tarfile.open(fileobj=io.BytesIO(data)) as archive:
    for member in archive.getmembers():
     if member.issym() or member.islnk(): raise RuntimeError('Unexpected archive link')
     archive.extract(member,dest,filter='data')
  else: p.chmod(0o755)
  rows.append({'name':name,'url':url,'sha256':digest,'bytes':len(data)})
 (CACHE/'acquisition.json').write_text(json.dumps(rows,indent=2)+'\n')
 print(json.dumps(rows,indent=2))
if __name__=='__main__': main()
