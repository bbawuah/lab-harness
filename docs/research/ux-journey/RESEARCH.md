# Research: how developers work with terminal agent harnesses

Desk research for the LAB-HARNESS UX journey study. **All sources accessed 2026-11-03.**
Snapshot: Claude Code v2.1.317 (GitHub release 2026-11-03), Codex CLI 0.166.0 (2026-10-29).

How this was produced: a research sub-agent read official docs, changelogs and GitHub issues via web fetch and
search, and I reviewed the result. Caveats:

- Page text was extracted by a summarising fetcher, so short quotes may differ slightly from the live page.
  Items that could not be confirmed are marked **unverified**.
- Part 1 is primary (vendor docs, changelogs, release notes). Part 2 is **secondary (developer-reported)**:
  GitHub issues and third-party blogs. No HN or Reddit thread could be verified, so none is cited.
- Part 3 lists the expectations. Part 4 (at the end) turns them into jobs-to-be-done for LAB and checks each one
  against the walkthrough in [JOURNEY.md](JOURNEY.md).

---------------------------------------------------------------------------
# PART 1: PRIMARY SOURCES

## A. Claude Code (Anthropic)

Primary pages: https://code.claude.com/docs/en/{setup, quickstart, permissions, permission-modes, security, interactive-mode, terminal-config, fullscreen, sessions, worktrees, checkpointing, memory, mcp, model-config, statusline, troubleshooting, common-workflows}; changelog https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md ; releases https://github.com/anthropics/claude-code/releases

1. Install and update
- Recommended native installer: `curl -fsSL https://claude.ai/install.sh | bash` (macOS/Linux/WSL); `irm https://claude.ai/install.ps1 | iex` (PowerShell); CMD variant via install.cmd. Also `brew install --cask claude-code` (stable) or `claude-code@latest`; `winget install Anthropic.ClaudeCode`; apt/dnf/apk signed repos; `npm install -g @anthropic-ai/claude-code` (Node 22+, installs same native binary). [setup]
- Verify with `claude --version` (example output `2.1.211 (Claude Code)`); `claude doctor` prints read-only install/settings diagnostics. [setup]
- Native installs auto-update in the background (checked on startup and periodically; takes effect next launch). Brew/WinGet/apt/dnf/apk/ do NOT auto-update (opt-in `CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE=1` for brew/WinGet). `claude update` applies manually; channels `latest` (default) vs `stable` (~1 week behind) via `autoUpdatesChannel`; `DISABLE_AUTOUPDATER=1`; `minimumVersion`. [setup]
- Failure surface: session footer shows `Auto-update failed · Run claude doctor` (red). [troubleshooting]

2. First-run auth / model
- Run `claude`, follow browser login. Accounts: Pro/Max/Ultra/Team/Enterprise, Console (prepaid API credits), Bedrock/Vertex("Google Cloud's Agent Platform")/Foundry, or a self-hosted gateway. If `ANTHROPIC_API_KEY` is set, Claude asks whether to use it. `/login` re-authenticates in session. Free claude.ai plan does not include Claude Code. [setup, quickstart]
- Credentials: macOS Keychain; on Linux a file with mode 0600; Windows file in the user profile. [security]
- Model: `/model` opens picker (Enter = save as default, `s` = this session only, arrows = effort slider); `claude --model`; aliases default/best/fable/opus/sonnet/haiku/`opusplan`; default on Pro/Max/Team/API shown as Opus 5.5; `/effort`. [model-config]
- After login the prompt shows version, model and working directory above it; `/help`, `/resume` hinted. [quickstart]

3. Trust / permissions / sandbox
- Workspace trust dialog appears in interactive sessions in an untrusted folder; `-p` sessions show neither trust nor MCP prompt. Starting in the home directory: trust held for the session only, prompt reappears every launch (no setting to persist). [security]
- Permission modes (config value / UI label): default=Manual (reads only; edits, shell, network prompt), acceptEdits=Edit automatically, plan=Plan, auto=Auto (classifier model reviews actions; the built-in starting mode for interactive terminal/VS Code from v2.1.283+), dontAsk, bypassPermissions. `Shift+Tab` cycles; `--permission-mode`; `--dangerously-skip-permissions`. Protected paths (.git, .claude, .mcp.json...) never auto-approved. Deny rules win in every mode. [permission-modes]
- Prompt options on a Bash command: approve once or "Yes, and don't ask again" (persisted per repo and command; file edits until session end). [permissions]
- Auto mode fallback: after 3 consecutive or 20 total blocks it pauses and prompts again. [permission-modes]
- Manual mode asks before file tools read/write outside the launch folder. `/sandbox` gives filesystem/network isolation for Bash (native Windows: not supported; WSL2: supported). [security, setup]
- Project `.mcp.json` servers have their own approval prompt. [mcp]

4. The first prompt
- Empty screen = prompt box with version/model/cwd header; `/` lists commands; `@` file completion; `!` shell mode. [quickstart, interactive-mode]
- `/init` analyses the codebase and writes a starting CLAUDE.md (suggests improvements if one exists; `CLAUDE_CODE_NEW_INIT=1` for an interactive multi-phase flow). CLAUDE.md locations: `./CLAUDE.md` or `./.claude/CLAUDE.md`, user and org scopes, `CLAUDE.local.md`. Claude reads `AGENTS.md` when no CLAUDE.md exists above the working dir; if both exist, CLAUDE.md only (can import AGENTS.md). Auto memory also exists. [memory]
- Suggested first prompts: "what does this project do?" [quickstart]

5. Edit -> review -> test -> commit
- Claude shows the change and asks "Yes" before editing when in Manual mode; rejected edits show a dimmed diff (theme tokens diffAddedDimmed). `/diff` opens a diff panel beside the conversation in fullscreen rendering. Tests are run by asking in natural language ("run the new tests and fix any failures"). Git: "commit my changes with a descriptive message", "create a pr"; sessions are linked to PRs created via `gh pr create`; `claude --from-pr N`. [quickstart, common-workflows, terminal-config, fullscreen]
- Commit behaviour: no automatic commits; commits happen when asked (unverified whether any default commit-attribution trailer is added; not in the pages read).

6. Plan mode
- `Shift+Tab` until status bar shows `⏸ plan mode on`, or `claude --permission-mode plan`, or `/plan` prefix for one prompt. Reads/explores only; at the end offers: "Yes, and use auto mode" / "Yes, manually approve edits" / "No, keep planning"; `Ctrl+G` edits the plan in $EDITOR. Accepting a plan names the session. `opusplan` model alias (Opus for plan, Sonnet for execution). [permission-modes, common-workflows, model-config, sessions]

7. Interrupt / steer
- `Esc` stops the current response/tool call mid-turn, keeps work done; `Ctrl+C` interrupts a running operation, else clears input (second press exits); `Ctrl+D` exit (confirm). Typing + Enter while Claude works QUEUES the message (grey until sent; delivered after current tool calls finish within the same turn). `Ctrl+Enter` / `Ctrl+X Ctrl+S` sends queued now; Up takes queued messages back; `Esc` interrupts and sends the queue. `/btw` asks a side question without affecting history. [interactive-mode]
- Running `/model`, `/effort`, `/fast` execute immediately even while working. [interactive-mode]

8. Resume
- `claude --continue` (most recent in cwd), `claude --resume` (picker) or `--resume <name|id>`, `/resume`, `claude --from-pr N`, `-n name` / `/rename`. Picker: Ctrl+W all worktrees, Ctrl+A all projects, Ctrl+B branch filter, Space preview. Resume restores history, model, permission mode (with exceptions); NOT `--mcp-config`, `--add-dir` etc. Resuming one session in two terminals interleaves messages in one transcript. Transcripts: `~/.claude/projects/<project>/<session-id>.jsonl`, 30-day retention default (`cleanupPeriodDays`). "Resume this conversation?" dialog warns of usage cost for long/stale sessions. [sessions]
- `/branch` or `--continue --fork-session` forks a session. [sessions]

9. Multiple sessions / worktrees
- `claude --worktree <name>` / `-w` creates `.claude/worktrees/<name>/` on branch `worktree-<name>`; requires trust accepted first and a repo with a commit; on exit clean worktrees are auto-removed (unnamed) or prompt; `.worktreeinclude` copies gitignored files; subagents can use `isolation: worktree`; `--worktree "#1234"` branches from a PR. Also background agents / agent view (`claude agents`, `claude attach`, press Left on empty prompt). Permission approvals saved by "don't ask again" are shared across worktrees of a repo. [worktrees, common-workflows, sessions]

10. MCP / tools
- `claude mcp add --transport http <name> <url>`; `claude mcp add <name> -- <cmd>` for stdio; scopes local (default, in ~/.claude.json), project (`.mcp.json`, shared), user. `claude mcp list|get|remove|login|logout`; `/mcp` in session shows status/auth/reconnect. Project servers need approval prompt; `claude mcp reset-project-choices`. [mcp]

11. Terminal ergonomics
- Multiline: `\`+Enter or Ctrl+J everywhere; Shift+Enter native in Ghostty/Kitty/iTerm2/WezTerm/Warp/Apple Terminal/Windows Terminal; VS Code/Cursor/Zed/old Alacritty need `/terminal-setup`; gnome-terminal and JetBrains: not available. Option+Enter requires Option-as-Meta on macOS. tmux needs `allow-passthrough`, `extended-keys` config. [terminal-config, interactive-mode]
- Paste: >800 chars or >3 lines collapses to `[Pasted text #1 +120 lines]` (full text still sent; cached under ~/.claude/paste-cache); VS Code terminal can drop chars on huge pastes (docs recommend writing to a file). Images: Ctrl+V (Cmd+V iTerm2, Alt+V Windows/WSL) inserts `[Image #N]`, or drag/drop or path. [terminal-config, common-workflows, interactive-mode]
- Rendering: classic renderer uses native scrollback; "fullscreen rendering" (alternate screen, `/tui fullscreen`, `CLAUDE_CODE_NO_FLICKER=1`) fixes flicker/scroll jumps, adds mouse and in-app scroll/search (Ctrl+O transcript, `[` dumps to native scrollback) but breaks Cmd+F / tmux search; default for users who first used Claude Code on/after 2026-05-06 (flag-fetching sessions). Research preview. Ctrl+L redraws. `maxProseWidth`, `/scroll-speed`, mouse caveats over SSH/tmux; incompatible with iTerm2 `tmux -CC`. [fullscreen, terminal-config]
- Themes: `/theme` (auto detects light/dark), custom JSON themes in ~/.claude/themes/. Vim mode: `/config` -> Editor mode or `editorMode: vim`. Status line: user script via `statusLine` setting (`/statusline`), receives JSON on stdin; with a custom status line most footer hints (e.g. "esc to interrupt") disappear. Notifications: bell / `preferredNotifChannel`. [terminal-config, statusline, interactive-mode]
- Narrow terminals: changelog v2.1.316 "Fixes first-run setup dropping words from the security notes in narrow terminals" (shows narrow widths are a known defect class); fullscreen jump-to-bottom button shortens its hint on narrow terminals. [CHANGELOG, fullscreen]

12. Errors / recovery
- `/doctor` (in session; proposes fixes) and `claude doctor` (shell). `/feedback`, `/mcp`, `/debug` (log at ~/.claude/debug/<session-id>.txt), `claude --safe-mode`, `/heapdump`. Error reference: https://code.claude.com/docs/en/errors (5xx, 529, 429). Hung: Ctrl+C then `claude --resume`. [troubleshooting]
- Checkpoints: every prompt creates a checkpoint (last 100 kept, ~30 days). `/rewind` or Esc Esc on empty prompt: restore code+conversation / conversation / code / summarize. Does NOT track Bash-only file changes, external edits, most subagent edits; "not a replacement for version control". [checkpointing]
- Windows backspace/Ctrl+Backspace env var, garbled text in VS Code terminal (`/terminal-setup` disables GPU acceleration). [terminal-config, troubleshooting]

13. Uninstall
- Native: `rm -f ~/.local/bin/claude; rm -rf ~/.local/share/claude`. `brew uninstall --cask claude-code[@latest]`, `winget uninstall Anthropic.ClaudeCode`, apt/dnf/apk remove, `npm uninstall -g @anthropic-ai/claude-code`. Config removal separate: `rm -rf ~/.claude ~/.claude.json` (and project `.claude`, `.mcp.json`). [setup]

---------------------------------------------------------------------------
## B. OpenAI Codex CLI

Primary: https://github.com/openai/codex (README, docs/, releases https://github.com/openai/codex/releases); docs https://developers.openai.com/codex/cli -> https://learn.chatgpt.com/docs/codex/cli ; /codex/auth -> https://learn.chatgpt.com/docs/auth ; security -> https://learn.chatgpt.com/docs/agent-approvals-security ; slash/shortcuts -> https://learn.chatgpt.com/docs/developer-commands?surface=cli ; MCP -> https://learn.chatgpt.com/docs/extend/mcp?surface=cli ; AGENTS.md -> https://learn.chatgpt.com/docs/agent-configuration/agents-md ; changelog -> https://learn.chatgpt.com/docs/changelog

1. Install and update
- README: `npm install -g @openai/codex`; `brew install --cask codex`; `curl -fsSL https://chatgpt.com/codex/install.sh | sh` (mac/Linux); `powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"`; or GitHub Releases binaries. Standalone installers pull from releases.openai.com/codex, fall back to GitHub Releases. [github.com/openai/codex]
- The docs say the same install command also updates Codex (standalone). [learn.chatgpt.com/docs/codex/cli]
- docs/install.md: macOS 12+, Ubuntu 20.04+/Debian 10+, Windows 11 via WSL2; git 2.23+ optional. [github.com/openai/codex/blob/main/docs/install.md]
- Auto-update behaviour, `codex --version`: unverified in pages read. Changelog 0.166.0 (2026-10-29): npm wrapper now hands off to native binary via execve; macOS standalone cleanup fix. [changelog]

2. First-run auth / model
- Run `codex`, choose "Sign in with ChatGPT" (Plus/Pro/Business/Edu/Enterprise) or API key. Cloud requires ChatGPT sign-in; API key = usage-based and some features limited. Headless: `codex login --device-auth` (beta), or copy `~/.codex/auth.json`, or forward port 1455 over SSH. `codex login status`, `codex logout`. Storage via `cli_auth_credentials_store` = file | keyring | auto | ephemeral. [learn.chatgpt.com/docs/auth]
- `/model` chooses model and reasoning effort; `/status` shows config and token usage. [docs/codex/cli, developer-commands]

3. Trust / approvals / sandbox
- Sandbox modes: `read-only`, `workspace-write`, `danger-full-access` (`--dangerously-bypass-approvals-and-sandbox`, alias `--yolo`). Approval policies: `on-request` (the Auto preset), `never`, granular; `untrusted` is retired. Default recommendation: Auto in version-controlled folders, read-only in non-VCS folders; Codex "may start in read-only until you trust the directory, through onboarding or /permissions". Trust in config: `[projects."/path"] trust_level = "untrusted"` also disables project-local config. `.git`, `.agents`, `.codex`, `.aws` stay read-only inside workspace-write. Network off by default in workspace-write. OS sandbox: macOS Seatbelt, Linux bwrap+seccomp, Windows MXC; WSL2 uses Linux sandbox, WSL1 unsupported from 0.115. `/permissions` sets what runs without asking; `approvals_reviewer = "auto_review"` routes to a reviewer agent. [learn.chatgpt.com/docs/agent-approvals-security]
- The exact wording/shape of the first-run trust prompt screen: unverified.

4. First prompt
- Docs: "Open a project directory and run `codex`", example first task "Tell me about this project"; suggests creating Git checkpoints before/after tasks. `/init` = "Generate an AGENTS.md scaffold in the current directory." AGENTS.md discovery: global `~/.codex/AGENTS.override.md` or `AGENTS.md`, then project root down to cwd, one file per dir, concatenated root-to-cwd, 32 KiB default cap (`project_doc_max_bytes`). Tips/tooltips shown in TUI come from codex-rs/tui/tooltips.txt (file not fetched; unverified content). [docs/codex/cli, developer-commands, agents-md]

5. Edit -> review -> test -> commit
- "steer an active turn and watch commands and diffs as they appear"; `/diff` = "Show the Git diff, including files Git isn't tracking yet"; `/review` = review working tree (base branch, uncommitted, specific commit; does not modify tree). No automatic commits documented; docs advise Git checkpoints. [docs/codex/cli, developer-commands]
- Inline diff preview limited to 12 rows (issue #41587, configurable request). [issue]

6. Plan mode
- `/plan` = "Switch to plan mode and optionally send a prompt." Changelog 0.165.0 (2026-10-27): queued agent messages no longer restart work after an interrupt or a switch to Plan mode. Detailed plan-mode UX (approve/execute): unverified from primary sources. [developer-commands, changelog]

7. Interrupt / steer
- Documented: "Press Enter while Codex is working to inject new instructions into the current turn" (steer); "Press Tab while Codex is working to queue a follow-up prompt, slash command, or shell command for the next turn"; Esc twice on empty composer edits the previous user message and forks from that point; Ctrl+C or /exit closes the session; Ctrl+L clears view only; Ctrl+R searches history. `codex queue` CLI command queues a message for an existing session. Esc-as-interrupt: not found in primary docs (unverified). [developer-commands?surface=cli]

8. Resume
- `codex resume` (recent chats from the current repo; also search across repos / by ID / most recent), `codex fork`, `/resume`, `/fork`, `/new`. 0.165.0 added repo filter to session picker. 0.166.0: approvals preserved on resume/fork. [docs/codex/cli, developer-commands, changelog]

9. Multiple sessions / worktrees
- 0.165.0: "agent command center groups sessions by directory"; `codex cloud` submits to cloud env and applies results locally; subagents delegate work. Git worktree support specific to CLI: unverified. [changelog, docs/codex/cli]

10. MCP / tools
- `codex mcp add <name> [--env K=V] -- <cmd>`, `codex mcp list`, `codex mcp login <name>` (OAuth; `--no-browser`). Config: `~/.codex/config.toml` global; `.codex/config.toml` project (trusted projects only); `[mcp_servers.<name>]` tables; STDIO (command/args/env) and streamable HTTP (url, bearer_token_env_var). `/mcp` lists tools. Skills and plugins also supported; web search `codex --search`. [learn.chatgpt.com/docs/extend/mcp]

11. Terminal ergonomics
- Images: `codex --image` or paste into composer. Themes: `/theme` (syntax highlighting). Status line: `/statusline` interactive config. `/copy`. External editor binding: unverified for Codex. 0.166.0: keyboard-driven transcript selection with word/line/page motions, integrated search, configurable shortcuts. Multiline key, large-paste handling, vim mode: unverified in primary docs. Narrow-terminal behaviour: unverified (see secondary issues). [docs/codex/cli, developer-commands, changelog]

12. Errors / recovery
- `codex doctor --network-only` (0.166.0); TUI reconnection recovery improved (0.166.0); safety blocks explained with selectable safer follow-ups; `/feedback` sends logs; `codex -c log_dir=./.codex-log` writes plaintext TUI log; `RUST_LOG`. Undo: a `/undo` command existed and users ask for it back (issue #9203, 2026-01-14, open); docs recommend Git checkpoints. [changelog, docs/install.md, developer-commands]

13. Uninstall
- Not found in the pages read: unverified. (npm path would be `npm uninstall -g @openai/codex`, brew `brew uninstall --cask codex`: inferred, not documented in sources fetched.)

---------------------------------------------------------------------------
## C. Other tools (brief; primary sources)

### Cursor CLI (`agent`) - https://cursor.com/docs/cli/overview ; https://cursor.com/docs/cli/reference/authentication
- Install: `curl https://cursor.com/install -fsS | bash` (mac/Linux/WSL); Windows `irm 'https://cursor.com/install?win32=true' | iex`; start with `agent`.
- Auth: `agent login` (browser; `NO_OPEN_BROWSER=1` prints URL), or `CURSOR_API_KEY`/`--api-key`; `agent status`, `agent logout`.
- Modes: Agent (default), Plan (`/plan`, `--plan`), Ask (read-only `/ask`); Shift+Tab switches. Interactive: "review proposed changes and approve commands". `/sandbox` or `--sandbox enabled|disabled`.
- Sessions: `agent ls`, `agent resume`, `--continue`, `--resume=<id>`.
- Distinctive: `&` prefix hands conversation to a Cloud Agent; masked sudo password prompt that bypasses the model.
- Approval/diff UI details, MCP, rules: unverified (not in pages read).

### Aider - https://aider.chat/docs/install.html ; https://aider.chat/docs/git.html
- Install: `python -m pip install aider-install && aider-install`, or `curl -LsSf https://aider.chat/install.sh | sh`, uv, pip, pipx. Auth: bring your own key `aider --model sonnet --api-key anthropic=<key>` (also .env).
- Distinctive: auto-commits every edit with a descriptive message; appends "(aider)" to git author/committer name; commits pre-existing dirty changes first (`--no-dirty-commits` disables); `--no-auto-commits` turns off; `/undo` discards last aider commit, `/diff` shows changes since last message.

### Gemini CLI - https://github.com/google-gemini/gemini-cli ; trusted folders https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md ; checkpointing .../docs/cli/checkpointing.md
- Install: `npx @google/gemini-cli`, `npm install -g @google/gemini-cli`, `brew install gemini-cli`, MacPorts, conda; channels @latest / @preview (weekly) / @nightly.
- Auth: Google OAuth (paid Code Assist licence needs GOOGLE_CLOUD_PROJECT), `GEMINI_API_KEY`, Vertex AI. README (as fetched 2026-11-03) says free individual access and Google AI Pro/Ultra moved to "Antigravity CLI" on June 18, 2026 (secondhand summary; verify before citing).
- Trust folders (off by default; `security.folderTrust.enabled`): first-run dialog Trust folder / Trust parent folder / Don't trust ("safe mode"); untrusted disables project settings, .env, extensions install, auto-accept tools, MCP connections, custom commands. Stored in ~/.gemini/trustedFolders.json.
- Context file GEMINI.md. Checkpointing is opt-in (`general.checkpointing.enabled`): shadow git repo in ~/.gemini/history; `/restore` re-proposes the tool call.
- Approval modes (default/auto_edit/yolo): unverified in the pages read.

### OpenCode - https://opencode.ai/docs/ ; https://opencode.ai/docs/tui/ ; https://opencode.ai/docs/permissions/
- Install: `curl -fsSL https://opencode.ai/install | bash`, `npm install -g opencode-ai`, brew (`brew install anomalyco/tap/opencode` = V1; plain `brew install opencode` = V2), WSL recommended on Windows.
- Auth: `/connect` in TUI (opencode.ai/auth key or another provider). `/init` writes AGENTS.md. Tab toggles Plan/Build agents (Plan cannot change files).
- TUI distinctives: leader key Ctrl+X (2000 ms timeout), `/undo` and `/redo` use Git (repo required) and restore your prompt, `/editor` ($EDITOR), `/themes`, `/sessions`, `/export`, `/details`, scroll_speed/acceleration config, `/update` (never self-updates).
- Permissions: most default to allow; `doom_loop` and `external_directory` default to ask; `.env` reads ask; rules are allow/ask/deny with last-match-wins patterns (`"bash": {"*":"ask","git *":"allow"}`).

---------------------------------------------------------------------------
# PART 2: Secondary (developer-reported)

All are public GitHub issues unless stated (accessed 2026-11-03 via gh API/search; dates = created_at). HN/Reddit threads: I did not find/verify any specific thread (search returned none), so none are listed. Blog items are labelled "blog (vendor/third-party)".

| # | URL | Date | Paraphrase | Topic |
|---|-----|------|-----------|-------|
| 1 | https://github.com/anthropics/claude-code/issues/769 | 2025-04-12 (open) | Screen flickers while a tool call is in progress | 11 scrollback/flicker |
| 2 | https://github.com/anthropics/claude-code/issues/826 | 2025-04-19 (open, 354 comments) | Console jumps to top of history when Claude appends text | 11 scrollback |
| 3 | https://github.com/anthropics/claude-code/issues/3648 | 2025-07-16 (closed) | Terminal scrolls uncontrollably during interaction | 11 scrollback |
| 4 | https://github.com/anthropics/claude-code/issues/41814 | 2026-04-01 (closed) | Messages disappear from terminal display after v2.1.89 update | 11 rendering regression |
| 5 | https://github.com/anthropics/claude-code/issues/3366 | 2025-07-11 (closed) | Native Windows repeatedly asks to trust folder | 3 trust prompt |
| 6 | https://github.com/anthropics/claude-code/issues/12980 | 2025-12-03 (closed) | Request to skip trust prompt when settings.local.json already allows it | 3 trust prompt |
| 7 | https://github.com/anthropics/claude-code/issues/23109 | 2026-02-04 (closed) | Request for trusted-workspace patterns so git worktrees do not re-prompt for trust | 3/9 trust + worktrees (cf. docs: --worktree needs prior trust) |
| 8 | https://github.com/anthropics/claude-code/issues/36168 | 2026-03-19 (open) | Bypass/--dangerously-skip-permissions reported broken in versions after v2.1.77 | 3 permissions |
| 9 | https://github.com/anthropics/claude-code/issues/5244 | 2025-08-06 (closed) | macOS OAuth login succeeds but token not persisted, then "Missing API key" | 2 auth loop |
| 10 | https://github.com/anthropics/claude-code/issues/14164 | 2025-12-16 (closed) | Pasted-text placeholders not expanded in message history | 11 paste |
| 11 | https://github.com/anthropics/claude-code/issues/6235 | 2025-08-21 (closed, 409 comments) | Request for AGENTS.md support (now supported per memory docs) | 4 instruction files |
| 12 | https://spin.atomicobject.com/permission-fatigue-claude-code/ | undated in results | Blog (third-party): permission fatigue as a security risk, how to tune allowlists | 3 permission fatigue |
| 13 | https://tessl.io/blog/claude-code-gets-auto-mode-to-cut-approval-fatigue/ | ~Mar 2026 per search summary (unverified date) | Blog (third-party): auto mode introduced to cut approval fatigue; a "93% of prompts approved" figure circulates but its source is unverified | 3 permission fatigue |
| 14 | https://github.com/openai/codex/issues/2558 | 2025-08-21 (closed) | Output truncated when scrolling in Zellij | 11 scrollback |
| 15 | https://github.com/openai/codex/issues/5259 | 2025-10-16 (closed) | Request to re-render scrollback after terminal resize | 11 resize |
| 16 | https://github.com/openai/codex/issues/16165 | 2026-03-29 (closed) | Input area drawing leaves artifacts / overwrites scrollback over repeated resizes | 11 resize |
| 17 | https://github.com/openai/codex/issues/21978 | 2026-05-09 (closed) | CLI still renders at stale size after resize (Ghostty, 0.131.0-alpha.4) | 11 resize |
| 18 | https://github.com/openai/codex/issues/25622 | 2026-06-01 (open) | TUI resize reflow emits a full clear outside synchronized output -> blank flash | 11 resize/flicker |
| 19 | https://github.com/openai/codex/issues/3085 | 2025-09-03 (closed) | Request to allowlist specific commands that need no approval | 3 permission fatigue |
| 20 | https://github.com/openai/codex/issues/9203 | 2026-01-14 (open, 97 comments) | "Please make /undo back" | 12 undo |
| 21 | https://github.com/openai/codex/issues/8259 | 2025-12-18 (closed) | Markdown tables not human-readable in TUI | 11 narrow/width rendering |
| 22 | https://github.com/openai/codex/issues/13993 | 2026-03-08 (open) | Request for a standalone Windows installer (codex-setup.exe) | 1 install (Windows) |
| 23 | https://github.com/openai/codex/issues/41587 | 2026-08-30 (closed) | Make 12-row inline diff preview limit configurable | 5 diff review |
| 24 | https://github.com/openai/codex/issues/17827 | 2026-04-14 (open, 55 comments) | Customizable status line request | 11 status line |
| 25 | https://github.com/openai/codex/issues/48122 | 2026-09-25 (closed) | Cmd+C not copying on mac while Ctrl+C works | 11 key bindings |
| 26 | https://github.com/anthropics/claude-code/issues/16157 | 2026-01-03 (open, 1499 comments) | Instantly hitting usage limits on Max subscription | 12 rate limits |

Not found: specific confirmed public issues on "WSL + Claude Code/Codex" sorted by relevance (searches returned unrelated results), "resume confusion", or "narrow terminal" for Claude Code; treat these topics as unverified at the issue level (the Claude docs themselves cover WSL search slowness and `Alt+V` image paste on WSL).

---------------------------------------------------------------------------
# PART 3: Expectations a developer brings to a new terminal agent harness (~12)

1. One-line install, no runtime prerequisites, and a verifiable version (`--version`) - Claude setup (native installer + `claude --version`), Codex README (curl/brew/npm), OpenCode, Gemini, Aider, Cursor all offer a curl one-liner.
2. Silent, safe auto-update with an opt-out and a visible failure message - Claude setup ("Auto-update failed" footer, `DISABLE_AUTOUPDATER`), OpenCode `/update` never auto-installs (explicit counter-model), Codex installer re-run updates.
3. Login with an existing subscription via browser, with API-key and headless (device code) fallbacks, and a clear logout - Claude quickstart; Codex auth page (`--device-auth`, `codex logout`); Cursor `agent login`/`NO_OPEN_BROWSER`.
4. A trust decision at the folder boundary before project config, hooks or MCP run - Claude workspace trust + `.mcp.json` approval; Gemini trusted folders (Trust / Trust parent / Don't trust); Codex `trust_level`. Developers also expect it to be remembered (issues #3366, #12980, #23109).
5. Legible permission tiers that can be switched mid-session with one key, plus a way to avoid prompt fatigue (allowlist rules, classifier or sandbox) - Claude Shift+Tab modes/auto mode; Codex `/permissions` presets; Cursor Shift+Tab modes; OpenCode allow/ask/deny; issues Codex #3085, blogs on permission fatigue.
6. A read-only plan mode before edits - Claude plan mode (`Shift+Tab`, `/plan`), Codex `/plan`, Cursor Plan, OpenCode Plan/Build via Tab.
7. Visible diffs, with approve/reject per change, plus a project-wide `/diff` - Claude diff panel/dimmed rejected diff; Codex `/diff`, `/review`; Aider `/diff`; issue Codex #41587 (diff preview cap).
8. Safe undo that does not depend on trusting the agent - Claude `/rewind` checkpoints (explicitly not for Bash changes), Gemini `/restore`, OpenCode `/undo`/`/redo` via Git, Aider auto-commit + `/undo`; Codex users ask for `/undo` back (#9203). Git remains the backstop in every vendor doc.
9. Interrupt and steer without losing the turn; type-ahead is queued, not dropped - Claude Esc/queue/Ctrl+Enter; Codex Enter = steer, Tab = queue.
10. Predictable session resume (latest in this dir, pick from list, by name) that restores mode and context - Claude `--continue/--resume/--from-pr`; Codex `codex resume/fork`; Cursor `agent resume`; OpenCode `/sessions`.
11. A project instruction file that works across tools (AGENTS.md) and a one-command bootstrap (`/init`) - Claude memory docs (AGENTS.md read when no CLAUDE.md), Codex AGENTS.md discovery, OpenCode `/init`, Gemini GEMINI.md; issue Claude #6235 (409 comments) shows demand.
12. The terminal must behave like a terminal: stable scrollback, correct resize/reflow, no flicker, sane multiline entry and big pastes, native copy/search, works in tmux and over SSH, adjustable width - Claude fullscreen docs (trade-off: loses Cmd+F), paste placeholders, `/terminal-setup`, tmux config; issues Claude #769/#826/#3648/#41814, Codex #2558/#5259/#16165/#21978/#25622/#8259.
13. Worktree/parallel-session isolation that does not re-ask trust or collide on approvals - Claude `--worktree`, shared approvals across worktrees; issue Claude #23109.
14. Diagnostics inside the tool (`/doctor`, `/status`, `codex doctor --network-only`, `/feedback`) and honest, specific error messages (auth, rate-limit, network) - Claude troubleshooting/errors docs; Codex 0.166.0 changelog; rate-limit complaints (#16157).
15. Clean uninstall that tells you which config/state remains (`~/.claude`, `~/.codex`) - Claude setup (uninstall + "Remove configuration files"); Codex: not documented in pages read (unverified).

---------------------------------------------------------------------------
# PART 4: Jobs-to-be-done for LAB, checked against the walkthrough

| # | Job ("When I…, I want to…, so I can…") | Expectation source (Part 3) | LAB today (JOURNEY.md) |
|---|---|---|---|
| J1 | When I try a new agent, I want one command that installs it and tells me the next step, so I can be coding in minutes. | 1, 2 | Install is fast and verified, but the next step is buried in ~150 lines and three launch paths (F09, F10, F11). |
| J2 | When I connect a model, I want it checked as I go, so I don't find out it's wrong at my first prompt. | 3, 14 | Validated only at the end, then the launcher exits. No connection test (F04, F05). |
| J3 | When I open a project, I want the agent to know the project's rules (AGENTS.md), so it follows our conventions. | 11 | Ignored: `--no-context-files` (F02). |
| J4 | When the agent wants to change files or run commands, I want to decide how much it may do without asking, so I stay in control without fatigue. | 4, 5 | No approvals and no modes (F01). |
| J5 | When a change is non-trivial, I want a read-only plan first, so I can redirect before any edit. | 6 | No plan mode. Shift+Tab is thinking level (F07). |
| J6 | When the agent has edited, I want to review the whole diff in place and undo a turn, so mistakes are cheap. | 7, 8 | The inline per-edit diff is good. No `/diff`, no `/undo` (F06, F08). |
| J7 | When a turn is going wrong, I want to interrupt or steer without losing work. | 9 | Esc aborts and Option+Enter queues, per `/hotkeys` (not exercised). |
| J8 | When I come back tomorrow, I want to continue where I left off. | 10 | `/resume` picker works. No `lab --continue` (F22). |
| J9 | When I run several sessions, I want them isolated but able to coordinate. | 13 | Relay between same-project sessions (not exercised). No worktree helper. |
| J10 | When my terminal is narrow or split, I want the UI to stay usable. | 12 | Herdr sidebar and two panes leave 22–30 columns for Pi. `--single-pane` works (F13). |
| J11 | When something fails, I want a specific message and the fixing command. | 14 | "Error: Connection error." with no host or hint (F05). |
| J12 | When I'm done with the tool, I want a clean uninstall that tells me what remains. | 15 | Not documented. 274 MB plus a cache outside LAB folders (F15). |
