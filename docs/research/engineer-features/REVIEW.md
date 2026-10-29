# Review and verification record

**2026-10-29; research only.** Solo writer; one independent read-only critical
reviewer (`critical_review`), no grandchildren. No implementation, account/model
trial, package installation, global change, private repository access or live
user-session inspection. Public documentation/source retrieval and this branch's
normal Git/PR publication are the only external research/publishing actions.

## Critical review disposition

Reviewer found **two medium contract gaps and one wording issue**, with no
blockers in research-only scope, upstream ownership or demand/evidence labelling.
Writer verified the findings against current `lab`, `scripts/runtime-bun.sh`,
`scripts/start.ts`, `src/pi/workspace.ts` and Herdr environment handling.

1. **Offline doctor could accidentally bootstrap/repair.** Normal launcher
   initialization can create cache directories, repair permissions and acquire
   Bun before TypeScript dispatch; start.ts can repair other runtimes. Contract
   1 now requires early bypass of both paths, a verified existing host reporter,
   read-only missing-host-runtime refusal and no execution of target artifacts.
   Target bytes and the host reporting runtime are explicitly distinguished.
   A missing-cache fixture must prove no directories were created. This is a
   future acceptance requirement, not a claim the current launcher has this mode.
2. **Check worker environment differs from developer shell.** Contract 3 now
   specifies isolated HOME by default, explicit toolchain PATH selection,
   missing-tool versus failed-test distinction, selected environment entries,
   no ambient profile/dotenv/model-key inheritance, and environment provenance
   limitations. Acceptance includes a command visible in the developer shell
   but absent in the worker. No reproducible-build guarantee is implied.
3. **Value wording overstated evidence.** Ranking now says briefing may reduce
   repeated setup and check receipts record observed freshness. No assertion
   that a brief benefits every session or hashes prove exactly what a test read.

All three responses were applied and source-checked by the solo writer; at that checkpoint there
was no second independent review round. These close documentation findings only.
The future implementation still needs its own security/design/runtime review.

## Additional writer challenges and decisions

- **Are we rebuilding Pi?** Native resume, context footer, export, branching and
  a checkpoint example are acknowledged. LAB proposals use supported APIs;
  there is no transcript engine, tokenizer, renderer or protocol implementation.
- **Are we competing with ongoing work?** All seven supplied in-flight/planned
  areas are excluded from novelty ranking. Provider P1 refusal/P3 replay remains
  authoritative; messaging cannot qualify controlled execution or accept a task.
- **Can source hashes prove tests ran on one tree?** No. Before/after equality
  misses transient edits and external dependencies. Contract 3 uses observed
  input wording, unknown coverage, explicit stale comparison and no green claim
  of atomic validation.
- **Does cached imply deployable offline?** No. Separate target byte inventory,
  Bun package-cache uncertainty, actual offline installation, WSL qualification
  and model egress. A source Git bundle alone cannot carry the whole runtime.
- **Does removing a brief erase model history?** No. Contract 2 distinguishes
  future selection from already-sent transcript text and post-compaction state.
- **Does tool supply establish demand?** No. Only Brian's brief supplies direct
  demand. Stories, benefit, effort and prioritization are hypotheses; no adoption
  numbers, interviews or representative-user measurements were invented.
- **Could a low-effort alternative win?** Yes. Every contract has falsifiers and
  a recipe/adopt/defer option; recovering metadata may outrank check receipts
  once actual interruption frequency and provider P3 are understood.

## Checks performed

- App thread branch/worktree matched shell and Git; clean starting worktree.
  Remote main matched `43a6ac2267d0261998453d56bd7f834956531812`; local main was
  older and was not used as the current baseline. No applicable AGENTS.md found.
- Read README, user guide, architecture, build plan, merged provider design,
  interactive/source/search/runtime/publication boundaries and selected source.
- Opened primary documentation for all six requested harnesses. Sampled public
  heads for Pi/OpenCode/Aider/Continue/Codex; pinned selected Pi/OpenCode/Aider/
  Continue source reads. Mutable docs labelled by retrieval date. Broken source
  paths were corrected using pinned trees, not interpreted as missing features.
- Pi installed/current-head usage document byte equality verified; SHA-256
  `6dfe7446c81d601d5ebef5769523115229f802da364fe90fcdf96e322ae9fbcd`.
- Local Markdown target scan, sensitive filename/content policy and immutable
  nine-file Relay closure check. No new external scripts/fonts/images in HTML.
- DESIGN comparison rendered with T3 HTML preview at **728px dark** and **390px
  light**; both returned no console errors. Visual inspection found an initial
  theme-variable conflict; corrected to theme-aware fallbacks and rechecked.
  Final heights 1003px / 1484px. This is a research matrix, not an app screenshot.
- Staged whitespace check and docs-only scope check before commit. No application
  tests needed for text/static HTML; no CI watcher, fullgate or runtime claims.
- Ran `bun --no-env-file --no-install scripts/check-publication.ts` using the
  already-installed Bun. **Expected failure:** `Publication allowlist differs
  from working files; inspect changes before explicit refresh`. New study files
  are intentionally absent from the coordinator-owned manifest. The independent
  publication filename/content scan and immutable Relay pin check passed.

At the initial handoff the manifest failure was an outstanding integration
action, not waived or reported green. Exact added paths and hashes are handed to root for explicit
allowlist/currentFiles entries (`status: "added"`, no `originalSHA256`). Original
concept identities and all existing file identities must remain intact.

## Remaining unknowns and adoption gates

- Real task frequency, setup time, context-selection value and stale-test-result
  confusion; voluntary owned-fixture trials proposed, not conducted.
- WSL filesystem/terminal behavior, actual disconnected target installation and
  screen-reader usability; Ubuntu CI or macOS previews cannot establish these.
- Real self-hosted model tool reliability and context limits; no gateway queried.
- Exact Bun cache completeness inspection API and cost of a bounded diagnostic
  adapter; “unknown” must remain possible without executing installers.
- Stable future provider connection revision/session metadata and P3 timeline;
  no new replay implementation should be commissioned from this report.
- Project-specific toolchains, external test inputs and privacy needs for check
  logs; the first receipt slice must not infer global dependency completeness.
- Broader competitor behavior beyond sampled docs/source; no runtime bake-off,
  full source audit, legal licensing recommendation or popularity study.

Research began at 22:06 UTC; source map was produced at 22:09 UTC. This bounded
study completed well within the requested approximately 45-minute window.
Research findings do not authorize implementation or merging main.

## Publication readiness follow-up

Root extended ownership to normal `docs/source-manifest.json` additions/current
hashes for this directory only. Merged main
`9a29db3bef718fa5c08c791d98a4c165210b89de` normally; provider/browser research and
their manifest entries are preserved. Runtime baseline remains unchanged by
those two documentation PRs. The original source map and comparison are dated
research snapshots, not claims those research threads are still unmerged.

Read the exact `refresh-publication.ts`, `publication-policy.ts`,
`check-publication.ts` and publication plan before refresh. The normal script
recomputes the full allowlist/currentFiles, so compare every pre-existing entry
against merged main after running it. Independently hash owned files with Python
SHA-256, compare all entries, and preserve schema/description/export/reviewed
anchors and the immutable original `files` map. No pin or policy edits allowed.

Added `COMPARISON.png` using T3 `html_preview` of the existing HTML at 728px/dark:
1003px content/capture height, no console messages. `COMPARISON.json` records
source commit/byte hash, image hash, capture method/time/theme and limitations.
The visible DESIGN label and text explicitly disclaim implemented UI/runtime
evidence. No model call or user browser session was involved.

Original reviewer verdict, verbatim: “Two medium-severity contract gaps; no
blockers in the research-only scope, upstream ownership, or demand/evidence
distinction.” The findings and responses are listed above. **Original reviewedSHA
is unavailable:** that review inspected the uncommitted draft on baseline
`43a6ac2267d0261998453d56bd7f834956531812`, not an immutable final research commit.
Do not label `36b3709a2bc9bcc4b61b6c4ccccaab3260735841` independently approved.
Its post-review changes were the early read-only bootstrap bypass, explicit
worker toolchain/environment contract, toned-down benefit wording, and the
author's review record/final formatting. A narrow fresh read-only verification
round against a frozen readiness commit follows; its verdict and exact SHA will
be recorded separately from any later record-only changes.
