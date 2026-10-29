# Complete local interactive installation

Base: `83c18d8754cb633ad2805723e12df899b2cbd9a6` on
`feat/complete-tui-install`. This continues the owner-authorized build.

The public entrypoint is `curl -fsSL https://raw.githubusercontent.com/bbawuah/lab-harness/main/bootstrap.sh | sh`. It verifies an immutable harness archive, installs in the user data directory without Git/sudo/profile changes, then attaches first-run setup and TUI through `/dev/tty`. Without a controlling terminal it installs only and prints the launcher. Stable private route/session state survives release upgrades. The distribution pin is assigned only after the integrated harness is runnable.

Within a checkout, `./install.sh` installs checksum-pinned project-local Bun when needed, frozen
JS dependencies, Pi, Herdr and ripgrep. `./lab` starts a persistent LAB-branded
Pi interactive workspace. First run configures an explicit local OpenAI-compatible
endpoint/model or an existing LiteLLM endpoint/alias, with private key input.
Installation never prompts a model, chooses a paid route or downloads weights.

## Mode boundary

The new workspace is native Pi interactive coding with LAB search and explicitly
loaded skills. It is not controlled LAB task execution: the integration does not grant, ingest
or accept ledger tasks. Native shell tools still run as the user; this is a
workflow separation, not a same-user security boundary. The controlled `activate-pi` refusal remains intact.
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

### Authorized project-workspace revision

Ordinary launch must work in the caller's existing project, never default to the
installed release as the user's work target. `./lab --project DIR` optionally
selects another directory. Bootstrap retains caller cwd through install/launch.
Runtime installation, model route/key, native sessions and disposable Herdr
state remain separate from project contents. A healthy start must not write to
the installed release. Missing dependency repair remains an explicit startup
installation action. Native Pi file/shell behavior remains native; LAB search
and skill discovery stay bound to the explicitly selected project, retaining
their existing exclusions, byte identities, symlink and resource guards.

Follow-up ownership is frozen before starting one isolated Codex high/default
specialist (no grandchildren). Specialist owns `src/pi/workspace.ts`,
`src/pi/workspace-config.ts`, `src/pi/workspace-extension.ts`, their focused
`tests/pi-workspace*` and `docs/pi-workspace.md` only. Coordinator owns shell
launcher/bootstrap/start, new `src/project.ts`, search binding support,
read-only runtime verification, all integration/docs/publication and E2E.

The project interface is `ProjectBinding = { root: string; device: number;
inode: number }`, `bindProjectRoot(path: string): ProjectBinding` and
`verifyProjectBinding(value: unknown): ProjectBinding` from `src/project.ts`.
Bindings describe a canonical existing non-root directory; revalidation refuses
replacement, symlink redirection and identity change. Search accepts an explicit
`projectBinding` option and otherwise keeps its prior owned-root rules.

Workspace entry becomes `runInteractiveWorkspace(options?: { configure?:
boolean; project?: string }): Promise<number>`. The selected directory comes
from `options.project ?? process.cwd()`. Pi/Herdr cwd is the verified project.
The child receives `LAB_WORKSPACE_ROOT`, serialized `LAB_WORKSPACE_BINDING`
and `LAB_INSTALL_ROOT` separately. The bridge revalidates binding before search
or skills; portable bundled examples resolve under the installation, project
instructions under the selected project. App state defaults beneath
`$HOME/.local/share/lab-harness/workspace`, not inside the release or project;
native Pi session storage remains partitioned by project cwd. Existing startup
model setup and controlled-task refusal remain unchanged.

Acceptance adds: install in A; launch from unrelated project B with spaces;
Pi cwd, search and project skill loading identify B; source/runtime tree A is
unchanged on healthy launch; repeated absolute launcher works from B; invalid,
replaced and escaping roots refuse. Final README leads with plain language,
one public command, first-run route/key needs, exact subsequent launcher,
verified project/exit and simple prompt/search/skill examples. Fresh review
checks these commands and their readability.

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
## Follow-up: project selection from home

The merged workspace guard refuses home because private application state must
remain beneath home and outside the selected project. The launcher now offers
an explicit existing-project choice before state, route or Pi startup when the
caller is home or overlaps the application directories. It never defaults to
searching home. Blank input, Ctrl-C and Ctrl-D cancel; no TTY means bootstrap
install-only or an actionable launch refusal. Valid project launches keep their
existing binding and state separation. This coordinator-owned follow-up adds no
controlled-task authority and requires a new verified runtime archive pin.
