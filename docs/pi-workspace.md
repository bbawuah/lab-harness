# Native Pi interactive workspace

`src/pi/workspace.ts` exports
`runInteractiveWorkspace(options?: { configure?: boolean; project?: string; relayGroup?: string }): Promise<number>`.
The coordinator's `./lab` launcher calls it; `./lab --configure` repeats route
setup. The selected project is `options.project ?? process.cwd()`, canonically
bound through `src/project.ts`. `./lab --project '/path/to/project B'` selects
another existing directory. Pi and its Herdr pane/client use that project as cwd.
Errors explain a missing terminal, invalid route, unsafe state or
unverified dependency. Setup makes no provider request and downloads no model.

This is native Pi interactive coding with LAB source search and explicitly
loaded skill instructions. Controlled LAB task execution remains unavailable.
There is no grant, ingest or acceptance command in this extension. Native Pi
file tools, shell execution, model selection, authentication and sessions retain
native behavior; this mode does not enforce a LAB request admission gate.
The existing `activate-pi` refusal is unchanged. The workspace header says
`Interactive coding workspace` and `Controlled LAB tasks: unavailable`.
The separate header extension's legacy blocked label remains its default.

## Dependencies and route setup

The launcher calls `verifyPiRuntime()` and uses its returned argv, never a
global Pi. Installation-local Herdr and ripgrep must match their platform-specific
pinned artifact hashes. Installation/acquisition belongs to the coordinator
and acquisition specialist; this entry point never repairs or downloads them.
The integration requires coordinator SearchService support for the explicit
`projectBinding` option with the exact selected directory identity.
Default SearchService callers retain their existing owned-subdirectory rules.

First run requires an actual terminal. Choose `local` with an explicit
self-hosted OpenAI-compatible HTTP(S) base URL and exact model ID, or `litellm`
with an existing HTTP(S) endpoint, alias and key. Self-hosted destinations may
use loopback, LAN, tailnet or another valid host. Setup does not select a service,
start LiteLLM, download weights or fall back to a cloud provider. Endpoint URLs
cannot contain credentials, query strings or fragments. Include `/v1` when the
server requires it. Remote LiteLLM is an explicitly selected existing route;
no inference-price or network-sandbox guarantee is implied.

Key input uses raw terminal input without echo, shell execution or history.
Keys are private file contents and the designated Pi environment variable,
never command arguments. `models.json` refers to `$LAB_WORKSPACE_API_KEY`.
An empty local key becomes a dummy nonsecret value for Pi's model availability
check. LiteLLM requires an explicit nonempty key. No inherited provider keys,
proxy credentials or global Pi settings are forwarded. Native coding tools
run under the same user and are not a secret isolation boundary.

Default route, key, Pi agent/session state, Herdr runs and the shell wrapper live
beneath `$HOME/.local/share/lab-harness/workspace`, outside installed code and
the selected project. `LAB_WORKSPACE_STATE_ROOT` can select another private app
directory for state that persists across immutable release upgrades. Its value
must be an absolute app directory beneath the current user's home. Existing ancestors must belong to
the user, have no symlinks and have no group/world write access; the final
directory is mode 0700. State inside the installed release or selected project
is refused before directory creation; choose an outside override if the default
falls within your selected project. Private files must be user-owned regular
files with one link and mode 0600. No shell profile or global Pi config is changed.
Persistent sessions remain available through Pi's native session controls;
Pi partitions sessions by selected project cwd. Startup creates a new native
session rather than automatically resuming one. Herdr run/config files are
beneath the same private app directory in `runs/h-*`. A healthy launch creates
no files in the installed release or selected project. Native editing and shell
commands retain their ordinary ability to write project files.

## Attachment and lifecycle

The verified Herdr 0.9.5 executable runs a retained foreground `server` child.
A unique owned session uses a fresh short `/tmp/lab-h-*` directory for its two
Unix sockets, avoiding macOS's 104-byte socket path limit. Persistent state is
in the private user app directory. No user session
is discovered, attached, listed for cleanup or signalled.

The adapter pings the owned socket, checks the runtime version, creates an
owned workspace, applies a pane with explicit argv, and spawns `herdr client`
with inherited terminal stdio and the same socket environment. This hidden
client command is implemented by the inspected Herdr source and was exercised
against the actual pinned release. Herdr owns the Pi PTY and meaningfully
renders its live output; its native client forwards input, paste, resize and
interrupt. `onboarding = false` is the supported top-level config setting.
Update checks, restored agents and pane history are disabled in owned config.

A small non-login shell wrapper records Pi's numeric exit status in the run
directory. `/quit` is Pi's native quit command; this extension adds `/exit`
through the supported `ctx.shutdown()` API. Pi exit stops attachment and returns
its status. Detaching the Herdr client closes this invocation's owned pane and
server; native Pi session files persist. It does not leave a background Pi
process running. Parent SIGTERM/SIGHUP also trigger cleanup. Parent SIGINT is
forwarded to the owned pane; ordinary terminal Ctrl-C travels through the native
client. Startup has a bounded deadline; native interactive use has no timeout.

Cleanup closes only the owned pane, requests owned server shutdown, and waits
for retained client/server children. Signal fallback targets only retained
children. The recorded shell PID is checked for disappearance but never killed
by PID. `attachment.json` records client/server/worker exit and socket removal.
Unknown or failed cleanup raises an error instead of claiming success. Abrupt
parent SIGKILL or host failure cannot be guaranteed to clean up.

## LAB commands and tools

`lab_search` and `lab_files` are actual Pi model-callable tools. Operator
commands `/lab-search <literal>` and `/lab-files <literal>` call the same
existing bounded LAB SearchService. Results retain paths, SHA-256 byte hashes,
line spans, truncation and omission information. Root is the selected caller
project, including paths with spaces. Every bridge request revalidates the
canonical root, device and inode; replacement, redirection, missing bindings or
a mismatched root refuse. Existing source exclusions and symlink guards remain.
Verified installation-local rg is on the child PATH; the existing service
reports fallback honestly.

`/lab-skills` uses the existing discovery API on selected project instructions
and skills, installed portable examples, and the actual user
`~/.codex/skills` and `~/.claude/skills` origins. The `repository` origin means
the selected project; `examples` always means the installed bundled examples.
It lists metadata and source identities; it does not load instruction bodies or
execute skill scripts. The coordinator
excludes generated `.tmp`/`.lab` paths in repository discovery.

`/lab-skill <exact-id>` explicitly revalidates and loads one unambiguous origin.
For duplicates, select the origin explicitly:

```text
/lab-skill <exact-id> examples terminal-evidence/SKILL.md
```

The returned custom Pi message includes instruction and bundle hashes, original
local instruction path, and body. Resources remain at the original bundle.
Changed bytes, stale IDs and ambiguous origins refuse loading. No model-facing
skill-loading tool exists: an operator command is required. Loading does not
run a skill script or confer task acceptance authority.

The extension is explicitly loaded with `-e`; automatic extensions, MCP, skills,
prompt templates, themes and context files are disabled. It uses only supported
Pi registration/header/message/shutdown APIs. To stay compatible with standalone
Pi, LAB API calls execute under the launcher's Bun through this private bridge:

```text
BUN --no-env-file --no-install src/pi/workspace-extension.ts --bridge
```

`LAB_WORKSPACE_ROOT` and serialized `LAB_WORKSPACE_BINDING` identify the
project; `LAB_INSTALL_ROOT` separately identifies the installation. The bridge
checks the installation against its own module location and revalidates the
project before search/discovery/loading, and around skill byte loading.
One bounded JSON request arrives on stdin; stdout returns JSON. No secret is
passed in argv or bridge environment. The bridge has a 20-second deadline,
output bound and abort support. Source errors are sanitized in the Pi UI.
The exported workspace entry point throws useful safe startup errors to the CLI.

## Actual evidence, 2026-10-29

This specialist exercised the official standalone **Pi 1.4.0** macOS arm64
bundle through its acquisition verifier and actual pinned **Herdr 0.9.5**.
The Pi release commit is `4a080252f06caf63a525d7873c5d94d3c23887e0`, different
from the historical source pin. Release-specific supported APIs were inspected:

- [extensions/types.ts](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/extensions/types.ts):
  SHA-256 `cb54c7a4fedb3473bb995694bbc1f2988c144fb0b802bfd1b656816bc25d0f25`;
  `setHeader` line 208, context mode 329, tools 1671, commands 1680,
  `sendMessage` 1731 and context `shutdown`.
- [interactive-mode.ts](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/modes/interactive/interactive-mode.ts):
  SHA-256 `fab51416b06840d4fc3b0ba4e50c292b5f022f29f6f7b2322274b7c245e1db70`;
  native `/quit` handling at line 3297.
- The verified release bundle's own `docs/extensions.md` describes tool,
  command, custom-message and `ctx.shutdown()` APIs. Existing Herdr provenance
  identifies its inspected source and the differing actual runtime release.

Actual native Pi loaded `workspace-extension.ts`, rendered the new header,
completed `/lab-search activate-pi`, listed skills, explicitly loaded a disposable
fixture and the repository's portable `terminal-evidence` example with hashes,
and exited with status 0 through `/quit` and the new `/exit` alias. The search
smoke temporarily used the coordinator's committed SearchService file from
`13a9e7b`; that shared file is not part of the specialist handoff.

Automated actual Herdr evidence separately exercised keyboard input, terminal
resize from 24x80 to 40x110, Ctrl-C delivery to the owned worker, status 130,
and cleanup with all four flags true: server exited, client exited, worker
stopped, sockets removed. The ordinary focused suite passes with the actual
test explicitly skipped; opt in using:

```sh
LAB_HERDR_INTERACTIVE_ACTUAL=1 bun --no-env-file --no-install test tests/herdr-interactive.test.ts
```

Raw evidence stays in ignored local `.tmp`; it includes host paths and is not
published. The terminal automation procedure is **bracketed paste, then a
separate Enter after rendering settles**. Sending ordinary text and Enter in
one write allowed native autocomplete to change a command into prompt text in
an initial probe. That probe attempted only the configured nonexistent loopback
port 9 and returned connection errors with zero tokens; it established no
inference success. Subsequent successful command checks made no provider turn.
This specialist performed no successful model inference or paid call.
The coordinator owns bounded actual local-model validation. macOS mini evidence
does not qualify the user's MacBook, WSL or Ubuntu CI; controlled LAB admission
remains unqualified on every platform.

## Caller-project revision verification

Focused tests exercise search in an unrelated project with spaces, exact byte
hashes, source exclusions and symlink omission, project instructions, installed
portable examples, user Codex/Claude skills, explicit loading, stale skills,
missing/mismatched/replaced project bindings, and state isolation. A subprocess
launch fixture verifies default caller cwd and explicit project selection,
separate installation paths, state outside both trees, and no automatic resume.
The fixture substitutes only dependency verification and terminal attachment; it
makes no model request. Coordinator E2E owns real Pi/Herdr/local inference for
this revision; historical native-session evidence above is not a new inference
qualification.

## Built-in Relay lifecycle and verification

The workspace now provisions its private project bus before Pi starts. The
supported session_start hook binds ctx.sessionManager.getSessionId(); matching
session_shutdown releases the current owner on quit, reload and replacement.
The pinned types explicitly support these async lifecycle hooks and native
session IDs. Host-only 15-second heartbeats renew 60-second leases. Model tool
callbacks use their native context, never caller-supplied sender/inbox scope.

The extension registers relay_peers, relay_send, relay_inbox and relay_ack plus
operator slash equivalents. Its Bun stdin bridge uses a private run reference
from the launcher, bounded128KiB requests/1MiB replies/20-second deadline.
Neither receipt nor ack is ledger ingest, task completion or acceptance. Normal
read leaves mail unread, and inbox polling never starts a model turn.

Actual acceptance exercises two owned native Pi/Herdr TUIs through the shipped
launcher and same project bus: discovery, explicit send/reply, duplicate-key
receipt, repeated read, foreign-ack refusal, explicit recipient ack, native
reload reconnect and host heartbeat with zero inference requests. A separate
owned Chat-protocol fixture drives actual Pi relay_send execution and full
native process resume; the original receipt is reused. Its large-context and
disabled-helper settings are fixture configuration, not the default route's
capacity or model-quality qualification. No paid provider or real model call is
needed for this gate. Captures distinguish actual pane text from rendered views.
