# Build and evidence plan

Contract first, implementation next. This file and `architecture.md` are the
reviewable current plan; historical reports are immutable inputs and are not
reconstructed. No historical `DESIGN.md` or `THREADS.json` is written.

1. Verify app binding, clean Git state and base ancestry; inspect source and
   read-only reports. Commit shared interfaces and this plan before delegation.
2. Delegate Herdr and search into separate app-created worktrees. At most two
   live children, no grandchildren. Each slice is bounded to 45 minutes with an
   interim handoff. Use live-catalog Codex `gpt-6.1-sol`, high/default options.
3. As a slot opens, delegate skills using the same contract commit. Coordinator
   implements context invalidation, CLI, Pi seam characterization and deliberate
   publication-manifest development support. Integrate ordinary commits.
4. Reach a runnable checkpoint within 60 minutes: actual owned Herdr process,
   usable offline search, inspectable context and separate operator acceptance.
   Aim for a substantial reviewable PR within 120 minutes; report blockers.
5. Run the existing regressions, new failure/recovery cases, typecheck, clean
   dependency installation, publication checks and Linux/macOS CI. Fresh
   independent review uses a new delegated task on the integrated final source;
   resolve blockers and repeat only where changes require it.
6. Push a coherent integration PR to `bbawuah/lab-harness`, immediately register
   it in T3, report exact head and evidence to the root thread. Do not merge.

Acceptance evidence:

| Area | Required checks |
| --- | --- |
| Existing ledger/Relay | All regressions preserved; duplicate/stale/conflicting callbacks and ingest-before-ack remain checked; no automatic acceptance |
| Herdr | Real owned disposable terminal launch, observable worker output/status, bounded stop and cleanup; fake socket tests explicitly separate; no live session access |
| Search | Deterministic results, literal query, file names, byte hash/line provenance, limits/exclusions, no binary/symlink escape; edit/rename/delete invalidation; FTS5 fixture benchmark |
| Skills | Complete sanitized origin coverage and deduplication; resource/script paths and hashes; explicit revalidation/load; no execution on discovery, private contents or home paths in publication |
| Context | Source and skill bytes revalidated; changed/deleted/renamed sources refuse stale context; immutable obligation/candidate fields survive selection |
| Pi | Exact source seam evidence, refusal unchanged for unqualified activation; any local smoke independently labelled and never represented as native qualification |
| Publication | Retain immutable original concept hashes; explicit current allowlist and new source identities; preserve all nine Relay pins and sensitive-content exclusions |
| Platforms | macOS local checks and Linux/macOS CI states recorded separately; WSL remains unverified |

Worker handoffs include commit SHA, exact file ownership, commands/results,
actual versus fixture evidence, remaining risks and no PR monitoring. Every
implementation change belongs in the integration PR. No paid cloud calls,
Claude agents, global installation, account changes or production deployment.
