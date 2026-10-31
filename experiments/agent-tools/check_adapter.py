"""Offline boundary checks: no subprocess, browser or inference."""
from mcp_bridge import translate
assert translate({'operation':'fill','ref':'@e2','text':'Fixture Alpha'})==('agent_browser_fill',{'selector':'@e2','text':'Fixture Alpha'})
assert translate({'operation':'snapshot'})==('agent_browser_snapshot',{'interactive':True})
for bad in [{'operation':'open','url':'https://example.invalid'},{'operation':'click','ref':'body'}, {'operation':'snapshot','session':'default'}, {'operation':'fill','ref':'@e2','text':'x\nsecret'},{'operation':'get_result','extraArgs':['--cdp','9222']}]:
 try: translate(bad)
 except ValueError: pass
 else: raise AssertionError('Boundary accepted invalid request')
print('Adapter boundary checks passed; model calls: 0')
