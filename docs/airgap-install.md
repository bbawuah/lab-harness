# Install an offline bundle

The supported bundle target is Linux x86_64 in WSL2. The same tarball can be
fetched from GitHub inside the airgap, or built/fetched on the Mac mini and
transferred manually. It contains Bun, Pi, Herdr, rg, fd and agent-browser.
It contains no browser, model weights or npm development packages.

The target needs a glibc-based Linux distribution (Ubuntu 24.04 is tested),
`sh`, `tar` with gzip support, `coreutils` and `sha256sum`. Neither Bun nor curl
is needed to install an already transferred bundle. An approved Windows Edge
installation and WSL interop are separate browser prerequisites.

Obtain the versioned tarball and SHA256SUMS from the same trusted release.
Verify on the receiving side before extracting or executing anything:

```sh
sha256sum -c SHA256SUMS
mkdir unpacked
tar -xzf lab-harness-0.2.0-linux-x64.tar.gz -C unpacked
sh unpacked/install.sh
"${XDG_DATA_HOME:-$HOME/.local/share}/lab-harness/lab" --version
```

The checksum detects transfer corruption. Obtain it through a trusted channel;
a checksum supplied by an attacker alongside a changed tarball is not proof of
authenticity. Keep the expected checksum when transferring just the single
`.tar.gz` file. On macOS, use `shasum -a 256 -c SHA256SUMS`.

The installer verifies every file against MANIFEST.json, checks the runtime
contracts and source publication manifest, and runs a real Herdr worker smoke.
It never downloads, invokes npm, edits a shell profile or needs sudo. Releases
use `$XDG_DATA_HOME/lab-harness/releases/<commit>` (default
`~/.local/share/lab-harness/releases/<commit>`). Private user state stays in
`~/.local/share/lab-harness/workspace`. A guarded launcher and optional
`~/.local/bin/lab` shim preserve foreign commands. Use the full launcher if the
shim cannot be installed or PATH has another `lab` command.

## Build on the mini

From the exact committed checkout, with pinned Bun, Git, curl, tar and unzip:

```sh
bun --no-env-file --no-install scripts/bundle/build.ts --commit HEAD --target linux-x64
cd .tmp/bundles/linux-x64
shasum -a 256 -c SHA256SUMS
```

Only files from `git archive` enter the bundle. Uncommitted edits do not enter
it. Transfer the single tarball and retain its expected checksum separately.
The Linux binaries are never executed during the macOS build.
