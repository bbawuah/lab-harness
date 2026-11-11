#!/bin/sh
# Run after verifying the downloaded tarball against trusted SHA256SUMS.
set -eu
umask 077
[ "$#" = 0 ] || { printf 'Usage: sh install.sh\n' >&2; exit 2; }
bundle_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
project_root=$bundle_root/harness
lab_offline=1
export LAB_INSTALL_OFFLINE=1
. "$project_root/scripts/runtime-bun.sh"
export BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
# Disable the transpiler disk cache until exact manifest coverage has been checked.
cd -- "$project_root"
exec "$lab_bun" --no-env-file --no-install "$project_root/scripts/bundle/install.ts" "$bundle_root"
