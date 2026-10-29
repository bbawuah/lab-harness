# Engineer workflow source map

Research date: **2026-10-29 UTC**. Source-map checkpoint: **22:09 UTC**, within
15 minutes of the 22:06 start. Research only. Sources were read, not installed
or executed. Competitor documentation is evidence of offered workflows, not
observed LAB user demand, comparative quality, or airgap qualification.

## Local baseline (L)

Baseline and remote main observed at
`43a6ac2267d0261998453d56bd7f834956531812` (PR #11). Local `main` was behind;
`git ls-remote origin refs/heads/main` confirmed the remote baseline. App thread
`mcp:03778afa-1922-414e-90b8-0ed020e0c82e` reports branch
`research/engineer-feature-opportunities` and the same worktree as shell `pwd`
and Git. No applicable AGENTS.md was found in this checkout or its ancestors.
README, user guide, architecture, build plan and merged provider design were
read before proposing opportunities. No other worktree's private state was read.

Use this immutable [baseline tree](https://github.com/bbawuah/lab-harness/tree/43a6ac2267d0261998453d56bd7f834956531812)
for all L references; relative links below are convenient but can change later.

- **L1:** [README](../../../README.md), [user guide](../../user-guide.md),
  [commands](../../../src/pi/commands.ts): shipping launch/search/skills surface,
  fresh normal startup, native sessions, cache-only offline mode, WSL unverified.
- **L2:** [workspace launcher](../../../src/pi/workspace.ts),
  [workspace extension](../../../src/pi/workspace-extension.ts): explicit extension,
  `--no-context-files`, `--no-skills`, `--no-mcp`; model tools search/files only;
  manual skill text injection and project identity checks.
- **L3:** [search](../../search.md), [search source](../../../src/search/index.ts),
  [context](../../../src/context.ts), [skills](../../skills.md): bounded literal
  retrieval with hashes/omissions; immutable operator context; metadata-only skill
  discovery and revalidated explicit load. Search doc's original owned-root
  description predates the interactive project-binding path in L2.
- **L4:** [installer](../../../install.sh), [runtime verification](../../../src/runtime/verify.ts),
  [bootstrap](../../../bootstrap.sh), [launcher](../../../lab),
  [startup](../../../scripts/start.ts), [Bun bootstrap](../../../scripts/runtime-bun.sh),
  [runtime pins](../../../contracts/pi-runtime.json):
  pinned bytes, frozen Bun cache, offline fail-closed acquisition. No complete
  target transfer planner or consolidated support-safe doctor command found.
- **L5:** [architecture](../../architecture.md), [build plan](../../build-plan.md),
  [Pi seam](../../pi-seam.md), [admission](../../../src/admission.ts): distinct native
  workspace and controlled ledger; Herdr observation and Relay receipt are not
  acceptance. Historical Pi source pin differs from installed release pin.
- **L6:** [merged provider design](../model-providers.md): design, not implemented
  provider profiles. P1 refuses historical resume/import; routed continuation
  belongs to P3. Unknown context/cost, redirect/error policy and fresh-route
  behavior are owned there.
- **L7:** [interactive validation](../../interactive-validation.md),
  [Herdr](../../herdr.md), [interactive lifecycle](../../../src/herdr/interactive.ts):
  owned process evidence and explicit limits; no WSL runtime proof in this study.
- **L8:** [publication policy](../../../scripts/publication-policy.ts),
  [manifest](../../source-manifest.json): explicit file allowlist and hashes.
  Integration owner must add this study; writer does not edit that scope.

## Pi: installed release and current-head cross-check (P)

Installed **1.4.0**, commit `4a080252f06caf63a525d7873c5d94d3c23887e0`.
Current public head sampled 2026-10-29:
`f09d01b85e0384647fcab6779d35ab9dabe04be3` (commit time 21:11:08 UTC).
The installed and sampled-head usage documents were byte-identical. This checks
that document only; it is not a complete release-to-head behavior comparison.

- **P1:** [Usage](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/docs/usage.md)
  and [sessions/context](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/docs/sessions.md):
  resume/name/tree/fork/clone, context footer, export and sensitive debug reports.
- **P2:** [Extension contracts](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/extensions/types.ts)
  and [extension guide](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/docs/extensions.md):
  getContextUsage, lifecycle/tool events and session manager. Supported seams;
  no proof a proposed LAB adapter is correct.
- **P3:** [Git checkpoint example](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/examples/extensions/git-checkpoint.ts):
  stash-create/apply, in-memory map cleared on settled event. Example is neither
  crash-persistent undo nor proof of restoring all external/untracked changes.
- **P4:** [README](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/README.md):
  extension-first design; subagents are not built-in defaults.

## Other harnesses (dated primary documentation)

All URLs below were opened/read on 2026-10-29. Mutable documentation has no
claimed release pin; do not equate a documentation page with a particular binary.

- **C1 Codex CLI:** [official CLI page](https://learn.chatgpt.com/docs/codex/cli)
  (redirect from developers.openai.com/codex/cli/features): local session resume,
  dedicated review, visible context, skills and delegation. Its recommendation
  to use Git checkpoints does not establish automatic filesystem rollback.
  [Developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
  was opened as a linked reference. No Codex account/model was used. Public source
  head sampled `e9854c0aa52d494fa4f4c3683741461e2640011b`; product claims here rely
  on official docs, not an unexamined source tree.
- **C2 Claude Code:** [checkpointing](https://code.claude.com/docs/en/checkpointing),
  [common workflows](https://code.claude.com/docs/en/common-workflows),
  [context window](https://code.claude.com/docs/en/context-window),
  [agent teams](https://code.claude.com/docs/en/agent-teams). Rewind tracks specific
  edits, not arbitrary external state. Worktrees and isolated research are
  documented; teams are experimental, disabled by default, and cost more tokens.
  No binary version or local-model/airgap compatibility is inferred.
- **O1 OpenCode:** [TUI](https://opencode.ai/docs/tui/): file references,
  init/session/compact/export and Git-dependent undo/redo. The page distinguishes
  OpenCode 1 from an offered OpenCode 2 upgrade: don't mix versions implicitly.
- **O2 OpenCode:** [LSP](https://opencode.ai/docs/lsp/): optional diagnostics,
  currently disabled by default, disable-download switch, and explicit warning
  that direct CLI checks may be simpler. Auto-downloads are inappropriate as an
  airgap prerequisite.
- **O3 OpenCode source:** sampled head
  `83e399999642663492ecd9a6f32af2c3a8ce032a` (21:49:27 UTC),
  [snapshot.ts](https://github.com/anomalyco/opencode/blob/83e399999642663492ecd9a6f32af2c3a8ce032a/packages/core/src/snapshot.ts).
  Read for snapshot implementation scope only; not proof TUI documentation and
  this development head describe one released artifact.
- **A1 Aider:** [lint/test](https://aider.chat/docs/usage/lint-test.html): configurable
  command feedback, default edit linting, optional automatic tests.
- **A2 Aider:** [repository map](https://aider.chat/docs/repomap.html) and pinned
  [repomap.py](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/repomap.py):
  symbol/reference map with token budgeting; an alternative to embeddings, not
  measured superior retrieval on LAB repositories.
- **A3 Aider:** [Git integration](https://aider.chat/docs/git.html): commits and
  undo workflow. Public head `5dc9490bb35f9729ef2c95d00a19ccd30c26339c`
  (2026-05-22T14:02:20Z) is the inspected source, not a claim of a recent release.
- **N1 Continue CLI:** [quickstart](https://docs.continue.dev/cli/quickstart),
  [TUI mode](https://docs.continue.dev/cli/tui-mode),
  [configuration](https://docs.continue.dev/cli/configuration): explicit file
  references, info/init/compact/resume/fork, local config selection. Quickstart
  lists account or Anthropic key onboarding; this study does not claim a fully
  offline/no-account CLI path from IDE local-model support.
- **N2 Continue source:** [CLI README](https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/cli/README.md),
  head `5522c6f44ca0ac3528b37244818fbfa39b5af470` (2026-07-21T04:00:09Z):
  terminal-associated saved sessions, JSON listing and headless use. This source
  is older than the retrieval date; current hosted docs are reported separately.

## Offline tools and target constraints

- **G1:** [Git bundle](https://git-scm.com/docs/git-bundle), retrieved 2026-10-29:
  offline transport of Git objects/refs; not untracked working files, model
  weights, installed runtimes, dependency caches or credentials.
- **W1:** [Microsoft WSL filesystem guidance](https://learn.microsoft.com/en-us/windows/wsl/filesystems),
  retrieved 2026-10-29: prefer Linux filesystem for Linux tool performance;
  filesystem placement is relevant to a readiness report. No WSL benchmark run.

## Search failures and limits

Pi `docs/session.md` returned 404; corrected to `docs/sessions.md` using the
pinned tree. OpenCode's former `packages/opencode/src/snapshot/index.ts` returned
404; inspected the current pinned tree's `packages/core/src/snapshot.ts` instead.
Continue `/cli/overview` only redirected and `/cli/tui` failed; linked
`/cli/tui-mode` was successfully opened. No missing page was used as evidence
that a feature does not exist. Public GitHub API heads identify snapshots only.

Demand evidence: Brian's explicit target/workflow brief is the only direct
user demand sampled. Product docs show supply, not demand. No interviews, usage
telemetry, private repositories, user sessions, live gateways or model accounts
were inspected. No public-issue popularity counts were used to rank features.
