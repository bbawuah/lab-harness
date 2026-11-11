# Linux amd64 interactive acceptance, 2026-11-11

**Passed on Ubuntu 24.04 x86_64 under Rosetta**, using Docker context
`colima-lab-amd64`. The tested product source is
`f414f7c548f6a53815f824dda4df0433914a2986`. No product code was changed.
This establishes a Linux interactive smoke result, not WSL2, Azure, Edge or
real-model qualification.

## Results against the workstream E brief

1. **Clone install passed in 15.03 seconds.** The unmodified `./install.sh`
   ran as UID 1001 with isolated HOME and no Git installed. It acquired the
   verified Bun 1.4.2, Herdr 0.9.5, Pi 1.4.0, ripgrep 14.1.1 and fd 10.3.0;
   installed frozen development dependencies; passed publication integrity;
   and passed the actual Herdr worker/cleanup smoke.
2. **The local model route worked without configuration prompts.** The driver
   wrote the existing version-1 `local` route and blank key directly into the
   private workspace state, with mode 0600. A Python server on loopback sent
   streaming Chat Completions, fragmented `bash` tool arguments, and final
   text after receiving the tool result. This is a scripted protocol fixture,
   with no inference, paid service, model weights or real credentials.
3. **The default two-pane interactive flow passed in 11.35 seconds.** The
   actual `lab --project /lab/fixture` ran in a PTY. The TUI started in ask mode,
   the prompt reached the fixture, and LAB showed the concrete shell approval.
   The marker file was absent before approval. Pressing Allow once ran the
   command, produced `LINUX_TOOL_OK`, and returned it to the fixture, which
   streamed `LINUX_E2E_FINAL_OK`. `/lab-search`, `/lab-files`, `/lab-skills`
   and `/relay-peers` returned visible results without extra model requests.
   `/exit` returned 0; the owned Herdr/Pi/shell PIDs and sockets disappeared;
   an unrelated process survived.
4. **The same interactive flow passed with `--network none` in 11.95 seconds.**
   A fresh container reused the installed source, HOME and project through an
   isolated named volume. Docker inspect recorded network mode `none`; the
   driver observed only `lo`. The loopback model/tool round trip and all
   commands/cleanup checks passed again. LAB's `--offline` flag was deliberately
   omitted, so this proves ordinary cached launch works without external
   networking. Each interactive run made exactly two local model requests.
5. **Sanitized evidence and a rerun script are supplied.** Source, state,
   fixture projects and model traffic stayed inside the containers. Host HOME,
   credentials and working-tree changes were not mounted or imported. Text
   captures use LF newlines without trailing whitespace. Each session result
   records SHA-256 identities for its captured files.

The online TUI reached ready in 6.12 seconds; its tool round trip took 0.87s.
Offline ready took 6.22 seconds; its tool round trip took 0.86s. Durations
include verification of pinned runtime bytes. Docker image preparation is
outside these timings. The separate SSE fixture self-test took 0.39 seconds.

See [install transcript](install.txt), [install result](install-result.json),
[online checks](online/result.json), [online approval](online/approval.txt),
[online model round trip](online/model.json), [offline checks](offline/result.json),
[offline approval](offline/approval.txt), [offline model round trip](offline/model.json),
[Docker network mode](offline-network.txt) and [runner result](runner-result.json).
The attachment reports and visible command responses sit alongside each
session result. Online and offline project device/inode identities match.

## Reproduce

From this branch, with the Rosetta-backed Docker profile running:

```sh
LAB_E2E_DOCKER_CONTEXT=colima-lab-amd64 scripts/e2e-linux/run.sh f414f7c
```

Every Docker invocation receives `--context colima-lab-amd64`. The script never
changes the global Docker context. On a native amd64 Docker host, omit the
environment variable. To test a later integration commit:

```sh
LAB_E2E_DOCKER_CONTEXT=colima-lab-amd64 scripts/e2e-linux/run.sh HEAD
```

The optional second argument chooses an output directory; the default is an
ignored `.tmp/linux-e2e-*` directory. The script returns nonzero if installation,
fixture self-test, online acceptance or offline acceptance fails. It copies an
exact Git archive into the container, so the product sees the clone's committed
bytes without Git metadata. This tests the clone installer, not bootstrap or an
offline release bundle.

The Dockerfile uses the official `amd64/ubuntu:24.04` architecture alias. This
host's legacy Docker builder selected ARM64 from the multi-platform tag despite
the platform flag; the explicit alias avoids that. The
[base-image digest](base-image.json) and [Docker context](docker-context.txt)
are recorded. Core dumps are disabled. On completion the runner removes only
its own containers, tagged image and named volume; result files remain.

The acceptance driver sends input through the real Herdr client attached to
an outer Python PTY. It reads visible pane text through the same owned Herdr
API used by `scripts/permission-actual.ts`. It accepts the isolated fixture
project's native trust prompt if shown. The fake model's only command writes
and reads `approval-marker.txt` in that fixture project. No browser or desktop
integration is started. Cleanup checks cover the named owned PIDs and sockets,
not arbitrary long-lived descendants.

## Distro packages

The base Ubuntu 24.04 image already contains Bash/sh, `tar`, SHA-256/coreutils,
`ps`, `script`/util-linux, glibc, `libgcc-s1` and `libstdc++6`. Add the following
for online clone installation:

```sh
apt-get update
apt-get install -y --no-install-recommends curl unzip ca-certificates
```

The interactive test image also installs `python3` for the PTY driver and fake
model server. Python is test infrastructure. Git is needed to obtain source
with `git clone`, but not to install or launch from the copied clone bytes:
Git was absent throughout both passing interactive runs. LAB acquires Bun and
standalone Pi itself; Node is not preinstalled.

Exact distro package versions are recorded in [packages.txt](packages.txt).
An additional fresh distro run installed only those three apt packages,
without Python, Git or Node, and passed `./install.sh` including Herdr smoke
in 14 seconds (whole-second timing). Its [result](minimal-distro/result.json),
[absent-tool probes](minimal-distro/optional-tools.txt),
[transcript](minimal-distro/install.txt) and
[runtime library linkage](minimal-distro/runtime-linkage.txt) confirm that
Python's dependencies are not hiding an installer prerequisite.
No sudo is used by the installer. Apt is run as root only while preparing the
test distro, then all LAB installation/session work runs as the non-root user.

## Earlier failures and limits

- The default Colima QEMU 7.0.0 profile lacks AVX/AVX2 and repeatedly segfaulted
  in pinned Bun, before the TUI. This is filed as
  [environment issue #32](https://github.com/bbawuah/lab-harness/issues/32).
  Exact commands, source boundaries, crash output and timings are retained in
  [the historical QEMU report](qemu/README.md). The lead supplied the Rosetta
  context; no runtime pin, product code or approval gate was changed to obtain
  the passing result.
- The first Rosetta offline test used `docker commit` and then copied the HOME
  and project into a new container filesystem. LAB refused the changed project
  identity with `LAB: conflict`. That was a test setup error: Relay binds a
  project to its device/inode at `src/relay/workspace.ts:194`. The runner now
  mounts the same isolated named volume in both containers. The
  [failed relocation capture](snapshot-diagnostic/failure-pty.txt) is kept
  separately; it is not a failed offline launch with stable project identity.
- No product defect was reproduced after selecting the working emulator and
  preserving project identity. WSL2 interop, Windows Edge, Azure/proxy/CA auth,
  real-model tool selection, interrupted sessions and arbitrary descendants
  remain outside this smoke test. The results apply to the tested source
  commit; re-run after integrating the other airgap workstreams.
