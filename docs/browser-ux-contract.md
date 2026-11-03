# Browser UX contract (boards 5 and 9)

Builds on the owned browser from PR #23 (`docs/browser-workspace-contract.md`) and starts from main `d3076ad`.
It covers UX findings F14 and F17 and the browser parts of F16, from the
[UX journey](research/ux-journey/SUMMARY.md) and boards 5 and 9. All PR #23 rules stay as they are: one exact origin, fresh `@eN` refs,
no automatic retry, bounded output, display escaping, lifecycle and cleanup. No model, provider or auth calls are made. Validation
uses only scripted 127.0.0.1 fixture pages.

## Out of scope (permission-modes thread, `feat/permission-modes`)

These belong to the permission-modes thread: approval prompts and modes, batched approval for page changes, and the F30 call and
success-result rows that name the ref, label, value and origin (`renderCall` and the success branch of `renderResult`). This
slice gives those rows the data they need (`details.operation`, `details.ref`, `session.refLabel(ref)`) but does not render them.

## Shared helpers (generic, reused by other threads)

- `src/pi/terminal-text.ts` holds `displaySafe`, `columns` and `wrapColumns`, moved unchanged from PR #23, plus a new `fitColumns`
  that cuts a value to one row with `…`. `browser-extension.ts` re-exports them.
- `src/pi/status-indicator.ts` provides `indicatorText({ glyph, label, detail })` and `setIndicator(ui, key, state | undefined)`.
  They sit on Pi's `ctx.ui.setStatus`. The glyph is one of `●` (active), `○` (off) or `!` (needs attention), so state never
  depends on colour. Label and detail are escaped and limited to 48 columns. Permission modes and agent-desktop can reuse them.
- Footer slots (`indicatorSlots`): `lab-mode` (#26), `lab-web` (this slice), `lab-x-desktop` (reserved). Pi 1.4.0 renders all
  statuses on one footer line, sorted by key with `localeCompare`, joined with a space and cut from the right with `...`. Key order
  is therefore keep order: the mode sorts first and stays whole whenever the terminal is at least as wide as the mode text; the
  web chip is cut next and desktop first. `setIndicator` accepts only these keys. A test replays Pi's footer rule at 40/80/120.
  At 40 columns with the longest mode (`mode: read-only · /lab-mode`) the footer is `mode: read-only · /lab-mode ○ web clo...`:
  the mode and the chip's glyph and label stay; the reason is then read from `/lab-browser status` or the failure row.

## States and what the operator sees

| State | When | Footer chip | Transcript row (not sent to the model) |
|---|---|---|---|
| active | browser attached and usable | `● web 127.0.0.1:53508` | `/lab-browser status` → `● browser 127.0.0.1:53508 only · private profile` plus `N actions · last: click @e4 · /lab-browser close` |
| closed | `/lab-browser close`, or a clean close after a failure | `○ web closed` (operator close: no reason) | `○ browser closed …` plus the restart command `lab --browser <origin>/` |
| breach | after an action, the page left the origin or opened a new tab or window (`ORIGIN` or `NEW_TARGET` inside the action) | `○ web closed · left origin` | `○ browser closed: page left <origin>` · actions off for this run · restart command |
| uncertain | a fill, click or navigate timed out, was cancelled, printed diagnostics or returned an unexpected response | `○ web closed · result unknown` (`· read failed` for snapshot/read) | `○ browser closed: click @e5 timed out, result unknown.` · `Check the page yourself before trying again.` · restart command |
| lost | the daemon exited, was replaced or the session identity changed (`SESSION_LOST`, spawn failure) | `○ web closed · connection lost` | `○ browser disconnected: the browser daemon exited or was replaced.` · page state is unknown · restart command |
| cleanup-failed | any of the above, and owned cleanup could not be verified | `! web cleanup` | the cause, plus `Owned state kept. Run /lab-browser close to retry cleanup.` |
| stale | the ref is not in the latest snapshot. Refused **before** anything is sent to the page, and the browser stays active. | unchanged | `! @e5 is stale: refs reset after fill/click/navigate. Nothing was sent. Take a new snapshot.` (or `unknown` if the ref was never issued) |
| refused | input or origin refused before dispatch (for example navigating to another origin). The browser stays active. | unchanged | `! refused before anything was sent: …` |

Rules:

- LAB **never** retries on its own and never takes the follow-up snapshot itself. The stale row tells the *model* (through the tool
  result) and the operator to look first. Uncertain mutations stay closed for the run, as in PR #23.
- Every failed tool result carries `details: { error, operation, state, recovery }`. The model-facing text is
  `<CODE>: <recovery>`, so the model receives the same look-first instruction the operator sees.
- The restart command uses only the operator-chosen origin from the private descriptor, never page text. It is escaped for
  display.
- After an action failure the chip names why it closed (lead review): `result unknown`, `read failed`, `connection lost` or
  `left origin`. The reason is written (validated, display only) beside the private browser ref, so it survives `/reload` after
  the owned root is gone.
- The chip is set when the session starts (including after `/reload`), after every `lab_browser` result and after
  `/lab-browser close`. Ordinary `lab` with no browser sets no chip.
- `/lab-browser status` and `/lab-browser close` write a transcript row through `pi.appendEntry` and `registerEntryRenderer`.
  Outside the TUI (`ctx.mode !== 'tui'`: print, json, rpc) they also notify, escaped, because entries are not drawn there.
  These rows never enter model context.
- Every action-phase failure records whether the command was dispatched. If the daemon was already gone or the page had
  already left the origin before the action was sent, the recovery text says the action was not sent (still closed for the
  run) instead of blaming it; the verdict reason is `not sent` and the chip `check failed` / `left origin` / `connection lost`.
- Cleanup never sends a command to a dead daemon (the CLI could start a replacement whose pid was never read). It goes straight
  to the verified profile reap; ownership is re-proved immediately before each signal.
- If `/reload` cannot reattach the browser while owned state still exists, the chip is `! web not reattached · /exit cleans up`
  (the launcher closes the browser on exit); it never claims `closed` while state is live.

## Verification and the browser turn verdict

- The session tracks a pending change. After a successful fill, click or navigate the change is *unverified*. A later successful
  `snapshot` or `read` sets `details.verifies = true` and clears it. This tells the permission-modes success rows (F30) and the
  verdict that the page was read back after the change.
- Read-back is scoped to one agent run: the verdict counts a change as verified only when a snapshot or read follows it in the
  same run.
- When an agent run that used `lab_browser` ends (`agent_end`), one verdict row is appended. It is built only from the
  `tool_execution_end` results (`isError` and `details`), never from model text:
  - `✓ browser: 1 snapshot · 1 fill · 1 click · 1 read · read back after change`
  - `! browser: page changed, not read back · …`, when the last change was never followed by a snapshot or read
  - `✗ browser: 1 failed (result unknown) · …`, when any action failed
  - refusals are counted (`1 refused`) but do not by themselves turn ✓ into ✗.
- The tool description tells the model to verify with snapshot or read after changes, and to report a failed or uncertain action
  as unknown instead of retrying.

## Setup and help (F17, board 5)

- `lab --setup-browser` prints `✓ agent-browser 0.41.0 verified (no browser downloaded)`, then either `✓ browser found: <path>`
  or `! no approved browser found; install Chrome/Chromium/Edge or pass --browser-executable PATH`, and ends with
  `Next:  lab --browser http://localhost:3000/` (an example URL, labelled as such).
- The `Usage:` line in `lab --help` is generated from `shellOptions`, so it includes `--setup-browser`, `--browser URL` and
  `--browser-executable PATH`. The `lab` shell launcher's unknown-flag Usage line matches it, and a test keeps the two equal.

## Acceptance

- Deterministic unit tests (normal gate):
  - every state's chip and row at widths 40, 80 and 120, with each row's columns ≤ width;
  - hostile origin and text (ESC, bidi, C1, wide or emoji, lone surrogates) escaped in chip, rows and recovery text;
  - error classification by code × operation × phase;
  - the stale and unknown ref paths send nothing to the transport;
  - the verdict from synthetic tool results (✓, !, ✗, refusals, Pi validation errors with empty details);
  - the Usage line includes every option, and the shell launcher matches it;
  - the setup output ends with `Next:`.
- Actual evidence, refreshed under `docs/browser-evidence/` with provenance:
  - `browser-smoke.ts` adds stale-ref, breach, uncertain (cancel) and lost (daemon killed by its own pid) state rows, read from
    real sessions;
  - `browser-native-smoke.ts` (normal `lab` with Pi, Relay, Herdr and the scripted protocol fixture) captures the `● web` chip, the
    stale row, the ✓ verdict, the status row, `/reload`, then a breach with `○ web closed` and the restart command, and a clean
    exit.
- Docs: the user guide's browser section is updated, along with the evidence doc and the publication manifest. `bun run check`
  stays green.
- Not claimed: the approval UX (other thread), live model behaviour, Linux or WSL, and pixel captures of the footer colour.
