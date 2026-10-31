# Agent browser and desktop: bounded local evaluation

**Current status:** [Authorized live continuation passed](LIVE-SUCCESS.md) at source `715cddeb`; first run remains PARTIAL. Cumulative usage: 9 requests / 7251 input / 232 output tokens. Earlier preparation/probe descriptions below retain their historical context.

Evidence date: 2026-10-31. **Browser deterministic fixture: passed. Desktop AX interaction: BLOCKED PERMISSION. Model/Pi: authorized continuation PASSED; first run PARTIAL.** This is an experiment, not a qualified LAB feature or airgap release.

Recommend evaluating an explicit, narrow Pi tool extension over agent-browser's official one-shot MCP commands. Keep the owned ephemeral browser first. Defer desktop interaction until an operator has approved the launching application's Accessibility access and a disposable app/PID is prepared. No production integration, installer, provider route or enterprise configuration changed.

## Actual observations

The pinned macOS arm64 agent-browser 0.41.0 binary controlled an approved existing Google Chrome **156.0.8078.74** installation with a fresh ephemeral browser and synthetic loopback fixture. Exact artifact hashes are in [CONTRACT](CONTRACT.md); the observed Chrome executable SHA-256 is `cf864393a84aa983ba58feea2c24050748e39738591205ecaa54b2c1199ad28c`.

[Corrected machine evidence](evidence/browser-trial.json) records navigation, accessibility snapshot/ref discovery, fill, click, visible-text assertion (`Saved: Fixture Alpha`), [native browser screenshot](evidence/browser-native.png), removed-element failure, resnapshot, second-page navigation, official MCP title retrieval, rejected hostname, close and empty temporary-profile inventory. This screenshot is native browser output, not a design rendering or model observation. The removed-ref failure is a generic element error; do not promise a stable typed stale-ref code. Fresh snapshots are required after page changes; refs are not durable object IDs.

The [first attempt](evidence/browser-trial-first.json) is retained because its MCP call launched a different default session at `about:blank`; it did **not** prove reuse. Outer CLI session/config flags do not propagate automatically through MCP re-execution. The corrected invocation passes `AGENT_BROWSER_SESSION` and `AGENT_BROWSER_CONFIG` through a deliberately small environment. MCP then returned `Second fixture`, `reused:true`, and the original launch hash; the MCP denied-host check also failed as intended. [Cleanup](evidence/first-mcp-cleanup.json) explicitly closed the first attempt's owned default session. Root independently inspected both the corrected identities and empty profile list. This is single-session deterministic proof, not concurrent-agent isolation or crash recovery qualification. No packet capture proves absence of background browser egress.

Desktop 1.0.2 initially failed command-host startup ([original](evidence/desktop-permissions.json)). The [bounded diagnostic](evidence/desktop-socket-diagnostic.json) reported that the socket requires an absolute path. Our relative `TMPDIR` caused this; a sanitized environment alone was not proof of AX denial. A short absolute owned 0700 socket directory fixed startup without changing TCC. [Corrected metadata/permissions](evidence/desktop-trial.json) report output envelope 2.5, Accessibility denied, Screen Recording denied and Automation unknown. No app snapshot, app launch, desktop screenshot or interaction followed. Socket state was removed; permission-denial host exit is distinct from signalling a running owned host. This does not prove desktop control works.

## Integration options and semantics

| Surface | Evidence and fit | Limits |
|---|---|---|
| Native CLI subprocess | Actual fixture proof; model-neutral JSON; simple operator reproduction | Own argument validation, time/output bounds, environment and session lifecycle; exposing shell grants unnecessary authority |
| Official one-shot MCP | Actual same-session title and denied-host proof; version-matched tool schemas/annotations/profiles in generated catalog | Re-exec needs explicit environment/session propagation; MCP itself is transport, not profile isolation |
| Persistent MCP server | Source-supported protocol/server lifecycle, schema discovery | Extra process lifecycle and channel management; public LAB launcher disables ambient MCP; not run |
| Explicit experimental Pi extension | Prepared [adapter](../../../experiments/agent-tools/pi-extension.ts) maps four fixture operations to official tools, with no arbitrary shell, URL, file, eval or desktop operations | Actually invoked by native Pi/model in the successful continuation; public LAB launcher does not load it |
| Built-in chat/eve integration | Upstream integrations demonstrate packaging choices | Not equivalent to LAB/Pi integration; not installed or invoked |

The generated `@agent-browser/sandbox/mcp-tools.json` catalog includes schemas and startup profiles; use it rather than inventing a complete CLI-to-tool mapping. This experiment narrows the surface to snapshot, fill, click and result text. See [first live evidence and correction](FIRST-LIVE.md): four real model requests invoked snapshot/fill/click, then admission refused continuation before final verification. The adapter is provider-neutral and uses no SDK for Anthropic/Ollama. Its subprocess environment omits credentials. It bounds returned stdout and duration; browser `maxOutput` bounds normal content. Input validation is not a browser sandbox: the trusted operator must create the exact owned fixture/session/config and serialize actions. The prepared bridge can launch a missing session; it does not independently prove fixture identity. A future model launcher must verify the marker before enabling tools and own close/recovery in `finally`.

The [prepared native runner](RUNNER.md) now uses verified Pi, the LAB workspace extension/real Relay and owned Herdr with the explicit adapter. A zero-HTTP loopback probe verifies healthy startup and the synchronous pre-request guard. This is not a model call or tool-driven model success. The first live attempt is PARTIAL, with four requests and 4147/117 reported input/output tokens; any follow-up requires new root authorization. the 20k input admission estimator is explicitly not exact tokenization, and actual usage must be inspected. Direct CLI success is not model success.

## Security, sessions and offline implications

Security settings are opt-in at this pin. Explicit trusted config replaces ambient discovery. The fixture sets allowed domains to `127.0.0.1`, content boundaries, max output 8000, WebMCP off and explicit installed Chrome executable. No raw launch arguments, CDP attachment, restore key, persistent profile, authentication storage or extension installation was used. The browser sandbox was not intentionally disabled; platform-dependent launch code can disable it in other environments (for example CI/root/container), which requires a separate deployment review. Content boundaries label untrusted page material; they do not neutralize prompt injection.

Fresh named sessions provide owned ephemeral browser state. Serialize operations per session, give each agent a different owned session and config, and never treat shared CDP tab selection as browser/context isolation. Refs become invalid after mutations/navigation; do not blindly retry writes. Desktop snapshot-qualified refs and delivery/retry metadata need observation after uncertain delivery, not automatic replay. Disconnect, daemon restart, stale targets and cleanup after timeout remain qualification cases beyond this normal close trial. Output logs can contain page text; retain synthetic data only.

Offline control is separate from an offline model route and reachable internal apps. Bundle and approve exact CLI binaries, desktop helper, skill data, browser/runtime dependencies, licenses/notices and OS compatibility; record hashes and signatures where available. Apache-2.0 applies to both tool repositories, not to Chrome or the whole LAB distribution. Browser installation/download helpers, npm/npx, provider/cloud browser integrations, built-in chat and remote resources must not be relied on at runtime. Stage updates outside the airgap, rehash, review changed launch/security semantics, retest and retain rollback assets. This run downloaded approved public release artifacts before local execution; it was **not** an airgap/network-isolated startup test. A bounded source keyword search found no explicit telemetry client in the inspected native source, which is not proof of zero tool, browser or OS egress. Egress controls and browser enterprise policies need operator qualification.

## Platforms and prior research delta

[Prior Edge/airgap work](../airgap-browser/SUMMARY.md) remains the enterprise and WSL baseline. Agent-browser 0.41.0 uses native Rust CDP, rather than the Playwright `connectOverCDP` implementation analyzed there. Do not transfer Playwright's specific autoattach/noDefaults effects as demonstrated native behavior. Native existing-session initialization, download settings, unselected tabs and restoration still need before/during/after evidence. No tool can assume arbitrary running Edge is attachable without launch/profile/policy prerequisites.

| Variant | Status and prerequisites |
|---|---|
| macOS arm64 + local Chrome | Actual browser fixture proof only; desktop metadata/permissions proof only |
| Windows + Edge | Upstream platform/Chromium support is not a local proof. Approved binary/browser, executable/channel selection, DevTools enterprise policy, dedicated profile and firewall decisions needed |
| Linux + Edge same OS | Not run; browser dependencies, sandbox and approved installed browser required |
| WSL harness + Windows Edge | Not run. Native Windows bridge is an option; otherwise qualified CDP reachability depends on NAT versus mirrored networking, loopback/firewall and debug launch. No unauthenticated LAN endpoint recommendation |
| Intranet separate machines | Not run. Authenticated restricted transport/bridge and explicit ownership required; MCP does not secure CDP by itself |
| Native desktop on Windows/Linux | Not run. UIA/AT-SPI/session access and same-user security differ from macOS. WSL Linux desktop accessibility does not establish Windows UIA access |

An extension is not needed for the proved owned-browser path. Existing user profiles/SSO remain borrowed authority: no cookies/password extraction, no personal-tab trial, and no claim that tab selection limits endpoint authority. Enterprise policies may prohibit DevTools, native automation or extensions independently. The old research covers extension/native-host and policy alternatives; this study does not approve them.

## Desktop operator prerequisite — documented, not performed

The [pinned macOS guide](https://github.com/vercel-labs/agent-desktop/blob/a47ed664e0db00d1d4df364eb3fe8a5599882f3c/skills/agent-desktop-macos/SKILL.md#requirements) requires macOS 13+ and Accessibility access for the **launching application** (examples include Terminal, iTerm2, Warp, VS Code and Codex). In this T3-hosted chain, confirm the responsible app displayed by macOS; do not assume the helper executable alone is sufficient. If macOS separately lists the agent-desktop binary, the guide says to grant that too.

Manual setup, only after operator authorization: open System Settings → Privacy & Security → Accessibility (called Device Control and Data Access on macOS 27+), add the launching app and turn it on; then rerun the nonprompting `agent-desktop permissions` check. The guide says a subsequent command sees the grant without restarting the launching app. `permissions --guide` and `--request` are upstream assisted alternatives, neither run here. Screen Recording is optional for AX-only fixture observation/action and required for screenshots or `session start --screenshots`; Automation is needed only where an operation reports it missing. Avoid the guide's generic foreground-app snapshot example: the follow-up must target only the disposable fixture PID/window.

## Remaining acceptance gates

1. Model **PASSED in the subsequent bounded continuation** (LIVE-SUCCESS.md): first live attempt used four requests and 4147/117 reported tokens; root owns any newly authorized follow-up allowance. No duplicate auth attempts or secrets in this report. The fixed prepared route/model and budget/cleanup gates are documented in RUNNER.md; the subsequent authorized live run passed (see LIVE-SUCCESS.md).
2. Desktop **BLOCKED PERMISSION**: existing approved Accessibility grant, owned fixture app/PID, semantic read/action/verification, stale-ref check and owned-host cleanup. No grant prompt or settings change performed.
3. Cross-platform/airgap: offline cold start with staged assets; Windows/WSL Edge prerequisites; network boundaries; concurrency/locking; crash cleanup; existing-session no-effects gate. All unexecuted.
