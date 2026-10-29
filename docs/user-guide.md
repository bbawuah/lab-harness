# Use LAB-HARNESS

LAB is an interactive AI coding workspace in your terminal. Pi provides the
conversation and coding tools; Herdr runs the terminal; LAB adds bounded project
search and explicit skill loading. You supply a model server or existing
LiteLLM service. Setup installs runtimes, not model weights or an inference server.

## Five-minute start

1. Open a terminal in your project, or start from your home folder:

   ~~~sh
   curl -fsSL https://raw.githubusercontent.com/bbawuah/lab-harness/main/bootstrap.sh | sh
   ~~~

2. From home, choose an existing project such as ~/Projects/my-app. Enter the
   path without shell quotes; spaces work. Home and LAB's application folders
   cannot be the project. Blank input, Ctrl-C or Ctrl-D cancels selection.
3. Choose local for a local/self-hosted **OpenAI-compatible** server, including
   LAN or tailnet URLs, or litellm for your existing LiteLLM service. Enter its
   exact base URL, model ID/alias and private API key. Key input is hidden; blank
   is allowed for an unauthenticated self-hosted endpoint. No prompt is sent
   during setup. Review Pi's native project-trust prompt.
4. Installation creates an owned ~/.local/bin/lab command when there is no
   collision. If it reports the command is on PATH, use lab. Otherwise run the
   printed export PATH line in your own shell and verify command -v lab. The
   installer cannot change its parent shell's PATH and edits no profile.
5. In the TUI, try:

   ~~~text
   Reply with exactly READY as plain text. Do not call tools.
   /lab-search TODO
   /lab-files README
   /lab-help
   ~~~

The first line is a model request to your configured destination. The slash
commands run LAB operations without asking the model to generate a response.
Use /exit when finished.

## Launch and update

After PATH is verified, launch from your project:

~~~sh
lab
lab --project "/path/to/my project"
lab --configure
lab --help
~~~

The first command uses your current folder. --project DIR chooses another
existing directory; --configure changes the saved endpoint/model/key before
opening. There is no background service or automatic extra agent launch.
Each normal launch starts a new native session; previous sessions remain in
private state. Your selected project drives Pi's cwd, LAB search and project
skills, while installed runtime and private settings stay separate.

If the command is not available, use the exact stable launcher:

~~~sh
"${XDG_DATA_HOME:-$HOME/.local/share}/lab-harness/lab"
~~~

For a collision-free command installed outside the current PATH, enable it in
this shell:

~~~sh
export PATH="$HOME/.local/bin:$PATH"
command -v lab
~~~

To persist PATH, add that line to your own shell startup file: normally .zshrc
for interactive zsh on macOS, .bashrc for interactive bash on Linux/WSL. A new
terminal reads the file; editing it does not update an already open shell.
If installation reports a foreign lab command or file, it preserves it. Use the
full launcher rather than blindly prepending a path to shadow another command.
Check the reported path before using bare lab.

Rerun the public install command to update to the verified pinned release and
refresh LAB-owned launchers. Existing state and old releases are retained.
Offline launch is:

~~~sh
lab --offline
~~~

This requires complete local runtime caches and disables Pi's startup model
catalog networking. **It does not block model requests to the network or prove
local-only inference.** A remote gateway or even a local server can route work
elsewhere. Choose and operate the endpoint accordingly.

## Command reference

Shell commands belong at your terminal prompt. TUI commands belong inside Pi.
Model tools are functions the model may call, rather than commands you type.

| Where | Command | Purpose |
| --- | --- | --- |
| Shell | lab | Open current project; from home, choose a project |
| Shell | lab --project DIR | Select an existing project, quote shell paths with spaces |
| Shell | lab --configure | Change explicit endpoint/model/private key |
| Shell | lab --offline | Require cached runtime dependencies; inference network still possible |
| Shell | lab --relay-group ID | Select an explicitly prepared cross-project Relay allowlist; unnecessary for normal project sessions |
| Shell | lab --help | Show current launcher help without opening Pi |
| TUI | /lab-help | List LAB commands; native /hotkeys shows shortcuts and typing / opens the command menu |
| TUI | /lab-search TEXT | Literal bounded project text search with lines/hashes |
| TUI | /lab-files NAME | Find project filenames |
| TUI | /lab-skills | Inventory skills and exact IDs; load nothing |
| TUI | /lab-skill ID [ORIGIN PATH] | Explicitly load a verified skill |
| TUI | /relay-peers [OFFSET] | Discover readable peers in the selected project bus |
| TUI | /relay-send PEER REQUEST_KEY MESSAGE | Store an explicit message; reuse the same key/payload to retry |
| TUI | /relay-inbox [WAIT_MS] | Read your unacknowledged mail; optional wait is at most 10 seconds |
| TUI | /relay-ack MESSAGE_ID [MESSAGE_ID ...] | Explicitly acknowledge handled mail in your own inbox |
| TUI | /exit | Exit with owned terminal cleanup; native /quit also works |
| Model tool | lab_search | Model-callable source search |
| Model tool | lab_files | Model-callable filename search |
| Model tools | relay_peers, relay_send, relay_inbox, relay_ack | Session-bound peer discovery, send, read and explicit acknowledgement |

The model gets LAB search and Relay tools automatically; successful use depends
on tool-calling support. Operator slash commands work without a model turn.
Native Pi supplies its own file/shell coding tools. Broader provider-profile
menus remain separately reviewed work; they are not implied by Relay support.

## Message another workspace session

Open lab in two terminals on the same project. Each native Pi session
automatically registers a distinct readable peer. There is no MCP server to
configure. In each TUI:

~~~text
/relay-peers
~~~

Copy the other session's displayed peer ID or alias. Send from session A:

~~~text
/relay-send OTHER_PEER intro-1 Hello from session A
~~~

Replace OTHER_PEER; intro-1 is your request key. A stored receipt means the
message is durable, not that the recipient read or acknowledged it. If the
outcome is unknown, retry the same recipient, body and key. Changed payload with
the same key is refused; keys have a bounded 30-day retry horizon.

In session B, read:

~~~text
/relay-inbox
~~~

Reading again returns the same unacknowledged message. After handling it:

~~~text
/relay-ack MESSAGE_ID
/relay-send FIRST_PEER reply-1 --reply-to MESSAGE_ID Reply from B
~~~

Replace the displayed IDs. A foreign inbox cannot be acknowledged. Reply
references preserve the conversation between those peers. Ack is message
acknowledgement; it never completes or accepts a LAB task.

The model is instructed to check inbox when coordinating or before handoff.
Mail does not wake a model, start another agent or cause continuous model
polling. Only explicit message bodies are shared; no transcript, skill body or
private history is copied automatically. Same-project sessions share a private
durable bus across runtime upgrades. Distinct projects/worktrees are isolated
unless the operator explicitly selects a private allowlisted group with
--relay-group ID. [Advanced scope/lifecycle contract](relay-workspace-contract.md)
describes the private version1 project-binding manifest; no group setup is
needed for normal same-project messaging.

Presence is lease-based, not proof a model is listening. Normal exit marks its
peer offline; a crashed process becomes stale after its 60-second lease.
Reconnect/reload preserves the logical session's peer/mailbox and fences old
helpers. New sessions get new peers. Messages/receipts remain for recovery.
Body limit is 16,000 UTF-8 bytes; inbox defaults to five/max ten messages, peer
pages default twenty/max fifty, and /relay-inbox WAIT_MS is bounded to 10,000ms.
Use the next offset for more peers. Model-tool waits support cancellation;
session shutdown cancels active waits without acknowledging mail.

## Search and skills

Search reports paths relative to the selected project, one-based line spans
and source byte hashes. Sensitive env/key paths, generated folders, binary or
invalid UTF-8 content, symlinks and hardlinked files are excluded. Results have
limits; omission/truncation is explicit. Project binding is not an OS sandbox:
native Pi file/shell tools run with your user permissions.

~~~text
/lab-search function
/lab-files package
/lab-skills
~~~

To load the bundled example, copy its exact displayed ID from /lab-skills:

~~~text
/lab-skill ID examples terminal-evidence/SKILL.md
~~~

Replace ID with the actual skill ID. For an unambiguous skill, /lab-skill ID is
enough. An ambiguous ID needs the displayed origin and path. LAB rechecks the
instruction and resource hashes before returning text; changed/unavailable
skills are refused. Discovery and loading execute no skill scripts. User skill
locations may require their own services or installed dependencies.

## Models and endpoints available now

The current local choice means self-hosted OpenAI-compatible Chat Completions.
It accepts explicit HTTP(S) URLs on any host, including Tailscale/tailnet, LAN,
IPv6 and loopback. Include the correct base path, often /v1; LAB does not infer
that from your model name. LM Studio commonly exposes port 1234; Ollama's
compatible server commonly uses port 11434/v1. The server can use another port
or reverse proxy. You start/operate that server yourself.

Use an existing LiteLLM endpoint and its exact public model alias for litellm;
LAB is a client and deploys no gateway. Do not put credentials in the URL.
Dedicated OpenAI/Anthropic provider onboarding and model-profile switching are
separately researched work, not features of this current two-route setup.
Do not configure Anthropic's Messages endpoint as if it were Chat Completions.
Changing endpoint/model currently uses lab --configure and a fresh launch.

## Exit, cancellation and state

Use /exit or native /quit for normal exit. Owned Herdr client/server/pane state
is cleaned up; route/key and native sessions persist. Cancelling project
selection creates no workspace route/state. In private key entry, Ctrl-C or
Ctrl-D cancels setup. For native Pi generation shortcuts use /hotkeys and the
[pinned upstream keybinding guide](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/docs/keybindings.md).
A local cancellation or timeout does not prove a remote server stopped work.
This pinned Pi has no built-in /help command; unrecognized slash text can become
a model prompt. Use /lab-help for LAB and /hotkeys for native shortcuts.

Private route, key, agent/sessions and owned run reports live beneath
$HOME/.local/share/lab-harness/workspace. Releases live beneath
${XDG_DATA_HOME:-$HOME/.local/share}/lab-harness/releases/&lt;commit&gt;.
The stable launcher points at a verified release. Keys are private file
contents, not command arguments. Keep state private; never paste keys into chat,
prompts or support logs. LAB does not automatically import vendor credentials.
Relay bus/control state lives under the same private workspace root, outside
the project and installed release. Sender and inbox are fixed to the native
session; they are not model-supplied overrides. This is a trusted adapter for
same-user coordination, not an OS sandbox.

## Common problems

| Symptom | Action |
| --- | --- |
| Project chooser appears | Pick an existing code folder, not home or an application-state ancestor; or cd into your project and launch again |
| Missing/invalid project | Create/choose the directory yourself; symlink roots and filesystem roots are refused |
| Invalid endpoint | Use an explicit HTTP(S) URL without username/password, query or fragment; check the service's base path |
| Connection refused/TLS error | Start/reach the selected server and confirm host/port/certificate; LAB does not deploy it or disable TLS validation |
| Model not found | Enter the exact loaded server model ID or gateway alias with --configure |
| Key/authentication failure | Replace the explicit private key through --configure; do not paste it into the TUI conversation |
| lab not found | Run the printed PATH step, verify command -v lab, or use the full quoted launcher |
| Another lab exists | Keep it intact and use LAB's absolute launcher; do not overwrite an unknown command |
| Missing/corrupt runtime while offline | Rerun installation online to repair verified bytes; no cloud model fallback is selected |
| Source/skill refused | Check the selected project, excluded/changed paths and exact skill origin/ID; refresh the inventory |
| Relay operation refused | Check peer ID, unchanged request key/payload, current session ownership and project/group binding; reconnect by restarting/reloading if the lease expired |

Without a controlling terminal, bootstrap installs only and prints the launcher.
Open a terminal to select the project/configure a model. Supported runtime
platforms are macOS arm64/Intel and Linux x86_64; WSL is a separate unverified
target. Native coding is available, while controlled LAB ledger-task execution
remains unqualified and unavailable. Relay messages, terminal output or model
answers never accept a ledger task.
