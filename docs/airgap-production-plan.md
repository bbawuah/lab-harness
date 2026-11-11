# Airgap production plan

Status: **plan and contract, 2026-11-11.** Owner (lead): this integration thread.
Base: `fix/bootstrap-pin-approval-gate` (PR #29) on `main` `773864e`.

## Goal

Ship `lab` as the daily AI coding workspace inside the organisation's airgapped
environment, in place of Codex: a Pi coding agent with LAB approvals, search,
skills, Relay mail between sessions and control of the organisation's Edge
browser. "Production ready" means an engineer can install a released version
inside the airgap without improvising, connect it to the approved model and
browser, and run a qualification script whose report says what works.

## Target environment (from the owner, 2026-11-11)

| Aspect | Target |
| --- | --- |
| OS | Windows with **WSL2**, Linux x86_64 distribution inside WSL |
| Model | OpenAI models served through an **Azure cloud landing zone** (Azure OpenAI, possibly behind an API Management gateway, proxy and corporate CA) |
| Browser | The organisation's installed **Microsoft Edge on Windows**. No bundled Chromium |
| Desktop control | Not needed now (draft PR #28 stays macOS-only and out of scope) |
| Delivery A | Tooling can be installed from GitHub inside the airgap |
| Delivery B | Build the installer on the owner's Mac mini and move it in through the jumphost transfer (`naar-mod`) |

## Facts this plan rests on (verified 2026-11-11)

- The LAB runtime has **no npm runtime dependencies**. `bun install` only fetches
  development tooling (TypeScript, types). Every runtime artifact (Bun, Pi, Herdr,
  rg, fd, agent-browser) is a pinned, hashed GitHub release download.
- The current route writes a Pi provider with `contextWindow: 8192`, `maxTokens: 1024`,
  `reasoning: false`, text only (`src/pi/workspace-config.ts`). This is unusable for
  GPT-class models and must change.
- Pi 1.4.0 has a native `azure` provider (Responses API for OpenAI models), with
  `AZURE_OPENAI_BASE_URL` / `AZURE_OPENAI_RESOURCE_NAME`, `AZURE_OPENAI_API_VERSION`
  (default `v1`) and `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`. `models.json` providers accept
  `headers` (values resolve like `apiKey`: literal, `$ENV`, `!command`) and `authHeader`.
  Settings accept `httpProxy`. See the pinned Pi `docs/providers.md`, `docs/models.md`,
  `docs/models-configuration.md`.
- agent-browser 0.41.0 publishes `agent-browser-win32-x64.exe`. WSL interop can run a
  Windows executable with stdio pipes, so the existing per-call `agent-browser mcp call`
  model can drive Windows Edge without a TCP debugging listener reachable from WSL.
- GitHub-hosted runners cannot run WSL2 (no nested virtualization). Windows-side
  browser behaviour can be tested on `windows-latest` (Edge preinstalled); the WSL2
  half is qualified on the real target with a script.

## Workstreams and ownership

Each workstream works in its own worktree and branch, opens a draft PR against
`main`, and touches only the files it owns. Shared files are listed separately.

### A. Releases and the offline bundle

Branch `feat/airgap-release-bundle`. Owns: `scripts/bundle/**` (new), `scripts/release/**` (new),
`install.sh`, `bootstrap.sh`, `scripts/runtime-bun.sh`, `scripts/publication-policy.ts`,
`scripts/check-publication.ts`, `.github/workflows/release.yml` (new), new jobs in
`.github/workflows/ci.yml` (keep the two existing required job names unchanged),
`docs/release.md`, `docs/airgap-install.md`, `tests/bundle*.test.ts`, `tests/install*.test.ts`,
`tests/publication*.test.ts`, and the `--version` handling in `lab`.

1. `lab --version` prints the harness version and commit (also usable offline).
2. A bundle builder that runs on macOS arm64 (the mini) **and** Linux CI and produces
   one file per target, first `lab-harness-<version>-linux-x64.tar.gz`, containing:
   harness source at an exact commit; every pinned linux-x64 runtime (Bun, Pi, Herdr,
   rg, fd, agent-browser linux-x64) plus `agent-browser-win32-x64.exe` for the WSL Edge
   bridge (include every agent-browser artifact listed in its contract for
   `linux/x64` and `win32/x64`); a `MANIFEST.json` with each file's SHA-256, source
   URL and license; collected license texts; and a sidecar `SHA256SUMS`. Every
   artifact is verified against the existing contracts before packing.
3. Offline install from the bundle with **zero network access**: verify the bundle
   against its manifest, install into the same layout as `bootstrap.sh`
   (`$XDG_DATA_HOME/lab-harness/releases/<commit>`, guarded launcher, `~/.local/bin/lab`),
   skip the npm development install, run the Herdr smoke. No sudo, no profile edits.
4. A release workflow on tag `v*`: run the checks, build the bundle(s), publish a GitHub
   Release with the bundle, `SHA256SUMS` and notes. Inside the airgap the same asset can be
   fetched from GitHub (delivery A); on the mini the builder or a fetch-and-verify command
   produces the identical file for the jumphost transfer (delivery B).
5. A CI job that installs the linux-x64 bundle inside a container with `--network none`
   and passes install, Herdr smoke and `lab --version`. This is the evidence that the
   installed runtime contacts nothing.
6. Keep `bootstrap.sh` from silently pinning an older build than the latest release:
   a CI guard and a documented release step.
7. `scripts/publication-policy.ts`: in a Git checkout, ignore untracked files that Git
   ignores or that are not part of the commit (today an untracked `.claude/` breaks
   `check:publication`); keep the walk for archive installs without `.git`.
8. An `uninstall` path (documented and scripted) that removes only LAB-owned files.

### B. Azure OpenAI route and real model limits

Branch `feat/azure-openai-route`. Owns: `src/pi/workspace-config.ts`, route/provider
parts of `src/runtime/**` and `src/pi/workspace.ts` (launch environment only),
the `--configure` prompts in `scripts/start.ts`, `tests/workspace-config*.test.ts`,
`tests/azure*.test.ts` (new), `docs/azure-openai.md` (new).

1. New route kind `azure` in `lab --configure`: endpoint (Azure resource URL or API
   Management gateway URL), deployment name, model ID used for capabilities, API version
   (default `v1`), and auth as one of: Azure `api-key` header, a custom header name
   (for example `Ocp-Apim-Subscription-Key`), or a bearer token from a command
   (for Entra ID). Secrets stay in the private route-key file, never in arguments.
2. Use Pi's native `azure` provider (Responses API), so GPT models get their real
   context window, output limit, reasoning and image input from Pi's bundled catalog.
   For a model that the catalog does not know, take explicit limits from configuration.
3. Remove the 8192/1024/text-only hardcoding for `local` and `litellm` too: configured
   limits with sane defaults, existing route files keep working (migration).
4. Network hygiene for the airgap: Pi must not call pi.dev (catalog overlay, version
   checks) when that is not reachable, without blocking the model endpoint. Pass
   `HTTPS_PROXY`/`NO_PROXY` and `NODE_EXTRA_CA_CERTS` (or Pi `httpProxy`) through to Pi
   explicitly and document it.
5. Tests against a local fake Azure endpoint: request path, deployment name, headers
   per auth mode, streaming response, one tool-call round trip, error mapping
   (401/403/404/429). No real Azure call is possible here; the real call is part of
   the qualification in the airgap.

### C. Organisation Edge from WSL

Branch `feat/wsl-edge-browser`. Owns: `src/browser/**`, `src/pi/browser-extension.ts`,
`scripts/acquire-browser.ts`, `scripts/browser-*.ts`, `contracts/agent-browser-source.json`
(add the `win32/x64` artifact), `tests/browser*.test.ts`, `docs/browser-wsl-edge.md` (new),
and a new `windows-latest` job in `.github/workflows/ci.yml` (coordinate with A; add a
separate job, do not edit A's jobs).

1. Detect WSL. Under WSL, run `agent-browser-win32-x64.exe` through WSL interop,
   with the owned session root on the Windows side (`%LOCALAPPDATA%\lab-harness\browser\…`,
   converted with `wslpath`), a dedicated LAB-owned Edge profile, and
   `executablePath` set to the organisation's Edge (default install paths, override with
   `--browser-executable` as a Windows or `/mnt/c` path). Pass environment through `WSLENV`.
2. Keep every existing guarantee: origin allowlist, approvals for navigate/fill/click,
   fresh snapshot refs, bounded output and time, owned-only cleanup. Cleanup on Windows
   must stop exactly the owned process tree and remove the owned profile; killing the
   WSL interop proxy is not enough.
3. Clear, actionable errors when Edge is missing, when enterprise policy blocks remote
   debugging (`RemoteDebuggingAllowed`), or when WSL interop is disabled.
4. Tests: unit tests with a fake interop layer; a `windows-latest` CI job that runs the
   win32 agent-browser against the preinstalled Edge and a local fixture page
   (navigate, snapshot, fill, click, close, profile removed). macOS/Linux behaviour unchanged.

### D. Lead: integration and qualification

Owns: this plan, `README.md`, `docs/user-guide.md`, `docs/source-manifest.json` conflict
resolution, `scripts/qualify-airgap.sh` (new), `docs/airgap-qualification.md` (new).

1. A qualification script for the real WSL2 machine that writes a sanitized report:
   WSL version and interop, installed release and hashes, Herdr smoke, model endpoint
   reachability and one explicit opt-in test prompt, Edge path and a fixture-page browser
   round trip, proxy/CA settings (names only, no secrets).
2. Review and integrate A, B and C; update README and user guide; cut the first release.
3. Hand over the bundle through both delivery routes and run the qualification with the owner.

## Shared rules for every workstream

- Start from this plan's commit. Do not edit files owned by another workstream; if you
  need a change there, stop and report the exact change to the lead.
- `docs/source-manifest.json`: run `bun --no-env-file run refresh:publication` in your own
  worktree so CI passes; the lead regenerates it when merging (conflicts there are expected
  and resolved by regenerating, never by hand-merging hashes).
- Keep the existing safety properties: pinned and hashed artifacts, no global installs,
  no shell-profile edits, no sudo, approvals before mutating actions, no secrets in
  arguments, logs or published files, no paid or cloud model calls in tests.
- Validation per PR: `bun --no-env-file run check` (and `check:actual` where Herdr is
  touched), plus the workstream's own tests. Report commit SHA, commands run and their
  results, actual-versus-fixture evidence and open risks.
- Docs: write your own `docs/*.md`; the lead updates README and the user guide.

## Out of scope for this release

Native LAB ledger task execution through Pi (stays blocked, see `docs/pi-seam.md`),
desktop control, attaching to the user's existing Edge tabs, and Windows-native LAB
outside WSL.
