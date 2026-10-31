# Pixel LB terminal evidence

[Current terminal-text image](terminal-text.png) · [HTML](terminal-text.html) ·
[Capture receipt](capture.json).

These are fresh captures of the real Pi 1.4.0 / Herdr 0.9.5 workspace at clean
source `b4cc6d2a9b6c0ae468ed5f9af68a65d5d4cb6c24`, on Darwin arm64 with Bun 1.4.2.
The default split, initial dark dialog, applied/reloaded light dialog, compact
NO_COLOR UI and indexed recovery workspace all come from the same actual
appearance regression. No model requests occurred. Three owned sessions exited
with server/client/worker/socket cleanup confirmed.

The PNG is a browser rendering of native text, not live terminal pixels.
Frame colors, font and spacing are editorial; physical color/contrast, mouse,
IME, clipboard, WSL and tmux are not qualified by it. The indexed fallback
signal was observed by the regression; the pictured recovered workspace does
not claim to retain the earlier transient notice. The compact capture shows
the native 40×16 viewport, including its clipping.

The new terminal logo reads the exact approved 24×32 SVG grid. Solid cells use
full blocks, so the silhouette survives text-only capture without inventing
missing foreground/background colors. Text transcripts were not edited to
replace the old logo. Sanitization changes only owned filesystem paths to
same-width aliases, including terminal-truncated path prefixes; original and
sanitized hashes are separate in the receipt.

Reproduce from an installed clean checkout with project-local pinned runtime
caches (install using `PATH=/usr/bin:/bin ./install.sh` if needed):

```sh
LAB_HERDR_ACTUAL=1 LAB_BRAND_CAPTURE_DIR="$PWD/.tmp/pixel-lb-capture" \
  bun --no-env-file --no-install test ./tests/pi-appearance-actual.test.ts
python3 docs/evidence/pixel-lb/prepare.py .tmp/pixel-lb-capture
python3 docs/evidence/pixel-lb/render.py
```

Render the complete HTML with T3 `html_preview` at 1280 CSS pixels, light
appearance, and save the returned PNG. Review before updating `renderedAssets`
in the receipt and explicitly refreshing the publication manifest. Run `python3 docs/evidence/pixel-lb/audit.py` to verify the receipt,
render hashes and every captured logo row against the recorded Git source. CI
runs this read-only audit after the historical media audit. Private raw
captures stay in `.tmp`. Renderer/font versions can change rasterization.

The [previous terminal captures](../tui/README.md) and [historical startup media](../../demos/README.md)
remain unchanged as source-labelled history. They are no longer the current
README workspace image.
