# Organisation Edge from WSL

LAB in Linux x64 under WSL2 uses the organisation's installed Windows Microsoft
Edge. It never downloads a browser, attaches to user tabs, copies user profiles,
or changes Edge policy. macOS and ordinary Linux retain their existing browser
path. Windows-native LAB is outside this release; Windows CI exercises the same
browser session implementation without the WSL interop hop.

## Setup

Install the organisation's approved Edge on Windows. WSL interoperability must
be enabled and the Windows system drive mounted at `/mnt/c`. LAB invokes Windows
PowerShell at `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe` and
uses `wslpath` for path conversion. A different mount layout is currently
unsupported; the path/interop error identifies this prerequisite.

```sh
lab --setup-browser
# After staging the verified cache, this makes no artifact download:
lab --setup-browser --offline
lab --browser http://localhost:3000/
# Optional organisation-specific install location (quote spaces):
lab --browser http://localhost:3000/ --browser-executable 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
# A mounted path is also accepted:
lab --browser http://localhost:3000/ --browser-executable '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
```

Acquisition detects WSL from Linux kernel/WSL environment markers and selects
`win32/x64`, rather than the Linux artifact. The project-local cache is
`.tmp/browser/agent-browser-win32-x64.exe`. Offline setup requires that exact
verified file; a missing/corrupt file fails without network access. Normal launch
never performs acquisition. Standard system-wide and per-user Edge install
locations are checked through Windows; overrides must be drive-absolute Windows
paths or resolvable mounted paths. UNC/existing-user-profile modes are excluded.

The pinned release asset is agent-browser **0.41.0**, source
`1453dd37a40c730fe00f592bc32198a896ff8747`, Apache-2.0. On 2026-11-11 the release
API and a separate `curl` download established **18,057,728 bytes** and SHA-256
`dee86b78071cbe7217f71ec1c9df6a50efa73cd44d64a18877bb36556fc8e270`.
These values are recorded in `contracts/agent-browser-source.json`; the offline
bundle workstream must include both Linux and Windows artifacts.

## Ownership and transport

Each session creates `%LOCALAPPDATA%\lab-harness\browser\lab-<random-id>` under
the Windows account used by WSL interop, with inheritance disabled and access
granted to that account. It contains a private copy of the verified executable,
`config.json`, IPC state, temporary files and a dedicated `profile`. Linux keeps
the private descriptor, failure marker and display activity in its existing
owned control root. Reload rebinds the same Windows session; it does not adopt
another Edge instance.

LAB runs the win32 executable directly through WSL interop for each
`mcp call` with stdio. Windows paths in `AGENT_BROWSER_CONFIG`,
`AGENT_BROWSER_SOCKET_DIR`, `HOME`, `USERPROFILE`, `TEMP`, `TMP` and
`LOCALAPPDATA`, plus the unique session and output settings, cross via explicit
`WSLENV` `/w` entries. They are already Windows paths, so `/p` translation is
intentionally absent. Shell startup files are not loaded.

The pinned implementation differs from the earlier Playwright bridge proposal:
[connection.rs](https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/cli/src/connection.rs)
and
[daemon.rs](https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/cli/src/native/daemon.rs)
use **Windows loopback TCP**, not a Unix socket or named pipe. The private socket
directory holds `.pid` and `.port`; the daemon tries a session-derived port,
falls back to an ephemeral port and writes the actual port for the CLI.
[chrome.rs](https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/cli/src/native/cdp/chrome.rs)
launches Edge headless with `--remote-debugging-port=0` and the explicit owned
profile. Neither port is forwarded to WSL or the LAN. This is local browser
control, not an authenticated isolation boundary against hostile local users.

[windows_process.rs](https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/cli/src/native/cdp/windows_process.rs)
assigns Edge to a Windows Job Object atomically at process creation, with
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; only the daemon holds its job handle.
LAB cleanup finds processes whose executable path equals this session's private
copy, rechecks that path on a held process object and terminates them. Closing
the daemon's handle kills its Edge tree, including descendants. Cleanup then
checks for remaining Edge command lines using the owned profile and requires
successful removal of the exact owned root. It never kills by `msedge` image
name or a pidfile alone. An unknown outcome retains state and reports
`LAB_BROWSER_CLEANUP_FAILED`; `/lab-browser close` retries cleanup only.

Origin allowlisting, exact-origin checks before and after operations, fresh
snapshot refs and the existing browser-facts approval interface are retained.
Navigate/fill/click continue through the existing permission modes. Operations
are serialized, output and time remain bounded, and uncertain mutations are
never automatically retried. An origin check cannot undo requests already sent
by the application; this is not an egress sandbox.

## Enterprise prerequisites and errors

The policy owner must review the **effective** policy in `edge://policy` for the
actual managed Edge version and the intended application/identity URLs:

- Does `RemoteDebuggingAllowed` permit the debugging port used by the owned
  headless browser? A value of `0` is refused before launch.
- What is `DeveloperToolsAvailability`, and which
  `DeveloperToolsAvailabilityAllowlist` / `DeveloperToolsAvailabilityBlocklist`
  rules apply to the fixture, application and sign-in targets? LAB conservatively
  refuses global value `2`, even if a URL exception might exist.
- May the signed/approved win32 agent-browser and Windows PowerShell run through
  WSL interop, create a per-user private desktop/Job Object and control Edge?
- Is a dedicated ephemeral automation profile allowed, and can the intended
  application complete sign-in without copying a personal profile?
- Are Windows loopback control listeners allowed for this user, and is the
  absence of isolation from hostile local processes acceptable?

Microsoft documents the separate launch gate in
[RemoteDebuggingAllowed](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/remotedebuggingallowed)
and target restrictions/precedence in
[DeveloperToolsAvailability](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/developertoolsavailability).
Registry preflight checks mandatory HKLM/HKCU settings. It does not replace the
owner's effective-policy review or prove all cloud-managed/URL policy results.
LAB does not weaken, bypass or write policy.

`LAB_BROWSER_EDGE_MISSING` gives install/override instructions.
`LAB_BROWSER_INTEROP` identifies disabled interop, unavailable PowerShell or
application-control restrictions. `LAB_BROWSER_WINDOWS_PATH` identifies failed
conversion, unsupported path forms or an unavailable mount.
If startup cleanup cannot be verified, LAB keeps a private `recovery.json` in
its reported control root. From WSL, retry only owned cleanup (no page action):

```sh
bun --no-env-file -e 'import {BrowserSession} from "./src/browser/session.ts"; await BrowserSession.rebind(process.argv[1]).close()' /reported/control/root/recovery.json
```

`LAB_BROWSER_POLICY` identifies the registry gate; `LAB_BROWSER_EDGE_START`
asks the owner to review Edge and effective debugging/target policies when a
tool reports failure. Tool/page diagnostics and form values are not echoed.

## Evidence and target qualification

`Windows owned Edge` in `.github/workflows/ci.yml` is a separate
`windows-latest` job. It downloads and verifies the pinned exe, validates warm
offline setup and drives the runner's installed Edge through the production
browser session: open, snapshot, fill, click, independent read-back, text read,
close, profile/root removal and daemon termination. No external fixture,
model inference or personal browser state is used. The smoke can also run on
the real WSL target:

```sh
bun --no-env-file scripts/browser-windows-smoke.ts
```

Unit tests use a fake interop layer for detection, both path forms, explicit
environment forwarding, configuration staging, cleanup scope and sanitized
error mapping. These fakes validate invocation contracts; they cannot prove
Windows process, ACL or Job Object behavior.

Windows CI proves only its installed Edge and Windows-side runtime on the
runner. It cannot prove WSL2 stdio/env propagation, the organisation's policies,
WSL NAT localhost forwarding, internal DNS/TLS/SSO, application behavior or
offline Windows/browser egress. No WSL2 execution was possible on the authoring
macOS arm64 host.

Manual qualification on the approved target:

- [ ] Record Windows/WSL distro and kernel versions, architecture, full Edge
  version/channel and effective policy answers above; exclude profile contents.
- [ ] Verify WSL interop and `wslpath`; use the organisation's standard mount
  layout. Confirm the same Windows user owns the private root and ACL.
- [ ] Stage and verify the win32 cache; run offline setup with network blocked.
  Confirm no Chromium, driver or package download occurs.
- [ ] Run the fixture smoke from WSL. Confirm Windows can reach its local WSL
  fixture server (normal localhost forwarding or an already approved equivalent).
- [ ] Exercise Windows and `/mnt/c` executable overrides, including paths with
  spaces. Check missing Edge and disabled-interop messages without changing
  enterprise policy yourself.
- [ ] Run normal LAB against an approved fixture and confirm navigate/fill/click
  approval, stale-ref refusal, same-origin refusal, reload and `/lab-browser close`.
- [ ] With only test-owned sessions, qualify timeout/cancel and forced daemon
  exit: only that Edge tree exits and its profile disappears. Keep an unrelated
  test-owned Edge session open to prove separation. Never use personal tabs.
- [ ] Inspect control listeners: loopback only, no WSL/LAN forwarding. Validate
  local-user trust and the organisation's egress controls independently.
- [ ] Qualify the intended application/IdP, corporate CA/proxy and sign-in in
  the dedicated profile. Retain sanitized pass/fail evidence and cleanup status;
  a working public runner does not qualify the managed target.
