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
