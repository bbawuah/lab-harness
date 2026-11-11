#!/bin/sh
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)
lab_offline=1
. "$project_root/scripts/runtime-bun.sh"
export BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
exec "$lab_bun" --no-env-file --no-install "$project_root/scripts/bundle/uninstall.ts" "$@"
