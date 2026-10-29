#!/bin/sh
# Project-local setup. Run from any directory; no profiles or global tools change.
set -eu

fail() { printf 'install: %s\n' "$*" >&2; exit 1; }
step() { printf '\ninstall: %s\n' "$*"; }

[ "$#" -eq 0 ] || fail 'Usage: ./install.sh (no arguments)'
project_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
cd -- "$project_root"

command -v git >/dev/null 2>&1 || fail 'Git is required. Install Git yourself, then rerun ./install.sh.'
git --version >/dev/null || fail 'Git is not working; fix it, then rerun ./install.sh.'
command -v bun >/dev/null 2>&1 || fail 'Bun 1.4.2 is required. Install that version yourself, then rerun ./install.sh.'
required_bun=$(cat .bun-version)
actual_bun=$(bun --no-env-file --version) || fail 'Could not read Bun version.'
[ "$actual_bun" = "$required_bun" ] || fail "Bun $required_bun is required; found $actual_bun. Select the pinned version and rerun ./install.sh."

platform=$(uname -s)
architecture=$(uname -m)
case "$platform/$architecture" in
  Darwin/arm64|Darwin/x86_64|Linux/x86_64) ;;
  *) fail "Unsupported platform $platform/$architecture: pinned Herdr + rg setup supports macOS arm64/x86_64 and Linux x86_64. WSL is unverified." ;;
esac
command -v tar >/dev/null 2>&1 || fail 'tar is required to extract the pinned rg archive.'

# Scope both Bun caches to this clone, including the first capability probe.
export BUN_INSTALL_CACHE_DIR="$project_root/.tmp/bun-cache"
export BUN_RUNTIME_TRANSPILER_CACHE_PATH="$project_root/.tmp/bun-transpiler-cache"

step 'Checking real Relay publication capability (loader refusals remain visible)'
bun --no-env-file --no-install -e 'import { assertPublishCapability } from "./vendor/relay/src/storage/publish.ts"; assertPublishCapability();'

step 'Installing frozen development dependencies without lifecycle scripts (first run needs npm)'
# Development dependencies are needed even when the caller uses NODE_ENV=production.
NODE_ENV=development bun --no-env-file install --frozen-lockfile --ignore-scripts --prefer-offline --cache-dir "$BUN_INSTALL_CACHE_DIR"

step 'Acquiring checksum-pinned Herdr and rg (GitHub on a cache miss)'
bun --no-env-file run setup:herdr
bun --no-env-file run setup:rg

# Only this process and its children see the optional pinned search tool.
export PATH="$project_root/.tmp/rg:$PATH"
step 'Running repository tests, typecheck and publication integrity'
bun --no-env-file run check
step 'Checking an actual owned Herdr worker with bounded cleanup; no model calls'
bun --no-env-file run smoke:herdr

printf '\nInstallation complete. From this clone, run:\n'
printf '  bun --no-env-file run demo:terminal\n'
printf '  bun --no-env-file run demo\n'
printf '  bun --no-env-file run check:actual\n'
printf 'Optional rg for later shell commands: prepend this clone\047s .tmp/rg to PATH.\n'
printf 'Native Pi activation remains blocked. No credentials or models are needed.\n'
