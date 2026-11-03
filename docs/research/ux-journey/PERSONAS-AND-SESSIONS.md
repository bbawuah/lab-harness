# Personas and session scripts (SIMULATED)

> **SIMULATED. No real developers were interviewed for this round.** Every persona, quote and session below was
> written by the UX researcher (an AI agent). Each is built from three things: the primary and secondary sources
> in [RESEARCH.md](RESEARCH.md), what LAB actually did in [JOURNEY.md](JOURNEY.md), and the evidence in
> [evidence/](evidence/). Treat them as hypotheses to test with real people using the
> [interview guide](INTERVIEW-GUIDE.md), not as findings. "Hesitates" and "expects" mark the points the walkthrough
> predicts will cause trouble. LAB output quoted in the scripts is taken from captured text.

The five personas cover the range Brian named: two vendor-agent power users, a first-timer, a regulated/airgapped
engineer and a team lead.

---

## P1 · Maya, Claude Code power user (simulated)

- **Background.** Senior backend developer who has used Claude Code daily for a year. Uses `Shift+Tab` into plan
  mode for anything over ~20 lines and "auto" mode otherwise. Has CLAUDE.md files in every repo. Wants LAB to run a
  self-hosted model for a client whose code can't leave the network.
- **Brings.** Expectations 4–7, 9 and 11 (RESEARCH.md Part 3): plan mode, permission tiers, `/rewind`, a queued
  type-ahead, and CLAUDE.md/AGENTS.md loaded automatically.

**Session script (simulated)**

| # | Maya types | Expects | Sees (from captures) | Hesitation |
|---|---|---|---|---|
| 1 | `curl … \| sh` in `~/work/client-api` | A few lines, then the TUI | ~150 lines including JSON. Model setup appears without a project prompt, because she is in a project. | Low. Skims past it. |
| 2 | `local`, `http://gpu-box:8000/v1`, `qwen2.5-coder-32b`, key | A model list or a test | It opens straight away. The footer says `0.0%/8.2k`. | "8.2k? This model has 32k." She can't change it (F03). |
| 3 | `Shift+Tab` | Plan mode | The thinking level cycles (F07). | **High.** "Where's plan mode?" Tries `/plan`, which doesn't exist. |
| 4 | "Refactor the retry logic in client.py to use backoff" | A permission prompt before edits | Edits are applied immediately (F01). | **High.** Presses Esc mid-turn (not exercised here) and checks `git status` in the right pane. |
| 5 | "Follow CLAUDE.md conventions" | It has already read them | It doesn't know them (F02). She pastes them in, using context. | Medium. |
| 6 | `/rewind` | Checkpoint picker | No such command. Unknown slash text may become a prompt (user guide). | Medium. Reverts with `git checkout` in the shell pane. |

**Likely verdict (simulated):** "Fast install, nice clean exit, but I can't let it loose on client code without
approvals."

---

## P2 · Dev, Codex CLI user (simulated)

- **Background.** Full-stack developer on Codex CLI in `workspace-write` with on-request approvals. Relies on
  `/diff` and `/review` before every commit and runs `codex resume` daily.
- **Brings.** Expectations 5, 7, 10 and 14: a sandbox with the network off, `/diff`, `/review`, resume, and
  `codex doctor`.

| # | Dev types | Expects | Sees | Hesitation |
|---|---|---|---|---|
| 1 | `curl … \| sh` from `~` | — | The project chooser. Types `~/code/shop` (correct). | Low. |
| 2 | `litellm`, `https://llm.corp/v1`, `gpt-oss-120b`, key | A sign-in-style flow | A plain prompt with a hidden key. OK. | Low. |
| 3 | "Add a unit test for cart totals" | Sandbox and approval for `npm test` | `bash npm test` runs with no ask (F01). | Medium. "Is there a sandbox?" README: "project binding is not an OS sandbox". |
| 4 | `/diff` | Diff overlay | Nothing matches (F06). Switches to the right pane (`Ctrl+B l`) and runs `git diff` at 36 columns. | Medium. |
| 5 | Next morning: `lab --resume` | Session picker | Unknown option, prints Usage (F22). Then finds `/resume` in the TUI. | Low–medium. |
| 6 | Gateway down: "continue" | A clear error naming the host | "Error: Connection error." ×3 (F05). | **High.** Doesn't know whether LAB, the gateway or the VPN failed. |

---

## P3 · Sam, first-time agent user (simulated)

- **Background.** Junior developer and bootcamp graduate who has used ChatGPT in the browser but never a
  terminal agent. Has Ollama on a laptop because a colleague suggested it.
- **Brings.** No vendor habits, but general expectations 1, 3 and 14: install and be told what to do next.

| # | Sam types | Expects | Sees | Hesitation |
|---|---|---|---|---|
| 1 | Pastes the curl line in `~` | A finished install | The project chooser asks for a path. Types `Projects/todo` but the folder is `projects/todo`. | **High.** A generic refusal (F12) lists four reasons. |
| 2 | `ollama` at the route prompt | The obvious answer | Accepted for now (F04). | — |
| 3 | `localhost:11434` | It works | Accepted for now. | — |
| 4 | `llama3.2` | — | `LAB: Invalid workspace route; run ./lab --configure`, then the shell prompt (F04). | **Very high.** Types `./lab --configure`: "no such file". Types `lab --configure`: "command not found" (F11). Probably gives up here. |
| 5 | (If helped) `lab` | A chat | A first screen of boilerplate and a peer hash (F19). No "try this". | Medium. |
| 6 | "What does this project do?" | An answer | Depends on the model (not exercised). The 8k context is quickly full on a real repo (F03). | Unknown. |

---

## P4 · Ruben, defence engineer on an airgapped network with WSL (simulated)

- **Background.** Works for a defence contractor on a Windows laptop with WSL2 Ubuntu. The model is a vLLM server
  on the classified LAN. There is no internet; packages arrive through a reviewed mirror. Every tool needs a
  security review and approvals must be auditable.
- **Brings.** An offline install, a verifiable supply chain, no outbound calls, approval gates and audit logs, and
  a clean uninstall. WSL is "not yet verified" by LAB.

| # | Ruben does | Expects | Sees or would see | Hesitation |
|---|---|---|---|---|
| 1 | Reads the README | An offline bundle | `--offline` needs warm caches. The first install needs GitHub/npm. | **High.** Needs a documented "transfer bundle" path. Not in scope today. |
| 2 | Platform check | WSL listed | "WSL remains unverified" (bootstrap). | High. His security officer will ask. |
| 3 | Reviews the supply chain | Pins and hashes | Strong: pinned archive SHA-256 and checksum-pinned runtimes. | Positive. This is LAB's differentiator. |
| 4 | First coding prompt | An approval prompt before every command | None (F01). | **Blocker (treated as P0 for this persona).** "Can't be approved for use." |
| 5 | Asks for an audit trail | Session logs plus approvals | Sessions persist under `workspace/agent/sessions`, but there are no approval records. | High. |
| 6 | `lab --offline` | No network | "Does not block model requests" (user guide). Honest, but he needs an enforced mode. | Medium. |
| 7 | Uninstall | A documented command | Manual `rm`. `~/Library/Caches/bun` is the macOS equivalent of a stray cache (F15). | Medium. |

---

## P5 · Lena, team lead running several sessions (simulated)

- **Background.** Tech lead who keeps 3–4 agent sessions open (feature, review, flaky-test hunt) across worktrees
  in tmux. Has used Claude Code `--worktree` and background agents.
- **Brings.** Expectations 10 and 13: named and resumable sessions, worktree isolation, and seeing at a glance what
  each session is doing.

| # | Lena does | Expects | Sees | Hesitation |
|---|---|---|---|---|
| 1 | Opens `lab` in two tmux windows on the same repo | Two independent sessions | Two sessions with distinct Relay peers. Good. | Low. |
| 2 | `/relay-peers`, `/relay-send …` | Messaging between agents | Works per the docs (not exercised here). Peer IDs are long hashes. | Medium. Needs aliases. |
| 3 | Wants a worktree per session | `lab --worktree feat-x` | No such option. `--project ../wt-feat-x` works, but Relay isolates distinct worktrees unless `--relay-group` is configured. | Medium–high. |
| 4 | Looks at the Herdr sidebar "agents" list | All sessions across windows | Only this workspace's panes. | Low. The sidebar is useful here, but it costs 25 columns. |
| 5 | Resizes tmux panes to 80 columns each | Readable | Pi gets 30 columns (F13). Uses `--single-pane`. | Medium. |

---

## Cross-persona pattern (simulated synthesis)

| Friction | P1 Maya | P2 Dev | P3 Sam | P4 Ruben | P5 Lena |
|---|---|---|---|---|---|
| F01 no approvals | high | medium | — | **blocker** | medium |
| F02 AGENTS.md ignored | medium | medium | — | medium | medium |
| F03 8k context | high | medium | high (later) | medium | medium |
| F04 route setup exits | low | low | **very high** | low | low |
| F05 opaque endpoint error | medium | high | high | high | medium |
| F06/F07/F08 diff, plan, undo | high | high | — | medium | medium |
| F13 width | low | medium | low | low | high |
