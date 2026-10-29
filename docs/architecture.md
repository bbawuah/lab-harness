# First runnable integration slice

This development continues the sanitized concept at public commit
`9c4f24aa5fdc6271873d6bc2c162b821154ffaa7`. The original export provenance stays
in `source-manifest.json`; changed development files receive new identities.
This repository grants no reuse license. Third-party sources are read as data;
unlicensed skill bundles are referenced locally rather than redistributed.

The operator owns task acceptance in the existing SQLite ledger. Relay owns
message storage and receipts, with ingest committed before acknowledgment.
Herdr owns disposable terminal processes and advisory observations. A stopped
terminal, successful command, idle agent or Relay receipt never accepts a task.
No model-facing acceptance tool, scheduler or new inference service is added.

The initial operator workflow creates a bounded source search, explicitly loads
selected local skill instructions, binds their byte identities into an immutable
context, and runs a harmless owned terminal worker through a dedicated Herdr
session. The worker can publish candidate-bound evidence through the existing
ledger/Relay adapter. The operator inspects and separately accepts it. Fixture
task evidence, actual terminal evidence and unqualified model behavior are
labelled separately. All runtime model tests, if any, use local models via Pi.

## Component contracts

`src/integration-contracts.ts` defines independent source references, terminal
observations and skill compatibility categories. The ledger wire protocol stays
v1; source selection is validated before creating its immutable context pack.

| Module | Owned files | Coordinator entry point |
| --- | --- | --- |
| Herdr | `src/herdr/**`, `tests/herdr*`, `scripts/herdr/**`, `docs/herdr.md`, `contracts/herdr-source.json` | `src/herdr/index.ts`: `runHerdrSmoke(options)` |
| Search | `src/search/**`, `tests/search*`, `scripts/benchmark-search.ts`, `docs/search.md` | `src/search/index.ts`: `SearchService` |
| Skills | `src/skills/**`, `tests/skills*`, `scripts/inventory-skills.ts`, `docs/skills*` | `src/skills/index.ts`: `discoverSkills`, `loadSkill` |
| Coordinator | Shared protocol, CLI, context validation, Pi seam analysis, package, CI, publication, remaining docs | `src/cli.ts` |

Herdr uses pinned source `bc8c28988f75c538d4ca058b702f5adbea30566e`
from `herdrdev/herdr`. The adapter must identify supported launch, observation
and stop APIs before executing them. Use an isolated configuration/state/socket
and a unique named session. Never attach to, enumerate for cleanup, signal or
stop the user's live sessions. Return owned-process cleanup observations and
unknown outcomes honestly; timeout is not proof that a launch did not happen.
No third-party source bundle is committed merely to run the adapter.

Search first inspects the existing `Workspace.searchDetailed` baseline. The new
service offers literal file/text search with explicit limits and exclusions,
byte hashes, relative paths and line spans. A ripgrep fast path is optional;
the bounded fallback remains runnable without it. Indexes, if selected, are
disposable. Rename/delete/edit and symlink/binary behavior must be explicit.
FTS5 must be benchmarked on the same deterministic realistic fixture before a
hybrid benefit is claimed; embeddings and graph services require evidence.

Skill discovery reads metadata and relative resource/script inventories, never
executes skill code. Explicit loading rechecks source byte identity. Inventory
all current user Codex and Claude skills plus repository portable agents/skills,
including duplicate origins and local dependencies. Source roots are operator
inputs kept out of published metadata. Classify every entry as portable,
local-dependency, connected-service or proprietary-unavailable. These categories
describe compatibility, not authorization. Skill text is not a security boundary.
No global settings, hooks or skills are modified. Private bodies and third-party
bundles remain local unless redistribution is explicitly established.

Pi source pin is `b857fbd8a9225ab7b0c15d7a6965b2f109c9317a`.
Native LAB activation remains blocked until request admission covers ordinary
calls, retry, compaction, queued input, actual model changes and resume. Ordinary
hook exceptions are swallowed and must not be represented as an admission gate.
The coordinator inspects the actual provider request seam and implements only a
bounded justified adapter, with source-grounded limits and tests. Native vendor
approvals and sandbox behavior remain in use. Existing LiteLLM is client-only.

Linux under WSL is the target; macOS is the development host. Linux CI proves
only its Ubuntu runner. WSL, native Pi admission and backend routing remain
unqualified until directly exercised on their actual targets.

## Owner branding addition

The owner authorized the canonical terminal B with its four-spot mesh in neutral
monochrome, as standalone light/dark SVGs and in the actual terminal UI. Exact
geometry, open gutters and source-byte provenance are kept in `assets/branding`.
`apps/tmux` uses the same canonical mark, not a separate terminal glyph. A bounded
Pi header worker may own `src/pi/header.ts`, `src/pi/terminal-mark.json`,
`tests/pi-header*`, `scripts/pi/**` and `docs/pi-header.md`; coordinator owns SVGs,
README, CLI/package/CI and all existing files. Use Pi's supported `setHeader`
extension API, preserve attribution and provide no-color/narrow fallbacks.
Actual owned no-model startup may use the installed Pi 1.4.0 in isolated state;
never activate LAB or run inference to validate branding.

## Interactive project workspace

The complete installer adds a native Pi workspace alongside the operator ledger.
It does not submit controlled LAB tasks or ingest/accept their results. The
launcher binds the caller's project (or explicit --project directory) by canonical
path/device/inode. Pi and Herdr use that cwd; the LAB bridge revalidates binding
before bounded source search and explicit skill loading. Installed runtime assets,
project sources and private HOME app state are separate. Healthy startup verifies
runtime bytes without reacquiring tools; missing dependencies invoke installation.
Native shell/file tools retain the user's capabilities, so the project binding
is a source-adapter boundary rather than an OS sandbox. The unqualified controlled
admission refusal and ledger acceptance semantics remain unchanged.

## ADR: explicit Pi-backed model connections

Status: proposed for independent design review, 2026-10-29. The detailed
[provider research and contracts](research/model-providers.md) compare pinned
Pi, OpenCode, Aider and Continue source with official provider documentation.

LAB will own explicit connection/profile identity, private configuration,
migration and terminal selection. Pi continues to own inference protocols,
streaming, tool conversion, credential adapters and session conversion. First
implementation supports API keys and explicitly unauthenticated endpoints for
OpenAI, Anthropic/Claude API, Ollama, LM Studio/OpenAI-compatible and existing
LiteLLM. Hostname is independent of provider/protocol; LiteLLM remains client-only.

The first switching contract is explicit exit/relaunch into a fresh session.
Each run has fresh private native agent/auth state and explicitly separate
persistent session storage; historical auth is retained but never imported.
A narrow supported Pi provider wrapper freezes the selected credential,
rejects redirects through per-request fetch, strips credential headers for
explicit none and sanitizes error events/results before native persistence.
It delegates every protocol to the existing native adapter, with no gateway.
Automatic retries/compaction and cache warming start disabled; 8K budgets are
explicit and validated. Exact locally
validated provider/model configuration and failed-bootstrap refusal provide a
bounded initial-launch policy, not general native request admission. Existing
sessions and their legacy provider binding are preserved; native resume/import
is explicitly cancelled in P1 until routed resume is qualified. Cross-destination
history replay and subscription OAuth require later proofs; no silent profile,
account, protocol or cloud replacement is authorized by a failure.

Metadata and cost retain provenance/unknown states. Saving or migrating performs
no network request; discovery is an explicit bounded metadata action. Native
Pi offline startup flags are not inference egress isolation. Cache warming is
disabled for the first profile phase. The ledger, acceptance semantics and
immutable Relay closure remain unchanged.
