# Build a release bundle

The package version comes from package.json; the source identity is the full
commit selected by `--commit`. The builder uses `git archive`, reads that
commit's runtime contracts, verifies downloaded archives and extracted binaries,
and verifies the complete Pi asset tree. License texts are collected in LICENSES
and every payload file has a SHA-256, source URL and license in MANIFEST.json.
MANIFEST.json is covered by the outer tarball checksum in SHA256SUMS.

```sh
bun --no-env-file --no-install scripts/bundle/build.ts --commit HEAD --target linux-x64
```

Builds use sorted USTAR entries, uid/gid zero, fixed modes, zero mtimes and gzip
without a timestamp or host OS marker. No target runtime is executed. With the
same source commit, pinned Bun and downloads, mini and Linux CI builds are
intended to be byte-identical. Cross-host equality must be measured before it
is claimed; fetching the published asset always preserves the CI hash.

See [offline installation](airgap-install.md) for receiving-side verification.

## Release procedure

The owner chooses a version in package.json and qualifies the desired source
commit on main. Version changes belong to the integration workstream. Do not
push a tag until the following pin update is merged.

1. Choose the exact, already-pushed source commit S. Its package version must
   match the intended tag `v<version>`. Keep S fixed through the remaining steps.
2. On a branch based on main, prepare the public bootstrap pin:

   ```sh
   bun --no-env-file --no-install scripts/release/pin.ts prepare S
   bun --no-env-file run refresh:publication
   bun --no-env-file run check
   ```

   Inspect the bootstrap commit/archive hash and publication changes, then
   commit, open a PR and merge that pin update through the normal checks. This
   creates a later main commit P whose bootstrap points to S. The source archive
   hash cannot be embedded in S itself without a circular self-reference.
3. Run `bun --no-env-file --no-install scripts/release/pin.ts check`. CI's new
   `bootstrap release pin` job rejects pins older than the latest stable GitHub
   Release. Equal or descendant commits are accepted so a pending release pin
   can land before publication. Git/API failures are failures, not bypasses.
4. The owner creates and pushes `v<version>` pointing at S, not P. The release
   workflow checks the version, verifies that S is on main, reads main's
   bootstrap and requires its commit and downloaded archive hash to match S.
   It runs tests, types and publication checks, builds the bundle, then runs the
   non-root container install and actual Herdr smoke with `--network none`.
5. Only after qualification succeeds does the publish job receive write
   permission and create the GitHub Release with the tarball, SHA256SUMS and
   installation notes. No npm registry publication is involved. An existing
   release makes creation fail; reruns never replace published assets silently.
6. Fetch and verify the published tarball using `scripts/release/fetch.sh`, record
   its checksum, and transfer the same file if required. Run target qualification
   in WSL2 before claiming model/Windows Edge acceptance.

The existing `check (ubuntu-24.04)` and `check (macos-15)` CI jobs are unchanged.
The task brief mentioned macos-14; docs/ci.md and the actual workflow establish
macos-15 as the current required name. New jobs have distinct names.

## Provenance and licenses

Runtime bytes keep their upstream licenses; LAB-HARNESS/Relay retain the
repository's UNLICENSED status and NOTICE.md. Additional pinned license sources
live in scripts/bundle/licenses.json. Pi and agent-browser license text hashes
come from their existing contracts; rg/fd texts come from checksum-pinned release
archives. Bun's upstream license overview records its MIT status, linked LGPL
JavaScriptCore and other linked libraries. The collected notices do not grant
new rights or replace the upstream redistribution obligations. Review those
obligations before publishing the first public runtime bundle.

The builder includes every agent-browser contract artifact for the target, and
for linux-x64 also every win32/x64 artifact. The initial contract has no Windows
artifact; that absence is a warning, not an invented URL/hash. Workstream C adds
it. A build before that integration supports the Linux control binary only.

## Determinism and evidence

The archive writer is platform-independent, and the builder never runs target
binaries. Use the pinned .bun-version on both hosts. Repeated builds at one commit
are compared in the regression suite; a full Mac/Linux comparison is required
to establish the cross-host checksum. Until that comparison has run, fetching
CI's published asset is the route that guarantees its exact hash.

Actual mini validation includes a real Linux-x64 build and a non-root Ubuntu
24.04 amd64 install under Rosetta with networking disabled, real Herdr worker
output and cleanup, version reporting, and idempotent reinstall. A separate
macOS-arm64 bundle was installed with outbound IP access denied by sandbox-exec.
Unit regressions use fixture manifests and temporary Git repositories; they do
not qualify WSL, Windows Edge, Azure, or any model call.
