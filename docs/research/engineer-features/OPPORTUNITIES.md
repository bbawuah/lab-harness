# Prioritized engineer workflow opportunities

**DESIGN / research only — no implementation authorization.** Source references
are in [SOURCES.md](SOURCES.md); [CURRENT-VS-GAPS.md](CURRENT-VS-GAPS.md) separates
native and in-flight capabilities. Stories below are research hypotheses, not
quotes from interviews.

## Selection method

Prioritize a concrete interruption in an engineer's day, value independent of
model quality, fit with WSL/airgap and existing local/LiteLLM routes, narrow LAB
ownership, and a small testable first slice. Effort is **one engineer's rough
working-day range including focused tests and review**, assuming existing APIs
stay stable; excludes waiting for hardware, upstream work or deployment. No
measured ROI or numeric scoring is invented.

Only Brian's platform and workflow brief is direct observed demand. Source/docs
show that competitors supply workflows, and local source shows gaps. Frequency,
time saved and willingness to adopt remain hypotheses for every item.

| Rank | Opportunity / decision | Initial effort | Confidence: gap / user value | Why this position |
| --- | --- | --- | --- | --- |
| 1 | Target-aware offline readiness report — **build thin adapter** | 3–6 days | High / medium-high | Prevents arriving offline with unusable caches; no inference, upstream or accounts required |
| 2 | Explicit project brief with context provenance — **adopt Pi + build selector** | 3–6 days | High / medium | LAB disables autoload; a small selected brief may reduce repeated setup with small models |
| 3 | Source-linked local check receipts — **build thin adapter** | 5–9 days | High / medium | Records outcome and observed input freshness after session loss or another edit |
| 4 | Recovery/handoff card — **build metadata first; defer replay** | 3–5 days metadata; 8–15+ routed recovery | High / medium | Strong potential, but safe transcript replay belongs to provider P3 |
| 5 | Review/diff and deliberate checkpoints — **adopt Git/Pi; defer undo engine** | 1–3 days guide; 8–15+ robust restore | Medium / medium | Manual Git already works; wrong undo can destroy unrelated edits |
| 6 | Worktree orientation — **adopt Git; build read-only summary if needed** | 2–4 days | Medium / medium | Lower-cost aid than automated branch lifecycle, useful before parallel writes |
| 7 | Skill/tool readiness explanations — **extend existing inventory** | 2–4 days | High / medium-low | Useful polish, but discovery and explicit loading already ship |
| 8 | Budgeted structural retrieval — **defer pending local benchmark** | 2–4 day experiment; 8–15+ product | Medium / low-medium | No evidence current literal retrieval is the limiting factor |
| 9 | One bounded read-only collaborator — **defer activation** | 8–15+ days after prerequisites | High / low-medium | Messaging isn't orchestration; doubles pressure on constrained gateway/models |
| 10 | Accessible status and local diagnostics — **adopt upstream; qualify** | 2–4 day audit; fixes unknown | Medium / medium | Required quality work, partly overlaps #1 and planned rendering; not another UI rewrite |

Top three avoid provider P3 and controlled admission as prerequisites. If explicit
brief loading changes the provider contract or native Pi already offers equivalent
check freshness/closure inventory by implementation time, rescope or drop that
slice. Recovery may outrank #3 after provider P3 and actual user testing.

## 1. Arrive in the airgap with the right dependencies

**Story:** Before moving a release into WSL without internet, I want a report for
Linux x86_64 that tells me exactly which verified runtime/cache bytes are missing,
so I can prepare one complete transfer instead of discovering missing pieces on
arrival. A Mac's healthy cache must not be reported as Linux-ready.

**Evidence:** LAB verifies pins and can install from an existing offline Bun
cache, but its runtime verifier stops on failure and the public bootstrap needs
network acquisition [L1, L4]. Git bundle transports Git objects, not this runtime
closure [G1]. WSL placement can matter [W1]. This is observed implementation
friction inferred from code, not a documented failed user deployment.

**Workaround:** Manually inventory pins, stage the correct source and runtime
artifacts plus package cache, run offline install on the target, and carry error
messages back. Keep configuration/keys separate.

**Decision/owner:** LAB builds a read-only inventory/preflight using existing
verifiers; adopt current acquisition/pinning. First slice outputs a transfer
plan, **not** a new packager/importer or reproducible-build claim. Later exporter
requires separate design. Dependencies: L4 pin schemas, Bun lock/cache semantics,
actual WSL acceptance host. A read-only reporter needs an early launcher path
that bypasses current Bun/cache bootstrap and auto-repair. No Relay update
automation dependency.

**Security/data:** Allowlist component/version/hash/status; no environment dump,
endpoints, keys, transcripts, project names or raw home paths in shareable output.
No network probe, auto-repair, install or global changes. Byte integrity is not
source trust, and offline-ready is not inference-egress isolation.

**Validation hypothesis:** An operator can enumerate the missing closure without
launching Pi or making a model request; then complete one disconnected target
install. Falsify if existing error output already provides this reliably at
comparable effort. Confidence high gap, medium-high value; 3–6 days for report,
with actual WSL validation time additional if host unavailable.

## 2. Begin a task with the right project instructions, visibly

**Story:** In an unfamiliar repository with a small self-hosted model, I want to
select the relevant README/conventions/test instructions, see their size and
origin, and load them once, so repeated sessions don't begin with guesswork or
an oversized dump of the whole repository.

**Evidence:** LAB explicitly disables context-file autoload and loads skills only
by command [L2]. Pi already estimates context; tokens can be unknown [P1–2].
OpenCode/Continue expose project init and explicit references [O1, N1]; Aider maps
structure within a budget [A2]. These demonstrate alternatives, not measured LAB
improvement.

**Workaround:** Read files with native tools or paste selected excerpts and use
`/lab-skill`; inspect Pi's footer. This is workable but leaves selection provenance
and freshness for the engineer to track.

**Decision/owner:** LAB builds a bounded selection/preview over current source
references and explicit loading; Pi owns actual prompt/context usage. Do not
auto-generate AGENTS.md or change automatic trust rules. Dependencies: project
binding, search eligibility, source-hash validation, existing extension. Provider
work owns model limits; show configured provenance rather than guessing a limit.

**Security/data:** A document can contain prompt injection or secrets even if it
is eligible source. Preview locally, require explicit load, state that selected
text will enter subsequent model requests, revalidate hashes, and preserve
current exclusions. No endpoint/key pulled from repository instructions. Show
bytes and Pi's estimate separately; never guarantee a prompt fits.

**Validation hypothesis:** A newcomer can find and deliberately load a small
brief without a model call for discovery; a changed source forces reselection.
Falsify if users prefer native references and no repeated setup cost is observed.
Confidence high gap, medium value; 3–6 days.

## 3. Know what was actually tested before handing off a change

**Story:** After editing code and running a local check, I want to see its command,
exit status, tested source scope and whether that scope has changed, so an old
green result is not mistaken for validation of the new diff.

**Evidence:** Native shell executes tests, but inspected LAB surface has no
source-linked check receipt [L2, L5]. Aider feeds lint/test results into its loop
[A1]; OpenCode advises direct CLI diagnostics where LSP adds overhead [O2]. LAB
already has hashes and owned process lifecycle, useful foundations [L3, L7].

**Workaround:** Run the project test command, record exact revision/dirty state
and inspect `git diff`; manually rerun after relevant changes. Shell scrollback
and an assistant saying “tests passed” are poor durable scope descriptions.

**Decision/owner:** LAB records a narrow local check receipt; existing project
tools execute checks, Herdr owns disposable process lifecycle. First slice is
explicit one-shot execution, no auto-fix/watch/retry/acceptance. Dependencies:
explicit command/cwd/toolchain environment (not the isolated worker inheriting
the developer login shell), source scope/hash capture, bounded output, lifecycle and
cancellation results. No dependency on built-in Relay; later send only an
operator-selected receipt reference over Relay.

**Security/data:** Commands are executable project code, not harmless metadata;
require explicit operator selection, no automatic script execution on open.
Logs can expose secrets; keep raw bounded output private and omit it from default
exports. Scope-incomplete, external dependency changes, concurrent edits,
timeouts or lost processes must yield unknown/stale, never a current green badge.
No exit code accepts a controlled task.

**Validation hypothesis:** A result becomes stale after editing any declared
input, even with identical HEAD. Falsify if reliable source scope requires an
entire build-system model or users don't need persistent receipts. Confidence
high gap, medium value; 5–9 days, limited to explicit input scopes and owned runs.

## 4. Recover intent without silently replaying history

**Story:** After a disconnected terminal or shift change, I want a local card
showing the task, native session ID, branch/worktree, last check and unresolved
step, so I can decide how to continue without repeating tool effects.

**Evidence/workaround:** Pi already saves/names/resumes sessions [P1]; engineers
can maintain a handoff note and Git commit. Provider P1 intentionally blocks
resume/import pending P3 [L6]. Native history persistence is not filesystem or
process recovery.

**Decision:** LAB metadata card first, adopt Pi transcript storage; **defer routed
replay to provider P3**. Render missing/moved project and unknown historical route
honestly. A user-written card can help now; no automatic model summary on exit.
Depend on stable session/project identifiers and future connection revision;
Herdr can report owned process unknown/exited state, never reconstruct success.
Relay delivery is optional, explicit and separate from acceptance.

**Security/data:** Card defaults to local private storage, relative paths,
operator text and references. No transcript, credential or endpoint export;
preview any Relay payload. Crash during tool execution means unknown outcome;
never rerun a tool as recovery. 3–5 days metadata, routed work 8–15+ days in its
existing owner scope. High gap confidence, medium value; demand hypothesis is
frequency of interruption, not established loss of LAB sessions.

## 5. Inspect and undo a bad experiment without losing unrelated work

**Story:** I want to inspect my change and deliberately return selected files to
an earlier state while preserving pre-existing dirty/untracked work.

**Evidence/workaround:** Git diff/commits already work; Pi supplies a stash-based
example that uses in-memory state [P3]. Claude documents rewind coverage holes
[C2]; OpenCode's Git-backed snapshots require careful version-specific reading
[O1, O3]; Aider exposes Git commits/undo [A3]. None proves universal rollback.

**Decision:** Adopt Git/Pi workflows and a discoverable recipe now (1–3 days).
Defer LAB restore engine (8–15+ days). A diff shortcut can be bundled with #3
without implying undo. Git owns object/branch/worktree semantics; upstream Pi is
the right place for general turn-to-file checkpoint behavior.

**Dependencies/security:** Git presence and project binding; test dirty index,
untracked files, renames, binary/large files, submodules, interrupted restore and
concurrent editor writes before any automated restore. Don't auto-commit, stash,
reset, clean or overwrite. Snapshots can retain sensitive deleted content.
Medium gap/value confidence: safe usability improvement plausible, but native
Git may be enough. Stop if the small feature becomes a second version-control
system.

## 6. Know which checkout a terminal and a session are using

**Story:** With two Herdr terminals, I want to see branch, worktree and dirty state
before I start a conflicting edit or carry a session to another checkout.

**Evidence/workaround:** LAB binds cwd by filesystem identity [L2]; Git worktrees
and competitor workflows already solve separate checkouts [C2]. Use `git status`
and `git worktree list`; no evidence LAB currently mixes project roots.

**Decision:** Adopt manual Git worktree creation. Consider a LAB read-only summary
(2–4 days), not branch management or automatic merge. Depends on Git's machine
readable output, detached/non-Git cases and future stable session identity.

**Security/data:** No remote URL/auth disclosure in shared status. Worktrees
share repository metadata and are not sandboxes. Don't prune/remove another
session's worktree. Medium gap/value confidence; hypothesis is orientation cost.
Defer if planned shell split makes manual status sufficiently visible.

## 7. Explain why a local skill is or is not usable here

**Story:** I want to distinguish a portable skill from one needing a network
service or missing executable before loading instructions I cannot follow.

**Evidence/workaround:** Existing inventory has compatibility, loadability,
origins and bundle hashes [L2–3]. Operator can inspect metadata and local files;
discovery isn't absent. Competitor skill menus alone don't justify another one.

**Decision:** Extend existing presentation with reasons and a literal text filter,
plus links to local resources (2–4 days). LAB owns inventory; Pi owns native tool
listing; no registry download/install or automatic skill execution.

**Dependencies/security:** Existing compatibility metadata and explicit source
roots. Never execute scripts or arbitrary `--version` probes during discovery;
path presence isn't proof of compatibility. Don't publish home paths/proprietary
bodies or infer authorization from “portable.” High gap, medium-low value;
hypothesis is that terse IDs/ambiguity impede selection. Validate before build.

## 8. Find related code without a network retrieval service

**Story:** When a literal term is unknown, I want a small symbol/reference view
that helps locate the implementation while respecting the model's context limit.

**Evidence/workaround:** Current literal retrieval has explicit bounds and a
synthetic FTS comparison, not real-project retrieval evaluation [L3]. Aider offers
a ranked structural map [A2]. Use filenames, literal searches and native tools.

**Decision:** Defer product; permit a later 2–4 day fixture experiment comparing
literal search against a bounded structural map. Adopt an existing parser only
if measured recall and end-to-end latency justify added offline dependencies;
8–15+ days for a product is speculative. No embedding service or vector store.

**Dependencies/security:** Language coverage, pinned parser bytes, exclusions,
rename/delete invalidation and budget provenance. Exclude secrets and generated
artifacts; an index is private disposable state, never authoritative source.
Medium gap/low-medium value confidence. Kill if useful-file recall doesn't improve
on a representative predeclared query set or exceeds offline startup budgets.

## 9. Ask one independent reviewer without creating an agent swarm

**Story:** I want one bounded read-only investigation while I keep coding, with
its scope and result visible and no competing writes.

**Evidence/workaround:** Pi is extension-first [P4]; Claude teams document overhead
and lifecycle limits [C2]; Codex documents focused delegation [C1]. Existing
separate terminals plus manually scoped prompts are the workaround. Relay #12
provides messages, not safe execution, quotas or qualified admission [L5].

**Decision:** Defer activation until runtime admission and cancellation boundaries
are independently qualified. LAB may later compose one child, explicit timeout,
selected route, no grandchildren and no automatic acceptance; Herdr owns process,
Relay transport, Pi inference. Estimate 8–15+ days after prerequisites, not a
promise to finish qualification in that period.

**Security/data:** Read-only must be enforced by actual tool/process capabilities,
not a prompt. Do not send full parent history by default or silently consume
another model/account. Child result is untrusted evidence, not an instruction.
High feature-gap/low-medium value confidence; validate throughput and model
quality on the existing gateway first. Drop if one-agent latency/cost dominates.

## 10. Understand terminal state without color or a secret-filled debug dump

**Story:** With keyboard-only navigation or a constrained WSL terminal, I want
unambiguous state and a small local diagnostic report I can share deliberately.

**Evidence/workaround:** LAB has no-color/narrow header behavior and run reports
[L1, L7]. Pi debug can contain transcript data [P1]. Native hotkeys, ordinary logs
and manual redaction are current workarounds; screen-reader usability unmeasured.

**Decision:** Adopt upstream Pi/Herdr accessibility mechanisms; conduct a 2–4 day
keyboard/narrow/no-color/screen-reader audit before estimating fixes. Feed
runtime diagnostics into #1. Planned fullscreen/composer/appearance work stays
with its owner; do not create a competing renderer or telemetry service.

**Dependencies/security:** Actual WSL terminal and assistive-technology testing,
Unicode/control escaping, focus/scroll behavior, bounded local status events.
No background telemetry, content logging or automatic support upload. Status must
say running/failed/cancelled/unknown in text. Medium gap/value confidence because
absence of qualification does not establish a specific accessibility defect.
