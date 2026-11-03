# Journey walkthrough: install to coding loop

Walked on 2026-11-03 (UTC, from 07:41) on macOS 27.0.1 arm64 (Mac mini). Terminal: tmux 3.7c (private socket),
120×40 unless noted. Hosted install from `main` (`bootstrap.sh` pins runtime `05b0d36`; repo HEAD `b889d80`).

**Hard limits respected.** No model, provider, auth or login was used. For the coding loop, LAB pointed at a
**scripted local fixture** on `127.0.0.1` that returns fixed OpenAI-compatible responses
([`evidence/fixture-server.ts.txt`](evidence/fixture-server.ts.txt)). It uses the same pattern as
`tests/relay-pi-actual.test.ts`. That shows how the real Pi 1.4.0 TUI renders read, edit and bash and how it asks
(or doesn't ask) for approval. **It says nothing about model quality.** Every fixture reply is prefixed
`[SCRIPTED FIXTURE]`.

**Environment.** Fresh `HOME` under the session scratchpad, `env -i` with
`PATH=/usr/bin:/bin:/usr/sbin:/sbin`, `TERM=xterm-256color`, `COLORTERM=truecolor`, `SHELL=/bin/zsh`.

**Captures.** [`evidence/`](evidence/) holds terminal text captured with `tmux capture-pane` and then sanitized.
Scratch paths become `$SCRATCH_HOME`, and user and host names are replaced. The API key was left blank and no
secrets exist in the captures.

**Cleanup.** At the end, only my own pids were killed (the two fixture servers), my own tmux socket was closed and
the scratch HOME was removed. No `/tmp/lab-s-*` sockets or LAB processes remained.

## Steps

| # | Step | What I did | What happened | Evidence |
|---|------|-----------|---------------|----------|
| 1 | Hosted install | `curl -fsSL …/main/bootstrap.sh \| sh` from `~` | Pinned archive, Bun 1.4.2, Herdr 0.9.5, rg, fd and Pi 1.4.0 were verified, publication check and Herdr smoke passed. **~75 s wall clock**, about 160 lines of output, much of it raw JSON. Three different launch paths were printed. It then went straight into project selection. | `01-install-progress.txt` |
| 2 | Project selection (fresh HOME) | Typed `~/Projects/demo-app` (missing) | Generic refusal: "Home, filesystem roots, missing directories and symlink directories are refused". It does not say *which* check failed and does not offer to create the folder. | `02-project-missing.txt` |
| 3 | Fixture repo | Created `~/Projects/demo-app` (git, `greet.sh`, `test.sh` failing, `AGENTS.md`) from another shell, then entered the path | Accepted. Model setup appeared. | `03-model-setup.txt` |
| 4 | Model setup, wrong input | Typed `ollama`, `localhost:11434`, `llama3.2` | All three questions were asked before any validation. Then the whole launcher exited with `LAB: Invalid workspace route; run ./lab --configure`. That command does not exist for a hosted user, whose launcher is `lab` and is not on PATH. | `04-model-setup-invalid.txt` |
| 5 | `lab --help` | Typed `lab --help` in a new shell | `zsh: command not found: lab`. After `export PATH="$HOME/.local/bin:$PATH"`, help printed. Its **Usage line omits `--setup-browser`, `--browser`, `--browser-executable`**, although the option list includes them. | `05-help.txt` |
| 6 | Unknown flag and `--version` | `lab --bogus`, `lab --version` | Both print the shell launcher's own Usage line (also missing the browser flags) and exit 1. There is no version command. | `05b-unknown-flag.txt`, `05c-version.txt` |
| 7 | First start | `cd ~/Projects/demo-app && lab`, route `local`, `http://127.0.0.1:<port>/v1`, `fixture-coder`, blank key | The workspace opened. The Herdr sidebar (25 cols) sits on the left, then Pi (54 cols) and the shell (36 cols). The header shows `[LB] (text fallback)` because the logo doesn't fit beside the sidebar, and a long Relay peer ID fills the first screen. **No project-trust prompt appeared** (the README says Pi "may" ask). The footer shows `0.0%/8.2k`. | `06-setup-key.txt`, `07-first-start.txt` |
| 8 | Coding turn | "sh test.sh fails. Make greet end with an exclamation mark so the test passes." | Pi rendered `read greet.sh`, an **inline numbered diff** for `edit greet.sh`, then `$ sh test.sh` → `PASS: greet` and `Took 0.0s`. **No approval was asked before the edit or the bash command.** | `10-coding-turn-ok.txt` |
| 8a | Coding turn, tool error (first attempt) | Same prompt, while the fixture sent a malformed edit | Pi showed the edit error ("edits[0] and edits[1] overlap… Merge them") and the failing test with "Command exited with code 1". The final fixture text claimed success. A user only sees the contradiction by reading the transcript, since no status marks the turn as failed. | `08-coding-turn.txt` |
| 9 | Endpoint down | Fixture restarted on a new port, prompt sent | `Error: Connection error.` three times, a "Retrying (3/3) in 7s… (escape to cancel)" spinner, then `Retry failed after 3 attempts`. **No endpoint, no hint about `lab --configure`.** The footer jumped to `30.7%/8.2k`. | `09-endpoint-down.txt`, `09b-…` |
| 10 | `/exit`, then `lab --configure` | Re-entered the route with the new port | Clean exit. The "Starting LAB… Ctrl+B then h/l…" banner printed before the alternate screen is only readable after exit. `--configure` worked. | `09b-…`, `10-…` |
| 11 | Review diff | `Ctrl+B l`, `git --no-pager diff; sh test.sh` in the right pane | Worked, but in a 36-column pane. There is no in-TUI `/diff`. | `11-diff-in-shell.txt` |
| 12 | Commit | `Ctrl+B h`, "Looks good, commit it." | The fixture's `bash git commit …` ran immediately: `[main 1e487da] greet: end greeting with !`. **No approval prompt for a git commit.** | `12-commit.txt` |
| 13 | Command discovery | Typed `/`, then filtered | 36 commands. `/resume`, `/new`, `/compact`, `/hotkeys`, `/login` and `/model` exist. **`/plan`, `/diff`, `/undo` and `/help` do not** (`/help` matches only `lab-help`). | `13-slash-menu.txt` |
| 14 | `/lab-help` | Ran it | About 45 wrapped lines at 54 cols. The context meter went from 0.0% to 4.9%, which *suggests* the help text enters model context (not verified in source). | `14-lab-help.txt` |
| 15 | `/hotkeys` | Ran it | A clear table. Notable bindings: `Shift+Tab` = cycle thinking level, `Ctrl+L` = model selector, `Escape` = abort streaming, `Option+Enter` = queue follow-up, `!`/`!!` = bash, `Ctrl+G` = external editor. | `15-hotkeys.txt`, `15b-…` |
| 16 | `/lab-appearance` | Opened it, then Esc | A numbered, keyboard-first dialog with non-colour labels. Esc cancelled cleanly. | `16-appearance.txt` |
| 17 | `/reload` | Ran it | "Reloaded keybindings, extensions, skills, prompts, themes, and context files". The session continued. | `17-reload.txt` |
| 18 | Second run and resume | `/exit`, `lab`, `/resume` | A new session started as documented. `/resume` showed a good picker (Current Folder / All, regex, sort). There is no `lab --continue` from the shell. | `18-second-run-resume.txt` |
| 19 | 80 columns | `resize-window -x 80` | Sidebar 25, Pi 30, shell 20 columns. The model name was cut to `fixture-code`. `Ctrl+B z` zoomed Pi but the sidebar stayed. `Ctrl+B b` hides the sidebar and only then does the pixel logo render. That key is not in `/lab-help`. | `19-…`, `21-…`, `22-herdr-help.txt`, `23-…` |
| 20 | 40 columns | `resize-window -x 40` | Pi 22 columns, shell 14, with shell prompt redraw artifacts. Unusable without zoom or single pane. | `20-width-40.txt` |
| 21 | `lab --single-pane` at 40 columns | `/exit`, then relaunched | Readable. The Herdr tab strip still uses two rows. | `24-single-pane-40.txt` |
| 22 | `lab --setup-browser` | Ran it | One line: `Verified agent-browser 0.41.0; existing approved browser required. Cached: false.` (~10 s). | `25-setup-browser.txt` |
| 23 | `lab --browser http://127.0.0.1:<port>/` | Local fixture page ([`fixture-page.html.txt`](evidence/fixture-page.html.txt)) | The workspace opened looking identical to a normal run. **No visible indication that a browser is attached.** | `26-browser-start.txt` |
| 24 | `/lab-browser status`, `/reload`, `status`, `close`, `status` | Ran each | Status read "Owned browser · http://127.0.0.1:… · fresh snapshot required before actions." and survived `/reload`. Close printed "Owned browser closed." and status then "Browser closed. Start a new LAB run with --browser URL." **These are transient notifications that do not stay in the transcript.** No owned browser processes remained. | `27-browser-commands.txt`, `27b-…` |
| 25 | Update (rerun bootstrap) | `… \| sh -s -- --install-only` | 2.5 s, everything re-verified and cached. It printed about 145 lines again and ended with "Run the launcher… to configure a model" although one was configured. There is no "already up to date / version X". | `28-rerun-update.txt` |
| 26 | Uninstall | `lab --uninstall` (not a command), then manual `rm` | No uninstall command and nothing about it in the README or user guide. Manual removal: `~/.local/bin/lab`, `~/.local/share/lab-harness` (**274 MB**) and `~/.cache/lab-harness`. Bun also left `~/Library/Caches/bun` outside LAB's own folders. The project repo had no LAB files written into it. | `29-manual-uninstall.txt` |

### Exercised vs not exercised

| Area | Status |
|------|--------|
| Hosted install, update rerun, PATH step, project chooser, route setup (bad and good input), `--configure`, `--help`, `--single-pane`, `/reload`, `/exit`, second run, `/resume`, widths 120/80/40, `--setup-browser`, `--browser` + `/lab-browser status/close`, manual uninstall | **Exercised** (real binaries) |
| Coding loop UI (read / edit diff / bash test / bash commit) and endpoint-down errors | **Exercised against a scripted fixture**. Pi rendering is real; model reasoning is not. |
| Any real model, provider, auth or login | **Not exercised** (hard limit) |
| `lab_browser` model tool (snapshot/fill/click) | **Not exercised** here; see PR #23 evidence `docs/browser-evidence/tui-tools.txt` |
| Esc interrupt during streaming, queued follow-up (Option+Enter), large paste, image paste, mouse, `Ctrl+B q` detach (Relay between two sessions: see [Tool flows](#tool-flows-second-walk-2026-11-03)) | **Not exercised** (the fixture replies instantly; time-boxed) |
| Real terminal emulators (iTerm2, Ghostty, Apple Terminal), SSH, WSL, Linux | **Not exercised**. tmux on macOS only. |
| Pi trust prompt | **Not observed.** No prompt appeared, and the trigger conditions were not read in Pi source. |

## Friction table

Severity: **P0** blocks the core journey or is unsafe by default with no workaround. **P1** a typical developer
will hit it and lose significant time, trust or correctness. **P2** clear friction with a workaround. **P3** polish.
No P0 was found: every step had a workaround.

| ID | Step | Friction | Evidence | Sev | Comparable Claude Code / Codex behaviour (see RESEARCH.md) |
|----|------|----------|----------|-----|-----|
| F01 | 8, 12 | **No approval gate or permission mode.** `edit`, `write` and `bash` (including `git commit`) run immediately, with no mode that requires approval and no read-only mode. **Verdict: deliberate delegation, but no gate in practice.** LAB chose not to own approvals: `src/pi/workspace.ts:56` "Persistent native Pi sessions and its own approvals remain native behavior" (4bd2e7a, PR #7, 2026-10-29); `docs/architecture.md:67–68` "Native vendor approvals and sandbox behavior remain in use"; `docs/pi-seam.md:39`; README:145 "not an OS sandbox". As launched (`--no-extensions`, `workspace.ts:75`), pinned Pi 1.4.0 showed no gate, and no LAB doc gives a reason for *having no gate*. Whether pinned Pi offers a gate or tool policy that LAB could enable was not verified in this round. **UX cost:** Claude Code and Codex users expect to approve edits and commands, and regulated users can't adopt LAB without it. | `10-…`, `12-commit.txt` (scripted fixture, not a model) | P1 (P0 for regulated users, see personas). Kept: the delegation is deliberate, but the delegated gate doesn't exist as launched. | Claude Code: Manual / acceptEdits / plan / auto modes, cycled with `Shift+Tab`; commands need approval unless allow-listed. Codex: `on-request` approvals plus a `workspace-write` sandbox with the network off. |
| F02 | 7 | **The project's `AGENTS.md` is ignored** because LAB passes `--no-context-files`. So the fixture repo's "Run `sh test.sh` before committing" would not reach a model. **Verdict: deliberate.** `src/pi/workspace.ts:55` "Extensions/skills/context are explicit: do not load global user integrations" and the flag at `workspace.ts:75` (both 4bd2e7a, PR #7); `docs/pi-workspace.md:132–133` (context files disabled); `docs/research/engineer-features/CURRENT-VS-GAPS.md:17` "Explicit, inspectable opt-in to project briefing; don't silently enable autoload"; `OPPORTUNITIES.md:82,93–94` "Do not auto-generate AGENTS.md or change automatic trust rules" (f1eca8b, PR #15). The reason is to keep untrusted project text out of the prompt unless the user chooses it. **UX cost:** conventions are silently ignored unless pasted in, which uses context, and Claude and Codex users assume they were read. | `src/pi/workspace.ts:75` Pi argv. The fixture logged only the system prompt's length (4,240 chars), not its text, so absence was inferred from the flag. | P2 (lowered from P1 because the choice is deliberate and documented). | Codex reads AGENTS.md root→cwd. Claude reads CLAUDE.md, or AGENTS.md when no CLAUDE.md exists, after a folder-trust prompt. Both have `/init`. |
| F03 | 7–9 | **Hard-coded 8,192-token context and 1,024 max output tokens** for every route. System prompt plus tool schemas take about 9.4k chars (~30%) before the first prompt. Output that long is cut off. **Verdict: deliberate legacy assumption, not a sized choice.** `src/pi/workspace-config.ts:111` `contextWindow: 8192, maxTokens: 1024` (4bd2e7a, PR #7). This matches the validation server in `docs/interactive-validation.md:83` (Qwen3-0.6B, 8,192 context). `docs/research/model-providers.md:266,412` (c107048, PR #9) keeps it as a "legacy assumption". `docs/research/provider-connection-ux/contracts.md:34` says a legacy 8192 "is not discovered maximum", and `OPPORTUNITIES.md:94–95` says provider work owns limits. So small airgapped models were the reason, and replacing it is already planned. **UX cost:** ~30% of context is gone before the first prompt, larger models are under-used, and long output is truncated with no explanation. | `src/pi/workspace-config.ts:111`; `09-endpoint-down.txt` (30.7%); `fixture-requests.jsonl.txt` (`max_tokens: 1024`) | P1 (kept: every route hits it today, whatever the model). | Both size context to the selected model and show usage (`/status`, `/context`). |
| F04 | 4 | **Route setup validates only after all three answers, then exits the launcher.** It accepts free text (`ollama`), gives no help for a scheme-less URL, and points to `./lab --configure`, which is wrong for hosted installs. | `04-model-setup-invalid.txt` | P1 | Claude: guided browser login, `/model` picker. Codex: "Sign in with ChatGPT" or an API key, `/model`. Both validate as they go and stay in the app. |
| F05 | 9 | **Endpoint failure is opaque.** "Error: Connection error." ×3, then retry exhaustion after ~20 s. It shows no host, no cause, no next step (`lab --configure`) and there is no connection test during setup. | `09-…`, `09b-…` | P1 | Claude: `/doctor`, an error reference, and "Run claude doctor" in the footer. Codex: `codex doctor --network-only`, reconnection handling. |
| F06 | 11 | **No in-TUI diff or review.** Reviewing means switching to the 36-column shell pane and typing `git diff`. | `11-diff-in-shell.txt`, `13-slash-menu.txt` | P2 | Codex `/diff` and `/review`; Claude's diff panel in fullscreen and per-edit approval diffs. |
| F07 | 13, 15 | **No plan mode, and `Shift+Tab` means "cycle thinking level".** That clashes with Claude and Cursor muscle memory, where Shift+Tab cycles permission and plan modes. | `13-…`, `15-hotkeys.txt` | P2 | Claude `Shift+Tab` → `⏸ plan mode on`; Codex `/plan`; Cursor `/plan`; OpenCode Tab toggles Plan/Build. |
| F08 | 13 | **No undo, rewind or checkpoint.** Recovery is manual git. | `13-slash-menu.txt` | P2 | Claude `/rewind` and Esc Esc checkpoints; OpenCode `/undo` via git; Aider `/undo`. Codex users ask for `/undo` back (#9203). |
| F09 | 1, 25 | **Install and update output is about 150 lines**, mostly raw JSON from acquire scripts and the Herdr smoke (including `"sourcePinMatch": false`, which reads like a failure). The real next step is buried. | `01-…`, `28-…` | P2 | Claude, Codex and OpenCode one-liners print a few lines and the next command. |
| F10 | 1 | **Three launch paths are printed** (release-internal `…/releases/<sha>/lab`, `~/.local/bin/lab`, the stable launcher), with "Installation complete" printed *before* command setup. | `01-install-progress.txt` | P2 | Claude prints one command (`claude`) and checks PATH. |
| F11 | 5 | **`lab` is not on PATH in a fresh shell.** It needs a manual `export`, with no profile edit offered. This is deliberate, but the first `lab --help` fails. | `05-help.txt` | P2 | Claude's native installer also uses `~/.local/bin`. Codex's installer installs to a PATH location. Both document the PATH fix in the install output. |
| F12 | 2 | **The project chooser's error is generic** (it lists four reasons) and it cannot create a missing folder. | `02-project-missing.txt` | P2 | Claude and Codex simply open in the cwd. Trust is asked per folder. |
| F13 | 7, 19, 20 | **The Herdr sidebar takes 25 columns by default** (Pi gets 54 of 120 or 30 of 80). Zoom keeps the sidebar. `Ctrl+B b` (hide it) is not in `/lab-help`. At 40 columns the two-pane view is unusable and LAB doesn't suggest `--single-pane`. | `07-…`, `19-…`, `20-…`, `21-…`, `23-…` | P2 | Claude and Codex are single-pane and reflow to the full width. Claude shortens hints on narrow terminals. |
| F14 | 23, 24 | **No persistent indicator that a browser is attached.** `/lab-browser status` is a transient notification that leaves no trace in the transcript. | `26-…`, `27-…` | P2 | Claude's status line (`/statusline`) and Codex's `/statusline` keep session state visible. |
| F15 | 26 | **No uninstall command or docs.** The 274 MB release plus state and a Bun cache outside LAB's folders need manual `rm`. | `29-manual-uninstall.txt` | P2 | Claude documents `rm -f ~/.local/bin/claude; rm -rf ~/.local/share/claude` plus config removal. |
| F16 | 8a | **A failed turn looks like a successful one.** The final assistant text can claim success after a failing test and a failed edit, and there is no turn-level ✓/✗. | `08-coding-turn.txt` | P2 | Codex surfaces command exit status per step. Claude shows tool errors inline. Neither has a turn verdict either, so this is an opportunity. |
| F17 | 5, 6 | **The Usage line in `lab --help` omits the browser flags**, and the unknown-flag Usage from the shell launcher (`lab`) omits them too. (Known finding.) | `05-help.txt`, `05b-…` | P3 | `claude --help` and `codex --help` list all flags. |
| F18 | 6, 25 | **No `lab --version`.** The update rerun doesn't say "up to date (05b0d36)" and still says "configure a model". | `05c-…`, `28-…` | P3 | `claude --version`, `claude update`; Codex version shown in the TUI header. |
| F19 | 7 | **The first screen is mostly boilerplate**: `[LB] (text fallback)` beside the sidebar, "Controlled LAB tasks: unavailable", `[Extensions] workspace-extension.ts`, and a 3-line Relay peer hash. It has no "try this" hint and doesn't show the project or route. | `07-first-start.txt` | P3 | Claude shows version, model and cwd plus `/help` hints. Codex shows model, directory and approval mode. |
| F20 | 10 | **The start banner (pane keys) is printed before the alternate screen**, so it is only visible after `/exit`. | `09b-endpoint-down-final.txt` | P3 | — |
| F21 | 14 | **`/lab-help` is long** (~45 lines at 54 columns) and appears to consume context (0→4.9%). | `14-lab-help.txt` | P3 | Claude `/help` is a UI overlay that doesn't enter context. |
| F22 | 18 | **No `lab --continue` or `lab --resume` shell flags.** `/resume` works in the TUI. | `18-…` | P3 | `claude --continue/--resume`, `codex resume`. |
| F23 | 15 | **`Ctrl+L` opens the model selector**, while Claude and Codex users expect clear/redraw. With one route the selector is near-empty. | `15-hotkeys.txt` | P3 | Claude: Ctrl+L redraws. Codex: Ctrl+L clears the view. |

### What already works well (keep)

- **Install.** Fast (~75 s cold, 2.5 s warm), checksum-verified, no sudo, no profile edits, and it refuses to
  overwrite a foreign `lab`.
- **Hygiene.** It writes nothing into the project repo. `/exit` cleans up Herdr. `--configure` is a reliable
  recovery path.
- **Edits are readable.** The inline numbered diff for `edit` and the `$ cmd` / exit code / `Took` lines for bash
  read clearly even at 54 columns.
- **Keyboard-first UI.** `/resume` is a capable picker. `/lab-appearance` is accessible and works without a mouse.
  `/hotkeys` is thorough.
- **Narrow terminals.** `--single-pane` is a good narrow-terminal answer, once you know about it.
- **Browser.** The flow is honest: setup is explicit, status reports the bound origin, and close is real and
  leaves no processes.

## Tool flows (second walk, 2026-11-03)

Brian asked for wireframes of the flows that use Relay, agent-browser and agent-desktop (boards 8–10 in
[WIREFRAMES.md](WIREFRAMES.md)). Each tool has a different evidence base:

| Tool | Evidence | Model involved? |
|---|---|---|
| **Relay** | **Walked for real** with two `lab` sessions (A in the default layout, B with `--single-pane`) on one fixture project in a fresh scratch HOME. Runtime pin `05b0d36`. Only operator slash commands were used: `/relay-peers`, `/relay-send`, `/relay-inbox`, `/relay-ack`, `/exit`. | **No.** The route pointed at a closed loopback port (`127.0.0.1:9`) as a backstop. One accidental prompt (F28) hit that port and failed. No request left the machine. |
| **agent-browser** (`lab_browser`) | Not walked again. Current state comes from the PR #23 fixture capture `docs/browser-evidence/tui-tools.txt` and from my steps 22–24. The real model run is in `docs/research/agent-tools/LIVE-SUCCESS.md` (experimental launcher, 2026-10-31). | Not in this round. |
| **agent-desktop** | Not part of LAB. The only evidence is the agent-tools experiment's permission preflight in `docs/research/agent-tools/evidence/desktop-trial.json`. That run stopped at "Accessibility denied", with no app snapshot or action. Board 10 is a **concept**, not a comparison. | No. |

### Relay steps

| # | Step | What happened | Evidence |
|---|------|---------------|----------|
| R1 | Both sessions start | Each shows `Relay ready: demo-app/<uuid> (pi-<64 hex>). Use /relay-peers.` | `32-recipient-idle.txt` |
| R2 | B types `/relay-peers` and Enter, quickly | The input became `/relay-relay-peers`. That is not a command, so it went to the model as a prompt (and failed against the dead port). Context rose to 28.6%. | `30-relay-peers.txt`, `30a-…` |
| R3 | B types `/relay-peers`, waits, then Enter | Raw JSON: two peers with 67-char IDs, UUID names, epoch-ms `lastSeenAt`. Context rose 28.6% → 30.2%. | `30b-…`, `30c-relay-peers-enter.txt` |
| R4 | B sends to A by name with key `intro-1` | `{"state": "stored", "duplicate": false, …}`. Using the name instead of the hash works. | `31-relay-send.txt` |
| R5 | A, idle | No badge, toast, footer or sidebar change. | `32-recipient-idle.txt` |
| R6 | A runs `/relay-inbox` | JSON message. `from` is the sender's hash, not its name. `unread: 1`. | `33-relay-inbox.txt` |
| R7 | A acks, then replies with `--reply-to` | `"acknowledged": 1`, then `"state": "stored"`. A's inbox shows `unread: 0`. Both commands need the 36-char message ID typed again. | `34-relay-ack-reply.txt` |
| R8 | B reads the reply, then makes two mistakes | The reply shows `replyTo`. A one-character name typo gives `Error: RELAY_UNKNOWN_PEER`. Reusing `intro-1` with new text gives `Error: RELAY_CONFLICT`. Neither says what to do. | `35-relay-reply-errors.txt` |
| R9 | A runs `/exit`. B sends to A and lists peers. | The send still returns `"state": "stored"` with no offline note. `/relay-peers` shows A as `"presence": "offline"`. | `36-relay-offline.txt` |

### Tool-flow friction

| ID | Step | Friction | Evidence | Sev | Comparable behaviour |
|----|------|----------|----------|-----|-----|
| F24 | R1, R3, R6, R7 | **Relay output is raw JSON with machine IDs.** Peers are 67-char hashes with UUID names. The inbox shows the sender's hash, not its name. Ack and reply need the 36-char message ID typed back in. | `30c-…`, `33-…`, `34-…` | P2 | Claude Code agent teams (experimental): the lead names each teammate, and any teammate can message another by name [S-T1]. |
| F25 | R5 | **No signal when mail arrives.** The recipient sees nothing until they run `/relay-inbox`. By design, mail does not wake the model (user guide), but the human gets no sign either. | `32-recipient-idle.txt` | P2 | Claude Code agent teams: messages are delivered to recipients automatically, so the lead doesn't poll [S-T1]. |
| F26 | R8 | **Relay errors are bare codes** (`RELAY_UNKNOWN_PEER`, `RELAY_CONFLICT`) with no cause or next step. The user guide explains the conflict rule, but the TUI doesn't. | `35-relay-reply-errors.txt` | P2 | Same pattern as F05. |
| F27 | R9 | **Sending to an offline peer looks the same as sending to an online one.** It returns `"stored"` with no hint that nobody is reading. | `36-relay-offline.txt` | P3 | — |
| F28 | R2 | **Enter before the slash menu updates can mangle a command, and an unknown slash command becomes a model prompt.** Seen with tmux `send-keys`, which types at paste speed. A fast typist or a paste may hit the same race. Not reproduced by hand. | `30-…`, `30a-…` | P2 | Not researched. |
| F29 | R3 | **Operator Relay output appears to use model context** (+1.6% for two peers, +0.6% per send). This is inferred from the footer meter, the same as F21. | `30c-…`, `31-…` | P3 | Not researched. |
| F30 | — | **`lab_browser` rows name only the operation** ("Browser · fill", "completed (expand for page data)"). The ref, field label, typed value and origin are hidden. Fill and click run without asking (same root as F01). | `docs/browser-evidence/tui-tools.txt` | P2 | Claude in Chrome: in Manual mode each action asks Allow/Deny, and new sites ask "once" or "always for this site". Downloads, sensitive input and authorizations always ask [S-T2]. |

Agent-desktop has no friction ID because nothing ships. Board 10 lists design rules for the day it does. The most
important rule: the macOS Accessibility grant goes to the **launching app** (Terminal, iTerm), not to LAB, so the
setup must say that every program started from that terminal gets it too.

### Relay: keep

- Sending by peer **name** works, so a short alias is a small step from today.
- Delivery semantics are honest and robust: idempotent request keys, explicit ack, `replyTo` threading, and
  presence that turns `offline` on exit.
- Only the explicit message body is shared, never the transcript.

Sources for the comparisons above (read 2026-11-03 through a search summary; not quoted verbatim):

- [S-T1] Claude Code docs, "Orchestrate teams of Claude Code sessions": https://code.claude.com/docs/en/agent-teams
- [S-T2] Claude Help Center, "Claude in Chrome permissions guide":
  https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide, and Claude Code docs
  "Use Claude Code with Chrome": https://code.claude.com/docs/en/chrome

