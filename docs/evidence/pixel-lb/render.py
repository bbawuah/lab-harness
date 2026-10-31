"""Render sanitized, source-labelled native terminal text; no image retouching."""
from pathlib import Path
import html, json, hashlib
P=Path(__file__).resolve().parent
receipt=json.loads((P/'capture.json').read_text())
def panel(name,title,cls=''):
 text=(P/name).read_text()
 assert hashlib.sha256(text.encode()).hexdigest()==receipt['captures'][name]['sanitizedSHA256']
 return f'<figure><figcaption>{html.escape(title)}</figcaption><pre class="{cls}">{html.escape(text)}</pre></figure>'
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pixel LB — actual terminal text</title><style>
body{margin:0;color:#222;font:14px system-ui}p{line-height:1.5}small{color:#555}figure{margin:12px 0}figcaption{font-size:12px;margin:8px 0}pre{padding:18px;border:1px solid #888;border-radius:8px;overflow:auto;margin:0;font:11px/1 ui-monospace,monospace;background:#111;color:#fafafa}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.light{background:#fafafa;color:#080808}.hero{font-size:12px}.compact{font-size:12px}@media(max-width:700px){.grid{grid-template-columns:1fr}pre{font-size:9px}.hero{font-size:9px}}
</style><body><p><strong>PIXEL LB · ACTUAL TERMINAL TEXT</strong><br><small>Darwin arm64 · Pi 1.4.0 · Herdr 0.9.5 · Bun 1.4.2 · zero model requests.<br>Browser rendering of native text, not live pixels. Frame colors and font are editorial. Clean source SOURCE.</small></p>'''.replace('SOURCE',receipt['sourceSHA'][:8])
page+=panel('split.txt','Default workspace · Pi focused left / regular Bash right','hero')+'<div class="grid">'
page+=panel('light.txt','Light mode after Apply and native reload · staged dialog reopened','light')
page+=panel('dark.txt','Initial dark mode · staged appearance dialog')
page+=panel('compact.txt','40 × 16 compact UI · NO_COLOR text fallback','compact')
page+=panel('fallback.txt','Indexed-color recovery workspace · saved custom preferences retained')
page+='</div><p><small>All three owned runs exited with server/client/worker/socket cleanup verified. No provider requests. Historical captures remain archived separately.</small></p><script>addEventListener("load",()=>console.log(JSON.stringify({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})))</script></body></html>'
(P/'terminal-text.html').write_text(page)
print('Rendered verified sanitized terminal text.')
