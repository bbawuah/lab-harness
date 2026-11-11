#!/bin/sh
set -eu
umask 077
command_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
command_dir=$HOME/.local/bin
command_path=$command_dir/lab
for parent in "$HOME" "$HOME/.local" "$command_dir"; do
  if [ -L "$parent" ] || { [ -e "$parent" ] && [ ! -d "$parent" ]; }; then
    printf 'LAB: unsafe command directory. Use %s/lab directly.\n' "$command_root"
    exit 0
  fi
done
existing=$(command -v lab 2>/dev/null) || existing=
if [ -n "$existing" ] && [ "$existing" != "$command_path" ]; then
  printf 'LAB: existing lab command at %s was left untouched. Use %s/lab directly.\n' "$existing" "$command_root"
  exit 0
fi
owned=0
if [ -e "$command_path" ] || [ -L "$command_path" ]; then
  if [ -f "$command_path" ] && [ ! -L "$command_path" ] && head -n 2 "$command_path" | tail -n 1 | grep -qx '# LAB-HARNESS owned command shim'; then
    owned=1
  else
    printf 'LAB: existing %s is not LAB-owned; left untouched.\n' "$command_path"
    exit 0
  fi
fi
mkdir -p "$command_dir"
command_stage=$(mktemp "$command_dir/.lab.XXXXXX")
trap 'rm -f "$command_stage"' EXIT HUP INT TERM
printf '#!/bin/sh\n# LAB-HARNESS owned command shim\nexec ' > "$command_stage"
printf "'" >> "$command_stage"
printf '%s/lab' "$command_root" | sed "s/'/'\\\\''/g" >> "$command_stage"
printf "'" >> "$command_stage"
printf ' "$@"\n' >> "$command_stage"
chmod 700 "$command_stage"
if [ "$owned" = 1 ]; then mv -f "$command_stage" "$command_path"; else ln "$command_stage" "$command_path"; fi
printf 'LAB command installed: %s\nRun lab from any working folder.\n' "$command_path"
case ":$PATH:" in
  *":$command_dir:"*) ;;
  *) printf 'Add this line to your shell configuration and run it in this terminal:\n  export PATH="$HOME/.local/bin:$PATH"\n' ;;
esac
