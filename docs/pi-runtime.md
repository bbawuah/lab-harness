# Project-local Pi runtime

`src/runtime/pi.ts` exports the frozen interface:

```ts
interface PiRuntime { command: string[]; version: string }
function verifyPiRuntime(): PiRuntime
function acquirePiRuntime(options?: { offline?: boolean }): Promise<PiRuntime>
```

Install explicitly with
`bun --no-env-file --no-install scripts/pi/acquire.ts`. Add `--offline` to
require an already complete verified cache without any network access. The CLI
prints the returned runtime as JSON, exits 1 on acquisition failure, and exits
2 for unknown or duplicate flags. The caller starts `runtime.command` directly,
appending its own Pi arguments. No shell, global Pi, npm or Node is involved.

The executable path is
`.tmp/pi/1.4.0/<platform>-<arch>/pi/pi`, resolved against this checkout rather
than the caller's working directory. It remains beside all 211 upstream bundled
files, including themes, image WASM, platform native helper, docs and examples.
The three supported selections are `darwin-arm64`, `darwin-x64` and `linux-x64`.
The x64 releases use upstream Bun's baseline target. Other platforms refuse
before creating a cache or contacting the network. Linux x64 artifact selection
also applies under WSL; actual WSL operation remains unverified. The user's
MacBook is distinct from the development mini and has not been tested here.

## Official source and artifact identity

[The official v1.4.0 release](https://github.com/earendil-works/pi/releases/tag/v1.4.0)
was published on 2026-10-21. Current release metadata, downloaded archives,
the official `SHA256SUMS`, release build workflow and pinned source were inspected
on 2026-10-29. `contracts/pi-runtime.json` records archive byte lengths and
SHA-256 values, extracted executable hashes, full extracted tree hashes, the
checksum file hash and hashes of the inspected source files. The downloaded
archives matched both GitHub's asset digest metadata and `SHA256SUMS`.

The release tag resolves to `4a080252f06caf63a525d7873c5d94d3c23887e0`.
The earlier source-inspection pin
`b857fbd8a9225ab7b0c15d7a6965b2f109c9317a` is 203 commits ahead, although its
package also declares 1.4.0. The binary is **not** claimed to match that source
pin; `sourcePinMatch` is false. The existing Pi seam provenance stays intact.
The upstream workflow allows a source-ref override for release recovery, so
these downloaded artifact identities are authoritative for this integration;
the tag alone is not a reproducible-build attestation.

The [release build script](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/scripts/build-binaries.sh)
compiles standalone Bun executables with embedded workers and disables automatic
`.env` and `bunfig.toml` loading. It includes platform native helpers beside the
executable. The upstream Pi package declares MIT. The contract includes the
complete [upstream MIT notice](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/LICENSE),
its byte hash and copyright attribution. Bundled Bun and third-party dependencies
retain their upstream licenses. This repository commits metadata and integration
code, not the downloaded third-party runtime bundle.

## Verification, cache and failure behavior

`verifyPiRuntime()` is read-only. It checks every directory and regular file,
rejects symlinks, hard links, special files, extra or missing entries, byte
changes and a non-executable Pi file. It recomputes the pinned tree hash and
returns the version associated with those exact bytes. It does not execute Pi,
create directories, change modes, repair the cache or fetch anything.

The tree digest is SHA-256 over entries sorted by relative ASCII path. Each
directory contributes `D <path>\n`; each file contributes
`F <path> <decimal byte length> <file SHA256>\n`. Paths are relative to the
archive's `pi/` root, which is omitted. Newlines are actual LF bytes; size is
unpadded decimal. Counts and total unpacked byte length are checked as well.

Acquisition first accepts an intact verified cache, including when offline.
Online acquisition can repair a corrupt or partial bundle. It downloads only
the selected exact official archive, bounds streaming allocation by its pinned
length, rejects short, oversized or changed responses, and passes only matching
bytes to system `tar`. The inspected archives contain only regular files and
directories beneath `pi/`. Extraction occurs in a fresh private staging directory
under this project's cache. The complete extracted tree is verified before use.

Pi 1.4.0 initializes settings before handling `--version`
([release `main.ts`](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/main.ts#L574)).
Acquisition alone runs that bounded probe with a disposable project-local home,
agent directory, working directory and XDG paths, a minimal environment and
`PI_OFFLINE=1`. It removes this state and verifies bundle bytes again before
publication. No credentials, model configuration or inference are required.

A per-platform exclusive directory lock prevents concurrent acquisition writers.
An intact cache remains usable while another writer holds a lock. A lock left
by an interrupted installer produces an actionable error: ensure no acquisition
is running, then remove that exact lock directory before retrying. The installer
does not guess that another writer is dead or remove its state.

Publication renames the verified staging directory into place. Repair first
renames the damaged tree aside, with rollback if publication fails, then removes
that previous tree. A reader during this brief replacement can receive an
unavailable-cache error and retry; it never receives a partially extracted
bundle. Failed download/extraction/probe leaves the previous cache unchanged.
Owned staging and locks are removed on ordinary failure. Abandoned staging from
a killed process is never selected as a runtime or deleted by another run.
Directory symlinks in cache ancestors or the destination refuse rather than
redirect installation outside the project.

## Validation

`bun --no-env-file --no-install test tests/pi-acquire.test.ts` exercises the real
exported API and CLI in isolated project fixtures, including paths with spaces,
read-only missing/offline behavior, cache reuse, asset and binary corruption,
missing/extra files, executable mode, symlink/hardlink refusal, partial installs,
abandoned staging, unreachable/HTTP/truncated/oversized/hash failures, extraction
failure, wrong executable version, lock ownership and concurrent writers. Fixture
executables intentionally write on execution so read-only/cache calls also
check that Pi is never invoked there. Fixtures make no public network or model
requests and are not actual Pi integration evidence.

Actual development-host evidence is separate: macOS arm64 downloaded the official
31,098,931-byte archive, matched its pinned hash, installed the complete bundle,
reported 1.4.0 and passed cached/offline/read-only verification. macOS x64 and
Linux x64 archives were also downloaded, hashed and their complete extracted file
identities recorded on the mini; their executables were not run there. Platform
CI and interactive workspace/inference evidence belong to coordinator integration.
