"""Offline faithful-projection and hostile/malformed envelope checks; no tool execution."""
from pathlib import Path
import json,copy
from mcp_projection import project
ROOT=Path(__file__).resolve().parents[2]
rows=json.loads((ROOT/'docs/research/agent-tools/evidence/browser-trial.json').read_text())['steps']

def envelope(response,kind):
 text=response['data'].get('snapshot',response['data'].get('text')) if kind in ['snapshot','get_text'] else json.dumps(response)
 return {'exit':0,'stderr':'','stdout':json.dumps({'_meta':{'agentBrowserVersion':'0.41.0'},'content':[{'type':'text','text':text}],'isError':False,'structuredContent':{'exitCode':0,'response':response,'stdout':json.dumps(response),'stderr':''}})}
for op,args in [('snapshot',['snapshot','-i']),('fill',['fill','@e4','Fixture Alpha']),('click',['click','@e5']),('get_text',['get','text','#result'])]:
 response=json.loads(next(row['stdout'] for row in rows if row['args']==args))
 run=envelope(response,op);output=json.loads(project('agent_browser_'+op,run))
 assert output['boundary']==response['_boundary']
 assert output['result']=={k:v for k,v in response['data'].items() if k!='lifecycle'}
 if op!='snapshot':continue
 good=json.loads(run['stdout'])
 mutations=[lambda x:x.update(isError=True),lambda x:x['_meta'].update(agentBrowserVersion='0.42.0'),lambda x:x['structuredContent'].update(exitCode=1),lambda x:x['structuredContent']['response'].update(success=False),lambda x:x['structuredContent']['response'].update(error='denied'),lambda x:x['structuredContent'].update(stdout='{}'),lambda x:x['structuredContent']['response']['data'].update(truncated=True),lambda x:x['structuredContent']['response']['data']['refs'].pop('e4'),lambda x:x['structuredContent']['response']['data'].update(snapshot='[truncated: showing 1 of 2 chars]'),lambda x:x['structuredContent'].update(stderr='warning'),lambda x:x.update(content=[]),lambda x:x['structuredContent']['response'].pop('_boundary')]
 for mutate in mutations:
  bad=copy.deepcopy(good);mutate(bad)
  try:project('agent_browser_snapshot',{**run,'stdout':json.dumps(bad)})
  except (ValueError,TypeError,KeyError):pass
  else:raise AssertionError('Malformed response accepted')
 # Re-encode internally consistent but incomplete/truncated/unknown semantics too.
 for change in [lambda d:d['refs'].pop('e4'),lambda d:d.update(snapshot=d['snapshot']+'\n[truncated: showing 1 of 2 chars]'),lambda d:d.update(unknown='new semantics'),lambda d:d.update(snapshot=d['snapshot']+'x'*9000)]:
  altered=copy.deepcopy(response);change(altered['data'])
  try:project('agent_browser_snapshot',envelope(altered,'snapshot'))
  except ValueError:pass
  else:raise AssertionError('Incomplete/truncated/unknown semantics accepted')
 for bad in [{**run,'exit':1},{**run,'stdout':'not json'},{**run,'stdout':'x'*32769}]:
  try:project('agent_browser_snapshot',bad)
  except ValueError:pass
  else:raise AssertionError('Failed/truncated process accepted')
print('Projection semantics and error/malformed/truncation/ref checks passed; model calls: 0')
