# Permission modes and approval gate contract

Implementation starts from main `d3076adc73ff671bcb6bde7fa94fc7d8f73b5d06` (includes PR #23–#25). It addresses UX
findings F01 (edit, write, bash and `git commit` run with no approval and no mode) and F30 (`lab_browser` fill/click
run without asking, and rows hide field, value and origin). The known F17 gap (the Usage line omits browser flags) is
fixed in the same change. No model, provider, cloud or auth calls are authorized for this validation.

## Seam (Phase 0, source-grounded)

Pinned Pi 1.4.0 (release commit `4a080252f06caf63a525d7873c5d94d3c23887e0`) has **no native approval gate or
permission mode** that LAB disabled. Its only permission code is example extensions that LAB never loads. It does
provide a supported extension event that can block a tool call:

- `packages/coding-agent/src/core/extensions/types.ts:1250–1265, 1454–1464`: `tool_call` fires before a tool
  executes. It returns `{ block, reason }`.
- `core/extensions/runner.ts:1249–1266`: the first `block` wins, and handler exceptions are not swallowed.
- `core/agent-session.ts:658–680, 752`: every model tool call goes through it, nested (codemode) calls included.
- `packages/agent/src/agent-loop.ts:718–785`: a block becomes an error **tool result** whose text is `reason`. A
  thrown error also becomes an error tool result, and so does an abort. The model always receives a result, so
  nothing hangs. Calls are prepared one at a time, even in parallel tool mode (`:606–614`).
- `ctx.ui.select/input` (`types.ts:151–157`) resolve to `undefined` on Esc or abort
  (`modes/interactive/interactive-mode.ts:2720–2749`). `ctx.hasUI` is false in json and print modes.

LAB adds a `tool_call` handler to its existing, explicitly loaded extension (`-e src/pi/workspace-extension.ts`;
explicit `-e` still loads under `--no-extensions`, `resource-loader.ts:578`). There is no Pi fork, patch, pin bump or
new Pi flag.

## Modes

| Mode | Reads (`read`, `grep`, `find`, `ls`, `lab_search`, `lab_files`, `relay_peers`, `relay_inbox`, `lab_browser` snapshot/read) | `edit`, `write` | `bash` | `lab_browser` navigate/fill/click | `relay_send` | `relay_ack` | Any other tool |
|---|---|---|---|---|---|---|---|
| `ask` (default) | run | ask | ask | ask | ask | run | ask |
| `edits` | run | run if inside the project (see Integrity), else ask | ask | ask | ask | run | ask |
| `read-only` | run | refused | refused | refused | refused | refused | refused |
| `auto` | run | run | run | run | run | run | run |

- `auto` is today's behaviour. It is an explicit opt-in only: `lab --mode auto` or a typed `/lab-mode auto`. The
  launch default is always `ask`.
- An unknown tool name counts as mutating, so it asks (or is refused in `read-only`).
- `relay_send` asks because it shares text outside this session and is a prompt-injection path to other sessions.
  Rendering Relay prompts and peers more fully (board 8) is a follow-up. `relay_ack` changes only this session's own
  inbox state, so it is not prompted, but `read-only` refuses it.
- Shell commands the user types (`!cmd`, Pi `user_bash`) are the user's own actions and are not gated.

## No-UI rule (fail closed)

If an approval cannot be shown, the action is **denied**. This covers `ctx.hasUI === false` (json/print/RPC without
dialogs), a non-TUI mode, a render or dialog error, an abort or signal, Esc, and an invalid or unreadable mode state
(which falls back to `ask`). In every mode except `auto`, each gated tool is denied when there is no UI. The denial
reaches the model as an error tool result:
`LAB_PERMISSION_DENIED: <tool> was not run (<why>). Do not retry it without asking the user.`, plus the user's note
if they gave one.

## Approval prompt

The prompt is a Pi selector. The title is built by LAB from escaped text (`displaySafe`) and wrapped to the terminal
width with `wrapColumns` (#23 rules: C0/C1/bidi/format controls escaped, no row wider than the width, at 40/80/120
columns). It shows the concrete action:

- **edit**: the project-relative path (absolute if outside the project, marked `outside project`), the number of
  replacements, `−removed +added` line counts, and a bounded preview of the first changed lines.
- **write**: the path, `new file` or `overwrites N bytes`, line and byte counts, and a bounded preview.
- **bash**: the full command (wrapped, never truncated up to 4,000 characters, with the excess counted) plus `cwd`
  and timeout.
- **lab_browser**: the verified origin, the operation, the element as `@eN role "name"` from the latest snapshot,
  and for fill the value preview. Values are masked (`•••• (masked, N chars)`) when the field name or role looks
  secret (password, passcode, secret, token, API key, PIN, OTP, CVV/CVC, card number, SSN, credentials) or the value
  looks like a credential (JWT, `sk-`/`ghp_`/`xox`/`AKIA` prefixes, or a long high-entropy string without spaces).
  Navigate shows the target URL.
- **relay_send**: the peer, request key, reply-to and a bounded body preview.

Choices:

1. **Allow once**
2. **Allow for this session**, labelled with its scope: the same tool and the same pattern. Bash: the exact command
   and cwd. Edit/write: the same tool and the same resolved file. Browser: the same operation on the same origin and
   the same element role/name (navigate: the same URL). Relay: the same peer.
3. **Deny**
4. **Deny with note…**: an input whose text is returned to the model. Cancelling the input still denies.

Esc denies. Prompts are serialized, one at a time. Session grants live only in memory. They are cleared on `/new`,
`/resume`, `/fork` and `/reload`, and when the mode changes. Nothing is written as an "always allow" this round.

## Mode selection, indicator and persistence

- `lab --mode ask|edits|read-only|auto` sets the mode for the launch. Without it, the mode is `ask`.
- `/lab-mode` shows the current mode and a selector. `/lab-mode <mode>` sets it directly. `/lab-mode next` cycles
  `ask → edits → read-only → ask` (it never enters `auto`).
- The footer always shows `● mode: <m> · /lab-mode` (`! mode: auto · /lab-mode` in auto). It uses the shared
  footer chip (`src/pi/status-indicator.ts`, slot `lab-mode`, shared with browser UX and desktop). Pi 1.4.0 sorts
  footer statuses by key and cuts the line from the right (`footer.ts:288–297`). `lab-mode` sorts before
  `lab-web` and `lab-x-desktop`, and the longest mode chip is 29 columns, so the mode is never truncated away at
  40 columns. `/lab-help` and `lab --help` list modes.
- Entering `auto` from `/lab-mode auto` or the selector asks one confirm, "LAB: switch from <m> to auto?". It names
  what auto skips and what it doesn't: "auto shows no approval prompt for edits, shell commands, browser actions or
  Relay sends; desktop actions still ask". Other registered families are named with what they do in auto. It ends
  with "not a sandbox". The choices are `Cancel` (first, the default) / `Switch to auto`. Cancel, Esc or a failed
  prompt keeps the mode. Without the interactive UI, `/lab-mode auto` never switches. Already in auto, there is no
  new confirm.
- **Auto does not cover desktop.** Desktop mutations (agent-desktop, PR #28) are Allow once / Deny in every mode,
  including `auto`, and refused in `read-only`. The confirm and the start warning say so even before the desktop
  family is installed.
- `lab --mode auto` prints one warning line before the workspace starts: "LAB warning: started in auto mode; auto
  shows no approval prompt for edits, shell commands, browser actions or Relay sends; desktop actions still ask.
  Change it with /lab-mode."
- **No keyboard shortcut.** `Shift+Tab` is reserved by Pi for `app.thinking.cycle` (`core/keybindings.ts:33–35`), and
  reserved keys cannot be overridden by extensions (`runner.ts:97–104, 697–703`). Every plain Ctrl letter is either
  bound by Pi or is a terminal control (Ctrl+H/I/M). Option/Alt combinations reach the pty only when the terminal
  sends Option as Meta, which Terminal.app and iTerm2 do not do by default (Option+M types `µ`). No key works out of
  the box, so none is documented, and `/lab-mode` is the primary path.
- The mode lives in a private (0600) file inside the per-launch LAB run directory, outside the project. It survives
  `/reload` and in-TUI `/new`, `/resume` and `/fork`. A new `lab` launch starts from `--mode` or `ask`.

## Integrity

- The model cannot change its own mode. Only `lab --mode` and the operator's `/lab-mode` command change it. No tool
  changes it. The in-memory mode is authoritative and survives `/reload` in a process-global slot keyed by the state
  file. The file is trusted only on the first load of a launch. If anything else changed it (an approved command,
  another process), LAB ignores the change, rewrites the file and warns once: "LAB ignored a change to its mode file
  made outside /lab-mode".
- `edits` auto-approves `edit`/`write` only when the target's realpath is inside the project root's realpath. For a
  file that doesn't exist yet, that is the deepest existing ancestor's realpath plus the remaining components, and
  those must not include `..`. Symlinks and `..` escapes, unresolvable paths, and paths with control or unicode-space
  characters ask instead. A path under the LAB run directory, the LAB state root or the install root also asks, even
  when it sits inside the project.
- `edits` never auto-approves project paths that tools later turn into code execution or agent instructions. Any
  path component (case- and NFC-insensitive) of `.git`, `.pi`, `.agents`, `.claude`, `.codex`, `.husky`, `.vscode`
  or `.envrc` asks, and the prompt marks it "(agent/VCS config — can run code)". Examples: git config and hooks
  (fsmonitor, pager, hooks run on later git commands); Pi's `.pi/settings.json` (`shellCommandPrefix`/`shellPath`
  would silently prefix every approved bash after `/reload`); `.pi/SYSTEM.md`; direnv. `ask` mode is unchanged.
- `bash` is never auto-approved by `edits`.
- This is an approval gate, not an OS sandbox. Approved commands run as the user. Paths are resolved when a call is
  gated. Pi gates a whole parallel tool batch before running it, so an approved command in the same batch can swap a
  directory for a symlink before an auto-approved edit runs. Hard links already in the project are followed. The
  OS sandbox follow-up is listed as out of scope.

## Registering another tool family

Other LAB tool families (first: agent-desktop) use this gate rather than adding a second prompt.
`installPermissionExtension` returns `registerFamily(family)` (`GatedFamily` in `src/pi/permission.ts`):

```ts
import { alwaysAsk } from "./permission.ts";
gate.registerFamily({
  ...alwaysAsk,                        // policy hook: { sessionGrants: false, inAuto: "ask", denyWithNote: false }
  family: "Desktop",                   // shown in the prompt heading
  tools: ["lab_desktop"],              // tool names this family owns
  isRead: (tool, input) => ["list", "snapshot", "read"].includes(String(input.operation)), // reads run in every mode
  describe: (tool, input) => ({ heading, lines, scope, scopeLabel }),
});
```

An optional `onApproved(toolCallId, toolName, input)` is called only after the gate allows a mutating call. Desktop
uses it to mint a single-use token bound to that call, so a missing or bypassed gate fails closed in the tool. If it
throws, the call is denied. A family must not add its own `tool_call` handler or mode check: one gate, one prompt
queue.

`alwaysAsk` is the desktop policy: choices are exactly `Allow once` / `Deny`, nothing is granted for the session,
and `auto` still asks. Without the preset, a family sets the fields itself: `sessionGrants` (false removes "Allow for
this session"), `inAuto` (`"ask"` or `"run"`) and `denyWithNote` (false removes "Deny with note…"; default true).

- A family's mutating calls are refused in `read-only`, always asked in `ask` and `edits` (`edits` never
  auto-approves them), and `inAuto` decides `auto`. The no-UI rule applies: without an interactive TUI they are
  denied unless `auto` runs them.
- `describe` returns plain text. LAB escapes and wraps the heading and every line (#23 rules), and it caps lengths.
  If `describe` or `isRead` throws or returns a bad shape, LAB shows a generic escaped description, or treats the
  call as mutating.
- Grant scopes are namespaced by family and tool. A family cannot claim a built-in tool (`read`, `edit`, `write`,
  `bash`, `lab_browser`, `relay_*`, …) or a tool another family already registered: `registerFamily` throws
  `LAB_PERMISSION_FAMILY`.
- Denials and refusals use the same `LAB_PERMISSION_DENIED` / `LAB_PERMISSION_REFUSED` text.

## F30 browser rows

`lab_browser` call rows read `Browser · fill @e4 textbox "Email" = "ada@…" · http://127.0.0.1:PORT`. Masking matches
the prompt. Result rows read `Browser · filled @e4 textbox "Email" · <origin>` (`clicked`, `navigated <url>`,
`snapshot N refs`, `read N chars`). Refusals keep `Browser refused · <code>`. The element label comes only from a
record made when that call's `execute` starts (complete args, refs from the snapshot the model used), keyed by Pi's
`toolCallId`. While args stream, and for rows re-rendered after `/reload` or `/resume`, the row shows the ref without
a label and masks the value. #23's escaping and width
rules apply. Expanded results keep the machine details unchanged.

## Acceptance

- Unit tests for each mode × tool class, unknown tools, session-grant scoping, a mode change clearing grants, and
  the path integrity cases (inside, `..`, a symlink out, a symlink in, a missing file under a symlinked directory,
  run dir/state/install root under the project, unicode spaces).
- Fault injection: a throwing `select`, `hasUI` false, abort, and Esc each produce a denial tool result. A corrupt
  state file falls back to `ask`.
- Hostile text (ESC sequences, bidi, wide or emoji text, long commands) in every prompt and row at 40/80/120
  columns, with no row wider than the width.
- Actual pty evidence with an owned 127.0.0.1 protocol fixture (no model or provider) and the actual pinned Pi and
  Herdr. It shows: ask → allow (an edit happens), ask → deny (the model receives `LAB_PERMISSION_DENIED`), `edits`
  auto-approving an in-project edit while bash still asks, a `read-only` refusal, `auto`, and a browser fill prompt
  on a local fixture page. Sanitized captures and provenance (commit, hashes) go under `docs/permission-evidence/`.
  Reproduce with `bun run smoke:permission [OUT_DIR]` (scripts/permission-actual.ts) after `./install.sh --browser`;
  it fails if any check fails or an absolute host path survives sanitization.
- The existing actual Relay model test runs Pi in json mode (no UI). It now provisions mode `auto` explicitly. That
  test change is called out in the PR.
- The user guide, README and `lab --help` are updated, and both Usage lines name `--browser`,
  `--browser-executable`, `--setup-browser` and `--mode` (F17). The publication manifest is refreshed, and
  `bun run check` passes.

## Out of scope this round

Persisted "always allow" rules, a plan mode (F07), `/diff` and `/undo` (F06/F08), richer Relay rendering (board 8),
an OS sandbox, and gating user-typed `!` commands.
