# Linux amd64 interactive acceptance, 2026-11-11

**Blocked before the TUI. Linux/WSL acceptance has not passed.** Pinned Bun
1.4.2 repeatedly segfaults under this host's QEMU 7.0.0. No product code was
changed. The defect is filed as
[LAB-HARNESS #32](https://github.com/bbawuah/lab-harness/issues/32).

Tested product source: `f414f7c548f6a53815f824dda4df0433914a2986`.
The runner copies that exact Git archive into the container, without host
credentials, caches, Git metadata or working-tree changes. Its source bytes
are the clone's committed bytes; this is the clone `./install.sh` path, not the
public bootstrap or an offline bundle.

## Results against the workstream E brief

1. **User install failed.** `./install.sh` ran as UID 1001 with isolated HOME.
   Bun downloaded and passed its pinned size/hash/version checks. The final
   fresh run exited 139 at the Relay capability check, after 6.61 seconds.
   The first exploratory fresh run reached the frozen dependency install and
   exited 139 after 8.13 seconds. Neither completed installation, acquisition
   of Pi/Herdr/rg/fd, publication validation or the Herdr smoke.
2. **Loopback fixture self-test passed in 0.53 seconds.** A Python HTTP server
   streamed fragmented Chat Completions tool arguments and final text. A
   synthetic tool result exercised the second HTTP response. This was a
   protocol-fixture check, with no LAB process, tool execution or inference.
   The existing version-1 `local` route and blank key were written directly
   into private files, mode 0600, under the isolated workspace state root.
   LAB did not get far enough to demonstrate loading them.
3. **Real interactive startup failed in 2.04 seconds.** The driver started
   `/lab/source/lab --project /lab/fixture` in a real PTY, using the default
   two-pane layout and default ask mode. The launcher segfaulted with signal
   11 before opening a Herdr socket. The fake model received **zero requests**.
   TUI rendering, prompt delivery, approval, tool execution, `/lab-search`,
   `/lab-files`, `/lab-skills`, `/relay-peers` and `/exit` cleanup are all
   **unverified**, not passes. This startup was deliberately attempted after
   the failed install; it is diagnostic evidence, not an installed-runtime test.
4. **Offline acceptance skipped.** There was no successful installation to
   reuse. No `--network none` launch is claimed. The runner implements a
   separate `docker run --network none` after a successful install, preserves
   its inspect result, and requires loopback to be its only interface.
5. **Evidence and rerun script supplied.** No host paths, keys, real model
   requests, browser sessions or product patches are published here. The
   publication manifest is refreshed separately as required by the plan.

The completed runner returns 1. See [runner-result.json](runner-result.json),
[install transcript](install.txt), [install timing](install-result.json),
[PTY failure](startup-after-failed-install/failure-pty.txt),
[startup result](startup-after-failed-install/result.json), and
[empty model log](startup-after-failed-install/model.json).
The [fixture self-test](fixture-selftest/result.json) is labelled separately.
Published capture hashes are recorded in the startup result. Text transcripts
use LF newlines and omit trailing whitespace; diagnostic content is retained.

## Reproduce

From this branch, with Docker running:

```sh
scripts/e2e-linux/run.sh f414f7c
```

The optional second argument chooses an output directory. It defaults to an
ignored `.tmp/linux-e2e-*` directory. Test a later integration commit with:

```sh
scripts/e2e-linux/run.sh HEAD
```

The runner builds an Ubuntu 24.04 amd64 image, creates a non-root user and a
separate HOME, copies only the selected commit, then runs the unmodified
installer with network access. Python is the only extra test dependency.
It never mounts host HOME or imports host auth. Core dumps are disabled because
QEMU's first crashes produced multi-gigabyte dumps. Only containers and tagged
images created by the runner are removed at exit; result files remain.

`Dockerfile` uses the official `amd64/ubuntu:24.04` architecture alias because
this Colima installation lacks Buildx and its legacy builder selected ARM64
from the multi-platform `ubuntu:24.04` tag despite `--platform linux/amd64`.
The final [base-image digest](base-image.json) is recorded. The container
reports Linux x86_64 and UID 1001 in both install and startup results.

After a successful install, the acceptance driver sends input through the
native Herdr client attached to an outer PTY. It reads visible pane text
through the same owned Herdr API used by `scripts/permission-actual.ts`.
It accepts the isolated fixture project's native trust prompt if shown.
The fixture requests a shell command that writes `approval-marker.txt`.
The driver requires that file to be absent while the approval prompt is visible,
presses Allow once, then checks the file, streamed final text and returned tool
result. Operator commands must produce visible results without another model
request. Cleanup must pass the attachment report, independent PID/socket checks
and an unrelated-process-survival check. **Those checks exist but have not run
past startup on this host.** The full post-startup driver still needs validation
on a working amd64 runtime.

The offline phase snapshots the installed container into a temporary image,
then creates a fresh container with `--network none`. Its loopback fake server
runs inside that container. The driver deliberately omits LAB's `--offline`
flag so it tests ordinary launch without external networking.

## Distro packages

The bare Ubuntu 24.04 image already had Bash/sh, `tar`, `sha256sum`/coreutils,
`ps`, `script`/util-linux, glibc, `libgcc-s1` and `libstdc++6`. It lacked `curl`,
`unzip`, CA certificates, Git and Python.

The expected additions for LAB's network bootstrap are:

```sh
apt-get update
apt-get install -y --no-install-recommends curl unzip ca-certificates
```

The smoke image also installs `python3` for the PTY and fake model driver.
Python is a test dependency, not a LAB runtime requirement. Git is needed to
obtain a clone using `git clone`, but is absent from this container; copying a
clone/archive gets as far as the Bun failure without it. A completed install
without Git, and the sufficiency of this package set for the full interactive
runtime, remain unverified. Do not turn the blocked run into a claim that the
complete distro dependency list has passed. Actual package versions are in
[packages.txt](packages.txt), including apt's dependencies.

## Defect #32 and narrower probes

Host observations: macOS arm64; Colima Virtualization.Framework aarch64 VM;
Linux kernel 6.8.0; binfmt interpreter `/usr/bin/qemu-x86_64`, version 7.0.0.
The container reports glibc 2.39 and no AVX/AVX2. This is user-mode emulation,
not native x86_64 and not WSL2.

Exact smaller reproduction inside the populated container:

```sh
cd /lab/source
ulimit -c 0
.tmp/bun/1.4.2/bun --no-env-file --no-install -e 'import { assertPublishCapability } from "./vendor/relay/src/storage/publish.ts"; console.log(typeof assertPublishCapability)'
```

Observed output includes:

```text
Bun v1.4.2 (744846f84) Linux x64
CPU: sse42 popcnt
panic: Segmentation fault at address 0x8C8
qemu: uncaught target signal 11 (Segmentation fault) - core dumped
```

The direct Python subprocess records `-11` for SIGSEGV; a shell reports 139.
[All bounded probe commands and timings](diagnostics/result.json) and their
individual `.txt` outputs are retained. Version, simple JavaScript, importing
`bun:ffi`, and opening libc's `__errno_location` passed in that run. Importing
the Relay module crashed even without calling `assertPublishCapability`.
This narrows the reproduction but does **not** prove that Relay's FFI calls
or any particular LAB statement caused it.

Suspected integration boundaries at the tested commit:

- `install.sh:20`: Relay module import/capability probe; `install.sh:25` also
  crashed on the first run during dependency installation.
- `scripts/runtime-bun.sh:67`: version-only validation passes before these
  runtime crashes; `contracts/bun-runtime.txt:7` selects the pinned Linux
  baseline executable.
- `vendor/relay/src/storage/publish.ts:1`: the smaller crashing module import.
  A native rerun is needed before blaming product code.

Disabling JIT (`BUN_JSC_useJIT=0`) and selecting `QEMU_CPU=max` or
`QEMU_CPU=Haswell` did not produce a reliable successful installer. One Haswell
capability probe succeeded; the next full installer and repeated probe failed.
There is no established one-line product fix. Keep artifact verification and
the Relay capability check intact. The next useful test is the same script on
native amd64 Ubuntu/WSL or a separately qualified newer emulator.

The first install evidence is retained under
[exploratory-first-install](exploratory-first-install/install-result.json).
Neither that run nor the final fresh run qualifies the target platform.
