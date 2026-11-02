# Built-in owned browser workspace contract

Implementation starts from main `6cf72d117b26af2661803e50610776c43fa22e4f`. Historical PR19 experiment code, evidence and paid-attempt markers are immutable. No model/cloud/auth calls are authorized for this feature validation.

## Operator experience

`lab --browser https://example.test/path` opens a fresh owned headless browser for this LAB run. `--browser-executable /absolute/path` optionally selects an approved Chrome/Chromium/Edge executable. No personal profiles, existing tabs, CDP attach, browser download or extension installation. Ordinary `lab` needs no browser. Missing assets/browser produce an actionable browser-feature error. `/lab-browser status` reports origin and lifecycle; `/lab-browser close` closes this run only. Reopening requires a new LAB run in this slice.

A provider-neutral `lab_browser` tool exposes snapshot, same-origin navigate, fill, click and read text. Actions use fresh `@eN` references from the most recent snapshot; no arbitrary selector/eval/file/shell/launch parameters. Navigation and mutations invalidate refs. Tool results retain untrusted-page boundary and exact semantic data; native renderers summarize calls/results while details retain machine data. Page text is data, not instruction. No integration depends on held PR17/18.

## Platforms, acquisition and boundary

Pin agent-browser 0.41.0 / source `1453dd37a40c730fe00f592bc32198a896ff8747` (Apache-2.0), official one-shot MCP. macOS arm64 is the actual validation platform; macOS x64 and Linux x64 artifact support is source/installation support until executed there. Native Windows and WSL-to-Windows Edge are outside this slice. An approved same-OS browser must already exist. Explicit optional browser setup acquires only the pinned tool; offline setup accepts verified cache only. Normal launch never acquires browser assets implicitly.

Each run owns a private root, unique session, config, ephemeral browser profile and minimal credential-free subprocess environment. Explicit AGENT_BROWSER_CONFIG/SESSION propagate through MCP. Exact initial HTTP(S) origin (no URL credentials) binds model navigation; hostname allowlist is defense in depth, not a network sandbox or zero-egress guarantee. Redirects/new targets must be detected and fail closed before further model actions; this cannot undo a site-triggered request. No cookies/password extraction or personal data trials.

## Lifecycle and failure

Serialize operations within a run; independent roots permit simultaneous LAB runs. Bound input, output and execution time; reject unknown/truncated/oversized semantic data instead of slicing refs. Do not retry uncertain mutations. Cancellation/timeouts invalidate and close the owned browser; normal Pi shutdown and outer LAB finally also close it. Cleanup must verify owned close/profile removal; retain uncertain state and report failure instead of claiming cleanup. Never kill unowned processes or delete shared roots. No changes to ledger admission, Relay vendor, provider engine or appearance storage.

## Owned files and acceptance

Own new `src/browser/**`, browser-specific Pi extension, `contracts/agent-browser-source.json`, explicit acquisition script, focused tests/evidence/docs. Narrow integration edits: `src/pi/workspace.ts`, extension/commands types and registration, `scripts/start.ts`, `lab`, optional install entrypoint, package scripts, README, publication manifest and final immutable bootstrap pin. Preserve all unrelated main behavior.

Acceptance: meaningful parsing/projection/error/cancel tests; pinned native owned loopback navigation/snapshot/fill/click/independent assertion, origin and ref refusal, two concurrent isolated sessions, cleanup and missing/offline cases. Exercise normal LAB + Pi + Relay + Herdr with a synthetic local protocol fixture, no cloud inference. Capture real native browser/TUI evidence labelled as such. Run appropriate existing full gate once coherent, independent critical source review, resolve concrete findings, then pin reviewed full-SHA distribution archive and verify fresh hosted installation/normal launch. Root owns CI watching and merge; open a draft feature PR early. Historical successful model trial remains historical, not this feature's qualification.
