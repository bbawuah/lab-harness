# Wireframes

**Artifact (Claude design canvas, private):** https://claude.ai/artifact/DP27dyyyGrDPxSi7paMr1a

It was created from the Design artifact type. The account has no design system, so the canvas uses its own small
system: IBM Plex Sans and Mono, a light ground, dark terminal frames, and blue/orange accents. Blue/orange instead
of green/red means diff and status colours differ in lightness, not only hue, and each also carries a `+`/`−` or
`✓`/`✗`/`!` glyph. The link is private by default: Brian can share it from the page's Share menu, and others can't
open it until he does.

Every board puts **Current** (sanitized text captured on 2026-11-03, abridged with `…`) beside **Proposed** (a
wireframe). The proposals are directions to test, not specifications. Friction IDs refer to
[JOURNEY.md](JOURNEY.md#friction-table).

| Board | Shows | Friction | Rationale |
|---|---|---|---|
| 0 · Journey overview | The 7 stages, their friction chips, links to each board | all | One page to orient reviewers. Severity is shown as a text label, not only colour. |
| 1 · Install | 161-line output vs a 14-line summary, plus a rerun/update screen and `lab --version` | F09 F10 F11 F18 | The checks stay, and the JSON moves to a log file. One launch command is named. The PATH step is visually separate and says LAB never edits profiles, which keeps the current safety stance. |
| 2 · First run and model setup | Validation only after three answers, then exit, vs step-by-step setup: numbered route choice, URL fix-up, opt-in connection test (`GET /v1/models`, no prompt), model list, context size, then a trust + AGENTS.md + approval-mode step | F04 F03 F01 F02 F12 | Gemini CLI's trust dialog, Claude's trust prompt and permission modes, and Codex's sandbox presets all ask this once at the start. The test is opt-in so "setup makes no model request" stays true unless the user agrees, and listing models is not inference. |
| 3 · Workspace | 120-column capture vs a collapsed sidebar, one-line header, first-screen hints, and a status line (project, branch, route, mode, context, relay) | F13 F19 F20 F21 F02 | Claude and Codex both show model, cwd and mode up front. Peer IDs move to `/relay-peers`. |
| 4 · Coding loop | Captured fixture transcript (no asks) vs four frames: A plan mode, B edit approval with diff, C command approval plus a turn verdict, D `/diff` overlay, commit approval and `/undo` | F01 F06 F07 F08 F16 | Two human gates (the change and the commit) match the Claude Code and Codex defaults. The turn verdict (✓/✗ from tool exit codes) addresses F16, where the reply claimed success after a failing test. Shift+Tab is reassigned to modes for muscle memory. |
| 5 · Browser | Toast-only status vs a persistent `● web <origin>` chip, browser action rows in the transcript, and a closed or breach state with the restart command | F14 F17 | The origin binding is LAB's safety story, so make it visible all the time. Setup ends with the next command. |
| 6 · Errors and recovery | "Error: Connection error." ×3 vs a message that names the host, cause and fix (`/lab-doctor`, `lab --configure`) while keeping the prompt; a `/lab-doctor` checklist; and a `lab --uninstall` that lists what it removes and keeps | F05 F15 F18 F22 | Mirrors `claude doctor` and `codex doctor --network-only`, and the Claude uninstall docs. |
| 7 · Narrow widths | 80 and 40 columns captured vs auto-fold to one pane below 100 columns (shell as a tab, `Ctrl+B l`) and frameless layout below 60 | F13 | `--single-pane` already works, so make it automatic and reversible. Claude shortens hints on narrow terminals (changelog v2.1.316). |

**Not designed in this round:**

- multi-session or worktree management (P5);
- an offline transfer bundle (P4);
- the Relay UI;
- large-paste chips;
- mouse behaviour.
