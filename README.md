<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/branding/terminal-b-dark.svg">
  <img src="assets/branding/terminal-b-light.svg" alt="LAB-HARNESS terminal B" width="84" height="112">
</picture>

# LAB-HARNESS

An interactive Pi coding workspace with LAB branding, bounded source search,
explicit skill loading and a persistent terminal owned by Herdr. The separate
LAB ledger keeps durable task evidence and explicit operator acceptance.

## Install and open LAB

From your terminal, outside any checkout:

```sh
curl -fsSL https://raw.githubusercontent.com/bbawuah/lab-harness/main/bootstrap.sh | sh
```

**This public command becomes available when this change is merged.** The
bootstrap downloads a SHA-256-pinned immutable harness archive and installs
Bun 1.4.2 when needed, Pi 1.4.0 standalone, Herdr 0.9.5, ripgrep, fd and frozen
JavaScript dependencies. No Git, global Pi, Node, sudo or shell profile edit is
required. Supported platforms are macOS arm64/x86_64 and Linux x86_64 with
standard `curl`, `tar`, `unzip` and SHA-256 tools. WSL remains unverified.

Installation then opens the interactive setup and TUI through `/dev/tty`;
piped script bytes are never read as answers. Without a controlling terminal,
installation finishes and prints the exact launcher path. For installation
only, append `| sh -s -- --install-only` instead of `| sh`.

First start asks for an existing local OpenAI-compatible endpoint and exact
model ID, or an existing LiteLLM endpoint, alias and private API key. Key input
is hidden and stored in private user-local state. Installation sends no model
prompt, chooses no paid model and downloads no weights. Start your local model
server separately, then enter its `/v1` URL and model ID. LiteLLM remains a
client destination; LAB installs no gateway. Once configured, type a prompt.

The stable launcher is `${XDG_DATA_HOME:-$HOME/.local/share}/lab-harness/lab`.
Setup prints an explicit PATH command if you want to run `lab` by name; profiles
are untouched. Releases live under the adjacent `releases/<commit>` directory;
route, key and native Pi sessions persist beneath
`$HOME/.local/share/lab-harness/workspace`, including when releases use an
external `XDG_DATA_HOME`.
Rerun the public command to install the pinned release, verify existing source,
repair missing runtimes, and update the owned launcher. Unrecognized existing
launchers or modified source are refused with instructions. Old releases remain
available; no user state is silently deleted.

From an existing checkout, including a fresh pull on your MacBook:

```sh
./install.sh
./lab
```

`./lab` also acquires missing verified runtime dependencies on demand. Use
`./lab --configure` to change routes and `./lab --offline` to require complete
local caches with no acquisition network access. `./install.sh --offline` also
requires cached frozen JavaScript dependencies. Normal reruns reuse valid
caches and repair partial/corrupt runtime downloads atomically. A first install
needs GitHub/npm access; a missing offline dependency produces an error.
Bun caches, Pi, Herdr, fd and ripgrep remain beneath the checkout's `.tmp`.

## In the workspace

Type a prompt to use the model you selected. `/lab-search TEXT` and
`/lab-files NAME` perform bounded literal search with source hashes; the model
also has `lab_search` and `lab_files` tools. `/lab-skills` lists available local
repository, Codex and Claude skill metadata. `/lab-skill ID` explicitly loads
verified instructions; ambiguous origins require the exact displayed origin
and path. Discovery does not execute skill scripts. Native Pi provides its
coding tools and session behavior. `/exit` exits the workspace.

**LAB does not submit this workspace as a controlled ledger task.** Controlled
`activate-pi` execution remains unavailable: request admission is unqualified
across retries, compaction, auth/routing and native session behavior. The TUI
runs useful native Pi coding while the separate operator ledger retains explicit
acceptance. Native shell/file tools run as your user; this workflow separation is
not an OS sandbox. [Mode boundary and source evidence](docs/pi-seam.md).

## Secondary demonstrations

The demos below demonstrate ledger/search/terminal contracts and do not open the
AI workspace. `bun --no-env-file run demo:terminal` runs a harmless real Herdr
worker; `bun --no-env-file run demo` uses fixture workers. Historical no-model
branding and output-slide captures are described in [the media guide](docs/demos/README.md).

### Advanced manual setup

The individual steps remain available for diagnosis or selective tool acquisition.
Unlike `install.sh`, plain Bun installation uses Bun's default cache unless you
specify a project-local one:

```sh
bun --no-env-file install --frozen-lockfile --ignore-scripts --cache-dir .tmp/bun-cache
bun --no-env-file run setup:herdr
bun --no-env-file run setup:rg
bun --no-env-file run setup:fd
bun --no-env-file run setup:pi
bun --no-env-file run check
bun --no-env-file run smoke:herdr
bun --no-env-file run check:actual
```

`demo:terminal` searches an owned source file, builds and revalidates immutable
context, launches a harmless worker in an isolated Herdr session, observes its
output and process status, then stops its pane/server. Results travel through
persisted outgoing intents and real Relay ingest-before-ack. The ledger finishes
at `result_available` with acceptance `null`. It prints the owned state directory
and review commands; inspect them before explicitly invoking `accept`.

The original `bun --no-env-file run demo` is still a deterministic **fixture**
gateway/worker/candidate demo. It makes no model calls and simulates an explicit
operator disposition. Actual process evidence and fixture envelopes stay labelled.

## Operator commands

Prefix these with `bun --no-env-file --no-install src/cli.ts`. State and search
roots must be owned subdirectories inside this clone; this is a bounded source
adapter, not an OS sandbox or same-user authentication boundary.

```text
terminal-demo                   # real Herdr/SQLite/Relay, no model, acceptance pending
herdr-smoke                     # process evidence only; no task authority
header [COLUMNS] [light|dark] [--no-color]
pi-ui-smoke PI_PATH NODE_PATH    # owned no-model Pi startup through Herdr, then stop
search ROOT QUERY [LIMIT] [auto|fallback|rg]
files ROOT NAME [LIMIT]          # literal basename substring
context ROOT INPUT.json         # candidate, requirements, sources, optional selected skills
verify-context ROOT CONTEXT.json
skill ROOT RELATIVE/SKILL.md     # original progressive metadata helper
skills ORIGINS.json             # sanitized inventory; roots are explicit local inputs
skill-select ORIGINS.json NAME  # sealed identity; ambiguous names are refused
skill-load ORIGINS.json REF.json # explicitly returns verified instruction text
--state PATH create INPUT.json  # {contract, context, workspaceRoot?}
--state PATH show TASK
--state PATH claim TASK SESSION
--state PATH event CALLBACK.json
--state PATH accept REVIEW.json # trusted operator workflow only
--state PATH cancel TASK
--state PATH recover
admission
activate-pi                     # refuses NATIVE_PI_UNQUALIFIED
```

Search preserves complete source-byte hashes, relative paths and one-based line
spans. It excludes sensitive config/env paths, generated state, binaries, invalid
UTF-8, symlinks and hardlinked files. Limits and omissions are explicit. Context
rehydrates selected lines and refuses changed, deleted or renamed sources.
[Search behavior and benchmark](docs/search.md), [context/architecture](docs/architecture.md).

The deterministic 266-file code/docs benchmark exercises actual Bun SQLite FTS5.
Exact search Recall@5 was 1.0 versus FTS5 0.9 across ten fixture queries; token
semantics differ and full index reconciliation was not measured. Exact scanning
remains the default. Optional rg is a bounded prefilter; no hybrid, vector or
graph benefit is claimed. Rerun with `bun --no-env-file run benchmark:search`.

## Skills and Pi

[The skill compatibility report](docs/skills.md) inventories all discovered user
and portable-repository origins, retaining duplicates, resource/script identities
and unavailable dependencies. Metadata discovery executes no skill code. Explicit
local loading rechecks the instruction and complete resource bundle. Private
bodies, home paths and proprietary bundles are not published. Source roots are
operator-supplied local manifests; connected services remain connected-service
dependencies. Skill text is not a security boundary.

Prefix context or state commands with `--skill-sources ORIGINS.json` when their
context contains selected skills. Creation, claim, event and acceptance recheck
both source bytes and every selected skill bundle. Missing manifests and changed
scripts/resources refuse the operation. Cancellation and inspection stay usable
for recovery. The terminal demo writes its own local example manifest and prints
the complete operator command; no user skill executes automatically.

The opt-in Pi advisory bridge maps native TUI prompts to Herdr's blocked events
and retains aborted/model-selection observations. It grants no acceptance or
request-admission authority. The [Pi seam report](docs/pi-seam.md) identifies
swallowed hook exceptions, compaction/retry paths, auth-dependent routing and
cache warming as reasons native activation remains blocked. LiteLLM remains an
existing client destination; this project deploys no gateway or inference backend.

The owner's terminal B uses the canonical six paths and four-spot mesh in neutral
monochrome. [Light](assets/branding/terminal-b-light.svg) and
[dark](assets/branding/terminal-b-dark.svg) SVGs have no private runtime dependency.
[Brand preview](docs/branding-preview.html) and
[provenance](assets/branding/PROVENANCE.json) retain the source identity.

The [supported Pi header extension](src/pi/header.ts) replaces Pi's built-in
startup logo and hints through `ctx.ui.setHeader`, while retaining **Powered by
Pi** and the blocked native-LAB status. Its terminal mesh derives from those
exact SVGs; narrow/no-color terminals get an identified `[B]` text fallback.
`pi-ui-smoke` launches the explicitly supplied installed Pi 1.4.0 with offline,
no-tool/no-MCP/no-discovery flags in an owned Herdr pane, checks the visible
header and stops it. It submits no prompt and never activates LAB. This worked
on macOS with the actual installed Pi; [runtime identity and evidence limits](docs/pi-header.md)
remain separate from fixture palette checks. No Pi installation is required by
the default checks or CI, and nothing is installed globally.

## Validation and limits

`check` runs regressions, strict typecheck and publication integrity. Actual Herdr
and integrated-flow tests are explicit skips without `LAB_HERDR_ACTUAL=1`;
`check:actual` requires the acquired runtime and fails if it is unavailable.
GitHub CI runs actual terminal checks, demos and the deterministic benchmark on
Linux and macOS. Ubuntu evidence applies to that runner, **not WSL**.
Both runners acquire pinned rg for the optional fast-path cases and execute the
decoded media/provenance audit. [Protected-main and CI responsibilities](docs/ci.md)
describe the stable required checks and isolated Bun/Python tool phases.

Owned normal/deadline cleanup is exercised. Parent termination, SIGKILL, machine
loss, arbitrary descendants, offline packet capture and WSL remain unqualified.
Native Pi cancellation/admission/model binding is also unqualified. Existing
ledger schema v1 and initialization-crash limits remain; use a new owned state
directory, not an old concept database. Recovery retires uncertain claims;
terminal restarts never accept a task. Detailed same-user coordination limits
are in [the architecture](docs/architecture.md) and [Herdr notes](docs/herdr.md).

## Publication and rights

The original exported concept's hashes remain immutable in
[the source manifest](docs/source-manifest.json). Development files have separate
current identities and an exact allowlist. The checker also rejects private
paths/credential patterns and preserves all nine unchanged Relay source hashes
at `dfe1b039bab45f4055ab39467e994a2981940c02`. Generated `.git`, `.tmp` and
`node_modules` entries are excluded. Inspect intentional changes before running
`bun --no-env-file run refresh:publication`; CI never refreshes hashes.

[NOTICE.md](NOTICE.md) records attribution and rights. This repository grants no
reuse license; `private: true` also prevents package-registry publication. No
private source history, vault contents, tokens, model assets or third-party skill
bundles are committed. The current [build plan](docs/build-plan.md) is separate
from immutable historical research inputs.
