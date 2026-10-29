# Three small outcome contracts

**DESIGN — proposals only, not implemented or authorized.** These are separately
reviewable first slices, not a commitment to build a roadmap. Rankings and
tradeoffs are in [OPPORTUNITIES.md](OPPORTUNITIES.md). Names below are provisional;
none is a current command. Integration owner assigns actual files only after
approval, particularly shared launcher/extension files already under active work.

## 1. Offline readiness for a named target

**Outcome:** An engineer preparing Linux x86_64 can obtain one complete inventory
of missing, wrong-platform, unverified and verified components without installing
anything, opening a terminal worker or contacting a service.

**Proposed interface:** `lab doctor --offline --target linux-x64`, optionally
`--json`. This is an inventory and transfer-plan report. It must distinguish
“bytes present and verified” from “runnable on this target” and “qualified on
WSL”; no broad “airgap safe” badge. Initial target can be Linux x86_64 only,
with host/target mismatch explicitly supported in inventory mode.

**Small file boundary proposal:** New `src/diagnostics/offline-readiness.ts`,
`tests/offline-readiness.test.ts` and a focused user guide. Integration owner
adds an early read-only dispatch/help path in `lab` and `scripts/start.ts`.
The normal launcher sources `scripts/runtime-bun.sh` (which can create cache
directories/repair permissions/acquire Bun), then start.ts can auto-repair other
runtimes. The proposed doctor must bypass both paths. Require an already
verified host reporting runtime; if it is missing, emit a bounded shell-level
"reporter unavailable" result without acquisition or writes. Inspect target
artifacts as bytes only, never execute them on the host. Read existing runtime-pin
contracts and verifiers; no pin updates, acquisition changes, manifest redesign,
provider settings, Relay vendor closure or Herdr internals in this slice.

**Input/output contract:** Explicit target, trusted installed release identity,
component pin metadata and declared cache roots. Output schema version, target,
release/lock identities, component names/versions/hash checks, missing reasons,
transfer requirements, inspection limitations and nonzero status if incomplete.
Shareable output uses logical cache labels, not absolute paths. Private local
output may show paths only on explicit request. Resolve Bun package-cache
completeness through supported offline metadata, not directory-exists heuristics;
if it cannot be established read-only, return **unknown** with the separate
offline-install verification step. Artifact bytes being equal is not a
reproducible-build guarantee. No source archive is silently trusted on its own.

**Acceptance (future fixtures and target tests):**

1. Complete/missing/corrupt/wrong-architecture fixtures report all components,
   not only the first failure. Pi, Herdr, Bun, rg, fd, source identity and frozen
   JavaScript package requirements are covered; model weights and project build
   dependencies are explicitly outside the LAB closure.
2. A healthy Mac cache cannot certify Linux. WSL detection never claims prior
   qualification; no WSL test host means status remains unqualified.
3. Network-disabled invocation and hostile proxy variables cause zero network
   attempts. No downloads, executing target cached binaries, config writes, model
   prompts, account discovery or inspection of live terminal sessions. Missing
   host Bun takes the read-only early refusal path; even no cache directory exists
   afterward. Disable reporter-generated transpiler/cache writes as well.
4. Malformed metadata, symlink/hardlink cache entries, permissions, oversized
   input and concurrent replacement yield bounded missing/unverified/unknown
   outcomes. Existing integrity rules are reused, not relaxed.
5. Canary credentials/endpoints/home paths/transcripts in neighboring files do
   not appear in JSON/text. Plain text works without ANSI color and at 80 columns.
6. Separately, on an owned clean WSL target with networking disabled, the planned
   transfer supports the existing offline install. Record exact runtime/OS and
   observed limitations; no model request needed. Until this is run, report is
   inventory evidence only.

**Dependencies:** L4 existing pins/caches; no provider P3, browser integration or
Relay update automation. Rough effort 3–6 working days plus WSL host availability.

**Falsifiers / stop conditions:** Existing offline installer errors are equally
complete/actionable in a bounded operator trial; or accurate inventory requires
running arbitrary dependencies. Stop and narrow to inventory with unknowns rather
than growing a general package manager. Full exporter/importer is a new contract.

## 2. Explicit, bounded project briefing

**Outcome:** Before the first model request, an engineer can inspect eligible
project instruction candidates and select a small set, see exactly which bytes
will enter context, and load them deliberately without enabling ambient autoload.

**Proposed interface:** `/lab-brief` lists candidates and existing loaded-source
identities; selection previews text/bytes, then explicit load. `/lab-context`
shows selected paths/hashes, known stale state, omission reasons and Pi's current
context estimate (including unknown). These names are proposals. The exact
selection UI should use existing Pi controls with a plain-text fallback.

**Small file boundary proposal:** New `src/context/brief.ts`,
`tests/project-brief.test.ts` and focused guide. Reuse `src/search/index.ts` and
existing source validation without changing search semantics. Integration owner
alone adds thin command registration in `src/pi/workspace-extension.ts` and
`src/pi/commands.ts`; provider owner supplies model-limit provenance if available.
No automatic AGENTS.md writing, session parser, tokenizer, embedding index or
changes to native Pi autoload flags.

**Input/output contract:** Bound project identity, explicit relative candidate
paths and current source references. Begin with README and project instruction
files, within a declared bounded search; nested instruction scope is shown,
never presumed globally applicable. Eligibility exclusions remain effective.
Discovery reports path/size/hash/scope only; previews and load are separate.
Before injecting text, revalidate root and every selected byte hash. Record which
selection was sent; duplicate loads require an explicit choice. Clearing a
selection means “not selected for future load,” **not** removal from a transcript
already sent. Offer native fresh-session controls if the user wants a clean
conversation; don't rewrite history.

Use byte count plus Pi `getContextUsage()` labelled estimated/unknown; **do not**
claim exact marginal token cost, exact remaining capacity or provider acceptance.
Prototype cap: at most 10 selected files and 32 KiB total text, configurable only
within a reviewed bound. This cap is a UX hypothesis, not a token equivalence.
No first-load defaults that contact the configured endpoint.

**Acceptance:**

1. Discovery/preview does not send a model request or append content to the
   conversation. Loading is explicit and explains that subsequent prompts send
   selected text to the configured destination.
2. Changed/deleted/renamed files, replaced project root, links and ineligible
   paths are refused on load, even when their preview previously succeeded.
3. Oversized candidates and incomplete traversal show omissions. No empty
   inventory is presented as proof no instructions exist.
4. Duplicate/nested instructions show origin and scope. Untrusted instructions
   never configure endpoints, credentials, tools or shell execution by themselves.
5. Missing model metadata and Pi's null token estimate render unknown, not zero.
   Compaction does not falsely mark old selected text as still present verbatim;
   distinguish historical load provenance from current native context estimates.
6. Keyboard-only and no-color flow exposes all choices. New/forked/resumed
   session state uses Pi's supported events; respects provider P1 resume refusal.
7. One owned fixture repository demonstrates first load, repeat load, stale source
   and a fresh session. Actual model-quality benefit remains separately untested.

**Dependencies:** L2–3, P2. Rough effort 3–6 working days. Shared extension work
must wait for or rebase onto Relay/provider integration, not compete with it.

**Falsifiers:** Native Pi references/explicit skill loading satisfy the same task
with no meaningful extra setup; brief makes small-model performance worse;
selection requires duplicating Pi's context engine. Drop the UI or publish a
recipe instead. Demand trial must use owned sample repos and volunteered tasks,
not inspect private user sessions without permission.

## 3. A check result with an honest source relationship

**Outcome:** After an explicit local check, an engineer can inspect what ran,
where, how it ended, and whether its declared inputs have changed since capture.
The result must never imply that exit zero proves a task accepted or a whole
repository correct.

**Proposed interface:** `/lab-check` selects an operator-specified local command
and input scope, shows both, and runs once in an owned worker. A receipt contains
command identity, cwd/project identity, start/end timestamps, HEAD if available,
input hashes before/after, exit/signal/timeout/unknown state, output truncation
and later freshness comparison. Store in private LAB state, not tracked source.
No command inferred from untrusted project text executes automatically.

**Execution environment:** Current Herdr/Pi launch has isolated HOME and a
restricted PATH; it is not the engineer's login shell. Before running, resolve
the selected executable against an explicitly chosen toolchain PATH and show its
identity. A missing tool is `not-started:tool-unavailable`, not a failing test.
Keep isolated HOME by default, allow only operator-selected required environment
entries, and do not source login profiles, dotenv files or inherit model keys
from Pi. Record nonsecret toolchain identifiers and selected variable names,
not secret values. Tool versions/config/external services that cannot be captured
remain unknown dependencies. Reproducing an interactive developer shell is a
separate explicit choice, not an assumed capability of this first slice.

**Small file boundary proposal:** New `src/checks/receipt.ts`,
`src/checks/run.ts`, `tests/check-receipt.test.ts`, `tests/check-run.test.ts` and
focused guide. Reuse owned Herdr lifecycle and source validation. Integration
owner adds thin extension/CLI wiring; no ledger, acceptance, Relay transport,
provider wrapper or generic scheduler changes.

**Scope and truth contract:** Capture an explicit bounded input set, including
relevant test/config/lock files where eligible; report exclusions and any unknown
coverage. A secret-excluded config must not be silently treated as irrelevant.
Untracked eligible selected inputs count. Fingerprint includes relative names,
bytes and relevant modes, with missing/non-Git states explicit. Commands may
mutate inputs; before/after differences are part of the result.

A mutable working-directory run cannot prove the tool read one atomic snapshot:
equal before/after hashes miss transient edits and external dependencies. Thus
label **“exit 0; observed inputs unchanged”**, not “verified current code.” If
another writer is known active, say concurrent-input uncertainty. “Stale” means a
later comparison differs, “unknown” means comparison/coverage was not established.
Neither unchanged hashes nor same HEAD implies fresh dependencies. A later
snapshot-isolated runner would require its own contract; no false green shortcut.

**Acceptance:**

1. Capture success, nonzero exit, missing executable, timeout, abort, output cap,
   process-loss and unknown-cleanup cases distinctly; unknown is never success.
   Include a tool present in the engineer's shell but absent from the worker PATH,
   an isolated-HOME-dependent failure and an explicit toolchain-path selection.
   Assert that model credentials and ambient shell hooks never reach the worker.
2. Editing a selected input after exit invalidates freshness without changing
   HEAD; delete/rename/mode changes and untracked selected files are covered.
   Input edits during a run report changed/uncertain. Check-output files cannot
   recursively invalidate the receipt unless explicitly part of input scope.
3. Before/after equality is visibly labelled an observation, not isolation proof.
   Incomplete enumeration and unknown dependencies prevent a whole-project
   validation claim. No unbounded scan/hash of giant repositories.
4. Display planned argv/cwd/scope before execution; explicit shell expressions
   are identified as shell code. Cancellation affects owned workers only; no
   inspection/signalling of pre-existing user sessions and no automatic rerun.
5. Escape terminal control characters in filenames/output presentation. Raw
   bounded logs stay private; default shareable receipt omits command arguments,
   absolute paths and stdout/stderr unless explicitly previewed for disclosure.
6. Session restart can inspect an existing receipt without executing the command
   or making a model call. Zero Relay messages, ledger dispositions, commits,
   branch changes or provider requests occur as a side effect of inspection.
7. Test on an owned Linux fixture and actual WSL before claiming WSL support;
   no fullgate or private gateway needed to qualify the receipt semantics.

**Dependencies:** L3, L7, project command/tool availability. 5–9 working days for
bounded receipt/execution, not build-system dependency inference or LSP hosting.

**Falsifiers:** Input scope is so incomplete the receipt is misleading; existing
project test reports already retain equivalent provenance; or lifecycle reuse
requires broad Herdr changes. Then keep a shell/skill recipe and postpone this
adapter. Automatic test selection, auto-fix, continuous watchers and multi-agent
“quality gates” are explicitly outside this first slice.
