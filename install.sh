#!/bin/sh
# Project-local setup; public bootstrap.sh also invokes this entrypoint.
set -eu
umask 077
fail() { printf 'install: %s\n' "$*" >&2; exit 1; }
step() { printf '\ninstall: %s\n' "$*"; }
lab_offline=0
case "${1:-}" in '') ;; --offline) lab_offline=1; shift;; *) fail 'Usage: ./install.sh [--offline]';; esac
[ "$#" -eq 0 ] || fail 'Usage: ./install.sh [--offline]'
project_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
cd -- "$project_root"
. "$project_root/scripts/runtime-bun.sh"
command -v tar >/dev/null 2>&1 || fail 'tar is required to extract pinned runtime archives.'
export BUN_INSTALL_CACHE_DIR="$project_root/.tmp/bun-cache"
export BUN_RUNTIME_TRANSPILER_CACHE_PATH="$project_root/.tmp/bun-transpiler-cache"
export PATH="$project_root/.tmp/fd:$project_root/.tmp/rg:$(dirname -- "$lab_bun"):$PATH"
if [ "$lab_offline" = 1 ]; then export LAB_INSTALL_OFFLINE=1; fi

step 'Checking real Relay publication capability (loader refusals remain visible)'
"$lab_bun" --no-env-file --no-install -e 'import { assertPublishCapability } from "./vendor/relay/src/storage/publish.ts"; assertPublishCapability();'
step 'Installing frozen dependencies without lifecycle scripts'
if [ "$lab_offline" = 1 ]; then
  NODE_ENV=development "$lab_bun" --no-env-file install --frozen-lockfile --ignore-scripts --offline --cache-dir "$BUN_INSTALL_CACHE_DIR"
else
  NODE_ENV=development "$lab_bun" --no-env-file install --frozen-lockfile --ignore-scripts --prefer-offline --cache-dir "$BUN_INSTALL_CACHE_DIR"
fi
step 'Acquiring checksum-pinned Herdr, ripgrep, fd and standalone Pi'
"$lab_bun" --no-env-file run setup:herdr
"$lab_bun" --no-env-file run setup:rg
"$lab_bun" --no-env-file run setup:fd
"$lab_bun" --no-env-file run setup:pi
step 'Running repository tests, typecheck and publication integrity'
"$lab_bun" --no-env-file run check
step 'Checking an actual owned Herdr worker with bounded cleanup; no model calls'
"$lab_bun" --no-env-file run smoke:herdr
printf '\nInstallation complete. Start the interactive LAB workspace:\n  %s/lab\n' "$project_root"
printf 'First start asks for your endpoint/model. No model weights or paid requests were selected.\n'
printf 'Controlled LAB task execution remains unavailable; native Pi workspace is separate.\n'
