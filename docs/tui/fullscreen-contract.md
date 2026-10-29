# Native fullscreen baseline contract

Status: phase 1 contract accepted at
`6ca69a0343d3811e9e8c0dd8fd47918ad33d9c19`; phase 2 explicitly activated on
2026-10-29. Phase 1 changed only this document. Phase 2 qualification results
belong to `docs/evidence/fullscreen/report.md` and its actual capture provenance.

## Binding and ownership

Verified on 2026-10-29 through T3 `t3_worktree_status` and Git:

- App worktree and Git root:
  `$BASELINE_WORKTREE`.
- App and Git branch: `t3/native-fullscreen-contract`.
- Initial HEAD, requested parent and merge-base:
  `da5eb98041881658f9e30542b21cba2dfb63eafe`; initially clean.
- App project root: `$PROJECT_CHECKOUT`.
- No `AGENTS.md` or `CLAUDE.md` was found in this worktree or its filesystem
  ancestors. Read README, the interactive and Relay contracts, runtime verifier
  and runtime/workspace/header documentation. This task's narrower ownership
  overrides historical implementation assignments in those contracts.

The parent already contains active Relay work. That implementation belongs to
its existing owners. Handoff consists only of exact scoped commits descended
from this parent; no feature merge, duplicate Relay implementation or PR.
Coordinator owns integration, publication, review, PR and eventual platform
qualification. No grandchildren or concurrent source writers.

After explicit activation, writable scope is frozen to:

1. NEW `tests/pi-fullscreen-actual.test.ts`.
2. NEW files beneath `docs/evidence/fullscreen/` listed below.
3. This contract, `docs/tui/fullscreen-contract.md`.

No existing test, product, CLI, installer, extension, provider, auth, manifest,
shared README or historical provenance edits. No renderer fork. Monochrome B
header remains unchanged. Unsupported behavior becomes a concrete gap report.
No full gates, CI watch, merge, paid cloud or Claude calls, active Relay sessions
or user shell rc. First phase 2 checkpoint within 15 minutes; handoff within
30 minutes of activation, including honest blockers and incomplete cases.

## Target and inspected native surface

Qualify the actual project-local pinned Pi **1.4.0** release, associated with
source `4a080252f06caf63a525d7873c5d94d3c23887e0`. Artifact hashes and full bundle
identity come from existing `contracts/pi-runtime.json` and the read-only
`verifyPiRuntime(): PiRuntime` export in `src/runtime/pi.ts`. Version text alone
is insufficient. Historical source
`b857fbd8a9225ab7b0c15d7a6965b2f109c9317a` is distinct and supplies no release
qualification here. Existing historical documents/evidence remain intact.

Source inspection at the release commit establishes a proposed native baseline:

- [`chat-viewport.ts`](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/modes/interactive/chat-viewport.ts)
  exports `createChatViewport`, constructing a primary transcript `ScrollView`
  with follow-end and a fixed bottom dock containing pending messages, status,
  above-editor widgets, editor, below-editor widgets and footer. The editor has
  a three-row minimum; transcript/dock allocations can shrink.
- [`interactive-mode.ts`](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/modes/interactive/interactive-mode.ts)
  mounts that layout for the fullscreen renderer. The header is part of the
  transcript document; this contract does not require it to stay fixed.
- [`ScrollView`](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/tui/src/components/scroll-view.ts)
  disables following when scrolling away from the end, preserves the bounded
  offset on content growth and restores following with `scrollToEnd()`.
- [`TuiAltScreen`](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/tui/src/tui-alt-screen.ts)
  handles transcript keys, application selection and mouse sequences. Its
  source supports a configurable return-to-end indicator; neither an unread
  counter nor its appearance in the actual Pi host is assumed.
- [`args.ts`](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/cli/args.ts)
  accepts `--tui-mode fullscreen`, which is also the source default. Use the
  explicit flag so the observed baseline is unambiguous.

Downloaded source stays ignored beneath `.tmp/fullscreen-source/<release-sha>/`.
Inspected file SHA-256 values, in the same order for viewport, ScrollView,
TuiAltScreen and TUI keybinding definitions, are:

```text
chat-viewport.ts 24bbdd06a5e17d6c0631f7de51329eb7bb4ecd4a460dec7b3d593ff9e6219960
scroll-view.ts   76dfd9f8a88cabc064f0652b83f16a945fbc988c9fe7c0423a4cd796907ef77d
tui-alt-screen.ts 19e24779ad040c55b535bf04993c9bce30611fca3c9b7a7219020c084f9be68e
keybindings.ts   475760dd4e3d02eca46bb5ee8704cd387c397b40d7a1f8967bdac3c481f5f702
```

These are source findings, not actual PTY passes or reproducible-build proof.
The user's goal is a Codex-like bottom composer with a separately scrolling
transcript. First determine whether native fullscreen already satisfies it.
`setEditorComponent` replaces the editor inside its container; it is not a
supported host viewport rewrite and will not be used to simulate this result.

## Keys to verify, not invent

The pinned [`TUI definitions`](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/tui/src/keybindings.ts)
and [`keybinding guide`](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/docs/keybindings.md)
define the following defaults for this isolated configuration:

| Input | Native action and qualification target |
| --- | --- |
| Up / Down | `tui.editor.cursorUp` / `cursorDown`: caret within multiline text, older/newer prompt history at its boundaries. Dedicated history actions have no default binding. |
| Left / Right, Home / End | Editor caret movement; Home/End are line boundaries. |
| Ctrl+J; bracketed paste | Insert newline; paste multiline text without submitting it. Shift+Enter is also defined, but its physical delivery depends on the terminal protocol. |
| PageUp / PageDown | `tui.altScreen.pageUp` / `pageDown`: transcript movement takes precedence over editor page actions when the transcript owns these keys. Close overlays before this check. |
| Ctrl+Home / Ctrl+End | `tui.altScreen.top` / `bottom`: transcript start; transcript end and follow-output restored. |

Half-page and single-line transcript actions are unbound by default. Do not
advertise universal alternative keys. Record exact injected bytes and active
keybindings for the tested host. Physical terminal interception, platform
overrides, overlay precedence and keyboard protocol negotiation limit claims.
Ctrl+C has selection-copy/application-clear behavior; it is not an unconditional
copy key. Do not invoke OS clipboard helpers during automated qualification.

## Phase 2 files, exports and dependencies

All fixture code is test-only; no production exports or dependency changes.

| Exact path | Role / exports |
| --- | --- |
| `tests/pi-fullscreen-actual.test.ts` | Bun opt-in actual PTY cases; module exports no API. Uses existing `verifyPiRuntime` and pinned JSON metadata read-only. |
| `docs/evidence/fullscreen/fixtures/native-display.ts` | Default export `fullscreenFixture(pi)` loaded explicitly by actual Pi. Uses pinned `ExtensionAPI` structural surface; no package install. |
| `docs/evidence/fullscreen/fixtures/screen.ts` | Test-only `TerminalScreen` export: bounded terminal output replay, `write(bytes)`, `resize(cols, rows)`, `snapshot()` returning cell rows and cursor. No Pi layout/editor implementation. |
| `docs/evidence/fullscreen/run.json` | Sanitized machine-readable identity, scenarios, assertions, safety counters, failures and cleanup. |
| `docs/evidence/fullscreen/terminal.ansi` | Sanitized actual PTY output with input/resize event offsets referenced from run.json. |
| `docs/evidence/fullscreen/screens.json` | Named settled cell-grid snapshots, cursor coordinates and dimensions, tied to the actual byte stream. |
| `docs/evidence/fullscreen/report.md` | Reproduction, acceptance results, gaps and limitations; links to those artifacts. |
| `docs/evidence/fullscreen/actual-text.html`, `docs/evidence/fullscreen/actual-text.png` | Optional actual screen-text rendering if trustworthy capture is available; explicitly labeled as below. No fabricated screenshot. |

Use existing pinned Bun 1.4.2, `bun:test`, Bun PTY support and standard library
APIs. No npm packages, global Pi, new manifest/lock, provider service or model
download. The test defaults to skipped unless `LAB_PI_FULLSCREEN_ACTUAL=1`:

```sh
LAB_PI_FULLSCREEN_ACTUAL=1 bun --no-env-file --no-install test tests/pi-fullscreen-actual.test.ts
```

Runtime verification failure must fail an opted-in run with its actionable
error; do not silently skip or substitute fixtures for actual Pi. No verified
Pi cache or node_modules existed in this worktree at phase 1 inspection.
The coordinator subsequently authorized copying the complete verified parent
bundle into this worktree's ignored cache and using the parent's verified Bun
read-only. The regular-file copy contained 211 files and this worktree's own
`verifyPiRuntime()` accepted it. Parent Bun 1.4.2 matched SHA-256
`35d20dd0263e5c950194434b925454fdfa9ba6e4467da960410fa05b08a7a5b5`.
No node_modules or package installation is needed. On this host sandbox-exec
accepted the network-deny profile and a loopback connect syscall returned EPERM;
the focused test repeats that prerequisite before starting Pi.

First actual case starts standalone Pi directly from `verifyPiRuntime().command`
under a PTY, without LAB launcher, Herdr, workspace extension or Relay. Native
fullscreen baseline and nested Herdr integration are distinct qualifications.
Nested Herdr is deferred to coordinator integration, not implied by baseline
results or an outer screenshot.

## Isolation and proof of no model request

Create a fresh private run root in ignored `.tmp/` with separate HOME, project,
agent, XDG configuration/cache/data/state and temp directories. Copy only the
owned fixture into this trusted synthetic project. Explicitly approve only that
project with `--approve`; never approve the repository or a user's project.
Use a minimal explicit environment, absolute executable paths and `shell:false`.
Never inherit account, key, proxy, provider, shell-rc or session configuration.

Start Pi with `--tui-mode fullscreen --offline --no-session --no-tools
--no-extensions --no-mcp --no-skills --no-prompt-templates --no-themes
--no-context-files --approve -e <owned-native-display.ts>`. Explicit `-e` remains
supported with discovery disabled. Set `PI_OFFLINE=1` and
`PI_SKIP_VERSION_CHECK=1`; disable telemetry/analytics, compaction, retry, cache
warming and `fullscreenCopyOnSelect` in the disposable settings. Offline mode
alone is not an inference gate.
No `--model`, provider registration, API key, endpoint, OAuth, saved route,
session resume, public fallback or loopback HTTP model fixture is allowed.

Fail closed before exercising inputs:

1. At `session_start`, require an absent routable model,
   `ctx.modelRegistry.getAvailable().length === 0` and the expected isolated cwd.
   Phase 2 corrected the phase 1 assumption that ctx.model would be undefined:
   actual release startup supplies the exact `unknown/unknown` placeholder from
   [`agent.ts`](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/agent/src/agent.ts#L58).
   Permit only undefined or that unregistered placeholder with API `unknown`,
   empty base URL, zero context window and zero max tokens. Record its actual
   identity; never label it an actual selected model or a successful request.
   Missing these invariants terminates the run. Source
   [`findInitialModel`](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/model-resolver.ts)
   permits no selected model when none is authenticated; interactive
   [`main.ts`](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/main.ts)
   permits that state. Actual startup must confirm it.
2. Handle ordinary submitted text with the supported `input` event returning
   `{action: "handled"}`. This allows native editor/history observation without
   a turn. Never call `sendUserMessage` or `sendMessage` with `triggerTurn:true`.
3. Install synchronous fatal tripwires on `before_agent_start` and
   `before_provider_request`: record the event and exit nonzero immediately.
   Do not rely on a thrown extension exception being propagated. Any agent or
   provider lifecycle event invalidates a successful run.
4. Deny child/descendant networking at the OS boundary for the actual run. On
   this macOS host use `/usr/bin/sandbox-exec` with a network-deny profile;
   do not assume availability or effectiveness on other platforms. If that
   boundary cannot be established, stop and report the blocker; never relax it
   or configure a reachable service to get a green result.

Record the empty available-model set, absent selected model, handled-input
counts, zero agent/provider events, active network-deny launch and exit status.
Use an intentional ordinary submission to verify the input guard. Never start
an agent turn to probe the fatal hooks. Their event ordering is a source finding;
zero observed events is not a runtime test of those hooks. If source inspection,
the absent-model invariant or OS network denial cannot establish the required
safety boundary, report the gap before continuing. No API key material, even
for a fake route, is needed.

The harmless extension uses only display messages through
`pi.sendMessage({customType, content, display:true}, {triggerTurn:false})` and
supported UI text/status/widget APIs. Incremental synthetic appends simulate
display activity, not model streaming. Bound content, timers and control-file
sizes. A private control/ack file pair in the disposable run root lets the driver
append messages and request `ctx.ui.getEditorText()` while preserving the draft.
Only enumerated actions are accepted; no arbitrary shell, path or code execution.
All fixture source is committed only under the owned new evidence directory.

## Acceptance and observation

Actual PTY input, actual rendered cells and fixture acknowledgments must agree.
Raw substring presence somewhere in output is insufficient to prove placement,
scrolling, draft contents or stability. The replay helper must handle the actual
control sequences used; unknown display-changing sequences make the affected
capture inconclusive. It must not manufacture layouts from expected results.
Settled screenshots/text grids measure visible boundaries and cursor positions;
fixture acknowledgments independently report logical draft and append progress.

| Case | Required observation |
| --- | --- |
| Bottom composer | At fixed terminal size and unchanged draft/widgets/status, record editor border, caret and footer rows before/after multiple bounded transcript appends. Rows stay stable while transcript content moves above the dock. Newest output is visible when following. |
| Multiline and Unicode | Bracketed paste literal LF text, CJK such as `漢字`, combining `e\u0301` and long wrapped lines. Verify exact logical draft, no accidental submission, correct displayed cell/caret behavior and no splitting/loss. Dock may grow upward with draft height; stable bottom anchoring is the invariant. |
| Caret and history | Exercise arrows inside multiline text and at history boundaries after handled synthetic submissions. Verify the expected caret/history draft and unchanged transcript position. Record any native history limitation rather than replacing the editor. |
| Transcript keys | With overlays closed, PageUp/Down change visible numbered transcript markers while draft stays identical. Ctrl+Home reaches earliest content; Ctrl+End returns to latest and restores follow-output. |
| Follow-output off | Scroll away from end, append new numbered display messages through control files, wait for append acknowledgment and rendered settling. Visible old markers and draft remain stable; no forced jump. Return to latest, then another append follows. An unread count is not required or claimed. |
| Wrapping and resize | Exercise 80x24, 160x50 and narrow 40x16, then return to 80x24, with a nonempty multiline draft and wrapped transcript. Verify bounds, no stale cells/overlap, draft preservation, usable transcript and dock. Record native clipping/minimum-size limits as gaps. Stable rows are compared within a fixed size/draft, not across sizes. |
| Pointer input | Inject complete and fragmented supported SGR wheel/left-click/drag/release sequences with copy-on-select disabled; include legacy/malformed variants as robustness probes. Draft must never gain pointer escape fragments. Confirm supported wheel transcript movement with draft unchanged; record unsupported sequence gaps. Do not inject middle/right-click paste actions. |
| Selection/copy | Record source-supported application selection and visible selection behavior if captured. Do not touch the user's clipboard or infer OS copy success. Physical selection, clipboard integration, right-click paste and emulator scrollback are unknown unless independently exercised. |
| Exit/cleanup | Clean exit using a native command or fixture `ctx.shutdown()`, bounded forced termination on failure, PTY EOF/close, owned child reaped, timers stopped and disposable files removed. No existing process/session is signaled. |

Use deterministic numbered synthetic messages, a bounded transcript (at most
200 messages / 128 KiB), acknowledged control steps and per-step deadlines of
at most 10 seconds. Bound each child lifetime to 120 seconds and the focused
qualification run to five minutes. Do not retry a failed case indefinitely.
Cleanup runs in `finally`, including on missing runtime, failed assertion,
timeout or guard termination. Only the owned PID/process group may be stopped;
no `killall`, shared socket removal or Relay cleanup.

## Evidence and handoff

Record full harness source HEAD plus dirty-state/owned-file hashes at capture
time, base SHA, Pi release source SHA, verified executable/bundle identity,
Bun version, OS/architecture, terminal protocol responses, dimensions, argv,
sanitized environment, scenario inputs, timestamps, exit status and cleanup.
Record fixture and capture-helper hashes and a SHA-256 for each evidence file
from run.json (excluding run.json itself). A later evidence commit references
the actual capture source revision; never backdate it to that commit's SHA.

Publish only synthetic, sanitized evidence beneath the owned directory. Raw
scratch remains ignored; no HOME/host paths, user history, credentials or account
data. Preserve control-byte fidelity when sanitizing ANSI; document replacements.
Prefer actual native terminal pixel capture when available. A browser/image
rendering of actual reconstructed screen text must visibly say **ACTUAL TEXT
CAPTURE**, identify source SHA/runtime/environment and explain that it is a
rendered text capture. No color/cursor/pixel claim beyond captured information.
Any design mockup must visibly say **DESIGN** and never serve as implementation
proof. A screenshot is optional; valid raw text evidence is required for passes.

Results use **PASS**, **FAIL**, **BLOCKED** or **UNKNOWN**, separately for source
inspection, standalone actual baseline and later nested integration. Physical
mouse behavior, IME composition, tmux, WSL and Windows Terminal remain UNKNOWN
unless explicitly tested in their own environments. Injected Unicode is not IME
qualification; macOS arm64 automation does not qualify another computer.

At phase 1 handoff return the full contract commit SHA, clean Git state and app
binding, then wait for explicit phase 2 activation. At the activated checkpoint
report dependency/safety blockers and first actual results. Final phase 2 handoff
returns only scoped commit SHAs, the focused command/result, evidence provenance,
acceptance gaps, cleanup and clean binding. No PR or publication from this owner.
