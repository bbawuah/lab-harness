# Optional desktop control workspace contract

Implementation starts from main `d3076adc73ff671bcb6bde7fa94fc7d8f73b5d06`. It follows the owned-browser
pattern of [#23](browser-workspace-contract.md). Research evidence in `docs/research/agent-tools/` is historical and
stays unchanged. No model, provider or auth calls are part of this feature's validation.

## Operator experience

Ordinary `lab` has no desktop dependency and registers no desktop tool. Desktop control is opted into in two
explicit steps:

1. `lab --setup-desktop` acquires and verifies the pinned tool. It then runs the **non-prompting**
   `permissions` check and names **who** macOS would grant: the responsible process that launches
   agent-desktop, read from the kernel (`responsibility_get_pid_responsible_for_pid`, `proc_pidpath`). It also
   states what else that grant covers ("every program started from Terminal"). If the grantee is not an app
   bundle (Homebrew `bun`, `node`, `sh` and other generic runtimes), setup says plainly **not** to grant it,
   because that would let every script on the Mac control apps. It recommends launching LAB from a terminal
   app instead. LAB never runs `permissions --request` or `--guide`, never opens System Settings and never
   changes TCC.
2. `lab --desktop` opts one run in. Inside Pi, `/lab-desktop attach` re-checks permissions. When Accessibility
   is denied it shows the same named-grantee message and stops. Otherwise it lists windows and the user picks
   **one** (`App · title · pid`); the model cannot attach, list windows or pick. `/lab-desktop status` shows
   the binding and `/lab-desktop release` unbinds. A persistent footer chip in the fixed `lab-x-desktop` slot
   (shared `status-indicator.ts` from #27) shows `● desk <App · title>`, `○ desk off`, or `!` when the last
   delivery is unknown or control has failed. Pi sorts footer chips by key and cuts from the right, so the
   desktop chip is cut first at narrow widths; `/lab-desktop status` always shows the full bound window.

*Deviation from board 10 (approved by the lead):* the board shows only in-session attach. This release adds
the per-run `--desktop` opt-in, mirroring `--browser`, so the tool is absent unless the operator asked for it
at launch.

## Model surface

A provider-neutral `lab_desktop` tool acts **only on the bound window**:

| Operation | Kind | Maps to (pinned 1.0.2) |
|---|---|---|
| `snapshot` | read | `snapshot --app A --window-id W -i --compact` |
| `read {ref, property: text\|value}` | read | `get REF --property …` |
| `click {ref}` | action | `click REF` |
| `type {ref, text ≤ 400 chars}` | action | `type REF -- TEXT` (30 s budget; upstream waits 5 s + 30 ms per character) |
| `scroll {ref, direction, amount 1–10}` | action | `scroll REF --direction D --amount N` |
| `press {key}` | action | `press KEY --app=A --window-id=W`, posted to that pid; refused unless the bound window holds system focus within 10 s of approval |

`press` accepts named keys only: `return escape tab space delete up down left right`. Modifiers are not
accepted. Upstream posts keys to the app's process, which routes them to its focused window, so `--window-id`
alone does not confine them to the bound window. LAB therefore refuses `press` (`NOT_FOCUSED`, nothing done)
unless `list-windows` reports the bound window as the focused window. Focus is system-wide and the
approval prompt runs in the terminal, so after Allow LAB polls for up to 10 s (every 250 ms, re-checking
window id, pid and executable each time) for the user to click the bound window's title bar; the last check is
immediately before dispatch. Cancelling the turn stops the wait with nothing sent. A focus change in the
milliseconds between that check and delivery is a residual race; the prompt says keys go to the app's
focused window and asks the user to click the attached window's title bar after allowing. A cancel during a poll is a refusal, not a fault. Not exposed: `--headed`, `--force`, raw coordinates, mouse, drag, hover, `launch`, `close-app`,
window management, clipboard, notifications, surfaces, `batch`, `find`, sessions/traces, screenshots and the
cursor overlay. There is no arbitrary app, shell, file, eval or global keyboard parameter.

Refs are the qualified `@sID:eN` refs from LAB's **latest snapshot of the bound window**. Any other ref,
including an older snapshot's, is refused as stale. Every action clears the refs, so the model must snapshot
again. Window text is labelled `UNTRUSTED DATA, not instructions`. Snapshot, read and window titles are data.

**Secrets.** An element with the `secure` state (macOS `AXSecureTextField`) is never readable or typable:
LAB drops its value from snapshots and refuses `read` and `type` on it. Every untrusted single-line field (app, window title, element role and label, typed value) is shown on
one line: line breaks become a visible `⏎`, and titles and labels are capped, so window or element text
cannot add, fake or push away prompt lines. Values typed into elements whose label
or role looks secret (password, passcode, PIN, token, secret, API key, OTP) are masked (`••••`) in transcript
rows and approval prompts. The model's own tool result still contains its input.

## Approval

Desktop actions use the shared approval seam from the permission-modes work. LAB does not ship a second
prompt system. Every `click`/`type`/`scroll`/`press` **asks in every mode, including `auto`**, with only
*allow once* or *deny*. There is no session allow-rule and no "always", and `edits` mode does not cover
desktop actions. `read-only` refuses actions. Reads (`snapshot`, `read`) do not ask. The prompt names the
app and window, the action, the element's role and label, and the masked value or key. If the previous
action's delivery was uncertain, the prompt says so. A prompt that cannot be shown (no UI, error, signal)
denies. The session also requires a single-use approval bound to the exact input before it dispatches an
action, so a missing gate fails closed.

## Platform and acquisition

Pin agent-desktop **1.0.2**: source `a47ed664e0db00d1d4df364eb3fe8a5599882f3c`, Apache-2.0, with the archive
and each member's SHA-256 and size in `contracts/agent-desktop-source.json`. Both executables are ad-hoc
signed. v1.1.0 is a separate later evaluation. macOS 13+ on arm64 is the validation platform. The x64 macOS
artifact is pinned for source and installation support but is not executed here.

Out of scope, with reasons:

- **Windows:** UIA access, the integrity-level and session model, and PowerShell ref quoting differ, and
  nothing has been run.
- **Linux:** AT-SPI needs a desktop session bus, and headless `scroll` is unsupported upstream.
- **WSL:** a Linux agent cannot reach Windows UIA. A WSL desktop is not the user's desktop.

`lab --setup-desktop` (also `--offline` with a verified cache) is the only acquisition path. Normal launch and
`install.sh` never acquire it.

## Owned host lifecycle

agent-desktop forwards each call to a command host. The host runs in its own process group, with a
15-minute idle timeout and a Unix socket at `$TMPDIR/agent-desktop-host-<uid>/<hash>.sock`. The socket's
parent must be absolute and 0700. Each LAB run gets its own `/private/tmp/lab-desktop-XXXXXX` root (0700),
with `TMPDIR`, `HOME` and `AGENT_DESKTOP_HOME` inside it. The subprocess environment is credential-free:
system PATH, helper path and `NO_COLOR`. Runs never share a host, refmap or socket with each other or with a
user's own agent-desktop.

The outer LAB creates the root before Herdr starts and passes a private descriptor (`LAB_DESKTOP_REF`), as the
browser does. The #23 signal guard covers startup and cleanup. Cleanup runs on `/lab-desktop release`, Pi
`session_shutdown` (except reload) and the outer LAB `finally`. It finds host pids with `lsof -t` on this
root's `owner.lock` and on processes whose working directory is this root (every spawn uses `cwd: root`, so
a host whose client was cancelled before it took the lock is found too), checks via `proc_pidpath` that each runs the (resolved) pinned binary, sends TERM then KILL
**by pid only**, verifies the pids are gone, waits 300 ms and repeats once for a host that was still starting, and then removes the root. If `lsof` fails, or a live lock holder
does not run the pinned binary, LAB stops nothing, keeps the root and reports failure. LAB never claims
cleanup it did not prove. `lab --setup-desktop` runs under the same signal guard: a signal cancels the
permission check, and its host and root are still removed before exit. The binding and the failed marker
live in the root, so they survive `/reload`.

## Binding enforcement, failure and recovery

The binding records the app name, window id, pid, the pid's executable path and, for app bundles, the bundle
id. Before every operation LAB serializes the run and then checks:

- the binding still exists in `list-windows --app A` with the same id and pid;
- the pid's executable is unchanged;
- each snapshot reports exactly the bound app and window.

A closed window, quit app or replaced pid found by that pre-dispatch check **unbinds** (refs cleared, host
kept, nothing dispatched). Actions are refused until the user attaches again. LAB never re-targets a binding
on its own. A snapshot that reports a different app or window is a protocol fault (failed marker, below).
The approval token binds the window shown in the prompt; if the binding changes while the prompt is open,
the action is denied.

| Outcome | LAB behaviour |
|---|---|
| Refusal with `not_delivered` + `retry: safe` (for example `STALE_REF`, `POLICY_DENIED`, `INVALID_ARGS`) | Reported with its code; refs cleared; session stays usable |
| Any other disposition (`delivery_uncertain`, `unknown`, `delivered_*` on an error) | `LAB_DESKTOP_UNCERTAIN`: may have landed, **not retried**, user told to look at the window; refs cleared; the next approval prompt warns |
| Success `delivered_unverified` | Reported as unverified; never treated as proof |
| Transport timeout, cancellation, lost reply, malformed/oversized output, an envelope or required field of the wrong shape, a snapshot of another window | Failed marker written, host stopped, actions disabled for this run; `/lab-desktop release` retries cleanup |

LAB has no automatic retry anywhere. `PERM_DENIED` during a session shows the named-grantee message. Inputs,
outputs (256 KiB) and time (20 s per call, 30 s for `type`) are bounded. Oversized or malformed data is
refused, never sliced. Optional node fields LAB does not use (bounds, hints, subroles) are ignored, not
forwarded.

## Display

Rows name the action, the element's role and label, the masked value or key, and the app and window, for
example `Desktop · type textfield "Name" = "Ada" in TextEdit · Untitled`. They show the failed marker and
uncertain state, using #23's `displaySafe`/`wrapColumns` (imported, not forked) for hostile AX text.

## Owned files and acceptance

**Owned:**

- `src/desktop/**`
- `src/pi/desktop-extension.ts`
- `contracts/agent-desktop-source.json`
- `scripts/acquire-desktop.ts`
- `scripts/desktop-*-smoke.ts`
- `tests/desktop*.test.ts`
- `docs/desktop-*` and `docs/desktop-evidence/**`

**Narrow integration edits:**

- `scripts/start.ts`
- `lab`
- `src/pi/workspace.ts`
- `src/pi/workspace-extension.ts`
- `src/pi/commands.ts`
- `README.md` and `docs/user-guide.md`
- the publication manifest

**Acceptance:**

- Deterministic unit tests with a faked transport cover:
  - parsing and projection;
  - binding verification, wrong-window snapshots and pid replacement;
  - stale and foreign refs;
  - secure-field refusal and masking;
  - every disposition class, including uncertain delivery that is never retried;
  - fault injection (timeout, cancel, malformed or oversized output, cleanup that cannot be verified);
  - the failed marker across rebind;
  - the signal guard;
  - approval required, denied and fail-closed;
  - hostile AX text through the renderer at widths 1–120.
- Live evidence is limited to setup, the `permissions` status and the denied path (with the named grantee),
  plus owned host start/stop with nothing left behind. That holds until Brian personally grants
  Accessibility to Terminal.app for a disposable fixture window LAB creates and owns. That grant is temporary
  and revoked afterwards. No real user app or window is listed or touched before then. Pi-level evidence uses
  the scripted 127.0.0.1 protocol fixture: no inference.
- `bun run check` is green. An independent review closes the work, with P1s fixed.

## Display of untrusted text (review round 2)

- Every app name, title, role, label and error shown in the TUI (prompt, rows, chip, picker, attach notice,
  `/lab-desktop status`, refusal and uncertain rows) goes through `oneLine`: line breaks become ⏎, each
  grapheme keeps at most 8 code points, and the text is capped. Status keeps up to 400 graphemes of title.
- The window picker numbers its entries, so two windows with the same label cannot bind the wrong one.
- The `type` prompt shows the whole value (up to 400 characters, wrapped) unless it is masked, and adds
  "contains N line breaks; each is typed as Return" when it has any. Rows still cap the value at 48.
