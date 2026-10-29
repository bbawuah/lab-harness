#!/bin/sh
# Sourced by install.sh and lab. project_root and lab_offline are caller inputs.
lab_fail() { printf 'LAB: %s\n' "$*" >&2; exit 1; }
lab_hash() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1";
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1";
  else lab_fail 'SHA-256 utility missing (sha256sum or shasum required).'; fi
}
lab_digest() { lab_hash_output=$(lab_hash "$1") || exit 1; printf '%s\n' "${lab_hash_output%% *}"; }
lab_directory() {
  [ ! -L "$1" ] || lab_fail "Refusing symlink directory: $1"
  if [ -e "$1" ]; then [ -d "$1" ] || lab_fail "Expected directory: $1";
  else mkdir -m 700 "$1" || lab_fail "Cannot create $1"; fi
}
lab_platform=$(uname -s)
lab_arch=$(uname -m)
case "$lab_platform/$lab_arch" in
  Darwin/arm64|Darwin/x86_64|Linux/x86_64) ;;
  *) lab_fail "Unsupported platform $lab_platform/$lab_arch; supports macOS arm64/x86_64 and Linux x86_64. WSL remains unverified." ;;
esac
lab_required_bun=$(cat "$project_root/.bun-version")
lab_bun=
lab_local_bun="$project_root/.tmp/bun/$lab_required_bun/bun"
lab_asset= lab_size= lab_archive_hash= lab_binary_hash=
while read -r lab_row_os lab_row_arch lab_row_asset lab_row_size lab_row_archive lab_row_binary; do
  if [ "$lab_row_os/$lab_row_arch" = "$lab_platform/$lab_arch" ]; then
    lab_asset=$lab_row_asset lab_size=$lab_row_size lab_archive_hash=$lab_row_archive lab_binary_hash=$lab_row_binary
  fi
done < "$project_root/contracts/bun-runtime.txt"
[ -n "$lab_asset" ] || lab_fail 'No pinned Bun artifact for this platform.'
lab_directory "$project_root/.tmp"
lab_directory "$project_root/.tmp/bun"
lab_directory "$project_root/.tmp/bun/$lab_required_bun"

if [ -e "$lab_local_bun" ] || [ -L "$lab_local_bun" ]; then
  [ -f "$lab_local_bun" ] && [ ! -L "$lab_local_bun" ] || lab_fail 'Unsafe local Bun entry.'
  if [ "$(lab_digest "$lab_local_bun")" = "$lab_binary_hash" ]; then lab_bun=$lab_local_bun;
  elif [ "$lab_offline" = 1 ]; then lab_fail 'Local Bun checksum mismatch; rerun online to repair.'; fi
elif command -v bun >/dev/null 2>&1; then
  # An existing exact runtime is optional; a different version is left untouched.
  lab_system_bun=$(command -v bun)
  if [ "$("$lab_system_bun" --no-env-file --version 2>/dev/null)" = "$lab_required_bun" ]; then lab_bun=$lab_system_bun; fi
fi
if [ -z "$lab_bun" ]; then
  [ "$lab_offline" = 0 ] || lab_fail 'Pinned Bun is missing; offline setup needs a complete verified cache.'
  command -v curl >/dev/null 2>&1 || lab_fail 'curl is required to bootstrap Bun.'
  command -v unzip >/dev/null 2>&1 || lab_fail 'unzip is required to bootstrap Bun.'
  lab_directory "$project_root/.tmp"
  lab_directory "$project_root/.tmp/bun"
  lab_directory "$project_root/.tmp/bun/$lab_required_bun"
  lab_stage=$(mktemp -d "$project_root/.tmp/bun/$lab_required_bun/download.XXXXXX") || exit 1
  trap 'rm -rf "$lab_stage"' EXIT HUP INT TERM
  printf 'LAB: acquiring verified project-local Bun %s\n' "$lab_required_bun" >&2
  curl -fL --retry 2 --connect-timeout 15 --max-time 180 --max-filesize "$lab_size" \
    "https://github.com/oven-sh/bun/releases/download/bun-v$lab_required_bun/$lab_asset" -o "$lab_stage/runtime.zip" || lab_fail 'Bun download failed; rerun to retry.'
  [ "$(wc -c < "$lab_stage/runtime.zip" | tr -d ' ')" = "$lab_size" ] || lab_fail 'Bun archive size mismatch.'
  [ "$(lab_digest "$lab_stage/runtime.zip")" = "$lab_archive_hash" ] || lab_fail 'Bun archive checksum mismatch.'
  unzip -p "$lab_stage/runtime.zip" "${lab_asset%.zip}/bun" > "$lab_stage/bun" || lab_fail 'Bun extraction failed.'
  [ "$(lab_digest "$lab_stage/bun")" = "$lab_binary_hash" ] || lab_fail 'Bun executable checksum mismatch.'
  chmod 700 "$lab_stage/bun"
  mv -f "$lab_stage/bun" "$lab_local_bun"
  rm -rf "$lab_stage"
  trap - EXIT HUP INT TERM
  lab_bun=$lab_local_bun
fi
[ "$("$lab_bun" --no-env-file --version)" = "$lab_required_bun" ] || lab_fail 'Pinned Bun version probe failed.'
