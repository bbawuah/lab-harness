# Built-in browser evidence

This feature uses normal `lab --browser URL`, the normal configured provider and
LAB's native Pi extension/Relay/Herdr. It does not import the historical Python
experiment or require another model gateway. PR19's successful cloud-model trial
remains immutable historical evidence, not evidence for this implementation.

## Check classification

- **Required CI** (`check (ubuntu-24.04)`, `check (macos-15)`): run by GitHub on
  each pushed head. Their results are reported in the PR, not here.
- **Local normal gate** (`bun run check`: tests, typecheck, publication). This is
  a non-actual gate: 256 pass, 34 skip at this head. The skipped tests are gated by
  `LAB_HERDR_ACTUAL` or `LAB_PI_FULLSCREEN_ACTUAL`. It does not launch a browser.
- **Actual browser scripts** (below): explicit, operator-run, need the pinned tool
  and an approved browser. They are not part of `check` or `check:actual`.
- `check:actual` (actual Herdr cases) was not run locally for this slice.

## Actual local acceptance (2026-11-02)

Captured from clean commit `04328b6` after the review fixes. The screenshot and
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
