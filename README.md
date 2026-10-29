# LAB-HARNESS

An executable offline terminal concept for a durable task ledger, explicit
operator acceptance and local agent mailboxes. The demo uses **real Bun SQLite
and pinned Relay source**, with a **fixture gateway, worker, candidate and
evidence**. It makes zero model calls.

This is an initial concept. Native Pi activation is **blocked**; Herdr is not
integrated and WSL is not qualified. It is not a production-ready agent platform.

## Quickstart

Prerequisites: Git and **Bun 1.4.2** available on your PATH. No global package
installation, provider account, credential, model or external service is needed.
The first dependency install needs access to the public npm registry.

```sh
git clone https://github.com/bbawuah/lab-harness.git
cd lab-harness
bun --version  # must be 1.4.2; also pinned in .bun-version and package.json
bun --no-env-file install --frozen-lockfile --ignore-scripts
bun --no-env-file run demo
bun --no-env-file run check
```

Use `--ignore-scripts` on installation to disable package lifecycle scripts.
Development dependencies and their transitive resolution are pinned by
`package.json` and `bun.lock`; do not copy another workspace's `node_modules`.
There are no third-party runtime packages to install: SQLite is built into Bun
and the required Relay source is included. The demo and tests also work before
installing development dependencies with these direct commands:

```sh
bun --no-env-file --no-install src/cli.ts demo
bun --no-env-file --no-install test ./tests
```

Individual checks after installation:

```sh
bun --no-env-file run test
bun --no-env-file run typecheck
bun --no-env-file run check:publication
bun --no-env-file --no-install src/cli.ts admission
```

The demo creates an owned `.tmp/demo-*` directory inside the clone and preserves
it for inspection. Tests create disposable state inside `.tmp/` and remove their
own fixtures. Run them from a disposable clone when inspecting untrusted changes.
The publication check verifies the exact file allowlist, reviewed source hashes
and all nine Relay hashes; generated `.git`, `.tmp` and `node_modules` entries
are excluded. GitHub CI runs the same checks and demo on Linux and macOS. Its
actual results are evidence for those runners, not WSL qualification.

## What the concept does

The demo creates an immutable context and candidate-bound task, grants a complete
claim, sends checked callbacks through Relay, commits ingestion before explicit
acknowledgement and records result availability separately from settlement.
Only an explicit candidate-bound operator action accepts the fixture result.
The demo then cancels another attempt, prunes detailed deduplication state and
rejects stale work. Its fake evidence does not prove a repository feature works.

The reusable ledger validates claim fields, task-version compare-and-swap,
payload/hash conflicts, complete requirement mappings, context/candidate/evidence
hashes, session occupancy, retirement fences and durable outgoing intents.
Result IDs cannot be rebound to different content. `BoundWorker` exposes result
submission without operator acceptance.

The workspace helper provides bounded exact search, sensitive-file and symlink
exclusions, working-byte hashes and selected skill-body metadata. Supporting
skill scripts/resources are not qualified. These helpers and same-user SQLite
files provide coordination and operator workflow, not hostile-code isolation
or same-user authentication.

## Operator CLI

Use `bun --no-env-file --no-install src/cli.ts` followed by a command. State and
workspace roots must be explicitly owned paths **inside this clone**. The helper
is not an unrestricted filesystem reader or a sandbox.

```text
--state PATH create INPUT.json   # {contract,context}; hashes are checked
--state PATH show TASK
--state PATH claim TASK SESSION
--state PATH event CALLBACK.json
--state PATH accept REVIEW.json  # taskId,resultId,candidateSHA,dirtyHash,reason,waived?
--state PATH cancel TASK
--state PATH recover             # explicitly retire uncertain old claims
search ROOT QUERY
skill ROOT RELATIVE/SKILL.md
admission
activate-pi                      # exits 1 with NATIVE_PI_UNQUALIFIED
```

The event/acceptance CLI is a trusted adapter/operator surface. No model-facing
acceptance tool exists. Document examples stay inert in the structured helper;
this does not establish or change a host runtime's guard behavior.

## Integration and durability limits

Native Pi request admission, cancellation and model binding remain **BLOCKED**.
Ordinary hooks, retries and compaction do not establish the required admission
gate. There is no SDK, provider guard, fork or custom runner added here. Herdr
has not been integrated or started. Existing LiteLLM is a future client-only
integration; this repository deploys no gateway or provider backend.

Earlier separate tiny-model local experiments reached inference but ended in
output-token truncation and remain **INCOMPLETE**. Their private historical
evidence, models, download scripts and optional smoke/native-characterization
tools are not shipped. This publication runs no inference and downloads no
model. Cleanup tests use harmless owned process stubs only.

Schema version 1 and expected columns are checked before reopening a ledger.
Old concept databases fail closed; no migration is supplied. Initialization
markers commit together, but a new file is visible before initialization
finishes. A crash during cold initialization can leave a refused partial file
requiring explicit operator handling. Atomic publication, concurrent
initialization, power loss and general schema migration are unqualified. Start
with a new owned state directory for this revision.

Tests exercise real owned-process SIGKILL boundaries and direct-child signal
cleanup. They do not prove power-loss behavior or supervision after parent
SIGKILL/machine loss, and do not cover unmanaged descendants. WSL and native
platform integration remain future work.

## Source and publication

The unchanged nine-file Relay closure is pinned to
`dfe1b039bab45f4055ab39467e994a2981940c02`. Attribution and rights status are in
[`NOTICE.md`](NOTICE.md); this public repository adds no reuse license grant.
`private: true` prevents package-registry publication, independently of GitHub
visibility. Original private Git history, reports, internal contracts, process
metadata, local paths and raw evidence are excluded from the new history.

The exact exported files and hashes are in
[`docs/source-manifest.json`](docs/source-manifest.json). The publication plan
and validation boundary are in [`docs/publication-plan.md`](docs/publication-plan.md)
and [`docs/publication-status.md`](docs/publication-status.md).
Terminal-first LAB-HARNESS concept: task evidence, context and Relay messaging for Pi workflows
