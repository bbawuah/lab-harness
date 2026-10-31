# Owner branding in Pi startup

`src/pi/header.ts` is an opt-in Pi extension. It uses the supported
`session_start` → `ctx.ui.setHeader` API to replace the built-in startup logo
and keybinding hints. The actual header contains the monochrome pixel LB,
`LAB-HARNESS`, `Powered by Pi`, `Native LAB activation: BLOCKED`, and
`Request admission unqualified`. It registers only `session_start`, and does
nothing outside TUI mode. No tools, request hooks, acceptance or admission
behavior are added. This startup observation does not qualify native LAB.

The inspected Pi source is commit `b857fbd8a9225ab7b0c15d7a6965b2f109c9317a`:

- `packages/coding-agent/src/core/extensions/types.ts:209` declares `setHeader`.
- `packages/coding-agent/examples/extensions/custom-header.ts` demonstrates
  replacement of the built-in startup logo and keybinding hints.
- `packages/coding-agent/src/modes/interactive/theme/theme.ts:249` exposes
  `Theme.appearance`. The supplied theme is a live proxy; reading appearance
  on each render follows light/dark changes without caching rendered colors.

These APIs also exist in the inspected installed package 1.4.0. Structural
types describe only this extension's API subset, avoiding a runtime import or
new package dependency. It can be loaded explicitly with
`pi -e /absolute/project/src/pi/header.ts`. This only changes branding;
operators must still obey the native LAB activation refusal.

## Pixel LB terminal mark

`src/pi/terminal-mark.json` is extracted from the approved `pixel-lb-light.svg`
and `pixel-lb-dark.svg` assets. The generator pins their exact SHA-256 identities,
checks the six ordered tile paths and reads each integer SVG run without
resampling. The 24×32 grid preserves the README logo's silhouette and gutters.
Provenance is recorded in the generated JSON and `assets/branding/PROVENANCE.json`.

The runtime uses 24 columns × 16 rows of terminal cells. Full foreground cells
use U+2588; partial cells use upper/lower half-blocks. Thus the silhouette remains
intact even when a capture API drops ANSI colors. Neutral indexed foregrounds
approximate the light/dark asset fills. Transparent cells retain the terminal
background. This assumes terminal cells approximately twice as tall as wide.

The full logo appears only when it fits beside all header text and detected color
support is available. Narrow terminals, `NO_COLOR`, `TERM=dumb`, or missing color
support use `[LB] (text fallback)`. All text wraps to the supplied columns;
zero/invalid widths render no lines. Old themes default to the dark palette.

## Fixture checks

These commands render fixtures without launching Pi or making model calls:

```sh
bun --no-env-file --no-install scripts/pi/render-header.ts --columns 80 --appearance dark
bun --no-env-file --no-install scripts/pi/render-header.ts --columns 80 --appearance light
bun --no-env-file --no-install scripts/pi/render-header.ts --columns 28 --no-color
bun --no-env-file --no-install scripts/pi/derive-terminal-mark.ts --check
bun --no-env-file --no-install test tests/pi-header.test.ts
```

The focused tests verify exact source hashes and integer-grid extraction,
lossless text-only silhouette reconstruction, dimensions and gutters, neutral
ANSI colors, all widths 1–120,
no-color/dumb/narrow fallback, attribution/blocked labels, and TUI-only
registration. Fixture rendering and actual startup are separate evidence.

## Actual no-model startup, 2026-10-29

`scripts/pi/smoke-header.ts` runs the already-installed Pi through a fresh,
owned disposable Herdr server/pane. It requires explicit `--herdr`, `--pi`
and `--node` paths; it installs nothing. Herdr's binary must match an official
artifact hash in `contracts/herdr-source.json`. The installed Pi package is
checked for version 1.4.0 and its runtime `--version` is checked in the isolated
environment before startup. Review flags and startup code before using a
different Pi build; version equality alone is not byte identity.

Example invocation, substituting local absolute executable paths:

```sh
bun --no-env-file --no-install scripts/pi/smoke-header.ts \
  --herdr /absolute/herdr --pi /absolute/pi --node /absolute/node
```

The Pi argv is exactly:

```text
--offline --no-extensions --no-mcp --no-skills --no-prompt-templates
--no-themes --no-context-files --no-session --no-tools
-e /absolute/project/src/pi/header.ts
```

Before launching, the installed `dist/cli/args.js`, `dist/main.js`,
`dist/core/agent-session-services.js`, `dist/core/model-runtime.js` and startup
UI source were inspected. Explicit `-e` paths still load with
`--no-extensions`; `--no-tools` disables built-in and extension tools.
`PI_OFFLINE=1` disables remote catalog refresh. Pi still initializes its
built-in local model metadata; no remote model discovery command or provider
request is invoked. No prompt or pane input is submitted. First-time setup
is bypassed by the explicitly isolated agent directory.

The subprocess environment is an allowlist, with disposable HOME, XDG paths,
TMPDIR, `PI_CODING_AGENT_DIR` and unique Herdr socket/config/session. It
inherits no credential, proxy, user settings or session variables. It uses
a non-login shell and an explicit Node executable. All written state and
raw observations remain in ignored `.tmp/p-*` directories. Only the owned
server's socket is contacted, using `ping`, `workspace.create`, `layout.apply`,
`pane.read`, `pane.process_info`, `pane.close` and `server.stop`. No live user
sessions are accessed. Cleanup verifies server exit, both socket files absent,
and the owned Pi PID absent; it never signals a discovered PID.

Observed on macOS arm64, Node 24.16.0:

- Actual installed Pi `--version`: **1.4.0**; bundle SHA-256
  `e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774`.
- Herdr ping: **0.9.5**, protocol **22**; official macOS arm64 binary SHA-256
  `fb77c2232a05a8035421382c894392f4174e4e38a18e48af3dd0290157c3a7e2`.
  This official runtime differs from the historical Herdr source pin.
- `pane.process_info` identified the owned foreground process as `node`,
  argv0 `pi`, with its PID matching the exec wrapper's recorded PID.
- `pane.read` with `source=visible` returned the following actual header
  (color is absent from this text observation):

```text
▀▀▀▀▀ ▀▀▀▀▀▀▀▀▄▄
▀▀▀▀▀ ▀▀▀▀▀▀▀▀▀▀▀
▀▀▀▀▀ ▀▀▀▀▀▀▀▀▀▀▀▀
▀▀▀▀▀ ▀▀▀▀▀▀▀▀▀▀▀▀   LAB-HARNESS
▀▀▀▀▀ ▀▀▀▀▀▀▀▀▀▀▀    Powered by Pi
▀▀▀▀▀ ▀▀▀▀▀▀ ▀▀      Native LAB activation: BLOCKED
▀▀▀▀▀ ▀▀▀▀▀▀ ▄▄▄     Request admission unqualified
▀▀▀▀▀   ▀▀▀▀ ▀▀▀▀
▀▀▀▀▀      ▀ ▀▀▀▀▀
▄▄▄▄▄▄▄▄▄▄▄▄ ▄▄▄▄▄
▀▀▀▀▀▀▀▀▀▀▀▀ ▀▀▀▀
 ▀▀▀▀▀▀▀▀▀▀▀ ▀▀▀
```

Pi listed only `header.ts` under extensions and warned **No models available**.
It reported missing fd/ripgrep and skipped their download in offline mode.
The built-in Pi logo/keybinding header was replaced successfully. Both plain
and `strip_ansi=false` pane text observations omitted color attributes; these
observations establish visible geometry/text, while the neutral-color checks
are fixture evidence. Pane close and server stop were acknowledged; server
exit, Pi process exit and socket removal were all verified without errors.

The startup check proves branding on this installed runtime only. It does not
exercise inference, request admission, native LAB activation, provider retry,
compaction, model switch, resume, Linux or WSL, and is not a network-egress
audit. The operator CLI exposes `header` for local rendering and `pi-ui-smoke
PI_PATH NODE_PATH` for this bounded owned startup. Default checks and CI exercise
the deterministic mesh and header fixtures without requiring Pi. Actual startup
remains an explicit local opt-in, with its runtime identity recorded above.

## Native interactive workspace label

The separate `workspace-extension.ts` uses `renderHeader({ workspace: true, ... })`
with `Interactive coding workspace` and `Controlled LAB tasks: unavailable`.
This describes executing native Pi accurately while preserving the separate
controlled-task limitation. Default rendering and the standalone header extension
retain their legacy blocked activation labels. See `pi-workspace.md` for the
actual standalone 1.4.0 release API and attachment evidence.
