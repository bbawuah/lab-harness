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

## Fetch on the mini or inside the airgap

Run this from a trusted checkout with curl and a SHA-256 utility:

```sh
sh scripts/release/fetch.sh v0.2.0 .tmp/transfer
```

The script downloads the versioned Linux tarball and release SHA256SUMS, checks
the tarball, and refuses to replace an existing output file. It prints the hash
and leaves just the verified tarball in the output directory. Record the printed
hash separately. Transfer that file through the approved manual route, then
compare the receiving-side `sha256sum` with the recorded hash before extraction.
The fetch command requires a published release; this implementation does not
create one. A locally rebuilt bundle is also usable, but its source commit must
match the release before comparing its hash with CI.

## Remove a bundle installation

Close your LAB sessions first. Run the uninstaller from the release you want to
remove, with the same HOME and XDG_DATA_HOME used for installation:

```sh
release="${XDG_DATA_HOME:-$HOME/.local/share}/lab-harness/releases/COMMIT"
sh "$release/scripts/bundle/uninstall.sh"
sh "$release/scripts/bundle/uninstall.sh" --apply
```

The first command previews the exact file list. The second removes only files
whose bytes still match the bundle receipt. It removes a launcher/shim only if
its complete contents identify this installation. Changed files, unknown files,
foreign commands, other releases and private workspace state remain. Empty
parent directories of removed files can be removed. Retained smoke evidence or
unknown content can leave a partial release directory behind; inspect it before
any manual deletion. This path requires a bundle receipt and refuses older
bootstrap-only releases that have no receipt, rather than guessing ownership.

## Reproduce the network isolation test

Prepare the Ubuntu image while connected, then run the committed test script:

```sh
docker pull --platform linux/amd64 ubuntu:24.04
scripts/bundle/test-offline.sh
```

The test installs as uid 1000 into disposable HOME/XDG directories inside a
container with `--network none`. Ubuntu has no Bun or curl installed. It checks
all hashes, performs the Herdr smoke and owned cleanup, prints `lab --version`,
checks that node_modules is absent and repeats installation.

On the Mac mini, use the Rosetta-backed Docker context explicitly. The default
QEMU profile lacks AVX and the pinned Bun can crash or spin there. Do not change
the global Docker context. Pass the context to the test script too:

```sh
docker --context colima-lab-amd64 pull --platform linux/amd64 ubuntu:24.04
scripts/bundle/test-offline.sh --context colima-lab-amd64
```

This is Linux container evidence. WSL2 interop, the organisation's Edge policy
and the model endpoint still require qualification on the target machine.
