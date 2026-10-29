# Future operator checklist

**NOT EXECUTED.** These are gates for a separately authorized PoC, not installation instructions or permission to change enterprise settings.

## Environment and authority

- [ ] Record actual Windows build, WSL version/distro/network mode, Edge channel/full version/architecture and installation provenance. Record current effective policy through an approved operator process; do not collect profile/auth contents.
- [ ] Obtain permission for the chosen attachment mode, test identity, fixture app and expected read/write actions. Existing-user consent and enterprise installation approval are separate.
- [ ] Establish `RemoteDebuggingAllowed`, `DeveloperToolsAvailability`, applicable DevTools URL allow/block rules and extension runtime host restrictions. Extension debugger is also governed by DevTools policy. Do not infer Linux policy support from Windows policy tables. [S03, S07](SOURCES.md)
- [ ] Review launch sandbox defaults against the approved platform; require browser sandboxing where supported and fail if the approved hardened configuration cannot launch. The inspected Playwright source can add `--no-sandbox` unless `chromiumSandbox` is explicitly true; do not inherit that default without review. [S11](SOURCES.md#s11)
- [ ] For owned mode, provision a distinct approved browser-side profile root with per-user access. Confirm expected sign-in, profile retention and shutdown behavior. No reuse, copy or unlocking of an active human profile.
- [ ] For existing mode, document approved pre-enabled endpoint or extension path. If a restart is necessary, schedule it explicitly; never silently terminate Edge, background processes or startup boost sessions.

## Option-specific installation and permissions

| Route | Required assets | Admin / restart considerations |
| --- | --- | --- |
| Playwright owned | Approved browser-side Node, Playwright and Edge; bridge if WSL → Windows | User-mode launch can suffice under permissive policy; enterprise deployment/signing may require admin. Separate profile avoids taking over human profile. Debugging-pipe permission still required |
| CDP | Approved Edge plus pinned client | Debug-enabled launch may require restart; endpoint must be separately approved. No new admin privilege inherently required for user-mode browser, but policy changes belong to administrators |
| WebDriver | Edge + same-OS EdgeDriver + Selenium 4/framework | Driver/browser first three version parts must match. Explicit driver path; no implicit Manager acquisition. Service lifecycle and policy qualification required [S02, S26] |
| Extension/native host | Signed/approved MV3 extension, native executable, manifest/registration, broker | HKCU host can be user-level if allowed; system registration needs enterprise/admin deployment. Rollout/reload/restart behavior must be recorded. Host is installed separately from extension [S08, S16] |
| Remote | Browser-side adapter and approved secure transport, trust roots and identity | Service provisioning/firewall is separately approved. Run browser as intended interactive/test user, never a broadly privileged service account |

- [ ] Native host allows only the approved extension IDs; account for IDs changing when repacked. Review `NativeMessagingBlocklist`/allowlist and `NativeMessagingUserLevelHosts`. Validate path ACLs and executable signature, not just manifest syntax. [S08, S16–S17]
- [ ] Extension permissions and target restrictions are approved. Developer-mode unpacked sideloading is a lab-only option if explicitly allowed, not an enterprise deployment strategy.
- [ ] For self-hosted Windows extensions, verify AD domain/hybrid join conditions; Entra-only is not sufficient according to Microsoft's self-host guide. Keep CRX signing key offline, consistent extension identity, internal update manifest and payload location. [S14]
- [ ] Set both initial installation and subsequent update sources to approved offline/intranet locations. The force-install URL governs initial install; subsequent updates normally follow extension manifest `update_url` unless policy overrides it. Force install implicitly grants permissions, so LAB still needs per-session consent. [S15]
- [ ] Treat file-based deployment and disconnected-machine updates as candidates requiring exact-version qualification. Do not assume a CRX dragged onto any managed Edge will install. Internal extension distribution may be static approved content; it must not expose a browser-control service.

## Offline supply chain

**R — mandatory release manifest before PoC:** record each artifact's name, exact version, OS/architecture, official source URL, source commit if available, SHA-256 of acquired bytes, upstream signature verification result, license/redistribution terms, dependency lock/integrity, approval owner and update/revocation procedure. No binaries were acquired here; **artifact hashes are deliberately not invented**. Source commits in SOURCES are research pins, not binary hashes.

| Artifact | Study pin / required completion |
| --- | --- |
| Playwright | 1.64.1 / `cfe490d941f992655948eee8fd4fd94e1c4234bf`; Apache-2.0 declared; inspected root requires Node ≥20. Choose a supported approved exact Node build; bundle its dependencies/licenses |
| Playwright MCP (optional) | 0.0.83 / `f183dad4a52965583e3cc1d59b88cdc279e2e57d`; Apache-2.0; package requires Node ≥18 but transitive requirements prevail; pins Playwright alpha `1.64.0-alpha-1790635538000`. Qualify separately from stable 1.64.1 |
| Playwright Extension (candidate) | Manifest 0.4.0 in Playwright stable source; store artifact and MCP compatibility unverified. Approved reproducible build/CRX ID/signature/hash required |
| Edge / EdgeDriver | Observe actual approved install; full version and platform hash/signature required. Public download page snapshot advertised stable 152.0.4191.66; this is not a qualified or mandated deployment pin [S27] |
| Native host / bridge | Not implemented; future exact build, source/license, signature and byte manifest required |
| Linux/Windows support files | Required OS libraries, runtime, fonts, CA roots, optional codecs; approved license inventory and architecture-specific versions |

- [ ] Prepare all assets on an approved connected staging system; transfer only approved hash-verified bundles using the organization's import process. Keep source and build recipe sufficient to reproduce custom components and verify upstream binary identity where reproducible builds are unavailable.
- [ ] Runtime starts from explicit local paths. No `npx ...@latest`, package registry resolution, browser/driver auto-install, online MCP registry lookup, cloud relay, store dependence, DevTools CDN or remote fonts/scripts.
- [ ] Playwright browser-install suppression is only a packaging control (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` in inspected source), not an egress sandbox. Use approved existing Edge and test missing-browser refusal. [S11]
- [ ] Prefer explicitly provided EdgeDriver over Selenium Manager. If Manager is retained, qualify `SE_OFFLINE=true` and `SE_AVOID_STATS=true`; its documented statistics default is enabled. [S26]
- [ ] Disable optional runtime telemetry/update checks through approved supported configuration; document any component without a verified off switch. Edge updater, diagnostics, crash reporting, sync and OS services need enterprise-approved controls. This study does not assert that Playwright launch flags disable all browser/OS egress.
- [ ] Apply independent egress enforcement and record attempted as well as successful external connections in the future test. No public access is required for startup/control; permitted internal extension updates are a separate managed process.
- [ ] Update browser, driver and automation bundle together through staging, hashes, license review and regression gates. Requalify policy changes and compatibility; maintain a known-good compatible set and forward-fix/rollback plan allowed by enterprise policy. Do not freeze browser security updates indefinitely.

## Networking, identity and data

- [ ] Choose approved WSL interop/stdio or qualify existing mirrored IPv4 loopback. NAT host IP is not Windows loopback. Inventory Windows/Hyper-V firewall and VPN/proxy constraints without changing them. No blanket inbound allow or unauthenticated port forwarding. [S04, S18]
- [ ] Remote connections use approved authentication, encryption and host identity validation. Refuse credentials in URLs/logs and accidental cross-user access; no raw debugging LAN listener.
- [ ] Establish a separate approved model destination and egress policy. Browser tools must not trigger a provider switch or send page contents to an unapproved model.
- [ ] Verify app/IdP/DNS/certificates/assets within the airgap using fixtures first. Browser owns normal authentication; no password/cookie/storage-state import or extraction.
- [ ] Approve artifact size/type/path/retention and content exposure. Screenshots, AX trees and DOM may contain sensitive data. Disable network traces/HAR by default; never collect auth headers for diagnostics.
- [ ] Provide visible revoke, lease expiry, human takeover, stale-target refusal and owned-only cleanup procedures. Qualification evidence must identify actual target/OS/version without leaking user data.
