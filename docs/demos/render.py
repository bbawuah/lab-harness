"""Render recorded terminal text, never synthesize command results. Pillow 12.0.0."""
import argparse, json, re, textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

CAPTURE_PATH=Path(__file__).resolve().parents[2]/'docs/media/capture-runtime.json'
SOURCE=json.loads(CAPTURE_PATH.read_text())['sourceSHA'][:7] if CAPTURE_PATH.exists() else 'unknown'
ANSI = re.compile(r'\x1b\[([0-9;]*)m')
def render(title, subtitle, text, font_path, appearance='dark', height=None):
    bg, fg, muted = ('#111518','#e8ecef','#aab6bd') if appearance=='dark' else ('#fafafa','#20272c','#58656e')
    font = ImageFont.truetype(font_path, 15)
    small = ImageFont.truetype(font_path, 12)
    lines=[]
    for line in text.splitlines():
        # ANSI fixture has bounded 80 columns; other captured excerpts wrap without omission.
        if '\x1b' in line: lines.append(line)
        else: lines.extend(textwrap.wrap(line, 75, replace_whitespace=False, drop_whitespace=False) or [''])
    h = max(height or 0, 134+len(lines)*21)
    im=Image.new('RGB',(728,h),bg); d=ImageDraw.Draw(im)
    d.text((24,20),title,font=font,fill=fg)
    for i,line in enumerate(textwrap.wrap(subtitle, 91)): d.text((24,49+i*17),line,font=small,fill=muted)
    y=105
    cell=d.textlength('M',font=font)
    def gray(n):
        if 232 <= n <= 255: return (8+10*(n-232),)*3
        raise ValueError('Only captured neutral 256-color values supported')
    for line in lines:
        x=24; pos=0; color=fg; background=bg
        def chunk(value):
            nonlocal x
            for char in value:
                if background != bg: d.rectangle((round(x),y,round(x+cell)-1,y+20),fill=background)
                if char in '▀▄█':
                    top=y+(10 if char=='▄' else 0); bottom=y+(9 if char=='▀' else 20)
                    d.rectangle((round(x),top,round(x+cell)-1,bottom),fill=color)
                else: d.text((x,y),char,font=font,fill=color)
                x+=cell
        for match in ANSI.finditer(line):
            chunk(line[pos:match.start()])
            codes=[int(v) if v else 0 for v in match.group(1).split(';')]
            i=0
            while i<len(codes):
                c=codes[i]
                if c in [38,48] and codes[i+1]==5:
                    if c==38: color=gray(codes[i+2])
                    else: background=gray(codes[i+2])
                    i+=3
                else:
                    if c in [0,39]: color=fg
                    if c in [0,49]: background=bg
                    i+=1
            pos=match.end()
        chunk(line[pos:]); y+=21
    d.text((24,h-23),f'Recorded output • source {SOURCE} • no performance claim',font=small,fill=muted)
    return im

def main():
    p=argparse.ArgumentParser(); p.add_argument('--font',required=True); a=p.parse_args()
    root=Path(__file__).resolve().parents[2]; media=root/'docs/media'
    pi=json.loads((media/'pi-startup.json').read_text())
    text=pi['paneText']; excerpt=text.split('\n\n\n')[0] # captured header + extension listing
    # Explicit excerpt selection; full sanitized observation remains beside the image.
    excerpt='\n'.join(text.strip().splitlines()[:24])
    render('Pi 1.4.0 · owned Herdr startup','ACTUAL CAPTURED TEXT, rendered excerpt. Pane API omits colors; this is not a raw pixel capture.',excerpt,a.font).save(media/'pi-startup-text.png')
    for mode in ['dark','light']:
        raw=(media/f'header-{mode}.ansi.txt').read_text()
        render(f'LAB-HARNESS · {mode} palette','FIXTURE PALETTE RENDER · actual render-header command output. No Pi process.',raw,a.font,mode).save(media/f'header-{mode}.png')
    for name in ['terminal-lifecycle','offline-search','skills-discovery']:
        file=media/f'{name}.json'
        if not file.exists(): continue
        scenes=json.loads(file.read_text())['scenes']
        frames=[render(s['title'],s['caption'],s['text'],a.font,height=620) for s in scenes]
        maxh=max(f.height for f in frames)
        frames=[render(s['title'],s['caption'],s['text'],a.font,height=maxh) for s in scenes]
        frames[0].save(media/f'{name}.gif',save_all=True,append_images=frames[1:],duration=[s['durationMs'] for s in scenes],loop=0,optimize=True,disposal=2)
        for idx in sorted(set([0,len(frames)//2,len(frames)-1])): frames[idx].save(root/f'.tmp/media/{name}-{idx}.png')
if __name__=='__main__': main()
