# Native Pi fullscreen: actual standalone PTY baseline

**Result: FAIL, with 11 of 12 scenarios passing.** Native Pi kept its composer
at the bottom and supported transcript scrolling in this run. One delayed,
fragmented mouse sequence inserted its tail into the draft. This is an observed
qualification gap; no product change or renderer fork was made.

The actual Pi child exited 0; the opted-in Bun test exited 1 because it asserts
all acceptance scenarios pass. The detailed result and exact inputs are in
[run.json](run.json), with [actual terminal output](terminal.ansi) and
[reconstructed screen cells](screens.json). The optional
[ACTUAL TEXT CAPTURE](actual-text.html) displays selected captured cell grids;
the [PNG](actual-text.png) is a browser screenshot of that rendering. It is
rendered text, not a native terminal pixel screenshot.

## Identity and boundaries

- Capture source HEAD: `061f2ce189ffa65656d6af72dd1479a4c8ef18c8`;
  `dirtyAtStart` was empty. Base parent:
  `da5eb98041881658f9e30542b21cba2dfb63eafe`. Evidence was written after
  capture, so the later evidence commit is not represented as the source HEAD.
- Captured 2026-10-29 22:25:53–22:26:06 UTC, macOS 27.0.1 / Darwin 27.0.0,
  arm64, pinned Bun 1.4.2. The verified official standalone Pi 1.4.0 bundle
  has executable SHA-256 `b4d93b78e542ca8d1792242cf6c1a875ef4e6fb644141fb4cf67ec7c81ef9b14`
  and tree SHA-256 `34e8b644b7ec49b405e4c94658cb57623417d2d3e53f636393802788f8d2079a`.
  Release source is `4a080252f06caf63a525d7873c5d94d3c23887e0`, distinct from
  historical pin `b857fbd8a9225ab7b0c15d7a6965b2f109c9317a`. The verifier
  checked the complete copied 211-file project-local bundle. These artifact
  hashes do not constitute a reproducible-build attestation of the source tag.
- Standalone actual Pi ran under Bun's PTY and `sandbox-exec` with
  `(version 1)(allow default)(deny network*)`; the preflight's direct libc
  loopback connect returned `-1`, `errno=1` (`EPERM`). No listener was started.
  Bun's Node-compatible socket wrapper had separately reported `ECONNREFUSED`
  for the same denied operation, so the preflight checks the syscall result,
  not that wrapper's error mapping.
- HOME, cwd, agent and XDG paths were private disposable directories. Discovery,
  tools, MCP, sessions and startup network were disabled. Available models: 0;
  Pi's exact unregistered `unknown/unknown` placeholder had an empty base URL.
  Three synthetic ordinary inputs were handled by the fixture; recorded
  `before_agent_start` and `before_provider_request` events were both 0. No model, provider, endpoint or account was
  configured, and no agent turn was started. Custom display messages simulated
  appends, not provider streaming. See the contract for the fatal guards and
  the release source's placeholder behavior.
- The fixture acknowledged shutdown, the owned process exited 0 and was reaped,
  PTY EOF was observed and the PTY closed, and the disposable run root was
  removed. Clipboard copying was disabled for these synthetic pointer checks.

The input event offsets in `run.json` refer to bytes of `terminal.ansi`. Paths
were replaced with equal-length `~` characters, preserving the captured control
bytes and text columns. No personal history was used. The replay reports no
unknown sequences or buffered partial output. It captures text/cursor cells;
it does not reproduce colors, selection highlighting, or physical pixels.

## Observations

| Scenario | Result |
| --- | --- |
| No-model input guard and no agent/provider events | PASS |
| 80x24 composer position across transcript appends | PASS: editor borders remained at zero-based rows 18 and 20, caret at row 19; newest numbered message changed from 040 to 045. |
| PageUp while output arrives | PASS: visible numbered markers and their rows remained stable, as did the draft and caret. |
| PageDown, Ctrl+Home, Ctrl+End and follow restoration | PASS: moved among markers, reached 001 at start and followed through 049 after returning to the end. An actual `Jump to latest message · Ctrl+End` label was observed; no unread counter is claimed. |
| Multiline bracketed paste, CJK, combining text, caret and history | PASS: synthetic draft and caret observations agreed; history restored the submitted text with trailing whitespace trimmed. Ctrl+J inserted a newline without submission. A short grapheme probe checked CJK two-column movement and deletion of `e` plus combining accent as one grapheme. |
| 160x50, 40x16, 80x24 resize and wrap | PASS: draft/caret bounds, transcript and dock remained usable; output included an actual screen-clear sequence after each resize. |
| Complete SGR wheel/left-click/drag/release, legacy wheel and unsupported numeric SGR code | PASS: tested bytes did not change the draft; SGR wheel moved the transcript. Selection copy was disabled and highlighting was not measured. |
| SGR fragments with a requested 5 ms delay | PASS: tested sequence did not change the draft. |
| SGR fragments with a requested 250 ms delay | **FAIL**: `ESC [ < 64 ;`, then `10;5M` after the timer, changed the synthetic draft from `漢X字` to `漢X10;5M字`. Both snapshots and exact input offsets are recorded. |

The pinned [stdin buffer](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/tui/src/stdin-buffer.ts#L20)
defines a 50 ms sequence timeout. That is consistent with the delayed split
result, but this capture does not independently establish the internal cause.
The delay is the requested timer duration, not an independently measured
inter-arrival time. This synthetic PTY case does not establish the
frequency or behavior of physical mouse input in a particular terminal.

## Reproduction and limits

Use Bun 1.4.2 matching the repository pin and an intact project-local Pi bundle;
the command refuses an unavailable or altered runtime. On the tested macOS
arm64 environment:

```sh
LAB_PI_FULLSCREEN_ACTUAL=1 /path/to/verified-bun --no-env-file --no-install test tests/pi-fullscreen-actual.test.ts
```

The test writes `run.json`, `terminal.ansi` and `screens.json` in this evidence
directory. A fresh run has its own source SHA and dirty state; regenerate any
rendered presentation and report before treating them as that run's evidence.
Without `LAB_PI_FULLSCREEN_ACTUAL=1`, the focused test is skipped.

Nested LAB/Herdr attachment, physical mouse operation, physical keyboard
interception, IME composition, clipboard integration, native pixel capture,
tmux, WSL and Windows Terminal remain **UNKNOWN**. These standalone synthetic
display results do not qualify provider streaming, model inference, another
machine, or the LAB header appearance. The coordinator owns integration and
any decision about the delayed-fragment gap.

## Independent review and integration note

The independent read-only review of artifact commit `9e173cafcb4b8e8a395e154a257e6f2e9d8a412b`
found no blocker to retaining this baseline, while preserving its explicit
**FAIL (11/12)** qualification. The delayed fragment changed the logical draft
reported by `ctx.ui.getEditorText()`, independently of screen replay. No
physical-mouse frequency or renderer-fork conclusion follows.

A reviewer replay matched 36 of 37 sanitized snapshots. At `resize-40x16`, one
sanitized footer suffix was `...` in replay versus `~~~` in `screens.json`;
the cursor matched. This path-sanitization discrepancy does not affect the
asserted draft, caret, numbered transcript markers or dock observations. The
bounded replay is not a complete terminal emulator or exhaustive Unicode/cell
proof. Keep the two artifacts as captured rather than relabel the mismatch.

This integration imports the exact captured test and fixture bytes. Only the
contract's human host-path documentation was replaced with public placeholders;
its recorded capture-time hash still identifies the original document at
`061f2ce`. The captured source and runtime identities remain unchanged. The next
bounded investigation would measure actual fragment arrival around the native
timeout, then qualify the intended physical terminal and nested Herdr flow.
