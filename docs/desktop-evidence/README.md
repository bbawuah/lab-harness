# Desktop control evidence

Captured on 2026-11-03 from clean commit `f464031`, on macOS 27.0.1 arm64, with
the pinned agent-desktop 1.0.2. The [provenance](provenance.json) file lists
each file's hash and how it was produced. Home paths are replaced by `~`.

## What was exercised

- **Setup and the denied path** ([setup-denied.txt](setup-denied.txt)):
  `--setup-desktop --offline` verifies the cached tool, then runs the
  non-prompting `permissions` check. In this environment the responsible process
  is Homebrew `bun`. Setup names it, says **not** to grant it, and recommends
  Terminal or iTerm2. No `--request` or `--guide` was run, no System Settings
  pane was opened, and TCC was not changed.
- **Live smoke preflight** ([live-smoke-denied.txt](live-smoke-denied.txt)):
  without Accessibility the smoke prints the same advice and exits 2 before it
  builds or starts the fixture. Its owned host and root are removed.
- **Nothing left behind** ([leftovers.txt](leftovers.txt)): no
  `/private/tmp/lab-desktop-*` root and no `agent-desktop` process after
  either run. Hosts are stopped by verified pid only.
- **Unit tests** ([unit-tests.txt](unit-tests.txt)): 42 deterministic tests
  with a fake transport. They cover projection, binding verification, pid
  replacement, stale and foreign refs, secure fields and masking, every
  delivery class, fault injection, unverifiable cleanup, the failed marker
  across rebind, the approval gate in every mode, and hostile AX text at widths
  1 to 120. The startup and cleanup signal guard is the #23
  `guardBrowserLifecycle`, now also created for `--desktop`; its own tests
  cover it.

## Not yet exercised

Accessibility has not been granted, so no window has been listed, bound or
acted on. The next step is `scripts/desktop-live-smoke.ts`, run by the operator
from Terminal.app with Accessibility granted to Terminal temporarily, against a
disposable `LABDesktopFixture` window that the smoke builds, starts and stops
by pid. A native Pi run with `lab --desktop` and `/lab-desktop attach` on that
fixture follows the same grant.
