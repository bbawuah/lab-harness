# Interview guide: developers and terminal agent harnesses

For Brian to use with real developers in a later round. About 45 minutes: a 30-minute interview plus a 15-minute
think-aloud on LAB. Use it to confirm or refute the simulated personas in
[PERSONAS-AND-SESSIONS.md](PERSONAS-AND-SESSIONS.md) and the friction table in [JOURNEY.md](JOURNEY.md).

## Before the session

- **Recruit** 5–8 people, aiming for at least one of each: a daily Claude Code user, a daily Codex user, someone
  new to agents, someone in a regulated or airgapped environment, and a lead who runs several sessions.
- **Consent.** Ask permission to record the screen and audio and to take notes. Tell them nothing they share about
  employers or code will be published. Don't record API keys: ask them to use a throwaway key or a local model.
- **Setup for the LAB task.** A fresh macOS or Linux user account (or a container), a tiny fixture repo with one
  failing test (as in `evidence/`), and a reachable local model, or the scripted fixture if no model is allowed.
  Record the LAB commit used.
- **Ground rule.** Ask about *the last time*, not "usually". Don't explain LAB's design until the end.

## Part A · Current practice (15 min)

1. Which coding agents have you used in the last month? Which one most? How did you install it?
2. Walk me through the last time you started a session on a real task. What did you type first?
3. How do you decide what the agent may do without asking? Have you changed that setting? Why?
   *Probe:* permission modes, allow-lists, sandbox, "yolo".
4. Tell me about the last time an agent made a change you didn't want. How did you notice? How did you undo it?
5. How do you review the agent's changes before committing? *Probe:* in-tool diff, `git diff`, IDE, `/review`.
6. Do you use a plan or read-only mode? When yes, when no?
7. How do you give the agent your project's rules? *Probe:* AGENTS.md, CLAUDE.md, pasting.
8. Do you run more than one session at a time? How do you keep them apart? *Probe:* worktrees, tmux, names.
9. What does your terminal look like while you work: width, splits, tmux, editor? Has an agent's UI ever broken in
   it (scrolling, resizing, paste)?
10. What was the last error from an agent that confused you? What did you do?

## Part B · Constraints (5 min)

11. Which models are you allowed to use at work? Who decides? Is there a gateway (LiteLLM etc.)?
12. Any rules about network access, data leaving the machine, or audit logs for AI tools?
13. What would make a security reviewer say no to a new agent tool?

## Part C · Think-aloud on LAB (15 min)

Hand them the README's one-line install and the fixture repo. Say: "Install it, then get the failing test fixed and
committed. Think aloud. I won't help unless you're stuck for two minutes."

Observe and time each step. Record hesitation points against the JOURNEY.md step numbers.

| Checkpoint | Watch for | Related friction |
|---|---|---|
| Install finished | Do they find the next command? Do they notice the PATH step? | F09, F10, F11 |
| Model setup | Route word, URL scheme, error recovery | F04 |
| First screen | What do they try first? Do they find `/lab-help`? | F19, F21 |
| First edit | Do they expect an approval? What do they do when there isn't one? | F01 |
| Review | Where do they look for the diff? Do they try `/diff`? | F06 |
| Commit | Do they let the agent commit or do it themselves? | F01 |
| Narrow or zoomed pane | Do they discover `Ctrl+B` keys? | F13 |

Debrief questions:

14. What surprised you, good or bad?
15. Where did you expect to be asked something and weren't, or the reverse?
16. If you could change one thing before using LAB on real work, what would it be?
17. Rate 1–5: "I would trust LAB to edit my real project." Why that number?

## Afterwards

- Within 24 hours, write one page per participant: quotes, the step where they hesitated, and their verdicts.
- Tag each observation with a friction ID, or add a new one. Mark it **observed (real participant)** to separate it
  from the simulated material.
- Re-rank the SUMMARY.md priorities only on observed evidence.
