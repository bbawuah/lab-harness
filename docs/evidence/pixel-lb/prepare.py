"""Publish text from LAB_BRAND_CAPTURE_DIR, preserving grid widths and receipts."""
from pathlib import Path
import json, hashlib, re, sys
raw=Path(sys.argv[1]); out=Path(__file__).resolve().parent
r=json.loads((raw/'run.json').read_text())
assert r['workingTree']=='' and r['providerRequests']==0 and all(all(c.values()) for c in r['cleanup'])
receipt={k:r[k] for k in ('sourceSHA','providerRequests','cleanup')}
receipt.update({'kind':'Browser rendering of recorded native terminal text, not live pixels','cleanAtCapture':True,'platform':'Darwin arm64','pi':'1.4.0','herdr':'0.9.5','bun':'1.4.2','captures':{}})
for name,source in [('split.txt','split-outer.txt'),('light.txt','light-pane.txt'),('dark.txt','dark-pane.txt'),('compact.txt','compact-pane.txt'),('fallback.txt','fallback-pane.txt')]:
 original=(raw/source).read_text(); sanitized=original
 for private,alias in [(r['privateRoot'],'[OWNED_RUN]'),(r['sourceRoot'],'[CHECKOUT]')]:
  sanitized=sanitized.replace(private,alias.ljust(len(private)))
 def redact_truncated(m):
  value=m[0]
  assert value.endswith('...') and r['privateRoot'].startswith(value[:-3]), 'Unexpected private path'
  return '[OWNED_RUN]'.ljust(len(value))
 sanitized=re.sub(r'/private/var/[^\s│]+',redact_truncated,sanitized)
 assert not re.search(r'/(?:Users|home)/[a-zA-Z0-9_.-]+/|/private/var/|/tmp/lab-',sanitized),name
 assert list(map(len,original.splitlines()))==list(map(len,sanitized.splitlines()))
 (out/name).write_text(sanitized)
 receipt['captures'][name]={'source':source,'originalSHA256':hashlib.sha256(original.encode()).hexdigest(),'sanitizedSHA256':hashlib.sha256(sanitized.encode()).hexdigest(),'sanitization':'Equal-width substitution of owned run/checkout paths, including truncated owned-path prefixes; no logo edits.'}
(out/'capture.json').write_text(json.dumps(receipt,indent=2)+'\n')
