# Recorded harness media

These assets replay actual command output at source commit
`93a831c4dbfe774f3c4a025f7c70334ae0f3e6b4`. They are rendered output cards,
not desktop recordings or raw terminal pixel captures. Displayed JSON is a
selected projection; [exact command records](../media/commands.json), adjacent
JSON and UTF-8 transcripts retain the displayed values and full source hashes.
Inputs and omitted fields are identified below. No inference or paid model call
was made. Native Pi activation and request admission remain blocked/unqualified.

| Asset | Evidence and alt text | Transcript |
| --- | --- | --- |
| [Terminal lifecycle](../media/terminal-lifecycle.gif) | Real owned Herdr worker, SQLite ledger and pinned Relay; fixture-only task envelope. Shows `result_available` and null acceptance, verified cleanup, then a **separate explicit test-operator accept command**. No model acceptance. | [Text](../media/terminal-lifecycle.txt), [selected output](../media/terminal-output.json), [accept output](../media/test-operator-accept.json) |
| [Offline search](../media/offline-search.gif) | Deterministic disposable text fixture searched by the actual fallback engine. Shows relative path, one-based line and full SHA-256; context verifies, then refuses changed bytes with `STALE_CONTEXT_SOURCE`. Candidate identity is explicitly fixture input. | [Text](../media/offline-search.txt), [output and fixture bytes](../media/search-output.json) |
| [Skills](../media/skills-discovery.gif) | Actual discovery/select of the bundled `terminal-evidence` skill; full instruction/bundle hashes, compatibility and dependencies. Final scene reads **committed sanitized inventory metadata**, not live user roots. Static dependencies are not operational qualification. No skill body is published or code executed. | [Text](../media/skills-discovery.txt), [output](../media/skills-output.json) |
| [Pi startup](../media/pi-startup-text.png) | Rendered excerpt of actual Pi 1.4.0 startup in an owned disposable Herdr pane. Header, attribution, blocked status and offline warnings are captured. The pane API drops foreground/background colors, even with `strip_ansi=false`; no colors were inferred. | [Complete selected region](../media/pi-startup.txt), [observation and cleanup](../media/pi-startup.json) |
| [Dark palette](../media/header-dark.png), [light palette](../media/header-light.png) | **Fixture palette renders**, from actual `render-header.ts` output. These are not light/dark Pi runtime screenshots. The existing smoke helper sets dark theme only. Both use the same source-derived canonical B mesh. | [Dark ANSI](../media/header-dark.ansi.txt), [light ANSI](../media/header-light.ansi.txt) |

Each GIF is 728px wide, three six-second scenes, 18 seconds total, looping.
Command execution/polling waits are omitted or compressed into scene boundaries;
reading holds are extended to six seconds. This is an edited replay, not elapsed
time or a performance claim. Hashes wrap intact; no lines are clipped. Use the
full-size asset or text transcript on mobile; README animation text scales with
the viewport. Stable JSON fields are projected to remove unrelated output.
`[CHECKOUT]`, `[PI_PACKAGE]`, `[PI]`, `[NODE]`, `[HERDR]`, `[OWNED_RUN]`,
`[OWNED_FIXTURE]`, `[OWNED_ORIGINS]`, `[TASK]` and `[ID]` are privacy aliases in
recorded commands/cards, not literal reproduction arguments. Raw ANSI transcripts preserve original terminal
padding, including trailing spaces. Commands use the
actual Bun entry point; there is no installed `lab` binary.

The full pane footer (working directory, branch and counters), process/session
identifiers, logs, raw run directories, UUIDs and acceptance timestamp are
omitted. Pi package references use the supplied/resolved package root, so custom
and Linux install roots are handled without a fixed home-directory assumption.
An unaliased absolute path causes publication to fail closed. Private full raw
captures remain ignored under `.tmp/media`; none are required for README use.
The worker output is represented by its original byte hash, not a fabricated
marker or published per-run nonce. Selected source/skill hashes remain exact.

[Provenance](../media/PROVENANCE.json) records source-file identities, executable
runtime versions/hashes (also in the startup and terminal observations), font and
renderer identity, pinned Pillow wheel identity, file sizes and frame durations.
Herdr release 0.9.5 differs from its inspected source pin; it remains labelled.
The Pi bundle matches the reviewed 1.4.0 identity. Node here is 22.23.3, distinct
from the earlier 24.16.0 run documented in `docs/pi-header.md`.

## Reproduce locally

Work in a disposable checkout. Capture commands write only project-local ignored
state and media. Supply the already-installed, reviewed Pi and Node executable
paths privately; the capture script resolves them and publishes aliases. Herdr
acquisition verifies the manifest-pinned release into `.tmp/herdr`. It can require
network access; subsequent captures use its verified cache. No global install,
user settings/session access or live skill-root scan is needed.

```sh
bun --no-env-file --no-install scripts/herdr/acquire.ts
python3.14 -m venv .tmp/media/py314
.tmp/media/py314/bin/pip --cache-dir .tmp/media/pip-cache \
  install --only-binary=:all: Pillow==12.0.0
.tmp/media/py314/bin/pip --cache-dir .tmp/media/pip-cache \
  download --only-binary=:all: --no-deps Pillow==12.0.0 --dest .tmp/media/wheels
# Set PI_PATH, NODE_PATH and FONT_PATH privately to local absolute paths.
python3.14 docs/demos/capture.py --pi "$PI_PATH" --node "$NODE_PATH" \
  --test-operator-accept
.tmp/media/py314/bin/python docs/demos/render.py --font "$FONT_PATH"
.tmp/media/py314/bin/python docs/demos/audit.py --font "$FONT_PATH"
```

The explicit `--test-operator-accept` authorizes acceptance of this disposable
fixture task only, via a new CLI subprocess after inspecting `show`. Startup
uses the existing reviewed smoke helper with isolated HOME/XDG/agent state,
offline/no-tools/no-MCP/no-discovery/no-context/no-session flags, and no prompt
or pane input. Successful cleanup must confirm pane/server stop, socket removal
and worker exit. The script refuses a different Pi bundle. Future runtime/build
changes require review rather than assuming matching version numbers suffice.

Rendering uses Python 3.14.7, Pillow 12.0.0, FreeType 2.14.1 and the operator's
local Menlo font for this capture. No font, binary, source bundle or third-party
asset is included. Other locally licensed monospace fonts can be supplied; their
metrics and raster output will differ. The renderer reads both combined SGR
`38;5` foreground and `48;5` background sequences and fills U+2580/U+2584 cell
halves with exact rectangles. The audit samples both halves against captured
ANSI, checks privacy refusal, GIF sizes/durations and frame bounds. Actual
startup text gets only the returned glyph data, with the card's neutral canvas.
The first Python 3.15 Pillow source build lacked FreeType; final assets use the
pinned binary wheel in the project-local Python 3.14 environment.

Visual review covers first/middle/last frames of every GIF, both fixture
palettes and the actual startup text image. Review helpers stay ignored under
`.tmp/media`. Normal cleanup of the owned processes was verified; crash,
SIGKILL, network-egress, inference, WSL and native admission behavior are not
qualified by these images.

## Coordinator integration

Root README and publication manifests are coordinator-owned. Suggested root
README embeds (keep the evidence captions and mobile transcript links):

```markdown
![Real Herdr/SQLite/Relay with fixture task envelope: result available, then separate test-operator acceptance](docs/media/terminal-lifecycle.gif)
[Full-size and transcript](docs/demos/README.md)

![Actual offline search on a disposable fixture: path, line, hash and stale-source refusal](docs/media/offline-search.gif)
[Transcript](docs/media/offline-search.txt)

![Bundled skill discovery and sealed selection; committed inventory dependency metadata](docs/media/skills-discovery.gif)
[Transcript](docs/media/skills-discovery.txt)

![Actual Pi 1.4.0 startup text, faithfully rendered; pane API omits colors, not a raw pixel capture](docs/media/pi-startup-text.png)
[Observation and limits](docs/demos/README.md)
```

Add the fixture palette pair only with a **fixture** caption. This additive
worker PR intentionally leaves the publication allowlist unchanged. The
publication check will report unlisted media/docs until the coordinator reviews
and refreshes the allowlist and current identities during ordinary integration.
No runtime source changed in this media slice.
