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
| Esc interrupt during streaming, queued follow-up (Option+Enter), large paste, image paste, mouse, Relay between two sessions, `Ctrl+B q` detach | **Not exercised** (the fixture replies instantly; time-boxed) |
| Real terminal emulators (iTerm2, Ghostty, Apple Terminal), SSH, WSL, Linux | **Not exercised**. tmux on macOS only. |
| Pi trust prompt | **Not observed.** No prompt appeared, and the trigger conditions were not read in Pi source. |

## Friction table

Severity: **P0** blocks the core journey or is unsafe by default with no workaround. **P1** a typical developer
will hit it and lose significant time, trust or correctness. **P2** clear friction with a workaround. **P3** polish.
No P0 was found: every step had a workaround.

| ID | Step | Friction | Evidence | Sev | Comparable Claude Code / Codex behaviour (see RESEARCH.md) |
|----|------|----------|----------|-----|-----|
| F01 | 8, 12 | **No approval gate or permission mode.** `edit`, `write` and `bash` (including `git commit`) run immediately, with no mode that requires approval and no read-only mode. | `10-…`, `12-commit.txt` | P1 (P0 for regulated users, see personas) | Claude Code: Manual / acceptEdits / plan / auto modes, cycled with `Shift+Tab`; commands need approval unless allow-listed. Codex: `on-request` approvals plus a `workspace-write` sandbox with the network off. |
| F02 | 7 | **The project's `AGENTS.md` is ignored** because LAB passes `--no-context-files`. So the fixture repo's "Run `sh test.sh` before committing" would not reach a model. | `src/pi/workspace.ts` Pi argv. The fixture logged only the system prompt's length (4,240 chars), not its text, so absence was inferred from the flag. | P1 | Codex reads AGENTS.md root→cwd. Claude reads CLAUDE.md, or AGENTS.md when no CLAUDE.md exists. Both have `/init`. |
| F03 | 7–9 | **Hard-coded 8,192-token context and 1,024 max output tokens** for every route (`modelsForRoute`). System prompt plus tool schemas take about 9.4k chars (~30%) before the first prompt. Output that long is cut off. | `src/pi/workspace-config.ts`; `09-endpoint-down.txt` (30.7%); `fixture-requests.jsonl.txt` (`max_tokens: 1024`) | P1 | Both size context to the selected model and show usage (`/status`, `/context`). |
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
