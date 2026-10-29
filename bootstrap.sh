#!/bin/sh
# Public entrypoint: curl -fsSL https://raw.githubusercontent.com/bbawuah/lab-harness/main/bootstrap.sh | sh
# Runtime source archive is immutable and verified before extraction/execution.
set -eu
umask 077

main() {
  bootstrap_commit=TO_BE_PINNED
  bootstrap_sha256=TO_BE_PINNED
  bootstrap_install_only=0
  case "${1:-}" in '') ;; --install-only) bootstrap_install_only=1; shift;; *) bootstrap_fail 'Usage: bootstrap.sh [--install-only]';; esac
  [ "$#" -eq 0 ] || bootstrap_fail 'Usage: bootstrap.sh [--install-only]'
  [ "$bootstrap_commit" != TO_BE_PINNED ] || bootstrap_fail 'Development bootstrap has no runnable distribution pin yet.'
  case "$(uname -s)/$(uname -m)" in Darwin/arm64|Darwin/x86_64|Linux/x86_64) ;; *) bootstrap_fail 'Supported platforms: macOS arm64/x86_64, Linux x86_64. WSL remains unverified.';; esac
  for bootstrap_tool in curl tar mktemp diff find sed; do command -v "$bootstrap_tool" >/dev/null 2>&1 || bootstrap_fail "Required system utility missing: $bootstrap_tool"; done
  if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then bootstrap_fail 'SHA-256 verification needs sha256sum or shasum.'; fi
  [ -n "${HOME:-}" ] || bootstrap_fail 'HOME must identify your user directory.'
  bootstrap_data=${XDG_DATA_HOME:-$HOME/.local/share}
  case "$bootstrap_data" in /*) ;; *) bootstrap_fail 'XDG_DATA_HOME must be an absolute path.';; esac
  bootstrap_root=$bootstrap_data/lab-harness
  # Refuse symlinks in the owned installation path and all existing ancestors.
  bootstrap_cursor=$bootstrap_root
  while [ "$bootstrap_cursor" != / ]; do
    [ ! -L "$bootstrap_cursor" ] || bootstrap_fail "Refusing symlink installation path: $bootstrap_cursor"
    if [ -e "$bootstrap_cursor" ]; then [ -d "$bootstrap_cursor" ] || bootstrap_fail "Expected directory: $bootstrap_cursor"; fi
    bootstrap_cursor=${bootstrap_cursor%/*}; [ -n "$bootstrap_cursor" ] || bootstrap_cursor=/
  done
  mkdir -p "$bootstrap_root/releases"
  bootstrap_destination=$bootstrap_root/releases/$bootstrap_commit
  [ ! -L "$bootstrap_root/releases" ] && [ ! -L "$bootstrap_destination" ] || bootstrap_fail 'Unsafe release directory.'
  bootstrap_stage=$(mktemp -d "$bootstrap_root/releases/.download.XXXXXX")
  trap 'rm -rf "$bootstrap_stage"' EXIT HUP INT TERM
  bootstrap_archive=$bootstrap_stage/harness.tar.gz
  printf 'LAB: downloading pinned harness %s\n' "$bootstrap_commit"
  curl -fL --retry 2 --connect-timeout 15 --max-time 180 --max-filesize 16777216 \
    "https://codeload.github.com/bbawuah/lab-harness/tar.gz/$bootstrap_commit" -o "$bootstrap_archive" || bootstrap_fail 'Harness download failed; rerun to retry.'
  bootstrap_actual=$(bootstrap_hash "$bootstrap_archive")
  [ "$bootstrap_actual" = "$bootstrap_sha256" ] || bootstrap_fail 'Harness checksum mismatch; nothing executed.'
  mkdir "$bootstrap_stage/source"
  tar -xzf "$bootstrap_archive" --strip-components=1 -C "$bootstrap_stage/source" || bootstrap_fail 'Harness extraction failed.'
  if [ ! -d "$bootstrap_destination" ]; then
    mv "$bootstrap_stage/source" "$bootstrap_destination"
  else
    # Validate installed source against the verified archive before executing it.
    bootstrap_links=$(find "$bootstrap_destination" \( -name .tmp -o -name node_modules \) -prune -o -type l -print)
    [ -z "$bootstrap_links" ] || bootstrap_fail 'Unexpected symlink in installed source; move the release aside and rerun.'
    diff -qr -x .tmp -x node_modules "$bootstrap_stage/source" "$bootstrap_destination" >/dev/null || bootstrap_fail 'Installed release source changed or is partial; move it aside and rerun.'
  fi
  "$bootstrap_destination/install.sh" || bootstrap_fail 'Installation failed; rerun to reuse verified runtime caches.'
  bootstrap_launcher=$bootstrap_root/lab
  if [ -e "$bootstrap_launcher" ] || [ -L "$bootstrap_launcher" ]; then
    [ -f "$bootstrap_launcher" ] && [ ! -L "$bootstrap_launcher" ] && \
      head -n 2 "$bootstrap_launcher" | tail -n 1 | grep -qx '# LAB-HARNESS owned launcher' || bootstrap_fail 'Existing launcher is not LAB-owned; leaving it untouched.'
  fi
  # A stable launcher points at this immutable release; profile changes are explicit.
  printf '#!/bin/sh\n# LAB-HARNESS owned launcher\nexport LAB_WORKSPACE_STATE_ROOT=' > "$bootstrap_stage/lab"
  bootstrap_quote "$bootstrap_root/workspace" >> "$bootstrap_stage/lab"
  printf '\nexec ' >> "$bootstrap_stage/lab"
  bootstrap_quote "$bootstrap_destination/lab" >> "$bootstrap_stage/lab"
  printf ' "$@"\n' >> "$bootstrap_stage/lab"
  chmod 700 "$bootstrap_stage/lab"
  mv -f "$bootstrap_stage/lab" "$bootstrap_launcher"
  rm -rf "$bootstrap_stage"
  trap - EXIT HUP INT TERM
  printf '\nLAB is installed. Launcher: %s\n' "$bootstrap_launcher"
  printf 'To make lab available in this shell, explicitly run:\n  export PATH='
  bootstrap_quote "$bootstrap_root"
  printf ':"$PATH"\n'
  if [ "$bootstrap_install_only" = 0 ] && ( : </dev/tty ) 2>/dev/null; then
    # All downloaded script input has been parsed inside main. User input is TTY-only.
    exec "$bootstrap_launcher" </dev/tty >/dev/tty 2>/dev/tty
  fi
  printf 'Installation only (no controlling terminal or --install-only). Run the launcher in your terminal to configure a model.\n'
}
bootstrap_fail() { printf 'LAB install: %s\n' "$*" >&2; exit 1; }
bootstrap_hash() {
  if command -v sha256sum >/dev/null 2>&1; then bootstrap_result=$(sha256sum "$1"); else bootstrap_result=$(shasum -a 256 "$1"); fi
  printf '%s\n' "${bootstrap_result%% *}"
}
bootstrap_quote() { printf "'"; printf '%s' "$1" | sed "s/'/'\\\\''/g"; printf "'"; }
# Keep the invocation last: never read configuration answers from the script pipe.
main "$@"
