# Airgap qualification

`scripts/qualify-airgap.sh` checks whether an installed LAB release works on the
target: Windows with WSL2 (Linux x86_64), an Azure OpenAI model behind a proxy and a
corporate CA, and the organisation's Edge browser. It writes a report that is safe to
copy out of the airgapped environment. The owner's steps are in
[mod-quickstart.md](mod-quickstart.md). This page explains each check and what a
failure means.

```sh
sh scripts/qualify-airgap.sh [--out DIR] [--release DIR] [--model-test] [--browser-test] [--skip-smoke]
```

| Option | Effect |
| --- | --- |
| `--out DIR` | Write `report.txt` and `report.json` to DIR. The default is `<XDG_DATA_HOME or ~/.local/share>/lab-harness/qualification/<UTC time>/` |
| `--release DIR` | Qualify this release or checkout instead of the one the launcher points to |
| `--model-test` | Send **one** fixed prompt through the saved route. Without this flag the script makes no model call |
| `--browser-test` | Run the WSL to Windows Edge fixture round trip, if the release supports it. Browser problems then count as FAIL instead of WARN |
| `--skip-smoke` | Do not run the owned Herdr smoke |

## What the script does and does not do

- It downloads nothing, uses no sudo and edits no shell profile. It writes its report
  directory and a temporary `.work.*` folder inside it, which is removed on exit.
  The only other writes are the existing Herdr smoke's transient state, which is
  owned and cleaned up under the release's `.tmp`, exactly as `install.sh` does.
- It contacts only the saved model endpoint: one request without credentials for
  reachability, plus the single prompt with `--model-test`. On WSL it runs
  `wsl.exe --version`, `cmd.exe /c ver` and a read-only `reg.exe query`.
- Redaction is applied to every line before it is printed. `$HOME` becomes `~`, user
  names after `/home/`, `/Users/` and `C:\Users\` become `<user>`, URL credentials
  and `Bearer` values are removed, and any run of 32 or more token-like characters
  becomes `<redacted>`. Commits and hashes therefore appear as 12-character prefixes.
  Proxy variables are shown as host and port only. The route key file is never read
  by the shell. Only Bun reads it, and only with `--model-test`, and it never prints
  it. Route values are printed only for known, non-secret fields (kind, endpoint
  host, model, deployment, API version, auth mode and header name). Other fields are
  listed by name only.
- A final leak guard checks the finished report for the home path, the key and any
  proxy credentials. If one is found, the report is erased and the script exits 1.

## Status and exit codes

| Status | Meaning |
| --- | --- |
| PASS | Checked and correct |
| FAIL | Broken for daily use. Fix it before relying on LAB |
| WARN | Works, but something is degraded or depends on a later fix (for example, the Edge bridge without `--browser-test`) |
| SKIPPED | Not applicable here, not requested, or not in this release yet. The reason follows |
| INFO | Facts for whoever reads the report |

The exit code is 0 when there is no FAIL, 1 when there is at least one FAIL (or the
leak guard fired), and 2 for a usage error. `report.json` has the schema
`lab-harness/airgap-qualification/v1`: `summary` (result and counts) and `checks`
(`id`, `status`, `detail`), in the same order as the text report.

## Checks

### Environment

| Check | What it means | If it fails |
| --- | --- | --- |
| `env.wsl` | The kernel is WSL2 (`microsoft-standard-WSL2`). On other systems it is SKIPPED | WSL1: in PowerShell, run `wsl --set-version <distro> 2` |
| `env.distro`, `env.arch` | Distribution and CPU. The target is Linux x86_64 | Another architecture has no pinned runtimes |
| `env.interop` | `WSLInterop` is registered and enabled, so Windows `.exe` files can run | Needed only for Edge. Set `[interop] enabled=true` in `/etc/wsl.conf`, then run `wsl --shutdown` |
| `env.interop-run` | `cmd.exe /c ver` really ran (shows the Windows version) | Interop is registered but blocked, for example by policy |
| `env.wsl-version` | Output of `wsl.exe --version` | INFO only. Older inbox WSL prints nothing |
| `env.systemd` | Whether systemd is PID 1 | INFO only. LAB does not need it |
| `env.tools` | `tar`, `sha256sum`, `sed`, `awk`, `find` and the other basics are present | Install them with the distribution's package manager (outside LAB) |
| `env.optional-tools` | `curl`, `getent`, `timeout`, `wslpath` | Without `curl`, the endpoint check is SKIPPED |
| `env.home`, `env.data-root` | Home and LAB data are on the Linux filesystem, not `/mnt/c` | Unset `XDG_DATA_HOME`, or move it, and reinstall |
| `env.disk` | Free space at the LAB data root. FAIL below 1 GiB, WARN below 4 GiB | Free space in the WSL disk |

### Installation and runtimes

| Check | What it means | If it fails |
| --- | --- | --- |
| `install.releases` | The commits installed under `releases/` | INFO |
| `install.launcher` | `~/.local/share/lab-harness/lab` is the LAB-owned launcher, owned by you, and points to an installed release | Reinstall the bundle. A launcher that is not LAB-owned is never overwritten |
| `install.release` | The release has `lab`, `install.sh` and `contracts/`, and its harness version | Incomplete copy: reinstall |
| `install.manifest` | `MANIFEST.json` from the offline bundle is present | SKIPPED for releases installed without the bundle |
| `install.version` | `lab --version` output | SKIPPED until the release-bundle work adds `--version` |
| `install.command` | `lab` on PATH resolves to the LAB-owned `~/.local/bin/lab` | WARN: add `~/.local/bin` to PATH, or use the full launcher |
| `install.path` | How many Windows directories WSL appended to PATH | INFO |
| `runtime.bun`, `runtime.herdr`, `runtime.rg`, `runtime.fd`, `runtime.pi` | Each runtime is a regular file owned by you, executable, and its SHA-256 equals the pin in that release's `contracts/`. A system Bun of the exact version is accepted with a WARN, because the launcher allows it | Missing or mismatched: reinstall the release. A mismatch means the file changed after install |
| `runtime.agent-browser` | Optional Linux agent-browser | SKIPPED when not installed |
| `runtime.pi-tree` | Every file in the Pi bundle matches the contract (`verifyPiRuntime`) | Reinstall |
| `runtime.herdr-smoke` | `scripts/herdr/smoke.ts` started an owned Herdr worker and cleaned it up. No model is involved | See [herdr.md](herdr.md). Common causes are a `/tmp` without Unix socket support or a very long path |

### Network and model route

| Check | What it means | If it fails |
| --- | --- | --- |
| `net.proxy`, `net.no-proxy` | Proxy variables that are set (host and port only) | INFO. "credentials present" means the URL contains a user name or password, which is not shown |
| `net.ca` | Each CA variable points to a readable PEM file, with its certificate count | Fix the path, or convert DER to PEM |
| `net.passthrough` | Whether this release passes proxy and CA variables to Pi | WARN: this release's Pi does not see them, so model calls through a proxy can fail. The Azure route work fixes this |
| `route.saved` | `route.json` has kind, endpoint and model (plus Azure fields) | FAIL: run `lab --configure` |
| `route.fields` | Names of all fields in `route.json` | INFO |
| `route.private`, `route.key` | Route and key files have mode 0600. The key content is never read by the script | `chmod 600` the file, or reconfigure |
| `net.dns` | The endpoint host resolves (`getent`) | With a proxy it is INFO, because the proxy resolves. Otherwise check DNS or set `HTTPS_PROXY` |
| `net.endpoint` | `curl` reaches the endpoint over TLS and gets **any** HTTP status. 401, 403 and 404 are normal without a key. It retries with `--cacert $NODE_EXTRA_CA_CERTS` when the system store rejects the certificate | Exit 6: DNS. 7: refused. 28: timeout (firewall, proxy or `NO_PROXY`). 35: TLS handshake. 56: proxy refused. 60: untrusted certificate (set `NODE_EXTRA_CA_CERTS`) |
| `net.endpoint-runtime` | The same request through Bun's `fetch`, the runtime Pi uses. It honours `HTTPS_PROXY`, `NO_PROXY` and `NODE_EXTRA_CA_CERTS` | When curl passes and this fails, the problem is in Bun's view of the proxy or CA |

### Model test (`--model-test` only)

`model.prompt` loads the saved route with the release's own `loadWorkspaceRoute` and
`modelsForRoute`, writes a temporary Pi agent directory, and runs the installed Pi
once (`--mode json --no-tools --no-session`) with `Reply with exactly one word: PONG`.
It reports pass or fail, latency, the model ID the provider returned, and an error
class with the HTTP status. It never reports reply text, only whether the expected
word arrived. Error classes: `auth` (401/403: key, header name or gateway policy),
`not-found` (404: endpoint path or deployment), `bad-request` (400: model, deployment
or API version), `rate-limit` (429), `certificate`, `proxy`, `timeout`, `connection`
and `provider-error`. If the release exports `environmentForRoute(route, key)`, its
variables are added to Pi's environment, so a route that needs extra launch variables
is tested the way `lab` launches it.

### Browser

| Check | What it means | If it fails |
| --- | --- | --- |
| `browser.edge` | `msedge.exe` under `C:\Program Files (x86)` or `C:\Program Files`, with its version | WARN, or FAIL with `--browser-test`: Edge is missing or installed elsewhere |
| `browser.policy` | Edge policy `RemoteDebuggingAllowed` (HKLM or HKCU). It passes when not set | `0x0` blocks browser control. Ask IT for an exception |
| `browser.agent-win32` | `agent-browser-win32-x64.exe` in the release, hash-checked against the contract | SKIPPED until the WSL Edge work adds the win32 contract |
| `browser.roundtrip` | With `--browser-test`: the release's WSL Edge fixture smoke (navigate, snapshot, fill, click, close) | SKIPPED off WSL or before the Edge bridge exists. When it fails, the first `LAB_BROWSER_*` code is shown |

## Features detected as they land

The script uses only interfaces that exist today, and it detects the newer pieces:

| Piece | Detected by | Until then |
| --- | --- | --- |
| Offline bundle | `MANIFEST.json` in the release | `install.manifest` SKIPPED |
| `lab --version` | `--version` in the release's `lab` | `install.version` SKIPPED |
| Azure route | extra fields in `route.json`, and `modelsForRoute` / `environmentForRoute` in the release | route printed with its generic fields |
| Proxy and CA passthrough | `HTTPS_PROXY` or `NODE_EXTRA_CA_CERTS` in the release's Pi launch code | `net.passthrough` WARN |
| WSL Edge bridge | a `win32/x64` entry in `contracts/agent-browser-source.json`, then `scripts/browser-wsl-smoke.ts` (or `browser-edge-smoke.ts`), or WSL support in `src/browser/` with `scripts/browser-smoke.ts` | `browser.agent-win32` and `browser.roundtrip` SKIPPED |

## Test hooks

`tests/qualify-airgap.test.ts` runs the script in a fake environment. These variables
exist only for that purpose and default to the real system: `LAB_QUALIFY_PROC_ROOT`
(instead of `/proc`), `LAB_QUALIFY_OS_RELEASE` (instead of `/etc/os-release`),
`LAB_QUALIFY_WINDOWS_ROOT` (instead of `wslpath -u 'C:\'` or `/mnt/c`), and
`LAB_QUALIFY_UNAME_S` and `LAB_QUALIFY_UNAME_M` (instead of `uname`).
