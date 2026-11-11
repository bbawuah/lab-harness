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
lab --single-pane
lab --mode edits
lab --help
~~~

The first command uses your current folder. --project DIR chooses another
existing directory; --configure changes the saved endpoint/model/key before
opening. There is no background service or automatic extra agent launch.
Each normal launch starts a new native session; previous sessions remain in
private state. Your selected project drives Pi's cwd, LAB search and project
skills, while installed runtime and private settings stay separate.

The default workspace has fullscreen Pi on the left and your regular
interactive shell on the right. Both start in the selected project; your shell
startup files may intentionally change its directory. The Pi composer stays at
the bottom while the conversation scrolls above it. Its double-rule border
and Message label distinguish the draft from sent messages. The editor grows
with the draft, then scrolls internally when it reaches its visible-line limit.

Use Ctrl+B, then h or l to focus left or right; Ctrl+B, then Tab cycles panes.
Ctrl+B, then z zooms the focused pane, and Ctrl+B, then ? lists Herdr controls.
These are prefix sequences, rather than keys held together. Ctrl+C goes to the
focused pane. Closing the right shell leaves Pi running; /exit in Pi leaves the
whole workspace and cleans its owned terminal processes.

For a narrow terminal, zoom a pane or start with lab --single-pane. That option
starts Pi alone and creates no right-hand shell. There is no automatic split
folding or shell restart on resize. Your regular shell retains its own startup,
PATH and theme; LAB does not rewrite shell profiles or terminal fonts.

Inside Pi, PageUp/PageDown scroll the transcript and Ctrl+Home/Ctrl+End go to
its beginning/latest output. Home/End and multiline arrows retain editor
behavior. Output arriving while scrolled away does not force a jump to latest.
The [standalone qualification report](evidence/fullscreen/report.md) documents a
remaining delayed fragmented mouse-input case; it does not establish physical
mouse behavior in every terminal. Keyboard navigation remains available.

Use /lab-appearance to change LAB appearance. Its staged sample has numbered
controls: Scope, Mode, Palette, editor/transcript padding, Reset, Apply and
Cancel. Use arrows or j/k and Enter, or press a number. Esc cancels. Mode offers
light, dark and terminal; terminal follows Pi's reported terminal appearance,
with dark fallback when it cannot be determined. This does not detect OS mode. Color depth is captured at launch; relaunch after
changing terminal color capabilities. Herdr defaults do not upgrade that captured
LAB capability during Apply.
If a saved custom palette loses contrast on a 256-color terminal, LAB opens
with a visible temporary Standard palette and preserves the saved values. Use
/lab-appearance to choose Standard or Reset; Apply checks both modes before saving. If a changed project override needs
fallback during a user-scope Apply, LAB shows the saved/fallback summary and lets
you reload with temporary Standard or defer the full resource reload. Settings
and generated themes are already saved; native theme watching may refresh colors.
The compact view keeps the focused choice and sample visible in small panes.
The Standard palette has readable light/dark colors; Custom edits semantic
#RRGGBB colors and refuses poor contrast against the chosen background.

Choose User defaults or explicitly choose This project only. Apply saves and
reloads Pi resources while keeping the right shell running. Other open sessions
keep their current appearance; future launches read the new defaults. Cancel
discards the draft without saving or changing the active theme. Reset removes
that scope's override: projects inherit user defaults, and removing all LAB
preferences restores native appearance settings. The dialog sample is not a
preview of shell styling or every native Pi component.

NO_COLOR makes the LAB sample plain and generated Pi theme colors use terminal
defaults. This does not force the independent Herdr frame or your shell to be
monochrome. Indexed/16-color terminals may differ; full-app contrast and physical
terminal behavior need terminal-specific validation. Font family, font size and
line height belong to your terminal app; LAB does not change profiles or send
terminal-setting escape sequences. Use terminal preferences for these controls.

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

Update from your terminal without opening a chat:

~~~sh
lab update
~~~

This downloads the public bootstrap and installs its verified pinned release,
then refreshes LAB-owned launchers. Settings, sessions, and old releases remain.
Already-running sessions keep their current release; new launches use the updated
one. `lab update --help` explains the command without downloading anything.
Run update separately from workspace options; offline updates are not supported.
Unpublished local features are not included, nor are main commits beyond the
bootstrap's published pin.

If an older launcher does not recognize `update`, run the public install command
once to install a launcher with this command.
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
| Shell | lab --single-pane | Open Pi alone, useful in a narrow terminal |
| Shell | lab --offline | Require cached runtime dependencies; inference network still possible |
| Shell | lab --mode MODE | Start in permission mode ask (default), edits, read-only or auto; see [Approvals](#approvals-and-permission-modes) |
| Shell | lab --setup-browser | Explicitly acquire the pinned browser control tool (no browser download) |
| Shell | lab --browser URL | Start an owned browser bound to that HTTP(S) origin |
| Shell | lab --browser-executable PATH | Use an existing approved Chrome/Chromium/Edge with --browser |
| Shell | lab --relay-group ID | Select an explicitly prepared cross-project Relay allowlist; unnecessary for normal project sessions |
| Shell | lab --help | Show current launcher help without opening Pi |
| TUI | /lab-appearance | Stage theme/colors/spacing; Apply, Cancel or Reset; no model request |
| TUI | /lab-mode [ask\|edits\|read-only\|auto\|next] | Show or change the permission mode; the footer shows the current mode |
| TUI | /lab-browser status\|close | Owned browser origin/lifecycle, or close it for this run |
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
Native Pi supplies its own file/shell coding tools; LAB asks before they change
anything (see below). Broader provider-profile
menus remain separately reviewed work; they are not implied by Relay support.

## Approvals and permission modes

By default LAB asks before the model changes anything. Each edit, file write,
shell command, browser navigate/fill/click and Relay send opens an approval
prompt that shows the concrete action:

- edit: the file, the number of replacements, `−removed +added` lines and the
  first changed lines;
- write: the file, `new file` or `overwrites N bytes`, and a preview;
- shell: the full command, its folder (`cwd`) and timeout;
- browser: the origin, the element (`@e4 textbox "Email"`) and the value to type.
  Passwords, codes, tokens and other secret-looking values are masked;
- Relay send: the recipient peer and the message.

Choose **Allow once**, **Allow for this session** (only the same tool and
pattern: the exact command in the same folder, the same file, the same browser
element on the same origin, or the same peer), **Deny**, or **Deny with note…**.
A note is passed to the model. Esc denies. A denied action is not run, and the
model receives `LAB_PERMISSION_DENIED`, so the turn continues instead of
hanging. Reads, searches, browser snapshots and inbox reads never ask.

| Mode | What runs without asking |
| --- | --- |
| ask (default) | Reads and Relay acknowledgements; everything else asks |
| edits | Also file edits and writes inside the project; shell, browser and Relay sends still ask |
| read-only | Reads only; every change is refused with a message to the model |
| auto | Everything except desktop actions, which always ask. Choose it explicitly |

Start with `lab --mode edits` (or another mode), or change it inside Pi with
`/lab-mode` (shows a picker), `/lab-mode read-only`, or `/lab-mode next` to
cycle ask → edits → read-only. `next` never enters auto. The footer always shows
`● mode: … · /lab-mode` (with `!` in auto), and it stays visible at 40 columns. There is no keyboard shortcut: Shift+Tab
is Pi's thinking level, and other keys don't reach Pi reliably in default terminals.

Switching to auto inside Pi asks once to confirm. The prompt names what auto skips:
no approval prompt for edits, shell commands, browser actions or Relay sends.
Desktop actions still ask in auto (Allow once / Deny) and are refused in read-only.
Cancel or Esc keeps the current mode. `lab --mode auto` prints a one-line warning
before the workspace starts.

The mode survives `/reload`, `/new` and `/resume` within one launch. Each new
`lab` launch starts in ask unless you pass `--mode`. "Allow for this session"
grants live only in memory; they end on `/new`, `/resume`, `/reload` and any mode
change, and nothing is saved as "always allow". The model cannot change the mode
itself: the mode is stored in LAB's private run folder, and edits mode never
auto-approves files outside the project (including through symlinks or `..`),
inside LAB's own state, or config that can run code later (`.git`, `.pi`,
`.agents`, `.claude`, `.codex`, `.husky`, `.vscode`, `.envrc`); those still ask.
If no prompt can be shown, for example in Pi's json or
print modes, every gated action is denied unless the mode is auto. Shell commands
you type yourself with `!` are your own actions and are not gated.

Approvals are a gate, not an OS sandbox: an approved command runs with your user
permissions. Details: [permission modes contract](permission-modes-contract.md).

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

Incoming messages appear in a labeled Relay block with the sender session and
message body. Press Ctrl+O to expand details, including the message ID needed
for acknowledgement or a reply. The same compact display applies to the
model’s relay_inbox tool; structured tool results retain their metadata.

Reading again returns the same unacknowledged message. After handling it:

~~~text
/relay-ack MESSAGE_ID
/relay-send FIRST_PEER reply-1 --reply-to MESSAGE_ID Reply from B
~~~

Replace the displayed IDs. A foreign inbox cannot be acknowledged. Reply
references preserve the conversation between those peers. Ack is message
acknowledgement; it never completes or accepts a LAB task.

Incoming mail appears as a Relay block and starts a model response when the
recipient is idle. A busy recipient finishes its current turn first. LAB checks
the inbox locally; these checks do not call the model. Each message starts at
most one automatic turn on the current transcript branch, including after
`/reload`. Reading and automatic delivery do not acknowledge mail; the model
must acknowledge handled IDs with `relay_ack`.

Use `/relay-auto off` to pause automatic responses, `/relay-auto on` to resume,
and `/relay-inbox` to inspect mail manually. This setting persists in the native
session. Automatic responses still obey the session's permission mode.
Only explicit message bodies are shared; no transcript, skill body or
private history is copied automatically. Same-project sessions share a private
durable bus across runtime upgrades. Distinct projects/worktrees are isolated
unless the operator explicitly selects a private allowlisted group with
--relay-group ID. [Advanced scope/lifecycle contract](relay-workspace-contract.md)
describes the private version1 project-binding manifest; no group setup is
needed for normal same-project messaging.

### Agents in Herdr tabs

Ask the model to “spawn a reviewer to inspect the current diff and report back.”
It receives `agent_spawn`, `agent_list`, and `agent_stop`. Each child opens in a
visible Herdr tab without taking focus; use Ctrl+B then n/p to switch tabs.
`/agents` lists the children and their process state. To message an existing
session, ask the model to find it with `relay_peers` and use `relay_send`.

Children receive the explicit task and the parent's Relay address. They inherit
the configured model and current permission mode, with their own native session,
inbox, settings, and permission state. They share project files: assign separate
files or coordinate edits. They do not inherit the parent's transcript or owned
browser. A child can report back with `relay_send`; the idle parent receives the
result automatically. In ask mode, child tool approvals appear in the child's tab.

Only the spawning session can stop its child through `agent_stop`. `/exit` in a
child closes that tab; `/exit` in the original session closes the whole workspace
and its children. Transcripts remain available through native session resume.
There are at most eight active children per workspace and 64 launches during one
workspace lifetime. Reusing a spawn request key with the same task returns the
original result; an uncertain launch is reported as `unknown` and is not retried
automatically. Inspect its Herdr tab before deciding what to do next.

Presence is lease-based, not proof a model is listening. Normal exit marks its
peer offline; a crashed process becomes stale after its 60-second lease.
Reload while ownership is healthy preserves the logical session's peer/mailbox
and fences old helpers. After an expired lease or changed binding, exit and
launch lab again, then use native /resume to reopen the same session. A fresh
launcher run supplies the new ownership capability; /reload alone cannot recover
an expired run. New sessions get new peers. Messages/receipts remain for recovery.
Body limit is 16,000 UTF-8 bytes; inbox defaults to five/max ten messages, peer
pages default twenty/max fifty, and /relay-inbox WAIT_MS is bounded to 10,000ms.
Use the next offset for more peers. Model-tool waits support cancellation;
session shutdown cancels active waits without acknowledging mail.

## Search and skills

Search reports paths relative to the selected project, one-based line spans
and source byte hashes. Sensitive env/key paths, generated folders, binary or
invalid UTF-8 content, symlinks and hardlinked files are excluded. Results have
limits; omission/truncation is explicit. Project binding is not an OS sandbox:
native Pi file/shell tools run with your user permissions once approved.

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

Private route, key, appearance/preferences.json, agent/sessions and owned run reports live beneath
$HOME/.local/share/lab-harness/workspace. Releases live beneath
${XDG_DATA_HOME:-$HOME/.local/share}/lab-harness/releases/&lt;commit&gt;.
The stable launcher points at a verified release. Keys are private file
contents, not command arguments. Keep state private; never paste keys into chat,
prompts or support logs. LAB does not automatically import vendor credentials.
Each launch keeps generated native config/themes in runs/h-*/agent, separate
from the persistent project session directory under agent/sessions. Historical
native auth is retained without being imported into the new runner.
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
| Relay operation refused | Check peer ID, unchanged request key/payload and project/group binding. For an expired lease, exit, launch lab again and use native /resume for the same session; reload alone cannot renew the run |

Without a controlling terminal, bootstrap installs only and prints the launcher.
Open a terminal to select the project/configure a model. Supported runtime
platforms are macOS arm64/Intel and Linux x86_64; WSL is a separate unverified
target. Native coding is available, while controlled LAB ledger-task execution
remains unqualified and unavailable. Relay messages, terminal output or model
answers never accept a ledger task.

## Optional owned browser

Run `lab --setup-browser` once to acquire checksum-pinned agent-browser 0.41.0.
This downloads the control tool, never a browser. `lab --setup-browser --offline`
requires a verified cached tool. An approved same-OS Chrome, Chromium or Edge
must already be installed; use `--browser-executable /absolute/path` if needed.

Start `lab --browser https://your-approved-origin.example/path`. LAB creates a
fresh private browser, separate from personal profiles. `/lab-browser status`
shows its origin; `/lab-browser close` closes only this run. A native `/reload`
rebinds the same browser with no retained refs. After close, start a new LAB run
to reopen. Ordinary `lab` has no browser dependency.

The model receives `lab_browser`: snapshot, navigate, fill, click, read.
Navigate, fill and click ask first (see [Approvals](#approvals-and-permission-modes)),
and tool rows name the element, value (masked when secret) and origin. Use a
fresh snapshot's `@eN` reference; mutations/navigation invalidate refs. Navigation
is restricted to the operator's exact origin. Redirects and new tabs are checked
after actions and cause closure if out of scope. This detects a boundary breach;
it cannot undo site requests and is not a network sandbox. Browser subprocesses
receive no model keys or Relay capability. Page content remains untrusted data.
Timeout/cancellation or an uncertain action closes the owned session rather than
retrying. After any failure the browser stays disabled for the rest of the run,
including after `/reload`. If cleanup also fails, owned state is kept,
`/lab-browser status` says so, and `/lab-browser close` retries cleanup only.
Ctrl+C or SIGTERM during browser startup cancels it and closes the browser;
signals during final cleanup wait for it to finish.

### What you see

`lab --setup-browser` ends with the next command to run, for example
`Next:  lab --browser http://localhost:3000/` (the URL is an example).

While a browser is attached, Pi's footer shows a chip:

| Chip | Meaning |
|---|---|
| `● web 127.0.0.1:3000` | Attached and bound to that origin. |
| `○ web closed · result unknown` | A fill, click or navigate failed partway. Look at the page yourself before trying again. |
| `○ web closed · connection lost` | The browser daemon exited or was replaced. Page state is unknown. |
| `○ web closed · left origin` | The page left your origin or opened another tab, so LAB closed the browser. |
| `○ web closed` | Closed for this run (for example by `/lab-browser close`). `/lab-browser status` gives the restart command `lab --browser <origin>/`. |
| `! web cleanup · /lab-browser close` | Stopped, but owned state could not be cleaned up yet. Run `/lab-browser close` to retry. |

The chip sits to the right of the permission mode. On a narrow terminal the chip
is shortened (ending in `...`) and the mode is never cut; `/lab-browser status`
always shows the full state.

`/lab-browser status` and `/lab-browser close` add a row to the transcript (it
is not sent to the model), for example:

```
● browser http://127.0.0.1:3000 only · private profile
  5 actions · last: snapshot · /lab-browser close
```

The failed tool rows say what happened and what to do:

- `! … @e2 is stale … Nothing was sent to the page. Take a new snapshot.` The
  ref came from an older snapshot. Nothing reached the page and the browser stays
  attached.
- `! Refused before anything was sent to the page …` Input was refused, for
  example a navigation to another origin. The browser stays attached.
- `○ Browser closed: click @e5 timed out, result unknown. Check the page yourself
  before trying again.` LAB never retries an uncertain action. Look at the page
  before you ask for it again in a new run.
- `○ Browser closed: the page left <origin> or opened another tab …` A boundary
  breach. The browser is closed for this run.
- `○ Browser disconnected: the browser daemon exited or was replaced …` LAB
  checks that its own daemon is still alive before every action, and never lets a
  replacement daemon continue the session. On close it also stops a browser that
  the dead daemon left behind, but only one whose command line uses this run's
  private profile.

After an agent run that used the browser, one verdict row summarises the
`lab_browser` tool results. It is never based on the model's own text:

- `✓ browser: … read back after change` means every change was followed by a
  snapshot or read;
- `! browser: page changed, not read back` means the last change was not checked;
- `✗ browser: 1 failed (result unknown|left origin|disconnected) …`.

Refusals are counted (`1 refused`). The model is also told to verify with a
snapshot or read after changes, and to report a failed action as unknown instead
of retrying it.

Actual validation: macOS arm64 with existing Chrome. macOS Intel/Linux x64 have
pinned tool assets but need platform acceptance; Windows/WSL-to-Windows Edge,
existing profiles and desktop control are outside this slice. See
[browser evidence and reproduction](browser-workspace-evidence.md).
