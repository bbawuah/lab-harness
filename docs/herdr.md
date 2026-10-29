# Disposable Herdr smoke

`src/herdr/index.ts` exports the contract entry point:

```ts
runHerdrSmoke(options: HerdrSmokeOptions): Promise<TerminalObservation>
// options: { stateRoot: string; executable?: string; timeoutMs?: number }
```

Run from the project checkout with its pinned Bun version:

```sh
bun --no-env-file install --frozen-lockfile
bun --no-env-file --no-install scripts/herdr/acquire.ts
bun --no-env-file --no-install scripts/herdr/smoke.ts
LAB_HERDR_ACTUAL=1 bun --no-env-file --no-install test tests/herdr*.test.ts
```

Acquisition downloads one official release binary into `.tmp/herdr/herdr`, checks
its pinned SHA-256 before making it executable, and records local runtime metadata.
It reuses a matching cached binary. Nothing is globally installed or added to PATH.
The smoke does not download anything; missing or unverified executables fail.
`executable` may select another copy of a manifest-pinned official binary.
Builds from arbitrary source are deliberately unqualified in this slice.

The same commands support Linux x86_64/aarch64 and macOS x86_64/aarch64.
For Linux CI, provision Bun 1.4.2, perform the frozen dependency install and
explicit acquisition, then run the opt-in command above. No Cargo, Zig, TTY,
model credentials or cloud service is needed. Download requires GitHub access;
subsequent smoke runs use the verified local cache. An Ubuntu runner qualifies
that runner only; WSL and Linux remain unverified by the local macOS evidence.
Shared CI and package integration belong to the coordinator.

## Source and runtime identities

`contracts/herdr-source.json` records authoritative source pin
`bc8c28988f75c538d4ca058b702f5adbea30566e`, byte hashes of the inspected source
and next socket documentation, and official artifact URLs/digests.
The runnable binary is release **v0.9.5**, commit
`2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01`; it is **different from the source pin**.
The release asset digests came from the official GitHub release API, not a
separately verified signature. No third-party source or binary is committed.
No reuse license is granted for this repository or third-party bundles.

Local actual evidence on 2026-10-29: Darwin arm64, Bun 1.4.2,
`herdr-macos-aarch64` SHA-256
`fb77c2232a05a8035421382c894392f4174e4e38a18e48af3dd0290157c3a7e2`.
The running server reported version 0.9.5, protocol 22. Actual pane output
contained the exact per-run `LAB_HERDR_OK_<nonce>` line; `pane.process_info`
matched the worker PID. Pane close and server stop were acknowledged, server
exit was 0, both socket files disappeared, and the worker PID was gone.
The concurrent 100ms deadline run also timed out after launch on this host;
its owned pane/server cleaned up while the other run succeeded.

## Supported API and ownership

The adapter uses the inspected source and
[next socket documentation at the source pin](https://github.com/herdrdev/herdr/blob/bc8c28988f75c538d4ca058b702f5adbea30566e/docs/next/website/src/content/docs/socket-api.mdx).
The supported sequence is:

1. Direct foreground `herdr server`, retaining the spawned child handle.
2. `ping` to verify runtime version and report protocol.
3. `workspace.create` and `layout.apply` with explicit argv to launch a plain
   `/bin/sh` worker. A new empty server may have no active workspace.
4. `pane.read` (`visible`, plain text) until the executed worker emits its marker;
   `pane.process_info` verifies its reported PID.
5. `pane.close`, then `server.stop`; wait for child exit, removal of both owned
   sockets, and disappearance of the diagnostic worker PID.

The worker prints a nonce, writes its own PID, then waits on terminal input.
It invokes no agent, Pi, model or integration. Direct argv execution means the
marker cannot be confused with an echoed shell command. A unique named session
is selected using `HERDR_SESSION`; explicit `HERDR_SOCKET_PATH` keeps the JSON
and derived client sockets inside the owned run directory. No explicit
`--session` flag is used because that overrides the socket override in Herdr.

Each invocation creates a fresh mode-0700 directory beneath the supplied
`stateRoot`, which must resolve inside this project's `.tmp`. Existing run
directories and sockets are never reused. Long Unix socket paths fail with an
actionable error. The process receives an allowlisted environment with isolated
HOME, XDG config/state/cache/data/runtime paths, TMPDIR and cwd. No inherited
dotenv, shell startup variables or credentials are passed. Config disables
version and manifest checks, agent restore and pane history, and selects
non-login `/bin/sh`. This is operational separation under one UID, not a
security boundary against malicious same-user processes. Network absence was
not independently packet-captured.

The adapter never lists user sessions, attaches to them, or signals a discovered
PID. It can fall back to SIGTERM/SIGKILL only on its retained server child and
records any fallback. Worker PIDs are used only for status and signal-0 existence
checks; they are never killed directly. Parent SIGKILL and machine failure cannot
be guaranteed to clean up; this slice verifies normal return, bounded deadline
failure, and cleanup through `finally` while the adapter remains alive.

## Results and failures

Successful results are labelled `actual-herdr-owned-process`. They include the
source pin, runtime hash/version/release commit, session, output, worker status
and cleanup observations. `taskAcceptance` is always `unchanged`. This adapter
does not import or call ledger acceptance APIs.

Any operation failure throws `HerdrSmokeError` with a partial `observation`.
It never returns successful smoke evidence for an unavailable runtime, missing
output, mismatched process status or unverified cleanup. `stopped` describes
cleanup alone: it may be true on a failed operation. Cleanup has its own bounded
budget after the operation deadline. Mutating requests are never retried;
timeout or a lost response is recorded as unknown delivery/outcome. Without a
worker PID, worker disappearance remains unknown rather than inferred from a
server exit. Pre-launch failures are distinguished by the absence of server PID.

Each run retains `observation.json`, config and logs beneath `.tmp/h-*` for local
inspection. These contain local paths and PIDs and are excluded from publication.
After verifying no run is active, remove only the specific run directory named
in its observation. Avoid broad cleanup of sessions or user configuration.

`tests/herdr-protocol.test.ts` uses labelled fake NDJSON sockets solely to verify
framing, response IDs, errors, size bounds and unknown-outcome timeout semantics.
`tests/herdr.test.ts` checks isolation, root ownership and unavailable runtime.
`tests/herdr-actual.test.ts` uses the downloaded real runtime and verifies output,
status, cleanup and independent concurrent ownership. Actual tests are explicitly
skipped unless `LAB_HERDR_ACTUAL=1`; opt-in with a missing runtime fails. The
deadline test tightens 100ms to 10ms/1ms on fast hosts and may fail before launch;
the retained observation distinguishes that case from a launched-server timeout.
