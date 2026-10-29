# Complete local interactive installation

Base: `83c18d8754cb633ad2805723e12df899b2cbd9a6` on
`feat/complete-tui-install`. This continues the owner-authorized build.

`./install.sh` installs checksum-pinned project-local Bun when needed, frozen
JS dependencies, Pi, Herdr and ripgrep. `./lab` starts a persistent LAB-branded
Pi interactive workspace. First run configures an explicit local OpenAI-compatible
endpoint/model or an existing LiteLLM endpoint/alias, with private key input.
Installation never prompts a model, chooses a paid route or downloads weights.

## Mode boundary

The new workspace is native Pi interactive coding with LAB search and explicitly
loaded skills. It is not controlled LAB task execution: it cannot grant, ingest
or accept ledger tasks. The controlled `activate-pi` refusal remains intact.
The workspace header describes the active workspace and the separate controlled
execution limitation; it must not falsely label an executing workspace blocked.
Pi's native tool/auth/session behavior is not an enforceable LAB request gate.
LiteLLM is an existing client destination only.

## Frozen implementation ownership

At most two active Codex `gpt-6.1-sol` high/default specialists, each in a separate
T3 worktree from this contract commit. No grandchildren. Ordinary commits only;
return commits and validation to the coordinator; do not merge or watch PRs.

1. Pi acquisition owns only `src/runtime/pi.ts`, `scripts/pi/acquire.ts`,
   `contracts/pi-runtime.json`, `tests/pi-acquire.test.ts`, `docs/pi-runtime.md`
   and, if needed, a dedicated `runtime/pi/` package and lock. Inspect official
   artifacts, prefer a self-contained binary, otherwise include a verified local
   JS runtime. Never require globally installed Pi. Export `PiRuntime` with
   `command: string[]`, `version: string`, and `verifyPiRuntime(): PiRuntime`;
   export async `acquirePiRuntime(options?: { offline?: boolean }): Promise<PiRuntime>`.
   Default executable/cache beneath project `.tmp/pi`. Verification is read-only,
   cache corruption refuses; acquisition may repair atomically. Record sources,
   byte hashes, licenses, platform limits, cache/offline/partial behavior.
2. Interactive runtime owns only new `src/pi/workspace.ts`,
   `src/pi/workspace-extension.ts`, `src/pi/workspace-config.ts`,
   `src/herdr/interactive.ts`, `tests/pi-workspace*.test.ts`,
   `tests/herdr-interactive.test.ts`, `docs/pi-workspace.md`, plus existing
   `src/pi/header.ts`, `tests/pi-header.test.ts`, `docs/pi-header.md` if required.
   Export `runInteractiveWorkspace(options?: { configure?: boolean }): Promise<number>`
   from workspace.ts. It calls `verifyPiRuntime()` and uses verified project-local
   Herdr and rg. Inspect actual Herdr PTY/client attachment: Herdr must own and
   meaningfully present the interactive Pi session, not just run a smoke first.
   Preserve resize, interrupt, exit, owned cleanup and useful errors. First-run
   route setup must use explicit endpoint/model and private input; no logging
   secrets. Expose actual LAB search and skill load in Pi via supported APIs,
   preserving source hashes and explicit loading. Keep ledger APIs out of this mode.
3. Coordinator owns all other files: shell bootstrap and launcher, CLI/package/
   lock/CI, search/skills existing APIs, architecture/docs/publication, integration
   and end-to-end evidence. Retain immutable Relay nine-file pin and original
   provenance. Keep required jobs `check (ubuntu-24.04)` and `check (macos-14)`;
   Python setup follows Bun/Relay checks because of loader guard environment.

## Evidence and timing

Send first ownership/gap checkpoint within 15 minutes. Deliver runnable local
TUI within 60 minutes; target reviewed substantial draft PR within 120 minutes.
Specialist interim at 20 minutes, handoff within 45 minutes; report concrete
blockers promptly. Fresh independent review per round receives the original
brief and every prior finding/response. Do not duplicate full gates.

Validate a clean installation without global Pi, rerun/cache/offline/partial
dependencies, a real bounded local-model prompt and tool result, skill loading,
terminal resize/interrupt/exit and cleanup. Historical 135M model attempts were
incomplete and provide no inference qualification. A small model download is
authorized with checksum/license, bounded context/CPU/tokens, no cloud fallback.
Record sanitized actual raw terminal/screenshot evidence, test results, exact
head SHA and platform-specific CI state. macOS mini, user's different MacBook,
Ubuntu CI and WSL are distinct evidence targets.
