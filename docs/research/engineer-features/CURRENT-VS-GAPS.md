# Current capability versus workflow gaps

**Research/design, 2026-10-29.** Baseline is remote main
`43a6ac2267d0261998453d56bd7f834956531812`. “Absent” below means not exposed in
the inspected launcher/extension/source baseline, not impossible with a shell,
a skill or a Pi extension. Source IDs resolve in [SOURCES.md](SOURCES.md).

## What engineers can already do

| Workflow | Shipping LAB or inherited Pi | Narrow remaining gap / proper owner |
| --- | --- | --- |
| Start on a chosen codebase | Guarded launcher; canonical project binding; existing local/LiteLLM Chat endpoint [L1–2] | Qualification on WSL, not another launcher |
| Find code offline | Literal filename/text search, hashes, exclusions and truncation; native Pi file/shell tools [L2–3] | Choose and explain small context sets; don't assume vector search is needed |
| Use local expertise | Inventory project/user/bundled skills, explicit selection and byte revalidation [L2–3] | Better explanation of unavailable dependencies and ambiguous origins; discovery itself exists |
| Keep a conversation | Pi auto-saves; native resume, naming, tree/fork/clone and exports [P1] | LAB doesn't record a trustworthy historical connection revision. Provider design P1 restricts resume; P3 owns routed continuation [L6] |
| See context pressure | Pi footer and `/session`; `getContextUsage()` may return unknown tokens [P1–2] | Which LAB-selected instructions/results entered context, their freshness and byte cost; no second tokenizer |
| Know project conventions | Native Pi supports context files, but LAB launches with `--no-context-files` [L2] | Explicit, inspectable opt-in to project briefing; don't silently enable autoload |
| Review/revert changes | Native shell can use Git; Pi offers a checkpoint extension example, not loaded by LAB [P3, L2] | Convenient review evidence; durable all-file rollback is a separate, harder contract |
| Run tests | Native shell can execute installed project commands; terminal output and lifecycle available [L5, L7] | Persist which source revision/scope a result tested and make stale/unknown results obvious |
| Start offline | Verified runtime caches; frozen/offline install path; fail on missing bytes [L1, L4] | Enumerate complete target-specific transfer requirements before disconnecting |
| Recover a controlled task | Operator ledger has recovery and explicit acceptance; native workspace does not submit such tasks [L5] | Don't conflate terminal restart, transcript continuation, ledger recovery and acceptance |
| Coordinate terminals | Herdr owns process lifecycle; native tools run with user capabilities [L5, L7] | Bounded multi-agent coordination could compose existing pieces only after qualification |
| Diagnose a problem | Individual runtime verifiers, owned run reports, Pi debug/export [L4, L7, P1] | Minimal offline support-safe status, without transcripts or raw provider errors |
| Read/use narrow terminals | Header supports narrow/no-color fallbacks; Pi has configurable hotkeys [L1, P1] | Real keyboard/screen-reader/WSL-terminal validation; no claim that no-color proves accessibility |

## Already in flight — excluded from new-gap ranking

These are **user-supplied coordination facts at study start**, not features
verified as shipping. The app catalog independently showed PR #12 open and the
two research/design threads active. This study neither reads their live sessions
nor modifies their scopes.

| Work | Status / ownership | Effect on this study |
| --- | --- | --- |
| Built-in Relay messaging | PR #12 in progress | No proposal for another peer bus, inbox or send/ack API |
| Provider connection UX/auth | Design owner `679ab07e`; merged provider design in L6 | Profiles, auth, route/cost metadata, discovery and safe switching are dependencies, not discoveries |
| Airgap browser connection | Research owner `7ad47d74` | Browser/CDP/Edge reachability excluded |
| Pi + regular-shell TUI split | Planned/in progress | Use forthcoming shell affordance; don't propose another terminal layout |
| Native fullscreen, bottom composer, scrolling | Planned/in progress | Upstream/Pi/Herdr rendering work, not a new LAB roadmap item |
| Appearance | Planned | Excluded; accessibility checks remain a separate unproven need |
| Relay dependency-update automation | Requested | Excluded; offline inventory reports installed pin identity, never updates it |

Integration/monitor owner: root `64847d95-5062-48cb-9506-4d3c9e7f19c5`.
Status may change after this snapshot; root should reconcile it before adoption.

## Competitive workflow evidence, not a replacement recommendation

| Harness | Verified useful pattern | What LAB should learn / avoid copying |
| --- | --- | --- |
| Pi 1.4.0 | Session tree, context footer, explicit exports, supported extension events; sample Git checkpoints [P1–4] | Reuse native mechanisms. LAB launch disables ambient extensions/context. A sample is not installed functionality |
| Codex CLI | Saved-session resume, dedicated local review, context display, skills, delegated investigation [C1] | Make return-to-work and review easy to discover. No account or model-portability claim made here |
| Claude Code | Conversation/code rewind with documented holes; worktrees; context accounting explanation; experimental teams [C2] | Distinguish transcript from filesystem recovery; start collaboration with narrow research/review, not unlimited agents |
| OpenCode | File references, init, sessions/export, Git-dependent undo/redo; optional LSP feedback [O1–3] | Explicit references and review are valuable patterns. Do not auto-install language servers in an airgap |
| Aider | Repository map, command lint/test loop, Git commits/undo [A1–3] | Try budgeted structural retrieval only against a measured literal baseline. Reuse project test commands |
| Continue CLI | File references, init, info, compact/resume/fork; local configuration and headless/session listing [N1–2] | Separate CLI from IDE claims. Offline/accountless operation isn't established by these sources |

No competitor was run. These observations establish product patterns, not which
harness wins, how well a self-hosted model follows tools, or what LAB users will
adopt. No source-backed demand survey is implied.

## Boundary decisions

- **LAB:** small composition layer for selected project context, installed closure
  inventory, source-linked check receipts and local handoff metadata.
- **Pi/upstream:** inference, transcripts, compaction, token estimation, native
  editing/undo primitives and terminal conversation interaction.
- **Herdr:** owned process/pane lifecycle, resize/input and shell-session behavior.
- **Relay:** message persistence, delivery and receipts. Content references may
  travel over it later; delivery never implies execution or accepted work.
- **Git/project tools:** diffs, worktrees, patches, test execution and dependency
  management. LAB should describe and invoke explicit local choices, not create
  a parallel VCS, CI product or central policy service.
