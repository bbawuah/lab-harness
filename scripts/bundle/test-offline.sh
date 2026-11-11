#!/bin/sh
# Prepare ubuntu:24.04 with docker pull first; the actual test has no network.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)
docker_context=${DOCKER_CONTEXT:-default}
if [ "${1:-}" = --context ]; then docker_context=$2; shift 2; fi
[ "$#" -le 1 ] || { printf "Usage: test-offline.sh [--context CONTEXT] [BUNDLE_DIRECTORY]\n" >&2; exit 2; }
bundle_dir=${1:-$root/.tmp/bundles/linux-x64}
docker --context "$docker_context" run --rm --platform linux/amd64 --network none --user 1000:1000 \
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
    cp -R /test/unpacked /test/corrupt
    printf "tampered source\n" >> /test/corrupt/harness/README.md
    if sh /test/corrupt/install.sh > /test/corrupt-output 2>&1; then cat /test/corrupt-output; exit 1; fi
    grep -q "Bundle identity mismatch" /test/corrupt-output
    test ! -e "$XDG_DATA_HOME/lab-harness/lab"
    mkdir -p "$HOME/.local/bin"
    printf "FOREIGN_COMMAND\n" > "$HOME/.local/bin/lab"
    sh /test/unpacked/install.sh
    test "$(cat "$HOME/.local/bin/lab")" = FOREIGN_COMMAND
    rm "$HOME/.local/bin/lab"
    "$XDG_DATA_HOME/lab-harness/lab" --version
    release="$XDG_DATA_HOME/lab-harness/releases/$(cat /test/unpacked/harness/.tmp/release-commit)"
    "$release/.tmp/bun/$(cat "$release/.bun-version")/bun" --no-env-file --no-install "$release/scripts/herdr/smoke.ts"
    test ! -d "$release/node_modules"
    sh /test/unpacked/install.sh
    test -x "$HOME/.local/bin/lab"
    mkdir -p "$release/foreign-empty-directory"
    printf "retain this file\n" > "$release/foreign-file"
    mkdir -p "$HOME/.local/share/lab-harness/workspace"
    printf "private state\n" > "$HOME/.local/share/lab-harness/workspace/retain"
    sh "$release/scripts/bundle/uninstall.sh"
    sh "$release/scripts/bundle/uninstall.sh" --apply
    test ! -e "$XDG_DATA_HOME/lab-harness/lab"
    test ! -e "$HOME/.local/bin/lab"
    test "$(cat "$release/foreign-file")" = "retain this file"
    test -d "$release/foreign-empty-directory"
    test "$(cat "$HOME/.local/share/lab-harness/workspace/retain")" = "private state"
  '
