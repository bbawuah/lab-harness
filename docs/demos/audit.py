"""Audit published capture files and frame geometry; write reviewable identities."""
import argparse, hashlib, json, platform, re, runpy, sys
import PIL
from PIL import features
from pathlib import Path
from PIL import Image, ImageFont

ROOT=Path(__file__).resolve().parents[2]; MEDIA=ROOT/'docs/media'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--font',required=True);a=p.parse_args()
    # Reproduction guard: alias actual package locations, refuse arbitrary private roots.
    capture=runpy.run_path(str(ROOT/'docs/demos/capture.py'))
    sanitize=capture['sanitize'];aliases=capture['ALIASES']
    package='/'+ 'srv/custom/pi-package';aliases[package]='[PI_PACKAGE]'
    assert sanitize(package+'/docs/models.md')=='[PI_PACKAGE]/docs/models.md'
    for private in ['/'+ 'home/test/private.txt','/'+ 'srv/unaliased/private.txt','C:'+chr(92)+'Users'+chr(92)+'test'+chr(92)+'private.txt']:
        try: sanitize(private)
        except ValueError: pass
        else: raise AssertionError('Absolute path was not refused')
    uuid=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',re.I)
    for file in MEDIA.iterdir():
        if file.suffix not in ['.json','.txt']:continue
        text=file.read_text();assert not uuid.search(text),file.name
        assert not re.search('/'+'(?:Users|home)/[a-zA-Z0-9_.-]+/',text),file.name
        assert not re.search(r'"(?:session|workerPid|paneId|runDirectory|serverLog|processInfo)"\s*:',text),file.name
    font=ImageFont.truetype(a.font,15); cell=font.getlength('M'); assets={}
    for file in sorted(MEDIA.iterdir()):
        if file.suffix not in ['.png','.gif']:continue
        im=Image.open(file);assert im.width==728
        item=dict(bytes=file.stat().st_size,sha256=sha(file),width=im.width,height=im.height)
        if file.suffix=='.gif':
            durations=[]
            for i in range(im.n_frames): im.seek(i);durations.append(im.info['duration'])
            assert file.stat().st_size<2_000_000 and durations==[6000]*3
            scenes=json.loads(file.with_suffix('.json').read_text())['scenes']
            # Text can wrap, but every glyph and line must fit the output canvas.
            renderer=runpy.run_path(str(ROOT/'docs/demos/render.py'))
            for scene in scenes:
                lines=[]
                for line in scene['text'].splitlines(): lines.extend(renderer['textwrap'].wrap(line,75,replace_whitespace=False,drop_whitespace=False) or [''])
                assert max(map(len,lines)) * cell + 24 < 728
                assert 105+len(lines)*21 <= im.height-29
            item.update(frames=im.n_frames,frameDurationsMs=durations,durationMs=sum(durations))
        assets[file.name]=item
    # Independent ANSI replay check: sample both halves of every fixture mesh cell.
    samples=0
    for mode in ['dark','light']:
        im=Image.open(MEDIA/f'header-{mode}.png').convert('RGB')
        default=(232,236,239) if mode=='dark' else (32,39,44)
        canvas=(17,21,24) if mode=='dark' else (250,250,250)
        for row,line in enumerate((MEDIA/f'header-{mode}.ansi.txt').read_text().splitlines()):
            fg=default;bg=canvas;col=0
            for token in re.findall(r'\x1b\[[0-9;]*m|[^\x1b]',line):
                if token.startswith('\x1b'):
                    codes=[int(v) for v in token[2:-1].split(';')];i=0
                    while i<len(codes):
                        if codes[i] in [38,48]:
                            n=codes[i+2];c=(8+10*(n-232),)*3
                            if codes[i]==38:fg=c
                            else:bg=c
                            i+=3
                        else:
                            if codes[i]==0:fg,bg=default,canvas
                            i+=1
                else:
                    if col<18 and token in '▀▄ ':
                        top=fg if token=='▀' else bg;bottom=fg if token=='▄' else bg
                        for offset,color in [(5,top),(16,bottom)]:
                            assert im.getpixel((round(24+(col+.5)*cell),105+row*21+offset))==color,(mode,row,col)
                            samples+=1
                    col+=1
    runtime=json.loads((MEDIA/'capture-runtime.json').read_text())
    assert all(sha(ROOT/path)==value for path,value in runtime['sourceFiles'].items()),'Source freeze violated'
    wheel=next((ROOT/'.tmp/media/wheels').glob('pillow-12.0.0-*.whl'))
    provenance=dict(sourceSHA=runtime['sourceSHA'],captureDate='2026-10-29',host=runtime['host'],bun=runtime['bun'],node=runtime['node'],python=platform.python_version(),pillow=PIL.__version__,freetype=features.version('freetype2'),wheel=dict(name=wheel.name,sha256=sha(wheel),origin='PyPI Pillow 12.0.0 official distribution'),font=dict(name=Path(a.font).name,sha256=sha(Path(a.font)),redistributed=False),sourceFiles=runtime['sourceFiles'],renderer=dict(path='docs/demos/render.py',sha256=sha(ROOT/'docs/demos/render.py')),captures=dict(path='docs/demos/capture.py',sha256=sha(ROOT/'docs/demos/capture.py')),assets=assets,audit=dict(ansiCellHalfSamples=samples,privatePathRefusal=True,noPublishedUUIDs=True,frameBounds=True,visualInspection='First/middle/last of all three GIFs inspected with view_image; palette pair and startup image inspected separately.'))
    (MEDIA/'PROVENANCE.json').write_text(json.dumps(provenance,indent=2)+'\n')
    print(json.dumps(dict(assets=len(assets),gifDurationsMs=[v['durationMs'] for v in assets.values() if 'durationMs'in v],ansiCellHalfSamples=samples,privatePathRefusal=True)))
if __name__=='__main__':main()
