#!/bin/sh
# LAB-HARNESS airgap qualification for the WSL2 target (docs/airgap-qualification.md).
# Read-only: no downloads, no sudo, no profile edits. It writes only its own report
# directory. The opt-in model test sends one fixed prompt; nothing else calls a model.
# The report is safe to copy out: $HOME becomes ~, user names in paths become <user>,
# proxy credentials, keys and long token-like strings are never printed.
set -u
umask 077
LC_ALL=C
export LC_ALL

q_script_version=1
q_usage() {
  printf '%s\n' 'Usage: qualify-airgap.sh [--out DIR] [--release DIR] [--model-test] [--browser-test] [--skip-smoke] [--help]' \
    '  --out DIR       write report.txt and report.json to DIR (default: <LAB data>/lab-harness/qualification/<UTC time>)' \
    '  --release DIR   qualify this release or checkout instead of the one the launcher points to' \
    '  --model-test    send ONE fixed prompt through the saved route (explicit opt-in)' \
    '  --browser-test  run the WSL -> Windows Edge fixture round trip when this release supports it' \
    '  --skip-smoke    do not run the owned Herdr smoke' \
    'Exit status: 0 no FAIL, 1 at least one FAIL, 2 usage error.'
}
q_out='' q_release='' q_model_test=0 q_browser_test=0 q_skip_smoke=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --out) [ "$#" -ge 2 ] && [ -n "$2" ] || { q_usage >&2; exit 2; }; q_out=$2; shift 2;;
    --release) [ "$#" -ge 2 ] && [ -n "$2" ] || { q_usage >&2; exit 2; }; q_release=$2; shift 2;;
    --model-test) q_model_test=1; shift;;
    --browser-test) q_browser_test=1; shift;;
    --skip-smoke) q_skip_smoke=1; shift;;
    --help|-h) q_usage; exit 0;;
    *) q_usage >&2; exit 2;;
  esac
done
[ -n "${HOME:-}" ] && [ "${HOME#/}" != "$HOME" ] || { printf 'qualify: HOME must be an absolute path.\n' >&2; exit 2; }

# Test hooks (documented in docs/airgap-qualification.md); defaults are the real system.
q_proc=${LAB_QUALIFY_PROC_ROOT:-/proc}
q_os_release=${LAB_QUALIFY_OS_RELEASE:-/etc/os-release}
q_uname_s=${LAB_QUALIFY_UNAME_S:-$(uname -s 2>/dev/null || echo unknown)}
q_uname_m=${LAB_QUALIFY_UNAME_M:-$(uname -m 2>/dev/null || echo unknown)}

q_data=${XDG_DATA_HOME:-$HOME/.local/share}
q_root=$q_data/lab-harness
q_stamp=$(date -u +%Y%m%dT%H%M%SZ)
if [ -z "$q_out" ]; then q_out=$q_root/qualification/$q_stamp; fi
case "$q_out" in /*) ;; *) q_out=$(pwd -P)/$q_out;; esac
[ ! -L "$q_out" ] || { printf 'qualify: refusing symlink report directory.\n' >&2; exit 2; }
mkdir -p "$q_out" || { printf 'qualify: cannot create the report directory.\n' >&2; exit 2; }
q_work=$(mktemp -d "$q_out/.work.XXXXXX") || { printf 'qualify: cannot create a work directory.\n' >&2; exit 2; }
trap 'rm -rf "$q_work"' EXIT
trap 'rm -rf "$q_work"; exit 130' HUP INT TERM
q_tsv=$q_work/results.tsv
q_txt=$q_out/report.txt
: > "$q_tsv"
: > "$q_txt"

# --- output and redaction -------------------------------------------------
q_home_re=$(printf '%s' "$HOME" | sed 's/[][\.*^$#]/\\&/g')
q_redact() {
  printf '%s' "$1" | tr '\n\t\r' '   ' | tr -d '\000-\010\013-\037\177' | sed \
    -e "s#${q_home_re}#~#g" \
    -e 's#/home/[^/ ]*#/home/<user>#g' \
    -e 's#/Users/[^/ ]*#/Users/<user>#g' \
    -e 's#\([A-Za-z]:\\\\*Users\\\\*\)[^\\ ]*#\1<user>#g' \
    -e 's#://[^/@ ]*@#://<redacted>@#g' \
    -e 's#[Bb]earer [^ ]*#Bearer <redacted>#g' \
    -e 's#[A-Za-z0-9_+-]\{32,\}#<redacted>#g'
}
q_record() {
  q_r_status=$1 q_r_id=$2
  q_r_detail=$(q_redact "$3")
  printf '%-8s %-22s %s\n' "$q_r_status" "$q_r_id" "$q_r_detail" | tee -a "$q_txt"
  printf '%s\t%s\t%s\n' "$q_r_status" "$q_r_id" "$q_r_detail" >> "$q_tsv"
}
q_section() { printf '\n== %s\n' "$1" | tee -a "$q_txt"; }
q_short() { printf '%.12s' "$1"; }
q_have() { command -v "$1" >/dev/null 2>&1; }

# Bounded execution without GNU timeout (macOS) as well as with it (WSL/Linux).
q_bounded() {
  q_b_secs=$1; shift
  if q_have timeout; then timeout -k 5 "$q_b_secs" "$@"; return $?; fi
  "$@" &
  q_b_pid=$!
  ( sleep "$q_b_secs"; kill -TERM "$q_b_pid" 2>/dev/null; sleep 5; kill -KILL "$q_b_pid" 2>/dev/null ) >/dev/null 2>&1 &
  q_b_watch=$!
  wait "$q_b_pid"; q_b_rc=$?
  kill "$q_b_watch" 2>/dev/null; wait "$q_b_watch" 2>/dev/null
  return "$q_b_rc"
}
q_sha() {
  if q_have sha256sum; then q_sha_out=$(sha256sum "$1" 2>/dev/null) || return 1
  elif q_have shasum; then q_sha_out=$(shasum -a 256 "$1" 2>/dev/null) || return 1
  else return 1; fi
  printf '%s\n' "${q_sha_out%% *}"
}
# Expected hash from a pretty-printed contract: object whose fields match k=v[,k=v].
q_contract_hash() {
  [ -f "$1" ] || return 0
  awk -v spec="$2" -v field="$3" '
    BEGIN { n = split(spec, pairs, ",") }
    /\{/ { split("", seen) }
    {
      if (match($0, /"[A-Za-z0-9_]+"[ ]*:[ ]*"[^"]*"/)) {
        kv = substr($0, RSTART, RLENGTH); k = kv; sub(/^"/, "", k); sub(/".*/, "", k)
        v = kv; sub(/^"[^"]*"[ ]*:[ ]*"/, "", v); sub(/"$/, "", v); seen[k] = v
      }
    }
    /\}/ {
      ok = 1
      for (i = 1; i <= n; i++) { split(pairs[i], p, "="); if (seen[p[1]] != p[2]) ok = 0 }
      if (ok && seen[field] != "") { print seen[field]; exit }
    }' "$1"
}
q_json_field() { # first "key": "value" in a JSON file (string values only)
  [ -f "$1" ] || return 0
  sed -n "s/.*\"$2\"[ ]*:[ ]*\"\([^\"]*\)\".*/\1/p" "$1" | head -n 1
}
q_safe_value() { # only short identifier-like values are ever printed from config
  case "$1" in ''|*[!A-Za-z0-9._:-]*) printf '%s' '<not shown>';; *) printf '%.80s' "$1";; esac
}
# ls -ldn on one known path: owner uid and mode without GNU/BSD stat differences.
# shellcheck disable=SC2012
q_owned() { [ "$(LC_ALL=C ls -ldn "$1" 2>/dev/null | awk '{print $3}')" = "$(id -u)" ]; }
# shellcheck disable=SC2012
q_mode() { LC_ALL=C ls -ldn "$1" 2>/dev/null | awk '{print substr($1, 1, 10)}'; }
q_url_hostport() { q_u=${1#*://}; q_u=${q_u##*@}; q_u=${q_u%%/*}; q_u=${q_u%%\?*}; printf '%s' "$q_u"; }
q_url_host() {
  q_h=$(q_url_hostport "$1")
  case "$q_h" in \[*) q_h=${q_h#\[}; q_h=${q_h%%\]*};; *) q_h=${q_h%%:*};; esac
  printf '%s' "$q_h"
}
q_no_proxy_match() { # host; true when NO_PROXY/no_proxy excludes it from the proxy
  q_np=${NO_PROXY:-${no_proxy:-}}
  [ -n "$q_np" ] || return 1
  q_np_old=$IFS; IFS=','
  for q_np_entry in $q_np; do
    q_np_entry=$(printf '%s' "$q_np_entry" | tr -d ' '); q_np_entry=${q_np_entry%%:*}
    case "$q_np_entry" in
      '') ;;
      '*') IFS=$q_np_old; return 0;;
      .*) case "$1" in *"$q_np_entry"|"${q_np_entry#.}") IFS=$q_np_old; return 0;; esac;;
      *) case "$1" in "$q_np_entry"|*".$q_np_entry") IFS=$q_np_old; return 0;; esac;;
    esac
  done
  IFS=$q_np_old; return 1
}

printf 'LAB airgap qualification %s (script v%s)\n' "$q_stamp" "$q_script_version" | tee -a "$q_txt"
printf 'Options: model-test=%s browser-test=%s smoke=%s\n' "$q_model_test" "$q_browser_test" "$((1 - q_skip_smoke))" | tee -a "$q_txt"

# --- 1. environment -------------------------------------------------------
q_section 'Environment'
q_wsl=0 q_wsl_version=
q_osrelease=$(cat "$q_proc/sys/kernel/osrelease" 2>/dev/null || uname -r 2>/dev/null || true)
case "$q_osrelease" in
  *[Mm]icrosoft*[Ww][Ss][Ll]2*) q_wsl=1 q_wsl_version=2;;
  *microsoft-standard*) q_wsl=1 q_wsl_version=2;;
  *Microsoft*) q_wsl=1 q_wsl_version=1;;
esac
if [ "$q_wsl" = 0 ] && grep -qi microsoft "$q_proc/version" 2>/dev/null; then q_wsl=1 q_wsl_version=unknown; fi
q_kernel_short=$(printf '%s' "$q_osrelease" | cut -c1-80)
if [ "$q_wsl" = 1 ] && [ "$q_wsl_version" = 2 ]; then q_record PASS env.wsl "WSL2 (kernel $q_kernel_short)"
elif [ "$q_wsl" = 1 ]; then q_record FAIL env.wsl "WSL$q_wsl_version detected (kernel $q_kernel_short); LAB needs WSL2: wsl --set-version <distro> 2"
else q_record SKIPPED env.wsl "not WSL ($q_uname_s, kernel $q_kernel_short); WSL checks do not apply"; fi

q_distro=$(sed -n 's/^PRETTY_NAME="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$q_os_release" 2>/dev/null | head -n 1)
[ -n "$q_distro" ] || q_distro=$q_uname_s
q_record INFO env.distro "$q_distro${WSL_DISTRO_NAME:+ (WSL distro name: $WSL_DISTRO_NAME)}"

case "$q_uname_s/$q_uname_m" in
  Linux/x86_64) q_record PASS env.arch "Linux x86_64";;
  Darwin/arm64|Darwin/x86_64) q_record INFO env.arch "$q_uname_s $q_uname_m (supported for development, not the airgap target)";;
  *) q_record FAIL env.arch "$q_uname_s $q_uname_m is unsupported; LAB needs Linux x86_64 inside WSL2";;
esac

q_interop=0
if [ "$q_wsl" = 1 ]; then
  q_interop_file=
  for q_f in "$q_proc/sys/fs/binfmt_misc/WSLInterop" "$q_proc/sys/fs/binfmt_misc/WSLInterop-late"; do
    [ -e "$q_f" ] && { q_interop_file=$q_f; break; }
  done
  q_interop_state=fail
  if [ -z "$q_interop_file" ]; then q_interop_detail='WSLInterop is not registered: Windows executables (Edge, agent-browser.exe) cannot run. Check [interop] enabled in /etc/wsl.conf'
  elif head -n 1 "$q_interop_file" 2>/dev/null | grep -qx enabled; then q_interop=1 q_interop_state=pass q_interop_detail="enabled (${q_interop_file##*/})"
  else q_interop_detail="${q_interop_file##*/} is registered but disabled: Windows executables cannot run"; fi
  if [ "$q_interop_state" = pass ]; then q_record PASS env.interop "$q_interop_detail"
  elif [ "$q_browser_test" = 1 ]; then q_record FAIL env.interop "$q_interop_detail"
  else q_record WARN env.interop "$q_interop_detail (only the Edge bridge needs it)"; fi
else q_record SKIPPED env.interop "not WSL"; fi

q_win_root=${LAB_QUALIFY_WINDOWS_ROOT:-}
# shellcheck disable=SC1003 # a literal C:\ path
if [ -z "$q_win_root" ] && [ "$q_wsl" = 1 ] && q_have wslpath; then q_win_root=$(wslpath -u 'C:\' 2>/dev/null || true); q_win_root=${q_win_root%/}; fi
[ -n "$q_win_root" ] || q_win_root=/mnt/c
if [ "$q_wsl" = 1 ] && [ "$q_interop" = 1 ]; then
  q_wslexe=$(command -v wsl.exe 2>/dev/null || true)
  [ -n "$q_wslexe" ] || { [ -x "$q_win_root/Windows/System32/wsl.exe" ] && q_wslexe=$q_win_root/Windows/System32/wsl.exe; }
  if [ -n "$q_wslexe" ]; then
    q_wsl_tool=$( (cd "$q_win_root" 2>/dev/null || cd /; q_bounded 15 "$q_wslexe" --version) 2>/dev/null | tr -d '\000\r' | head -n 1)
    if [ -n "$q_wsl_tool" ]; then q_record INFO env.wsl-version "$q_wsl_tool"; else q_record INFO env.wsl-version "wsl.exe --version gave no output (older inbox WSL)"; fi
  else q_record INFO env.wsl-version "wsl.exe not found via interop"; fi
  q_cmd=$q_win_root/Windows/System32/cmd.exe
  if [ -f "$q_cmd" ]; then
    q_winver=$( (cd "$q_win_root" 2>/dev/null || cd /; q_bounded 15 "$q_cmd" /d /c ver) 2>/dev/null | tr -d '\r' | sed '/^$/d' | head -n 1)
    if [ -n "$q_winver" ]; then q_record PASS env.interop-run "Windows executable ran: $q_winver"
    else q_record WARN env.interop-run "cmd.exe /c ver did not run through interop"; fi
  fi
fi

if [ -r "$q_proc/1/comm" ]; then
  if [ "$(cat "$q_proc/1/comm" 2>/dev/null)" = systemd ]; then q_record INFO env.systemd "systemd is PID 1"
  else q_record INFO env.systemd "systemd is not PID 1 (LAB does not need it)"; fi
fi

q_missing=
for q_tool in tar mktemp find sed awk grep df uname diff ln head tail cut tr wc id ls sort; do q_have "$q_tool" || q_missing="$q_missing $q_tool"; done
q_have sha256sum || q_have shasum || q_missing="$q_missing sha256sum|shasum"
if [ -z "$q_missing" ]; then q_record PASS env.tools "required utilities present"
else q_record FAIL env.tools "missing required utilities:$q_missing"; fi
q_optional=
for q_tool in curl getent timeout wslpath; do q_have "$q_tool" || q_optional="$q_optional $q_tool"; done
if [ -n "$q_optional" ]; then q_record INFO env.optional-tools "not found:$q_optional (some checks are skipped)"; fi

q_record INFO env.paths "HOME=$HOME XDG_DATA_HOME=${XDG_DATA_HOME:-<unset>} data root=$q_root"
case "$HOME/" in /mnt/[a-z]/*) q_record FAIL env.home "HOME is on the Windows filesystem; use the Linux home (/home/<user>)";; esac
case "$q_root/" in
  /*) case "$q_root/" in /mnt/[a-z]/*) q_record FAIL env.data-root "LAB data is on the Windows filesystem (/mnt/...): permissions and sockets break; unset XDG_DATA_HOME";; esac;;
  *) q_record FAIL env.data-root "XDG_DATA_HOME must be absolute";;
esac
q_df_dir=$q_root
while [ ! -d "$q_df_dir" ] && [ "$q_df_dir" != / ] && [ -n "$q_df_dir" ]; do q_df_dir=${q_df_dir%/*}; [ -n "$q_df_dir" ] || q_df_dir=/; done
q_free_kb=$(df -Pk "$q_df_dir" 2>/dev/null | awk 'NR==2 {print $4}')
case "$q_free_kb" in
  ''|*[!0-9]*) q_record WARN env.disk "free space unknown";;
  *) q_free_mb=$((q_free_kb / 1024))
     if [ "$q_free_mb" -lt 1024 ]; then q_record FAIL env.disk "${q_free_mb} MiB free at the LAB data root; need at least 1024 MiB"
     elif [ "$q_free_mb" -lt 4096 ]; then q_record WARN env.disk "${q_free_mb} MiB free at the LAB data root (4096 MiB recommended)"
     else q_record PASS env.disk "${q_free_mb} MiB free at the LAB data root"; fi;;
esac

# --- 2. installation ------------------------------------------------------
q_section 'Installation'
q_releases='' q_release_count=0
if [ -d "$q_root/releases" ]; then
  for q_d in "$q_root"/releases/*; do
    q_n=${q_d##*/}
    [ -d "$q_d" ] && [ ! -L "$q_d" ] && [ "${#q_n}" -eq 40 ] || continue
    case "$q_n" in *[!0-9a-f]*) continue;; esac
    q_releases="$q_releases $(q_short "$q_n")"; q_release_count=$((q_release_count + 1))
  done
fi
if [ "$q_release_count" -gt 0 ]; then q_record INFO install.releases "$q_release_count installed:$q_releases"
else q_record INFO install.releases "no releases under $q_root/releases"; fi

q_launcher=$q_root/lab q_launcher_commit='' q_state_root=''
if [ -f "$q_launcher" ] && [ ! -L "$q_launcher" ] && [ "$(sed -n 2p "$q_launcher")" = '# LAB-HARNESS owned launcher' ]; then
  q_launcher_commit=$(sed -n "s#^exec '.*/releases/\([0-9a-f]\{40\}\)/lab' \"\$@\"\$#\1#p" "$q_launcher" | head -n 1)
  q_state_root=$(sed -n "s#^export LAB_WORKSPACE_STATE_ROOT='\(.*\)'\$#\1#p" "$q_launcher" | head -n 1)
  if ! q_owned "$q_launcher"; then q_record FAIL install.launcher "launcher is not owned by this user"
  elif [ -n "$q_launcher_commit" ] && [ -d "$q_root/releases/$q_launcher_commit" ]; then q_record PASS install.launcher "LAB-owned launcher -> release $(q_short "$q_launcher_commit")"
  else q_record FAIL install.launcher "LAB-owned launcher points to a missing release; reinstall the bundle"; fi
elif [ -e "$q_launcher" ] || [ -L "$q_launcher" ]; then q_record FAIL install.launcher "$q_launcher exists but is not the LAB-owned launcher"
elif [ -n "$q_release" ]; then q_record INFO install.launcher "no launcher; qualifying --release only"
else q_record FAIL install.launcher "no launcher at $q_launcher; install the bundle first"; fi

if [ -n "$q_release" ]; then
  q_rel=$(CDPATH='' cd -- "$q_release" 2>/dev/null && pwd -P) || q_rel=''
  [ -n "$q_rel" ] || q_record FAIL install.release "--release directory does not exist"
elif [ -n "$q_launcher_commit" ] && [ -d "$q_root/releases/$q_launcher_commit" ]; then q_rel=$q_root/releases/$q_launcher_commit
else q_rel=; fi
q_rel_id=
if [ -n "$q_rel" ]; then
  q_rel_id=${q_rel##*/}
  if [ -d "$q_rel/.git" ] && q_have git; then q_rel_id=$(git -C "$q_rel" rev-parse HEAD 2>/dev/null || printf '%s' "$q_rel_id"); fi
  q_rel_version=$(q_json_field "$q_rel/package.json" version)
  if [ -f "$q_rel/lab" ] && [ -f "$q_rel/install.sh" ] && [ -d "$q_rel/contracts" ]; then
    q_record PASS install.release "release $(q_short "$q_rel_id") (harness ${q_rel_version:-unknown})"
  else q_record FAIL install.release "release $(q_short "$q_rel_id") is incomplete (lab, install.sh or contracts missing)"; fi
  if [ -f "$q_rel/.tmp/bundle-receipt.json" ]; then q_record PASS install.manifest "installed from the offline bundle (receipt present)"
  else q_record SKIPPED install.manifest "no bundle receipt in this release (installed without the offline bundle)"; fi
  if grep -q -- '--version' "$q_rel/lab" 2>/dev/null; then
    q_ver=$(q_bounded 30 "$q_rel/lab" --version 2>/dev/null | head -n 1)
    if [ -n "$q_ver" ]; then q_record PASS install.version "lab --version: $q_ver"
    else q_record FAIL install.version "lab --version produced no output"; fi
  else q_record SKIPPED install.version "this release has no lab --version (added by the release-bundle work)"; fi
fi

q_shim=$HOME/.local/bin/lab
q_resolved=$(command -v lab 2>/dev/null || true)
if [ -f "$q_shim" ] && [ ! -L "$q_shim" ] && [ "$(sed -n 2p "$q_shim")" = '# LAB-HARNESS owned command shim' ]; then
  if ! q_owned "$q_shim"; then q_record FAIL install.command "$q_shim is not owned by this user"
  elif [ "$q_resolved" = "$q_shim" ]; then q_record PASS install.command "lab resolves to the LAB-owned $q_shim"
  elif [ -n "$q_resolved" ]; then q_record WARN install.command "lab on PATH is $q_resolved, not the LAB-owned shim"
  else q_record WARN install.command "$HOME/.local/bin is not on PATH; add: export PATH=\"\$HOME/.local/bin:\$PATH\""; fi
elif [ -e "$q_shim" ]; then q_record WARN install.command "$q_shim exists but is not LAB-owned; use $q_launcher"
elif [ -n "$q_resolved" ]; then q_record WARN install.command "lab on PATH is $q_resolved (no LAB-owned shim)"
else q_record WARN install.command "no lab command; run $q_launcher directly"; fi
q_win_path=$(printf '%s' "${PATH:-}" | tr ':' '\n' | grep -c '^/mnt/[a-z]/' || true)
if [ "$q_wsl" = 1 ]; then q_record INFO install.path "PATH has $q_win_path Windows entries (appendWindowsPath)"; fi

# --- 3. runtimes ----------------------------------------------------------
q_section 'Runtimes'
case "$q_uname_s" in Linux) q_cp=linux q_hos=linux;; Darwin) q_cp=darwin q_hos=macos;; *) q_cp=unknown q_hos=unknown;; esac
case "$q_uname_m" in x86_64|amd64) q_ca=x64 q_ha=x86_64;; arm64|aarch64) q_ca=arm64 q_ha=aarch64;; *) q_ca=unknown q_ha=unknown;; esac
q_bun=
q_check_binary() { # id label path expected-hash optional(0/1)
  if [ -z "$4" ]; then q_record SKIPPED "$1" "$2: no pinned artifact for $q_cp/$q_ca in this release"; return 1; fi
  if [ ! -e "$3" ]; then
    if [ "$5" = 1 ]; then q_record SKIPPED "$1" "$2 not installed (optional)"; else q_record FAIL "$1" "$2 missing at $3; reinstall the release"; fi
    return 1
  fi
  if [ -L "$3" ] || [ ! -f "$3" ]; then q_record FAIL "$1" "$2 is not a regular file"; return 1; fi
  if ! q_owned "$3"; then q_record FAIL "$1" "$2 is not owned by this user"; return 1; fi
  q_actual=$(q_sha "$3") || { q_record FAIL "$1" "$2 could not be hashed"; return 1; }
  if [ "$q_actual" != "$4" ]; then q_record FAIL "$1" "$2 hash $(q_short "$q_actual") does not match the contract $(q_short "$4")"; return 1; fi
  if [ ! -x "$3" ]; then q_record FAIL "$1" "$2 matches its hash but is not executable"; return 1; fi
  q_record PASS "$1" "$2 sha256 $(q_short "$4") matches the contract"
}
if [ -z "$q_rel" ]; then
  for q_id in bun herdr rg fd pi; do q_record FAIL "runtime.$q_id" "no installed release to verify"; done
else
  q_bun_version=$(cat "$q_rel/.bun-version" 2>/dev/null || true)
  q_bun_hash=$(awk -v os="$q_uname_s" -v arch="$q_uname_m" '$1 == os && $2 == arch {print $6}' "$q_rel/contracts/bun-runtime.txt" 2>/dev/null)
  q_bun_path=$q_rel/.tmp/bun/$q_bun_version/bun
  if [ -e "$q_bun_path" ]; then
    q_check_binary runtime.bun "Bun $q_bun_version" "$q_bun_path" "$q_bun_hash" 0 && q_bun=$q_bun_path
  elif q_have bun && [ -n "$q_bun_version" ] && [ "$(bun --no-env-file --version 2>/dev/null)" = "$q_bun_version" ]; then
    q_bun=$(command -v bun); q_record WARN runtime.bun "no project-local Bun; using system Bun $q_bun_version (accepted by the launcher, hash not pinned)"
  else q_record FAIL runtime.bun "Bun ${q_bun_version:-?} missing at .tmp/bun; reinstall the release"; fi
  q_check_binary runtime.herdr "Herdr" "$q_rel/.tmp/herdr/herdr" "$(q_contract_hash "$q_rel/contracts/herdr-source.json" "name=herdr-$q_hos-$q_ha" sha256)" 0
  q_check_binary runtime.rg "ripgrep" "$q_rel/.tmp/rg/rg" "$(q_contract_hash "$q_rel/contracts/ripgrep-source.json" "platform=$q_cp,arch=$q_ca" binarySHA256)" 0
  q_check_binary runtime.fd "fd" "$q_rel/.tmp/fd/fd" "$(q_contract_hash "$q_rel/contracts/fd-source.json" "platform=$q_cp,arch=$q_ca" binarySHA256)" 0
  q_pi_version=$(q_json_field "$q_rel/contracts/pi-runtime.json" version)
  q_pi_ok=0
  q_check_binary runtime.pi "Pi $q_pi_version" "$q_rel/.tmp/pi/$q_pi_version/$q_cp-$q_ca/pi/pi" "$(q_contract_hash "$q_rel/contracts/pi-runtime.json" "platform=$q_cp,arch=$q_ca" binarySHA256)" 0 && q_pi_ok=1
  q_check_binary runtime.agent-browser "agent-browser (Linux)" "$q_rel/.tmp/browser/agent-browser" "$(q_contract_hash "$q_rel/contracts/agent-browser-source.json" "platform=$q_cp,arch=$q_ca" sha256)" 1
fi

q_bun_run() { # run a Bun program from the release, read-only (no transpiler or install cache writes)
  (cd "$q_rel" && export BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 BUN_INSTALL_CACHE_DIR="$q_work/bun-cache" && "$@")
}
if [ -n "$q_bun" ] && [ "${q_pi_ok:-0}" = 1 ]; then
  export LAB_Q_REL="$q_rel"
  q_pi_tree=$(q_bun_run q_bounded 120 "$q_bun" --no-env-file --no-install -e '
    try { const m = await import(process.env.LAB_Q_REL + "/src/runtime/pi.ts"); const r = m.verifyPiRuntime(); console.log("ok " + r.version); }
    catch (e) { console.log("fail " + String(e?.message ?? e).split("\n")[0].slice(0, 200)); }' 2>/dev/null | tail -n 1)
  case "$q_pi_tree" in
    ok*) q_record PASS runtime.pi-tree "Pi bundle tree (every file) matches the contract";;
    *) q_record FAIL runtime.pi-tree "Pi bundle tree check failed: ${q_pi_tree#fail }";;
  esac
elif [ -n "$q_rel" ]; then q_record SKIPPED runtime.pi-tree "needs a verified Bun and Pi executable"; fi

if [ "$q_skip_smoke" = 1 ]; then q_record SKIPPED runtime.herdr-smoke "--skip-smoke"
elif [ -z "$q_bun" ] || [ -z "$q_rel" ]; then q_record SKIPPED runtime.herdr-smoke "needs a verified Bun and release"
elif [ ! -f "$q_rel/scripts/herdr/smoke.ts" ]; then q_record SKIPPED runtime.herdr-smoke "release has no scripts/herdr/smoke.ts"
else
  q_smoke_start=$(date +%s)
  if q_bun_run q_bounded 180 "$q_bun" --no-env-file --no-install scripts/herdr/smoke.ts > "$q_work/smoke.log" 2>&1; then
    q_record PASS runtime.herdr-smoke "owned Herdr worker started and was cleaned up in $(( $(date +%s) - q_smoke_start ))s (no model)"
  else
    q_record FAIL runtime.herdr-smoke "Herdr smoke failed: $(grep -v '^[[:space:]]*[{}]' "$q_work/smoke.log" | head -n 2 | cut -c1-200)"
  fi
fi

# --- 4. network and model route ------------------------------------------
q_section 'Network and model route'
q_proxy_any=0
for q_var in HTTPS_PROXY https_proxy HTTP_PROXY http_proxy ALL_PROXY all_proxy; do
  eval "q_val=\${$q_var:-}"
  [ -n "$q_val" ] || continue
  q_proxy_any=1
  q_hp=$(q_url_hostport "$q_val")
  case "$q_val" in *@*) q_cred=' (credentials present, not shown)';; *) q_cred=;; esac
  q_record INFO "net.proxy" "$q_var set: ${q_hp:-<unparsed>}$q_cred"
done
for q_var in NO_PROXY no_proxy; do
  eval "q_val=\${$q_var:-}"
  [ -n "$q_val" ] && q_record INFO net.no-proxy "$q_var: $(printf '%s' "$q_val" | tr -d ' ' | cut -c1-300)"
done
[ "$q_proxy_any" = 1 ] || q_record INFO net.proxy "no proxy variables set (direct connections)"
q_ca_any=0
for q_var in NODE_EXTRA_CA_CERTS SSL_CERT_FILE SSL_CERT_DIR CURL_CA_BUNDLE REQUESTS_CA_BUNDLE; do
  eval "q_val=\${$q_var:-}"
  [ -n "$q_val" ] || continue
  q_ca_any=1
  if [ -f "$q_val" ] && [ -r "$q_val" ]; then
    q_certs=$(grep -c 'BEGIN CERTIFICATE' "$q_val" 2>/dev/null || true)
    if [ "${q_certs:-0}" -gt 0 ]; then q_record PASS net.ca "$q_var=$q_val ($q_certs certificates)"
    else q_record FAIL net.ca "$q_var=$q_val contains no PEM certificate"; fi
  elif [ -d "$q_val" ]; then q_record INFO net.ca "$q_var=$q_val (directory)"
  else q_record FAIL net.ca "$q_var=$q_val is not a readable file"; fi
done
[ "$q_ca_any" = 1 ] || q_record INFO net.ca "no extra CA variables set (system trust store only)"
if [ -n "$q_rel" ] && { [ "$q_proxy_any" = 1 ] || [ -n "${NODE_EXTRA_CA_CERTS:-}" ]; }; then
  if grep -qs 'HTTPS_PROXY\|NODE_EXTRA_CA_CERTS' "$q_rel/src/pi/workspace.ts" "$q_rel/src/pi/workspace-config.ts"; then
    q_record PASS net.passthrough "this release passes proxy/CA variables to Pi"
  else q_record WARN net.passthrough "this release does not pass proxy/CA variables into Pi; model calls through a proxy may fail (fixed by the Azure route work)"; fi
fi

[ -n "$q_state_root" ] || q_state_root=${LAB_WORKSPACE_STATE_ROOT:-$HOME/.local/share/lab-harness/workspace}
q_route=$q_state_root/route.json q_key=$q_state_root/key q_endpoint='' q_route_ok=0
if [ ! -f "$q_route" ]; then q_record FAIL route.saved "no saved model route; run: lab --configure"
else
  q_kind=$(q_json_field "$q_route" kind); q_endpoint=$(q_json_field "$q_route" endpoint); q_model=$(q_json_field "$q_route" model)
  q_extra=
  for q_field in deployment deploymentName apiVersion auth authMode authHeader headerName; do
    q_v=$(q_json_field "$q_route" "$q_field"); [ -z "$q_v" ] || q_extra="$q_extra $q_field=$(q_safe_value "$q_v")"
  done
  q_fields=$(grep -o '"[A-Za-z0-9_]*"[ ]*:' "$q_route" | tr -d '": ' | sort -u | tr "\n" " " | sed "s/ *$//")
  if [ -n "$q_kind" ] && [ -n "$q_endpoint" ] && [ -n "$q_model" ]; then
    q_route_ok=1
    q_record PASS route.saved "kind=$(q_safe_value "$q_kind") endpoint host=$(q_url_host "$q_endpoint") model=$(q_safe_value "$q_model")$q_extra"
  else q_record FAIL route.saved "route.json is incomplete (kind, endpoint and model are required)"; fi
  q_record INFO route.fields "fields: $q_fields"
  [ "$(q_mode "$q_route")" = '-rw-------' ] || q_record FAIL route.private "route.json is not private (mode 0600 expected)"
  if [ ! -f "$q_key" ]; then q_record FAIL route.key "no private key file; run: lab --configure"
  elif [ "$(q_mode "$q_key")" != '-rw-------' ]; then q_record FAIL route.key "key file is not private (mode 0600 expected)"
  elif [ -s "$q_key" ]; then q_record PASS route.key "private key file present (0600, content not read)"
  else q_record INFO route.key "key file is empty (unauthenticated route, or the credential comes from a command)"; fi
fi

if [ "$q_route_ok" = 1 ]; then
  q_host=$(q_url_host "$q_endpoint")
  q_via_proxy=0
  case "$q_endpoint" in https:*) [ -n "${HTTPS_PROXY:-${https_proxy:-}}" ] && q_via_proxy=1;; *) [ -n "${HTTP_PROXY:-${http_proxy:-}}" ] && q_via_proxy=1;; esac
  q_no_proxy_match "$q_host" && q_via_proxy=0
  case "$q_host" in
    *[!0-9.]*) if ! q_have getent; then q_record SKIPPED net.dns "getent not available"
               elif getent hosts "$q_host" >/dev/null 2>&1; then q_record PASS net.dns "$q_host resolves"
               elif [ "$q_via_proxy" = 1 ]; then q_record INFO net.dns "$q_host does not resolve locally; the proxy resolves it"
               else q_record FAIL net.dns "$q_host does not resolve and no proxy applies; check DNS or HTTPS_PROXY/NO_PROXY"; fi;;
    *) q_record SKIPPED net.dns "endpoint is an IP address";;
  esac
  q_path_note=direct; [ "$q_via_proxy" = 1 ] && q_path_note='via proxy'
  if q_have curl; then
    q_curl() { curl -sS -o /dev/null -w '%{http_code} %{time_total}' --connect-timeout 10 --max-time 20 "$@" "$q_endpoint" 2>/dev/null; }
    q_cr=$(q_curl); q_crc=$?
    if [ "$q_crc" = 60 ] || [ "$q_crc" = 77 ]; then
      if [ -n "${NODE_EXTRA_CA_CERTS:-}" ] && [ -f "$NODE_EXTRA_CA_CERTS" ]; then
        q_cr=$(q_curl --cacert "$NODE_EXTRA_CA_CERTS"); q_crc=$?
        [ "$q_crc" = 0 ] && q_cr="$q_cr (trusted only with NODE_EXTRA_CA_CERTS)"
      fi
    fi
    case "$q_crc" in
      0) q_record PASS net.endpoint "curl $q_path_note: TLS/HTTP ok, HTTP ${q_cr%% *} in ${q_cr#* }s (any HTTP status proves reachability; 401/404 are normal without a key)";;
      5) q_record FAIL net.endpoint "curl: cannot resolve the proxy host";;
      6) q_record FAIL net.endpoint "curl: cannot resolve $q_host";;
      7) q_record FAIL net.endpoint "curl $q_path_note: connection refused or no route to host";;
      28) q_record FAIL net.endpoint "curl $q_path_note: timed out (firewall, proxy or NO_PROXY?)";;
      35) q_record FAIL net.endpoint "curl $q_path_note: TLS handshake failed (TLS inspection or protocol mismatch?)";;
      56) q_record FAIL net.endpoint "curl $q_path_note: proxy refused the CONNECT or reset the connection";;
      60|77) q_record FAIL net.endpoint "curl: certificate not trusted; set NODE_EXTRA_CA_CERTS to the corporate CA bundle (PEM)";;
      *) q_record FAIL net.endpoint "curl $q_path_note: failed (curl exit $q_crc)";;
    esac
  else q_record SKIPPED net.endpoint "curl not available"; fi
  if [ -n "$q_bun" ]; then
    export LAB_Q_URL="$q_endpoint"
    q_bf=$(q_bun_run q_bounded 30 "$q_bun" --no-env-file --no-install -e '
      try { const r = await fetch(process.env.LAB_Q_URL, { redirect: "manual", signal: AbortSignal.timeout(20000) }); console.log("ok " + r.status); }
      catch (e) { console.log("fail " + String(e?.code ?? e?.name ?? "error").slice(0, 80)); }' 2>/dev/null | tail -n 1)
    case "$q_bf" in
      ok*) q_record PASS net.endpoint-runtime "Bun fetch (the runtime Pi uses): HTTP ${q_bf#ok }";;
      '') q_record FAIL net.endpoint-runtime "Bun fetch did not finish";;
      *) q_record FAIL net.endpoint-runtime "Bun fetch failed: ${q_bf#fail } (proxy, NO_PROXY or NODE_EXTRA_CA_CERTS?)";;
    esac
  else q_record SKIPPED net.endpoint-runtime "needs a verified Bun"; fi
else q_record SKIPPED net.endpoint "no complete saved route"; fi

# --- 5. optional model test ----------------------------------------------
if [ "$q_model_test" = 1 ]; then
  q_section 'Model test (one fixed prompt)'
  if [ "$q_route_ok" != 1 ]; then q_record FAIL model.prompt "no complete saved route"
  elif [ -z "$q_bun" ] || [ "${q_pi_ok:-0}" != 1 ]; then q_record FAIL model.prompt "needs a verified Bun and Pi"
  else
    mkdir -p "$q_work/model/home" "$q_work/model/agent" "$q_work/model/cwd"
    export LAB_Q_REL="$q_rel" LAB_Q_STATE="$q_state_root" LAB_Q_WORK="$q_work/model"
    q_mt=$(q_bun_run q_bounded 150 "$q_bun" --no-env-file --no-install -e '
      const { join } = await import("node:path"); const { writeFileSync } = await import("node:fs");
      const rel = process.env.LAB_Q_REL, work = process.env.LAB_Q_WORK;
      const say = (...p) => console.log(p.join("\t"));
      try {
        const cfg = await import(rel + "/src/pi/workspace-config.ts");
        const { verifyPiRuntime } = await import(rel + "/src/runtime/pi.ts");
        const { route, key } = cfg.loadWorkspaceRoute(process.env.LAB_Q_STATE);
        const models = cfg.modelsForRoute(route);
        const provider = typeof cfg.routeProvider === "function" ? cfg.routeProvider(route) : Object.keys(models.providers ?? {})[0];
        if (!provider) throw new Error("route produced no Pi provider");
        const agent = join(work, "agent");
        writeFileSync(join(agent, "models.json"), JSON.stringify(models), { mode: 0o600 });
        const settings = typeof cfg.routeSettings === "function" ? cfg.routeSettings(route) : { defaultProvider: provider, defaultModel: route.model, packages: [] };
        writeFileSync(join(agent, "settings.json"), JSON.stringify(settings), { mode: 0o600 });
        const pass = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "NO_PROXY", "no_proxy", "ALL_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR"];
        const env = { PATH: "/usr/bin:/bin", HOME: join(work, "home"), TMPDIR: join(work, "home"), LANG: "C.UTF-8", PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", LAB_WORKSPACE_API_KEY: key || "lab-local-no-key" };
        for (const n of pass) if (process.env[n]) env[n] = process.env[n];
        // Same launch environment as lab itself (Azure variables, header auth, proxy/CA, no pi.dev).
        if (typeof cfg.routeEnvironment === "function") Object.assign(env, cfg.routeEnvironment(route, key));
        const azureExtension = route.kind === "azure" ? ["-e", rel + "/src/runtime/azure.ts"] : [];
        const cmd = [...verifyPiRuntime().command, "--mode", "json", "--offline", "--no-session", "--no-tools", "--no-extensions", ...azureExtension, "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--provider", provider, "--model", route.model, "Reply with exactly one word: PONG"];
        const started = performance.now();
        const child = Bun.spawn(cmd, { cwd: join(work, "cwd"), env, stdin: "ignore", stdout: "pipe", stderr: "ignore" });
        const timer = setTimeout(() => child.kill(), 120000);
        const out = (await new Response(child.stdout).text()).slice(0, 4 << 20);
        await child.exited; clearTimeout(timer);
        const ms = Math.round(performance.now() - started);
        let last;
        for (const line of out.split("\n")) { try { const r = JSON.parse(line); if (r.type === "message_end" && r.message?.role === "assistant") last = r.message; } catch {} }
        if (!last) { say("fail", ms, "-", "no assistant message (Pi exit " + child.exitCode + ")"); process.exit(0); }
        const model = String(last.responseModel ?? last.model ?? "-").replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 80);
        const text = (last.content ?? []).filter(c => c.type === "text").map(c => c.text).join("");
        if (last.stopReason === "error" || last.errorMessage) {
          const m = String(last.errorMessage ?? ""), status = m.match(/\b([45]\d\d)\b/)?.[1];
          const byStatus = { "400": "bad-request (model or deployment name, API version?)", "401": "auth", "403": "auth (key, header name or gateway policy?)", "404": "not-found (endpoint path or deployment?)", "408": "timeout", "429": "rate-limit" };
          const kind = status && byStatus[status] ? byStatus[status] : /certificate|self.signed|issuer/i.test(m) ? "certificate" : /proxy/i.test(m) ? "proxy" : /timed? ?out|timeout/i.test(m) ? "timeout" : /refused|ENOTFOUND|resolve/i.test(m) ? "connection" : /unauthori|forbidden|api.key|credential/i.test(m) ? "auth" : /not.found|deployment/i.test(m) ? "not-found" : /rate|quota|429/i.test(m) ? "rate-limit" : "provider-error";
          say("fail", ms, model, kind + (status ? " HTTP " + status : ""));
        } else say(/\bPONG\b/i.test(text) ? "pass" : "fail", ms, model, /\bPONG\b/i.test(text) ? "expected word received" : "reply did not contain the expected word");
      } catch (e) { say("fail", 0, "-", "setup: " + String(e?.message ?? e).split("\n")[0].slice(0, 160)); }' 2>/dev/null | tail -n 1)
    q_mt_status=$(printf '%s' "$q_mt" | cut -f1); q_mt_ms=$(printf '%s' "$q_mt" | cut -f2)
    q_mt_model=$(printf '%s' "$q_mt" | cut -f3); q_mt_detail=$(printf '%s' "$q_mt" | cut -f4)
    if [ "$q_mt_status" = pass ]; then q_record PASS model.prompt "model $q_mt_model answered in ${q_mt_ms} ms via Pi ($q_mt_detail)"
    elif [ -n "$q_mt" ]; then q_record FAIL model.prompt "model ${q_mt_model:--} after ${q_mt_ms:-?} ms: $q_mt_detail"
    else q_record FAIL model.prompt "model test did not finish within 150 s"; fi
  fi
fi

# --- 6. browser -----------------------------------------------------------
q_section 'Browser (Windows Edge from WSL)'
q_browser_fail=WARN; [ "$q_browser_test" = 1 ] && q_browser_fail=FAIL
if [ "$q_wsl" != 1 ]; then
  q_record SKIPPED browser.edge "not WSL"
else
  q_edge=
  for q_e in "$q_win_root/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" "$q_win_root/Program Files/Microsoft/Edge/Application/msedge.exe"; do
    [ -f "$q_e" ] && { q_edge=$q_e; break; }
  done
  if [ -n "$q_edge" ]; then
    q_edge_ver=$(for q_v in "${q_edge%/*}"/[0-9]*.*; do [ -d "$q_v" ] && printf '%s\n' "${q_v##*/}"; done | grep '^[0-9][0-9.]*$' | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n | tail -n 1)
    q_record PASS browser.edge "Edge ${q_edge_ver:-version unknown} at $q_edge"
  else q_record "$q_browser_fail" browser.edge "Microsoft Edge not found under $q_win_root/Program Files*/Microsoft/Edge/Application"; fi
  q_reg=$q_win_root/Windows/System32/reg.exe
  if [ "$q_interop" = 1 ] && [ -f "$q_reg" ]; then
    q_pol=$( (cd "$q_win_root" 2>/dev/null || cd /; for q_hive in HKLM HKCU; do q_bounded 15 "$q_reg" query "$q_hive\\SOFTWARE\\Policies\\Microsoft\\Edge" /v RemoteDebuggingAllowed 2>/dev/null; done) | tr -d '\r' | awk '/RemoteDebuggingAllowed/ {print $3}' | head -n 1)
    case "$q_pol" in
      '') q_record PASS browser.policy "RemoteDebuggingAllowed policy not set (allowed)";;
      0x0) q_record "$q_browser_fail" browser.policy "Edge policy RemoteDebuggingAllowed=0 blocks browser control; ask IT for an exception";;
      *) q_record PASS browser.policy "RemoteDebuggingAllowed=$q_pol";;
    esac
  else q_record SKIPPED browser.policy "needs WSL interop and reg.exe"; fi
fi
q_ab_win_hash=
[ -n "$q_rel" ] && q_ab_win_hash=$(q_contract_hash "$q_rel/contracts/agent-browser-source.json" "platform=win32,arch=x64" sha256)
if [ -z "$q_rel" ]; then q_record SKIPPED browser.agent-win32 "no release"
elif [ -z "$q_ab_win_hash" ]; then q_record SKIPPED browser.agent-win32 "this release has no win32 agent-browser contract (added by the WSL Edge work)"
else
  q_ab_win=$(find "$q_rel/.tmp/browser" -maxdepth 2 -type f -name '*.exe' 2>/dev/null | head -n 1)
  if [ -z "$q_ab_win" ]; then q_record "$q_browser_fail" browser.agent-win32 "agent-browser-win32-x64.exe not installed in this release"
  else q_check_binary browser.agent-win32 "agent-browser (win32)" "$q_ab_win" "$q_ab_win_hash" 1 || true; fi
fi
if [ "$q_browser_test" = 1 ]; then
  q_smoke=
  if [ -n "$q_rel" ]; then
    for q_s in browser-wsl-smoke.ts browser-edge-smoke.ts browser-wsl-edge-smoke.ts; do [ -f "$q_rel/scripts/$q_s" ] && { q_smoke=scripts/$q_s; break; }; done
    if [ -z "$q_smoke" ] && grep -qsl 'WSLInterop\|wslpath' "$q_rel"/src/browser/*.ts && [ -f "$q_rel/scripts/browser-smoke.ts" ]; then q_smoke=scripts/browser-smoke.ts; fi
  fi
  if [ "$q_wsl" != 1 ]; then q_record SKIPPED browser.roundtrip "not WSL; on this host run: bun run scripts/browser-smoke.ts"
  elif [ -z "$q_smoke" ]; then q_record SKIPPED browser.roundtrip "this release has no WSL Edge bridge yet"
  elif [ -z "$q_bun" ]; then q_record FAIL browser.roundtrip "needs a verified Bun"
  elif q_bun_run q_bounded 300 "$q_bun" --no-env-file --no-install "$q_smoke" > "$q_work/browser.log" 2>&1; then
    q_record PASS browser.roundtrip "fixture page round trip in Windows Edge passed ($q_smoke)"
  else q_record FAIL browser.roundtrip "fixture round trip failed: $(grep -o 'LAB_BROWSER_[A-Z_]*' "$q_work/browser.log" | head -n 1)"; fi
fi

# --- summary and JSON report ---------------------------------------------
q_count() { awk -F '\t' -v s="$1" '$1 == s {n++} END {print n + 0}' "$q_tsv"; }
q_pass=$(q_count PASS) q_fail=$(q_count FAIL) q_warn=$(q_count WARN) q_skip=$(q_count SKIPPED) q_info=$(q_count INFO)
q_result=PASS; [ "$q_fail" -eq 0 ] || q_result=FAIL
q_json=$q_out/report.json
q_jesc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
{
  printf '{\n  "schema": "lab-harness/airgap-qualification/v1",\n  "scriptVersion": %s,\n  "generatedAt": "%s",\n' "$q_script_version" "$q_stamp"
  printf '  "options": { "modelTest": %s, "browserTest": %s, "herdrSmoke": %s },\n' \
    "$([ "$q_model_test" = 1 ] && echo true || echo false)" "$([ "$q_browser_test" = 1 ] && echo true || echo false)" "$([ "$q_skip_smoke" = 1 ] && echo false || echo true)"
  printf '  "summary": { "result": "%s", "pass": %s, "fail": %s, "warn": %s, "skipped": %s, "info": %s },\n  "checks": [\n' \
    "$q_result" "$q_pass" "$q_fail" "$q_warn" "$q_skip" "$q_info"
  q_first=1
  while IFS="$(printf '\t')" read -r q_s q_i q_d; do
    [ "$q_first" = 1 ] || printf ',\n'
    q_first=0
    printf '    { "id": "%s", "status": "%s", "detail": "%s" }' "$(q_jesc "$q_i")" "$q_s" "$(q_jesc "$q_d")"
  done < "$q_tsv"
  printf '\n  ]\n}\n'
} > "$q_json"
{
  printf '\nSummary: %s  (PASS %s, FAIL %s, WARN %s, SKIPPED %s, INFO %s)\n' "$q_result" "$q_pass" "$q_fail" "$q_warn" "$q_skip" "$q_info"
  printf 'Report: %s\n        %s\n' "$(q_redact "$q_txt")" "$(q_redact "$q_json")"
} | tee -a "$q_txt"

# Leak guard: never leave a report that contains the home path, the route key or proxy credentials.
q_leak=
if [ "${#HOME}" -gt 1 ] && grep -qF -- "$HOME" "$q_txt" "$q_json"; then q_leak=home; fi
if [ -f "${q_key:-}" ] && [ -s "$q_key" ] && [ -r "$q_key" ] && \
  awk 'FNR == NR { k = k $0; next } length(k) >= 8 && index($0, k) { f = 1 } END { exit !f }' "$q_key" "$q_txt" "$q_json"; then q_leak="$q_leak key"; fi
for q_var in HTTPS_PROXY https_proxy HTTP_PROXY http_proxy ALL_PROXY all_proxy; do
  eval "q_val=\${$q_var:-}"
  case "$q_val" in *@*) q_ui=${q_val#*://}; q_ui=${q_ui%@*}
    Q_SECRET=$q_ui awk 'length(ENVIRON["Q_SECRET"]) >= 3 && index($0, ENVIRON["Q_SECRET"]) { f = 1 } END { exit !f }' "$q_txt" "$q_json" && q_leak="$q_leak proxy";;
  esac
done
if [ -n "$q_leak" ]; then
  : > "$q_txt"; : > "$q_json"
  printf 'qualify: the report would have contained sensitive data (%s); it was erased. Please report this bug.\n' "$q_leak" >&2
  exit 1
fi
[ "$q_result" = PASS ] || exit 1
exit 0
