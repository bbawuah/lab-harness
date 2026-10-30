# Native split and appearance evidence

[Rendered actual terminal text](terminal-text.png) · [HTML](terminal-text.html) ·
[Capture identities](capture.json) · [Sanitized outer PTY](terminal.ansi).
The image renders actual recorded text in a browser. It is not live terminal
pixels: its frame colors and font are editorial. Native pane text and bounded
outer-cell replay are recorded separately. Private paths use equal-width
substitution; original and sanitized hashes are distinct in the receipt.

- Default split, compact 40×16 sample, and fallback summary: clean source
  `4aaf3e59b62b522ec686f4a8b1525d1956188565`, Darwin arm64 mini,
  Bun 1.4.2, Pi release `4a080252f06caf63a525d7873c5d94d3c23887e0`,
  Herdr release `2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01`.
- Light/dark staged samples: clean source
  `9441b126c66f6ec124c4fd904f311bf2b7e0b4a7`. Later changes bind outer
  capability and correct test discovery; these are labelled historical source
  captures of the same staged controls, not claims that 944 was release-ready.
- The 4aaf cross-scope case has outer `TERM=xterm-256color` and COLORTERM
  absent. Another synthetic truecolor runner saved a project palette whose
  light text passes RGB contrast but fails indexed contrast. A valid user Apply
  displayed the fallback summary. Reload later retained user and project
  preferences; the generated fallback was disclosed. The pane's injected
  COLORTERM was not independently sampled.

Owned local runs made zero HTTP sink requests. All recorded server/client/worker/
socket cleanup flags are true. Separate clean 39fa acceptance used `pane.layout`
to establish zoom false → true → false with stable PIDs and focus; it is not
claimed as part of the pictured 4aaf run. Shell cwd/PATH, no Pi-only sentinels,
focus, shell-close preserving Pi, search/skills and explicit single-pane were
also exercised separately. The caption does not establish model quality.

Focused reproduction from an installed development checkout:

```sh
LAB_HERDR_ACTUAL=1 bun --no-env-file --no-install test ./tests/pi-appearance-actual.test.ts
LAB_HERDR_ACTUAL=1 bun --no-env-file --no-install test ./tests/herdr-shell.test.ts
```

The capture drivers used only synthetic HOME/project/RC/state and explicit
operator commands. No real credentials or user histories were loaded. The
committed actual regression exercises native theme loading/reload, Cancel,
relaunch, NO_COLOR artifacts, compact keyboard UI and indexed recovery. Its
readiness uses positioned cells and owned native protocol reads, not concatenated
ANSI substrings.

The separate [standalone fullscreen diagnostic](../fullscreen/report.md)
remains **FAIL 11/12** for delayed fragmented SGR input. No physical mouse, IME,
clipboard, tmux, WSL, whole-terminal colors or full-app contrast qualification.
There is no automatic narrow split folding; use native zoom or --single-pane.
