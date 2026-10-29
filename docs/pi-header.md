# Owner branding in Pi startup

`src/pi/header.ts` is an opt-in Pi extension. It uses the supported
`session_start` → `ctx.ui.setHeader` API to replace the built-in startup logo
and keybinding hints. The actual header contains the canonical monochrome B,
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

## Canonical terminal mesh

`src/pi/terminal-mark.json` is generated from the two owner-authorized SVGs:

- `assets/branding/terminal-b-light.svg`: SHA-256
  `8aab0cd157a63c0d1982fcedadcddd3fd300e7227ac8f8431a4f3860c7723e71`.
- `assets/branding/terminal-b-dark.svg`: SHA-256
  `5a46de364f7019736c6202e0f81384fc8ac1d87d68a46f515b740d2ebc5b8c29`.

The provenance refers back to `assets/branding/PROVENANCE.json`. Owner
authorization covers this adaptation; no general reuse license is granted.
There is no private source-repository dependency and no runtime rasterizer.

The offline generator reads the actual six SVG clip paths and four gradient
spots. It flattens each cubic curve in 32 steps, samples each output pixel on
an 8×8 grid, and composites the four radial overlays in SVG order. A pixel
must have at least 80% coverage by one tile. This conservative threshold
keeps gutters open at low resolution. The resulting 18×24 neutral-gray
pixels use 18×12 terminal cells, with upper/lower half-blocks and neutral
256-color grayscale indices 232–255. This assumes terminal cells roughly
twice as tall as they are wide; low resolution necessarily approximates
curves and gradients. The runtime performs only palette quantization and
half-block composition of the bounded stored samples.

The mesh is shown at widths of at least 50 columns with detected color
support. Narrow terminals, `NO_COLOR` (including an empty value), `TERM=dumb`,
and terminals without detected 256-color/truecolor support use
`[B] (text fallback)`. The fallback is explicitly identified and retains
the name, attribution and blocked status. All text wraps to the supplied
columns; zero/invalid widths render no lines. Older themes without an
appearance property default to the dark palette. Header text uses the
terminal's default foreground; only the mesh emits neutral color escapes.

## Fixture checks

These commands render fixtures without launching Pi or making model calls:

```sh
bun --no-env-file --no-install scripts/pi/render-header.ts --columns 80 --appearance dark
bun --no-env-file --no-install scripts/pi/render-header.ts --columns 80 --appearance light
bun --no-env-file --no-install scripts/pi/render-header.ts --columns 28 --no-color
bun --no-env-file --no-install scripts/pi/derive-terminal-mark.ts --check
bun --no-env-file --no-install test tests/pi-header.test.ts
```

The five focused tests verify exact source hashes and deterministic mesh
reproduction, dimensions and gutters, neutral ANSI colors, all widths 1–120,
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
