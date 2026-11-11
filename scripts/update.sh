#!/bin/sh
# Download completely before running the same verified release bootstrap as installation.
set -eu
umask 077
case "$#:${1:-}" in
  0:) ;;
  1:--help)
    printf 'Usage: lab update\nUpdate to the published pinned release without starting a chat.\nSettings, sessions and old releases are retained. Requires internet access.\n'
    exit 0 ;;
  *) printf 'Usage: lab update [--help]\nRun update separately from workspace options.\n' >&2; exit 2 ;;
esac
if [ "${LAB_INSTALL_OFFLINE:-0}" = 1 ]; then
  printf 'LAB update: unavailable in offline mode.\n' >&2
  exit 1
fi
command -v curl >/dev/null 2>&1 || { printf 'LAB update: curl is required.\n' >&2; exit 1; }
update_stage=$(mktemp -d "${TMPDIR:-/tmp}/lab-update.XXXXXX")
trap 'rm -rf "$update_stage"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'LAB: checking the published release...\n'
if ! curl --proto '=https' --proto-redir '=https' -fL --retry 2 --connect-timeout 15 --max-time 60 --max-filesize 1048576 \
  https://raw.githubusercontent.com/bbawuah/lab-harness/main/bootstrap.sh -o "$update_stage/bootstrap.sh"; then
  printf 'LAB update: download failed; the current installation was not changed.\n' >&2
  exit 1
fi
if [ ! -s "$update_stage/bootstrap.sh" ] || ! /bin/sh -n "$update_stage/bootstrap.sh"; then
  printf 'LAB update: invalid bootstrap; the current installation was not changed.\n' >&2
  exit 1
fi
if /bin/sh "$update_stage/bootstrap.sh" --install-only; then
  printf '\nLAB update complete. New sessions use the published release; existing sessions keep running.\n'
else
  update_status=$?
  printf 'LAB update failed. Check the installer output above before retrying.\n' >&2
  exit "$update_status"
fi
