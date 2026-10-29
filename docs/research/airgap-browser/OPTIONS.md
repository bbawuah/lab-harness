# Options and limits

**2026-10-29 · research only.** Source IDs resolve in [SOURCES.md](SOURCES.md). All proposed LAB behavior is **R**, and all end-to-end compatibility is **U**.

## Attachment is independent of tool transport

| Option | Prerequisites and policy | Existing vs owned browser | Consent and scope | Main cost / limitation |
| --- | --- | --- | --- | --- |
| Raw CDP, no extension | Approved debug-enabled Edge launch, compatible client; `RemoteDebuggingAllowed` and DevTools target rules | Existing only if endpoint was enabled; otherwise launch/restart needed. Use a distinct owned user-data directory | CDP itself is not a user-consent or read-only boundary; LAB must supply selection and enforcement | Browser endpoint can enumerate/control other targets; protocol/version drift; broad local authority |
| Playwright `connectOverCDP` | Same as CDP plus pinned Node/Playwright | Reuses enabled Chromium browser's contexts; does not enable debugging itself | LAB scoped tools over powerful library; prevent raw endpoint/tool escape | Documented lower fidelity; do not promise all fixtures work [S09] |
| Playwright launch, `channel: msedge` | Approved installed Edge, matching OS runtime, permission for debugging pipe | Own launch/profile. No arbitrary ordinary user browser adoption | Explicit owned session; direct user login if needed | WSL Linux channel does not mean Windows Edge. Prefer Windows runtime/bridge [S10–S11] |
| Edge WebDriver / Selenium 4 | EdgeDriver, matching first three browser version components, framework, driver service; policy approval | Normally starts dedicated browser. `debuggerAddress` attaches only an existing debugging server | LAB consent/lease still needed; session ID is not authentication | Extra driver lifecycle; existing-session commands need qualification [S02, S05, S21] |
| Extension + native host / local broker | MV3 `debugger`, narrow UI/host permissions, `nativeMessaging`; registered approved host; deployment/DevTools/native-host policies | Can target existing tab without CDP launch flag; ordinary browser restart generally not an API prerequisite, but install/policy rollout may require reload/restart | Browser-side selection, status, revoke; per-tab method allowlist | Broad extension trust, limited CDP domains, host/extension updates, debugger detach handling [S06–S08, S14–S17] |
| Existing Playwright Extension + MCP | Exact extension/server bundle and approved self-host deployment; extension and MCP approval | Documented existing-tab chooser; multiple-client groups in inspected extension source | Default interactive connection approval; do not configure approval-bypass token as default | Source manifest includes `<all_urls>`, debugger/tabs/tabGroups; no nativeMessaging. Published store path is not an offline installation solution [S12–S13] |
| Windows bridge | Signed/approved Windows runtime, same-user identity and approved WSL interop or authenticated local channel | Wraps one of the above; not an attachment protocol | Enforces leases and finite tool API before privileged browser operations | Proposed engineering and packaging work; avoid system-wide privileged service [S18] |
| MCP server | Pinned server/runtime; stdio or authenticated HTTP transport | Must still choose launch, CDP or extension underneath | MCP session is neither browser tab permission nor OS identity | Useful reusable tool schema; not an authorization, isolation or airgap mechanism [S19] |

Edge documentation describes closing all Edge instances before a debug-port launch and optionally using a distinct profile. Do not silently close a user's browser. Offer an owned profile first; any restart of a human profile needs separate operator authorization. Chrome's default-profile restriction since 136 is **Chrome evidence**, not proof of identical Edge behavior. Treat current Edge/default-profile behavior as a PoC gate. [S01, S20]

Playwright 1.64.1 source also resolves channel-name CDP endpoints by reading `DevToolsActivePort` from a default profile directory and prints a remote-debugging UI hint. That is evidence of client discovery logic, **not proof that enterprise Edge exposes that UI or permits attachment**, and is unsuitable as automatic cross-WSL profile discovery. Require an explicitly approved endpoint; no profile scan. [S11]

## Capabilities exposed by a future adapter

| Operation | CDP / Playwright | WebDriver | Debugger extension + host |
| --- | --- | --- | --- |
| Accessibility / DOM | CDP Accessibility and DOM; Playwright role/ARIA/DOM locators | DOM elements and accessible names/roles; full AX tree may require CDP-specific support | Accessibility/DOM are permitted debugger domains; verify frames/restricted targets |
| Screenshot | `Page.captureScreenshot` / Playwright screenshot | Standard screenshot | Page domain, subject to policy; sensitive content remains sensitive |
| Click / type | Input domain or Playwright locators/actions | Element actions and keyboard/pointer APIs | Input domain; approved tab only |
| Read-only | Implement finite read commands; arbitrary evaluation is not read-only | Same; scripts can mutate | Same; debugger permission itself is powerful |
| Download | Browser download behavior/events; Playwright download object | Browser-owned destination; framework/remote retrieval requires design | Browser domain is absent from documented debugger domain list; do not assume full download control. Separate approved downloads API or host flow needed |
| Upload | DOM `setFileInputFiles` / Playwright file input or buffers | File input send-keys; remote file transfer depends on driver/framework | Qualify file input/CDP behavior; host must stage only user-approved files |
| OS dialogs / protected pages | Not general Windows desktop control | Not general desktop control | No general native-dialog automation; restricted URLs may refuse attach |

Evidence: [CDP domain references S22](SOURCES.md#s22), [debugger domains S07](SOURCES.md#s07), [Playwright files S23](SOURCES.md#s23), [Selenium uploads S24](SOURCES.md#s24). Accessible snapshots omit some visual information; screenshots do not establish semantic controls. Re-resolve locators after navigation; no coordinate-only success claims.

**R — file handling:** uploads and downloads are writes even when the page interaction seems observational. Stage approved bytes in a per-session directory on the **browser-side OS**, record hash/size, forbid arbitrary path access, and transfer artifacts through the authenticated bridge. `/home/...` is not a Windows pathname. Do not expose an unrestricted host filesystem API, import browser storage state, or harvest credentials. Download completion, retention and deletion need explicit outcomes; a click is not proof of a completed download.

## Host topologies

| Topology | Qualified direction to investigate | Boundary and rejected shortcut |
| --- | --- | --- |
| **WSL Linux → Windows Edge, same host (first target)** | WSL invokes approved Windows bridge over stdio; bridge locally launches Playwright/Edge. Optional direct CDP only when mirrored loopback is approved | Windows binaries/profile remain Windows-owned. Interop framing and exit semantics untested. NAT host IP does not reach a Windows loopback-only listener |
| WSL NAT alternative | Approved bridge via interop first; if interop prohibited, evaluate an authenticated narrowly bound broker under separate network approval | Never solve by binding unauthenticated CDP/WebDriver to `0.0.0.0`, using wildcard origins, or broad firewall rules |
| WSL mirrored alternative | Windows 11 22H2+; verify installed WSL, IPv4 loopback and effective Windows/Hyper-V rules | Documentation supports `127.0.0.1` host reachability, not IPv6 `::1`; not an isolation guarantee. Existing firewall/VPN behavior needs fixture test [S04] |
| Same-OS Linux harness + Linux Edge | Linux Playwright `msedge` or local CDP; Linux host registration for extension if selected | No WSL crossing; distro/GUI/runtime dependencies and enterprise Linux policy support need qualification. Windows SSO/profile does not transfer |
| Remote harness and Edge on separate intranet machines | Browser-side broker under the logged-in user; approved mTLS or SSH channel with host verification and per-session authorization | Browser resolves internal apps on its own machine. No anonymous LAN debugger/driver/MCP server; no assumption browser loopback equals remote harness loopback |

An approved transport can be unavailable without invalidating the browser option: fail with a topology-specific diagnostic. DNS, proxies and identity need independent treatment. Microsoft Remote Tools / Windows Device Portal is another documented remote-debugging route, but adds Developer Mode, Device Portal/Remote Tools deployment and service exposure; exclude it from the first PoC unless already approved and offline-provisioned. Do not rely on the public DevTools frontend/CDN shown in documentation examples. [S25]

## Sessions, SSO and recovery

**R — common contract:** the browser owns its live session and SSO. The user authenticates through normal approved UI; LAB receives neither cookies nor passwords. A dedicated Windows profile may participate in integrated SSO, but seamless SSO, client certificates, MFA and internal IdP availability are untested. A new Linux profile cannot stand in for a signed-in Windows profile.

| Route | Concurrent work | Disconnect / failure / restart |
| --- | --- | --- |
| CDP existing | One writer lease per selected target, scoped descendants only; other clients can still bypass LAB if they have raw endpoint access | Detach transport, leave user browser/tabs alive. Endpoint may remain enabled; state this visibly. Browser restart invalidates target IDs and consent |
| Playwright owned | Distinct profile per independent session; never concurrent launches on one profile | Close only owned context/process, invalidate lease and clean owned artifacts. If close result unknown, record unknown; never kill by process name |
| WebDriver owned/attach | One owner per driver session; no global shared driver | Test `quit`/detach semantics before borrowed-session use; EdgeOptions documents shutdown behavior and temporary-profile retention [S05] |
| Extension | Lease per tab; human control pauses automation; no silent transfer between clients | Handle `onDetach`, user revoke, extension reload, MV3 worker/host disconnect. No automatic consent restoration. Opening DevTools can detach [S07] |
| Bridge / MCP | Bind authenticated client, run ID, connection generation, OS user and allowed targets | Expiring leases; cancel queues; never replay ambiguous click/submit after timeout. Reconnect requires revalidation; MCP reconnect alone grants nothing |

The inspected Playwright Extension documents client tab groups and single-client tab membership; that is a useful design candidate, not a hostile-client security boundary or evidence that its 0.4.0 extension is compatible with MCP 0.0.83. LAB must still mediate tools and data release. [S13]
