# Built-in browser evidence

This feature uses normal `lab --browser URL`, the normal configured provider and
LAB's native Pi extension/Relay/Herdr. It does not import the historical Python
experiment or require another model gateway. PR19's successful cloud-model trial
remains immutable historical evidence, not evidence for this implementation.

## Check classification

- **Required CI** (`check (ubuntu-24.04)`, `check (macos-15)`): run by GitHub on
  each pushed head. Their results are reported in the PR, not here.
- **Local normal gate** (`bun run check`: tests, typecheck, publication). This is
  a non-actual gate: 256 pass, 34 skip at `9ef79f1`. The skipped tests are gated by
  `LAB_HERDR_ACTUAL` or `LAB_PI_FULLSCREEN_ACTUAL`. It does not launch a browser.
- **Actual browser scripts** (below): explicit, operator-run, need the pinned tool
  and an approved browser. They are not part of `check` or `check:actual`.
- `check:actual` (actual Herdr cases) was not run locally for this slice.

## Actual local acceptance (2026-11-02)

Historical (PR #23). The files in `browser-evidence/` were since replaced by the
browser UX set below; the PR #23 hashes remain in git history at `9ef79f1`.

Captured from clean commit `9ef79f1` after both review rounds. The screenshot and
both result files reproduced byte-for-byte from the earlier capture, which had
been taken from the uncommitted tree before `a893e0d`. See
[provenance](browser-evidence/provenance.json) for the per-file hash mapping.

- Pinned agent-browser 0.41.0, approved existing Chrome 156.0.8078.74, macOS arm64.
- Unit tests (in the normal gate) cover failure-state persistence across rebind
  with cleanup-retry only, the startup/cleanup signal guard, and hostile renderer
  input: wide CJK/emoji, combining marks, ESC/BEL, bidi controls and lone
  surrogates at widths 1-40, plus Pi-reported errors with empty details. The
  native capture shows ordinary text only. Hostile text inside the live Pi TUI was
  not captured.
- `scripts/browser-smoke.ts`: two independent owned sessions; snapshot/fill,
  stale-ref refusal, fresh snapshot/click, independent DOM assertion; other session
  unchanged. Same-origin refusal, post-click other-port redirect, HTTP redirect,
  popup detection, cancellation, reload handler rebinding and close all passed.
- `scripts/browser-native-smoke.ts`: normal launcher, native Pi 1.4.0 + healthy
  LAB Relay + Herdr 0.9.5, deterministic local OpenAI-compatible protocol fixture.
  Six local protocol requests drive actual tool dispatch and native concise render;
  independent DOM reads `Saved: Native Fixture`. Native `/reload` and status retain
  the same browser. Pi exit 0, browser root removed and Herdr cleanup flags true;
  released Relay state verified before deleting only the owned fixture state.
  No inference, credentials or paid calls. Early failed preparation probes were
  not counted as success.

Reproduce from a checkout with approved runtimes/browser: `lab --setup-browser`,
then `bun --no-env-file --no-install scripts/browser-smoke.ts`. Run
`bun --no-env-file --no-install scripts/browser-native-smoke.ts` in a TTY for
normal-launch acceptance. These explicit scripts create synthetic fixture state,
not personal projects/profiles. They save ignored evidence under `.tmp`.

[Native browser pixels](browser-evidence/native-browser.png), [tool TUI text](browser-evidence/tui-tools.txt), [reload/status TUI text](browser-evidence/tui-reload.txt), [normal-launch result](browser-evidence/native-result.json), [session result](browser-evidence/session-result.json) and [provenance](browser-evidence/provenance.json) record this acceptance. They are actual
browser pixels and native terminal text, not mockups. Protocol responses are
scripted, so they do not establish model quality. The byte-based production output
limits are not token guarantees. No zero-network-egress claim is made.

## Browser UX acceptance (2026-11-03, PR #27)

Captured from clean commit `98363a7` (after independent review round 1) with pinned
agent-browser 0.41.0, approved existing Chrome 156.0.8078.80, Pi 1.4.0 and Herdr
0.9.5 on macOS arm64. No inference, credentials or paid calls. Only synthetic
127.0.0.1 fixture pages. Contract: [browser UX contract](browser-ux-contract.md).
These files replace the PR #23 set in `browser-evidence/`; per-file hashes are in
[provenance](browser-evidence/provenance.json).

- `scripts/browser-smoke.ts` now also drives every UX state on real sessions
  ([session result](browser-evidence/session-result.json) `ux`,
  [rows at 40/80/120](browser-evidence/ux-rows.txt)):
  - stale and never-issued refs, and cross-origin navigate: refused before dispatch,
    browser stays active, chip `● web 127.0.0.1:<port>`;
  - read back after a change sets `verifies`;
  - post-click redirect to another port: breach, root removed, chip
    `○ web closed · left origin`;
  - daemon killed by its own pid: the next action is `SESSION_LOST` before
    dispatch, no command (not even `close`) is sent to the dead daemon, the orphaned
    Chrome is proven ours by its profile and stopped (alive before, gone after),
    chip `○ web closed · connection lost`;
  - click on a page that busy-loops: times out after about 30 s, result unknown,
    cleanup done, chip `○ web closed · result unknown`.
- `scripts/browser-native-smoke.ts` (normal `lab`, 40x120 pty, 10 scripted protocol
  requests): the real Pi footer shows `● web 127.0.0.1:<FIXTURE_PORT>`; the stale
  row and `✓ browser: 3 snapshot · 1 fill · 1 click · 1 refused · read back after change`
  ([tool text](browser-evidence/tui-tools.txt)); `/lab-browser status`
  ([status](browser-evidence/tui-status.txt)); after `/reload` the same browser
  with 5 actions and the chip kept ([reload](browser-evidence/tui-reload.txt)); a
  second prompt clicks to another port: breach row, `✗ browser: 1 failed (left origin)`
  and the footer `○ web closed · left origin` ([breach](browser-evidence/tui-breach.txt)).
  Pi exit 0, browser root removed, Herdr cleanup flags true
  ([normal-launch result](browser-evidence/native-result.json)).
- `lab --setup-browser` ends with the next command
  ([setup output](browser-evidence/setup-browser.txt)).
- Combined footer after merging #26 (clean `e31427a`, ask mode, live Pi in Herdr):
  at 120 columns `● mode: ask · /lab-mode ● web 127.0.0.1:<FIXTURE_PORT>`
  ([120](browser-evidence/tui-footer-120.txt)); at 40 columns the mode stays whole
  and only the web chip truncates: `● mode: ask · /lab-mode ● web 127.0.0...`
  ([40](browser-evidence/tui-footer-40.txt)).
- Not exercised: a live model, Linux or WSL, and footer colour pixels. The other
  files in this set predate the #26 merge (approval prompts are covered by #26's
  own evidence).
  `check:actual` was not run for this slice.

## Hosted install (2026-11-02)

`bootstrap.sh` at `53d26e8` pins runtime `05b0d36` (codeload archive SHA-256
`b889d53a1c3ea232a82bbd28e70a0d5fbc6d95854a96524b6f5c88ab0c69c58b`). Required CI
passed on `05b0d36` before the pin was pushed. On macOS arm64, with an empty HOME
and system-only PATH, the raw `bootstrap.sh` from `53d26e8` with `--install-only`:

- downloaded and verified the archive, Bun 1.4.2, Herdr, ripgrep, fd and Pi; it
  passed the publication check and the owned Herdr smoke, and exited 0;
- did not acquire agent-browser (ordinary install has no browser dependency).

`lab --setup-browser` then acquired agent-browser 0.41.0 whose SHA-256 and size
match the contract. Both actual browser scripts, run from the installed release
with its own Bun, passed, and their result files and screenshot were
byte-identical to the published evidence. A second bootstrap run re-verified the
installed source and exited 0. No browser processes or owned temp state remained.
Interactive first-run model setup was not exercised (no model calls).

## Pins and limits

[Official release](https://github.com/vercel-labs/agent-browser/releases/tag/v0.41.0),
[immutable source](https://github.com/vercel-labs/agent-browser/tree/1453dd37a40c730fe00f592bc32198a896ff8747),
and [release asset metadata](https://api.github.com/repos/vercel-labs/agent-browser/releases/tags/v0.41.0)
were checked 2026-11-02. Exact platform bytes/SHA-256 and Apache-2.0 license text
are retained in `contracts/agent-browser-source.json`. Acquired executables are
verified before use, without ambient package managers or browser installers.
Pi and Herdr retain their existing immutable contracts. No policies, firewalls,
TCC permissions or personal profiles are changed.

The hostname allowlist is broader than exact origin (ports/schemes). LAB checks
observed current URL and the single target before/after every action, preserving
upstream untrusted boundary even when an action reports origin `unknown` and
adding independently checked origin. Site-triggered requests can occur before
post-action detection. Existing tabs/profile attachment, browser sandboxing,
zero egress, Windows/WSL bridges and desktop control are not implemented.
