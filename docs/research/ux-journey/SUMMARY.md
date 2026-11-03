# UX journey summary: install to terminal to real work

Study date 2026-11-03. Repo `main` at `b889d80`, hosted runtime `05b0d36`. macOS 27 arm64.
Scope runs from the first curl line to a reviewed commit. This was a research round: no source changes.

## How this was done

- **[RESEARCH.md](RESEARCH.md).** Primary docs, changelogs and release notes for Claude Code (v2.1.317) and Codex
  CLI (0.166.0), plus Cursor CLI, Aider, Gemini CLI and OpenCode. Also 26 labelled developer-reported GitHub issues
  and blogs. All sources are dated.
- **[JOURNEY.md](JOURNEY.md).** A real walkthrough: hosted install into a fresh HOME, first run, workspace,
  browser, resize, update and uninstall, with 23 friction items and [sanitized evidence](evidence/).
  - **No model, provider or auth was used.** The coding loop ran against a scripted fixture on 127.0.0.1, so Pi's
    UI is real and the "model" is not.
- **[PERSONAS-AND-SESSIONS.md](PERSONAS-AND-SESSIONS.md).** Five **simulated** personas with session scripts.
  [INTERVIEW-GUIDE.md](INTERVIEW-GUIDE.md) is for real interviews later.
- **[WIREFRAMES.md](WIREFRAMES.md).** An 8-board design canvas comparing current and proposed:
  https://claude.ai/artifact/DP27dyyyGrDPxSi7paMr1a (private).

## Headline

LAB's **install and hygiene are already better than average**:
- the install is checksum-pinned, takes ~75 s cold and 2.5 s warm, needs no sudo and makes no profile edits;
- it writes nothing into the project, and exit cleans up properly.

The **coding loop is where LAB falls short of what Claude Code and Codex users expect**:
- there are no approval gates or modes;
- the project's AGENTS.md is ignored;
- the context window is fixed at 8k;
- there is no plan, diff or undo.

First-run errors drop a beginner back at the shell with a command that doesn't exist. No P0 blocked the
walkthrough, but F01 is a blocker for regulated users.

## Top findings (prioritised)

| Rank | ID | Finding | Sev | Recommendation |
|---|---|---|---|---|
| 1 | F01 | Edits, shell and `git commit` run with **no approval and no mode to require one**. *Deliberate delegation to Pi's native approvals (`src/pi/workspace.ts:56`, 4bd2e7a; `docs/architecture.md:67–68`), but no gate appears as launched, and no rationale for having none was found.* | P1 (blocker for regulated users) | First check whether pinned Pi 1.4.0 has a gate or tool policy LAB could enable without breaking `--no-extensions`. If not, add approval modes (plan / ask / edit / allow-all), defaulting to **ask** and set at first run. Board 2 and board 4 (B, C, D). |
| 2 | F03 | **Context fixed at 8,192 tokens and output at 1,024** for every model. About 30% is used before the first prompt. *Deliberate legacy assumption sized to the 0.6B/8k validation server (`src/pi/workspace-config.ts:111`, 4bd2e7a; `docs/interactive-validation.md:83`; `docs/research/model-providers.md:266`). The provider-connection work already plans to replace it.* | P1 | Don't add a separate fix. Show provenance now (`8192 · configured, legacy`) with honest `used/total`, and let the planned provider-connection flow set the context and output limits per model (`provider-connection-ux/contracts.md:34`). |
| 3 | F04 | **Route setup validates only at the end, then exits** with `./lab --configure` | P1 | Validate each answer and re-ask. Use numbered choices and fix up the URL. Never exit on bad input. Errors should name the real launcher (`lab --configure`). |
| 4 | F05 | **"Error: Connection error."** with no host, cause or next step, and no connection test | P1 | Add an opt-in `GET /v1/models` test in setup, a `/lab-doctor` (no prompt), and errors that name the endpoint and the fix while keeping the user's prompt. |
| 5 | F02 | **Project AGENTS.md ignored** (`--no-context-files`, `src/pi/workspace.ts:75`). *Deliberate: context is opt-in by design (`workspace.ts:55`; `docs/pi-workspace.md:132–133`; `engineer-features/CURRENT-VS-GAPS.md:17`, "don't silently enable autoload", f1eca8b).* | P2 (lowered from P1) | Don't autoload. Add an explicit, inspectable opt-in instead: a one-time trust or briefing prompt per project that shows which files would load ("Load AGENTS.md (412 B)? y/N"), then "Loaded AGENTS.md" on the first screen and `/reload` for changes. |
| 6 | F06 F07 F08 | No `/diff`, no plan mode (Shift+Tab = thinking), no `/undo` | P2 | Add a `/diff` overlay (git diff including untracked files), a plan mode on Shift+Tab, and a git-backed per-turn `/undo`. |
| 7 | F13 | The Herdr sidebar takes 25 columns, so Pi gets 30 of 80 or 22 of 40 columns | P2 | Start with the sidebar collapsed. Auto-fold to one pane below about 100 columns. Put `Ctrl+B b` in `/lab-help`. |
| 8 | F09 F10 F11 F18 | Install prints ~150 lines of JSON and 3 launch paths. PATH needs a manual step. No `--version`. | P2 | Write a 10–15 line summary with the log saved to a file, name one next command, and add `lab --version` and an "already up to date" message. |
| 9 | F14 | No persistent indicator that a browser is attached, and status is a transient toast | P2 | Add a `● web <origin>` chip in the status line and transcript rows for status and close. |
| 10 | F15 | No uninstall command or docs (274 MB plus a Bun cache outside LAB folders) | P2 | Add `lab --uninstall` (keeps state unless `--purge`) and a README section. Point Bun's cache inside LAB folders. |
| 11 | F16 | A turn can end with a "success" message after a failing test | P2 | Show a turn verdict (✓/✗) computed from tool exit codes, not model text. |
| 12 | F17 | **The Usage line in `lab --help` and in the shell launcher omits the browser flags** (the known finding) | P3 | Generate both Usage lines from `shellOptions`. |
| 13 | F12 F19–F23 | Generic project error, boilerplate first screen, banner hidden behind the alternate screen, long `/lab-help`, no `--continue`, Ctrl+L = model selector | P3 | See JOURNEY.md. These are cheap polish once the P1s are done. |

## Keep (don't regress)

- The pinned, verified supply chain and the refusal to overwrite a foreign `lab` or edit profiles. This is what
  P4-type users need most.
- The inline numbered diff on `edit`, and the `$ cmd` / exit code / `Took` lines for bash.
- The `/resume` picker, keyboard-first `/lab-appearance`, `--single-pane` and `--configure`.
- Clean `/exit` with no leftover processes or sockets. The browser close is also real.

## Suggested next steps (for Brian to decide)

1. Decide the approval-mode stance first (F01). It shapes first run, the coding loop and the P4 audience.
2. Ship the route and context fixes together (F02–F05). They are small and change the first-day experience a lot.
3. Run 5 real interviews with [INTERVIEW-GUIDE.md](INTERVIEW-GUIDE.md) before building diff, plan and undo. Check
   whether LAB users want vendor muscle memory (Shift+Tab) or something LAB-specific.
4. Re-walk the journey with a real local model once allowed. A live model run was not needed for this round.

## Limits

- Personas and sessions are simulated. The coding loop used a scripted fixture.
- Not exercised: model quality, Esc and queue, paste, mouse, the Relay two-session flow, the `lab_browser` tool
  (see the PR #23 evidence), real terminal apps, Linux and WSL.
- Research quotes came through a summarising fetcher. Unverified items are marked as such.
