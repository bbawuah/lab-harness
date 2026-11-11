#!/bin/sh
# Prepare ubuntu:24.04 with docker pull first; the actual test has no network.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)
bundle_dir=${1:-$root/.tmp/bundles/linux-x64}
docker run --rm --platform linux/amd64 --network none --user 1000:1000 \
  --tmpfs /test:rw,exec,mode=1777 -v "$bundle_dir:/b:ro" ubuntu:24.04 /bin/sh -eu -c '
    export HOME=/test/home XDG_DATA_HOME=/test/data
    mkdir -p "$HOME" /test/unpacked
    cd /b
    sha256sum -c SHA256SUMS
    test "$(id -u)" != 0
    ! command -v bun
    ! command -v curl
    archive=$(find /b -maxdepth 1 -name "lab-harness-*-linux-x64.tar.gz")
    test -n "$archive"
    tar -xzf "$archive" -C /test/unpacked
    sh /test/unpacked/install.sh
    "$XDG_DATA_HOME/lab-harness/lab" --version
    release="$XDG_DATA_HOME/lab-harness/releases/$(cat /test/unpacked/harness/.tmp/release-commit)"
    "$release/.tmp/bun/$(cat "$release/.bun-version")/bun" --no-env-file --no-install "$release/scripts/herdr/smoke.ts"
    test ! -d "$release/node_modules"
    sh /test/unpacked/install.sh
  '
