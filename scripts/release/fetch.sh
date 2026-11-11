#!/bin/sh
# Fetch exactly the published asset, then verify before publishing it locally.
set -eu
umask 077
fail() { printf 'fetch: %s\n' "$*" >&2; exit 1; }
[ "$#" = 2 ] || fail 'Usage: fetch.sh vVERSION OUTPUT_DIRECTORY'
version=$1
case "$version" in v[0-9]*) ;; *) fail 'Expected a version tag starting with v';; esac
case "$version" in *[!a-zA-Z0-9.-]*) fail 'Unsafe version tag';; esac
mkdir -p "$2"
out=$(CDPATH= cd -- "$2" && pwd -P)
asset=lab-harness-${version#v}-linux-x64.tar.gz
stage=$(mktemp -d "$out/.fetch.XXXXXX")
trap 'rm -rf "$stage"' EXIT HUP INT TERM
base=https://github.com/bbawuah/lab-harness/releases/download/$version
curl -fL --retry 2 --connect-timeout 15 --max-time 300 --max-filesize 536870912 "$base/$asset" -o "$stage/$asset"
curl -fL --retry 2 --connect-timeout 15 --max-time 60 --max-filesize 65536 "$base/SHA256SUMS" -o "$stage/SHA256SUMS"
expected=$(awk -v asset="$asset" '$2 == asset {print $1}' "$stage/SHA256SUMS")
[ "${#expected}" = 64 ] || fail 'Missing or ambiguous asset checksum'
case "$expected" in *[!0-9a-f]*) fail 'Invalid SHA-256';; esac
if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$stage/$asset"); else actual=$(shasum -a 256 "$stage/$asset"); fi
[ "${actual%% *}" = "$expected" ] || fail 'Release checksum mismatch'
# Hard-link publication refuses an existing file or symlink rather than replacing it.
ln "$stage/$asset" "$out/$asset" || fail 'Output asset already exists; no file replaced'
printf '%s  %s\n' "$expected" "$asset"
printf 'Verified release asset: %s\n' "$out/$asset"
