"""Opt-in owned captures; executable paths are private arguments, never published."""
import argparse, hashlib, json, platform, re, shlex, subprocess, sys, time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
MEDIA=ROOT/'docs/media'
RAW=ROOT/'.tmp/media'
BASE='93a831c4dbfe774f3c4a025f7c70334ae0f3e6b4'
ALIASES={}
UUID=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',re.I)
def sanitize(text):
    for private, alias in sorted(ALIASES.items(),key=lambda item:-len(item[0])):
        text=text.replace(private,alias)
    text=text.replace(str(ROOT),'[CHECKOUT]')
    text=re.sub(r'\[CHECKOUT\]/\.tmp/(?:terminal-demo-|p-|h-)[^/\s"\)]+','[OWNED_RUN]',text)
    text=UUID.sub('[ID]',text)
    # Fail closed for remaining absolute filesystem paths, independent of OS/root.
    # /login is Pi's displayed slash command, not a filesystem path.
    probe=re.sub(r'\[[A-Z_]+\](?:/[^\s"\']*)?','[ALIAS]',text)
    if re.search(r"(?<![\w:/])/(?!login(?:[\s.,]|$))[^\s\"']+|[A-Za-z]:[\\/]",probe):
        raise ValueError('Unaliased absolute path: private capture retained; publication refused')
    return text

def dump(path,data): path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
def pretty(x): return json.dumps(x,indent=2,ensure_ascii=False)
def scene(title,caption,text,duration=6000): return dict(title=title,caption=caption,text=sanitize(text),durationMs=duration)

def main():
    p=argparse.ArgumentParser(); p.add_argument('--bun',default='bun');p.add_argument('--pi',required=True);p.add_argument('--node',required=True);p.add_argument('--test-operator-accept',action='store_true',required=True)
    a=p.parse_args(); MEDIA.mkdir(exist_ok=True); RAW.mkdir(parents=True,exist_ok=True)
    pi=Path(a.pi).resolve(strict=True); node=Path(a.node).resolve(strict=True)
    ALIASES.update({str(pi.parents[2]):'[PI_PACKAGE]',str(pi):'[PI]',str(node):'[NODE]',a.pi:'[PI]',a.node:'[NODE]'})
    source_paths=['src/cli.ts','src/terminal-demo.ts','src/context.ts','src/search/index.ts','src/skills/index.ts','src/herdr/index.ts','src/pi/header.ts','src/pi/terminal-mark.json','scripts/pi/smoke-header.ts','scripts/pi/render-header.ts','contracts/herdr-source.json','docs/skills-inventory.json','assets/branding/terminal-b-dark.svg','assets/branding/terminal-b-light.svg']
    runtime=dict(sourceSHA=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),host=dict(system=platform.system(),machine=platform.machine()),bun=subprocess.check_output([a.bun,'--version'],text=True).strip(),node=subprocess.check_output([str(node),'--version'],text=True).strip(),nodeBinarySha256=hashlib.sha256(node.read_bytes()).hexdigest(),capturePython=platform.python_version(),sourceFiles={path:hashlib.sha256((ROOT/path).read_bytes()).hexdigest() for path in source_paths},driver='python3 docs/demos/capture.py --pi [PI] --node [NODE] --test-operator-accept')
    records=[]
    def run(args,name,expected=0):
        start=time.monotonic(); r=subprocess.run([a.bun,'--no-env-file','--no-install',*args],cwd=ROOT,capture_output=True,text=True,timeout=50)
        (RAW/f'{name}.stdout').write_text(r.stdout);(RAW/f'{name}.stderr').write_text(r.stderr)
        records.append(dict(name=name,argv=sanitize(shlex.join(['bun','--no-env-file','--no-install',*args])),exitCode=r.returncode,elapsedSeconds=round(time.monotonic()-start,3)))
        if r.returncode!=expected: raise RuntimeError(f'{name}: unexpected exit {r.returncode}; inspect private output')
        return r.stdout if not name.startswith('json-') else json.loads(r.stdout)
    # Existing reviewed startup helper owns isolation, flags and cleanup.
    output=run(['scripts/pi/smoke-header.ts','--herdr',str(ROOT/'.tmp/herdr/herdr'),'--pi',a.pi,'--node',a.node],'startup')
    (RAW/'pi-raw.json').write_text(output)
    x=json.loads((RAW/'pi-raw.json').read_text())
    assert x['piBundleSha256']=='e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774'
    assert all(x['cleanup'][key] is True for key in ['paneCloseAcknowledged','serverStopAcknowledged','serverExited','socketsRemoved','workerStopped'])
    out={k:x[k] for k in ['label','runtimeVersion','piBundleSha256','herdrVersion','herdrBinarySha256','herdrSourcePinMatch','promptSubmitted','providerRequest','nativeLabActivation','taskAcceptance','cleanup']}
    out['paneText']=sanitize(re.split(r'\n─{10,}',x['visible']['read']['text'])[0].rstrip()+'\n');out['colorAttributes']='not returned by pane.read, including strip_ansi=false'
    dump(MEDIA/'pi-startup.json',out);(MEDIA/'pi-startup.txt').write_text(out['paneText'])
    for mode in ['dark','light']:
        output=run(['scripts/pi/render-header.ts','--columns','80','--appearance',mode],f'palette-{mode}')
        (MEDIA/f'header-{mode}.ansi.txt').write_text(output)
    output=run(['src/cli.ts','terminal-demo'],'terminal-demo')
    (RAW/'terminal-raw.json').write_text(output)
    t=json.loads((RAW/'terminal-raw.json').read_text()); assert t['state']=='result_available' and t['acceptance'] is None
    state=Path(t['stateDirectory']); task=t['taskId']
    shown=json.loads(run(['src/cli.ts','--state',str(state/'lab'),'show',task],'show-before'))
    assert shown['state']=='result_available' and shown['acceptance'] is None
    # Explicitly separate test-operator command after recorded inspection; never model acceptance.
    accepted=json.loads(run(['src/cli.ts','--skill-sources',str(state/'skill-origins.json'),'--state',str(state/'lab'),'accept',str(state/'review.json')],'test-operator-accept'))
    assert accepted['state']=='accepted'
    terminal=dict(label=t['label'],candidate=t['candidate'],state=t['state'],acceptance=t['acceptance'],contextHash=t['contextHash'],sourceReferences=t['sourceReferences'],evidence=t['evidence'],actualModelCalls=t['actualModelCalls'])
    # Evidence cleanup has booleans/status only, no process identifiers.
    dump(MEDIA/'terminal-output.json',json.loads(sanitize(pretty(terminal))))
    accept_subset={k:accepted[k] for k in ['state','outcome','acceptance']}
    accept_subset['acceptance']={k:v for k,v in accepted['acceptance'].items() if k!='at'}
    dump(MEDIA/'test-operator-accept.json',json.loads(sanitize(pretty(accept_subset))))
    caption='REAL Herdr / SQLite / Relay · FIXTURE task envelope · no Pi/model'
    scenes=[scene('Terminal lifecycle · 1 / 3',caption,'$ bun --no-env-file --no-install src/cli.ts terminal-demo\n(output projection)\n\n'+pretty({k:t[k] for k in ['label','state','acceptance','actualModelCalls']})),
      scene('Result available · 2 / 3',caption,'$ bun --no-env-file --no-install src/cli.ts --state [OWNED_RUN]/lab show [TASK]\n(output projection)\n\n'+pretty(dict(state=shown['state'],acceptance=shown['acceptance'],cleanup=t['evidence']['cleanup'],taskAcceptance=t['evidence']['taskAcceptance']))),
      scene('Explicit test operator · 3 / 3','Separate accept command AFTER inspection · no model acceptance','$ bun --no-env-file --no-install src/cli.ts --skill-sources [OWNED_RUN]/skill-origins.json\n  --state [OWNED_RUN]/lab accept [OWNED_RUN]/review.json\n(output projection)\n\n'+pretty(accept_subset))]
    dump(MEDIA/'terminal-lifecycle.json',dict(scenes=scenes))
    # Deterministic owned source fixture; literal search and refusal use real CLI.
    fixture=RAW/'search-fixture';fixture.mkdir(exist_ok=True)
    source=fixture/'operator.txt';source.write_text('Operator guide\nTerminal settlement never accepts a task.\n')
    search=json.loads(run(['src/cli.ts','search',str(fixture),'Terminal settlement','5','fallback'],'search'))
    selection=dict(candidateSHA=BASE,dirtyHash='0'*64,requirements=[dict(id='R1',text='Preserve explicit acceptance.')],sources=search['hits'])
    dump(RAW/'selection.json',selection)
    context=run(['src/cli.ts','context',str(fixture),str(RAW/'selection.json')],'context')
    (RAW/'context.json').write_text(context)
    valid=run(['src/cli.ts','verify-context',str(fixture),str(RAW/'context.json')],'verify-before')
    source.write_text('Operator guide\nChanged disposable fixture bytes.\n')
    run(['src/cli.ts','verify-context',str(fixture),str(RAW/'context.json')],'verify-after',expected=1)
    stale=(RAW/'verify-after.stderr').read_text()
    dump(MEDIA/'search-output.json',dict(fixture='original deterministic owned text, not production repository',initialBytes='Operator guide\nTerminal settlement never accepts a task.\n',search=search,before=json.loads(valid),after=json.loads(stale),fixtureCandidateIdentity=True))
    scenes=[scene('Offline search · 1 / 3','Deterministic owned fixture · actual fallback search · no model','$ bun --no-env-file --no-install src/cli.ts search [OWNED_FIXTURE] "Terminal settlement" 5 fallback\n\n'+pretty(search)),
      scene('Bind source bytes · 2 / 3','Actual context verification · fixture candidate identity','$ bun --no-env-file --no-install src/cli.ts context [OWNED_FIXTURE] selection.json\n$ bun --no-env-file --no-install src/cli.ts verify-context [OWNED_FIXTURE] context.json\n\n'+pretty(json.loads(valid))+'\n\nSelected source:\n'+pretty(search['hits'][0])),
      scene('Changed source refused · 3 / 3','Only disposable fixture bytes edited · original reference retained','Fixture input replaced: operator.txt\n$ bun --no-env-file --no-install src/cli.ts verify-context [OWNED_FIXTURE] context.json\n\n'+stale+'\nexit: 1')]
    dump(MEDIA/'offline-search.json',dict(scenes=scenes))
    origins=dict(origins=[dict(id='bundled-example',root=str(ROOT/'examples/skills'))]);dump(RAW/'origins.json',origins)
    inv=json.loads(run(['src/cli.ts','skills',str(RAW/'origins.json')],'skills'))
    selected=json.loads(run(['src/cli.ts','skill-select',str(RAW/'origins.json'),'terminal-evidence'],'skill-select'))
    skill=next(s for s in inv['skills'] if s['name']=='terminal-evidence')
    # Project committed sanitized inventory only. Never open live user skill roots/bodies.
    historical=json.loads((ROOT/'docs/skills-inventory.json').read_text())
    inspect=[{k:s[k] for k in ['name','compatibility','dependencyReasons','loadable']} for s in historical['skills'] if s['name'] in ['kibana-connectors','scrawl']][:2]
    out=dict(bundledSkill=skill,selection=selected,committedInventorySha256=hashlib.sha256((ROOT/'docs/skills-inventory.json').read_bytes()).hexdigest(),committedInventoryCoverage=historical['coverage'],committedInventoryInspection=inspect)
    dump(MEDIA/'skills-output.json',out)
    scenes=[scene('Discover skills · 1 / 3','Bundled example only · actual metadata discovery · no skill execution','$ bun --no-env-file --no-install src/cli.ts skills [OWNED_ORIGINS].json\n(output projection)\n\n'+pretty({k:skill[k] for k in ['name','compatibility','dependencyReasons','loadable','complete']})),
      scene('Seal identity · 2 / 3','Actual skill-select · no instruction body published','$ bun --no-env-file --no-install src/cli.ts skill-select [OWNED_ORIGINS].json terminal-evidence\n\n'+pretty(selected)),
      scene('Inspect dependencies · 3 / 3','COMMITTED sanitized inventory · static hints, no live source scan','Recorded metadata: docs/skills-inventory.json (projection)\n\n'+pretty(inspect)+'\n\nNo dependency installed or skill executed.')]
    dump(MEDIA/'skills-discovery.json',dict(scenes=scenes))
    # Protocol transcripts are complete for displayed projections; full private raw outputs stay ignored.
    for name in ['terminal-lifecycle','offline-search','skills-discovery']:
        scenes=json.loads((MEDIA/f'{name}.json').read_text())['scenes']
        (MEDIA/f'{name}.txt').write_text('\n\n'.join(s['title']+'\n'+s['caption']+'\n'+s['text'] for s in scenes)+'\n')
    # Executable args include private paths, so publish placeholders for startup paths.
    for r in records:
        if r['name']=='startup': r['argv']='bun --no-env-file --no-install scripts/pi/smoke-header.ts --herdr [HERDR] --pi [PI] --node [NODE]'
    dump(MEDIA/'commands.json',records)
    dump(MEDIA/'capture-runtime.json',runtime)
    print('Sanitized captures written; raw evidence stays project-local and ignored.')
if __name__=='__main__': main()
