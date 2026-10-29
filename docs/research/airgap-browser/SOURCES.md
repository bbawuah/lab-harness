# Primary evidence register

Research date: 2026-10-29. Research only; no browser attachment or runtime qualification.

## First checkpoint

Verified before writes: cwd verified as the app-bound `lab-harness/research-airgap-browser-connection` worktree (absolute user path omitted from publication), branch `research/airgap-browser-connection`, HEAD `43a6ac2267d0261998453d56bd7f834956531812`, clean status. No AGENTS.md found in the worktree or checked ancestor directories. Read lead skill and review discipline; solo research, no subagents/provider calls. Read `docs/architecture.md` and `docs/research/model-providers.md`; they remain unchanged.

Initial source map: Microsoft Edge DevTools protocol and WebDriver/EdgeOptions; Edge enterprise debugging/extension/native messaging policies; Microsoft WSL networking; Chromium debugger API; Playwright browser types/channels and release source; Playwright MCP release source; MCP transport specification. Primary findings: existing tabs need a pre-enabled debugging endpoint or approved extension; WSL NAT does not imply Windows loopback reachability; extension debugger is also subject to DevTools policy. MCP adds tool transport, not permission to attach.

Version checkpoint: Playwright v1.64.1 (`cfe490d941f992655948eee8fd4fd94e1c4234bf`), release 2026-10-14; Playwright MCP v0.0.83 (`f183dad4a52965583e3cc1d59b88cdc279e2e57d`), release 2026-09-28. MCP pins Playwright `1.64.0-alpha-1790635538000`; do not silently substitute stable. Full source register follows in the completed study.

## Reading conventions and source dates

All sources below were consulted **2026-10-29**. **D** = primary documentation, **S** = immutable release source inspected, **R** = our inference; none establishes installed-environment behavior. Microsoft HTML `ms.date` and `updated_at` can differ; both are recorded where fetched. Rolling references are dated observations, not immutable guarantees. API names in references identify capabilities, not permission to use them.

Some Microsoft Learn responses included a generic authorization banner while returning the full public article body; only that returned public body was read. No login, directory switching or access-denial bypass occurred. One ordinary 404 occurred for `microsoft/playwright-mcp/.../extension/README.md`; the release README links the moved extension to `microsoft/playwright/packages/extension`, which was then inspected at the stable release commit. No alternate identity or restricted content was accessed.

### S01

**D — Edge CDP.** [Microsoft Edge DevTools Protocol](https://learn.microsoft.com/en-us/microsoft-edge/devtools/protocol/), “Using the DevTools Protocol” and HTTP endpoints. `ms.date` 2021-04-06; `updated_at` 2025-11-26. Documents close/relaunch with remote debugging, optional distinct profile, target listing/WebSocket connection and protocol description. It does not promise arbitrary existing-process attachment or endpoint authentication.

### S02

**D — Edge WebDriver.** [Use WebDriver to automate Microsoft Edge](https://learn.microsoft.com/en-us/microsoft-edge/webdriver/), “Download Microsoft Edge WebDriver”, framework and policy sections. `ms.date` 2024-12-12; updated 2026-07-30. Requires browser, driver and framework; first three version components match; Selenium 4 supported. Platform/version/policy checks remain necessary.

### S03

**D — debugging policies.** [RemoteDebuggingAllowed](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/remotedebuggingallowed), updated 2026-09-28; [DeveloperToolsAvailability](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/developertoolsavailability), updated 2026-10-07. Remote-debug policy covers desktop port/pipe switches; DevTools policy explicitly covers direct CDP and extension debugger, with URL allow/block precedence. Policy platform tables must not be extrapolated to Linux.

### S04

**D — WSL networking.** [Accessing network applications with WSL](https://learn.microsoft.com/en-us/windows/wsl/networking), updated 2025-08-06; sections NAT, mirrored mode and firewall. NAT Linux→Windows uses host addressing, while mirrored mode on Windows 11 22H2+ supports IPv4 localhost. WSL 2.0.9+ enables Hyper-V firewall by default on supported Windows. Generic broad-bind examples are not safe browser-control recommendations. This study recommends no networking changes.

### S05

**D — attach and lifetime options.** [Capabilities and EdgeOptions](https://learn.microsoft.com/en-us/microsoft-edge/webdriver/capabilities-edge-options), `ms.date` 2022-06-09; updated 2026-09-02. Relevant fields: `args`, `binary`, `debuggerAddress`, `detach`, `wdpAddress`. An address parameter requires a server already available; it does not enable one. `detach` has shutdown and temporary-profile cleanup consequences that must be tested for borrowed sessions.

### S06

**D — Edge extension API support.** [Supported APIs](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support), `ms.date` 2023-12-13; updated 2026-08-12. Lists debugger, nativeMessaging and related extension APIs by platform/manifest version. API presence does not override effective enterprise policy or restricted targets.

### S07

**D — Chromium debugger extension.** [chrome.debugger / browser.debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger), rolling API reference accessed on research date. Relevant sections: permission, tab targets, restricted domains, attach/sendCommand and onDetach. Accessibility, DOM, Input and Page are available; not every CDP domain is available. Tab close/DevTools can detach. Chrome policy/version details are not automatically Edge policy evidence; use S03 for Edge.

### S08

**D — native messaging.** [Microsoft Edge native messaging](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging), `ms.date` 2024-01-09; updated 2026-09-02. Relevant sections: nativeMessaging permission, host `path`/`stdio`/`allowed_origins`, HKCU/HKLM registration, host communication framing and limits. Browser starts a separately installed native executable; Windows host registration is not a WSL service. Broker rendezvous and authentication in our diagram are R.

### S09

**D — Playwright connection methods.** [BrowserType.connectOverCDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp) and [connect](https://playwright.dev/docs/api/class-browsertype#browser-type-connect), rolling docs accessed 2026-10-29. CDP connection is Chromium-only and documented as lower fidelity. Native Playwright `connect` expects a launched Playwright server and compatible major/minor library versions. These are separate protocols.

### S10

**D — channels and installation.** [Playwright browsers](https://playwright.dev/docs/browsers), “Google Chrome & Microsoft Edge”, enterprise policy and download-management sections; rolling docs accessed 2026-10-29. Branded channel support does not include the browser automatically. Enterprise policy can interfere. Runtime acquisition is disallowed for the proposed airgap bundle.

### S11

**S — Playwright stable source.** [v1.64.1 release](https://github.com/microsoft/playwright/releases/tag/v1.64.1), published **2026-10-14T11:51:33Z**; tag resolved via [commit API](https://api.github.com/repos/microsoft/playwright/commits/v1.64.1) to **cfe490d941f992655948eee8fd4fd94e1c4234bf**, commit date 2026-10-13T21:18:30Z.

- [package.json](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/package.json): version, Node ≥20 root engine, Apache-2.0.
- [chromium.ts, CDP connection](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/playwright-core/src/server/chromium/chromium.ts#L90-L169): HTTP/WebSocket discovery, transport closure and artifact cleanup; does not qualify every public close method's effect.
- [chromium.ts, launch arguments](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/playwright-core/src/server/chromium/chromium.ts#L355-L390): owned user-data dir, remote-debugging pipe, sandbox option handling. Future bundle must review sandbox defaults; do not automatically disable the browser sandbox.
- [chromium.ts, channel endpoint discovery](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/playwright-core/src/server/chromium/chromium.ts#L478-L499): reads profile `DevToolsActivePort`. Not proof of Edge support for a particular enable-debug UI; no profile discovery performed here.
- [registry/index.ts](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/playwright-core/src/server/registry/index.ts#L631-L658): OS-specific Edge channel paths; [download suppression](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/playwright-core/src/server/registry/index.ts#L1336-L1339). No cross-OS channel-launch guarantee.

### S12

**S — Playwright MCP release.** [v0.0.83](https://github.com/microsoft/playwright-mcp/releases/tag/v0.0.83), published **2026-09-28T23:17:11Z**; [commit API](https://api.github.com/repos/microsoft/playwright-mcp/commits/v0.0.83) resolves to **f183dad4a52965583e3cc1d59b88cdc279e2e57d**, commit 2026-09-28T23:12:55Z.

[package.json](https://github.com/microsoft/playwright-mcp/blob/f183dad4a52965583e3cc1d59b88cdc279e2e57d/package.json#L1-L50) pins both Playwright dependencies to `1.64.0-alpha-1790635538000`, declares Node ≥18 and Apache-2.0. [README configuration](https://github.com/microsoft/playwright-mcp/blob/f183dad4a52965583e3cc1d59b88cdc279e2e57d/README.md#L410-L511) describes CDP/extension/isolated/shared-context options and persistent profile contention; [security](https://github.com/microsoft/playwright-mcp/blob/f183dad4a52965583e3cc1d59b88cdc279e2e57d/README.md#L823-L825) says it is not a security boundary. Origin filtering is not egress isolation. No MCP server run.

### S13

**S — existing-tab extension candidate, separate from MCP release.** [Playwright Extension README](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/extension/README.md): tab selection, connection approval, profile-specific optional bypass token, client tab groups and single-client membership. [Manifest](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/extension/manifest.json): version **0.4.0**, MV3, debugger/activeTab/tabs/tabGroups, `<all_urls>`, no nativeMessaging. [Background source](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/extension/src/background.ts) references relay WebSocket/worker lifetime. These source observations do not verify store binary identity or compatibility with S12's alpha dependencies.

### S14

**D — offline enterprise extension distribution.** [Self-host Microsoft Edge extensions](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-manage-extensions-webstore), `ms.date` 2023-07-20; updated 2026-06-15. Relevant: Windows AD/hybrid join versus Entra-only limits, CRX/PEM identity, update XML and same-key version updates. Internal hosting and managed import are required design work; no deployment performed.

### S15

**D — force install/update behavior.** [ExtensionInstallForcelist](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/extensioninstallforcelist), dated 2026-07-09. Initial install URL differs from subsequent manifest update source unless overridden; supports specified URL schemes; non-AD Windows has store restrictions. Silent install implicitly grants permissions and does not apply to InPrivate. LAB session consent is an additional proposed control.

### S16

**D — host privilege level.** [NativeMessagingUserLevelHosts](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/nativemessaginguserlevelhosts), dated 2026-05-22. Disabled policy requires system-level hosts; otherwise user-level hosts may be used. User-mode capability is not enterprise authorization.

### S17

**D — native host denial.** [NativeMessagingBlocklist](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/nativemessagingblocklist), rolling policy page accessed 2026-10-29. Wildcard denies hosts unless explicitly allowed; effective allowlist must be reviewed with it.

### S18

**D — WSL Windows process interoperability.** [Working across Windows and Linux file systems](https://learn.microsoft.com/en-us/windows/wsl/filesystems#run-windows-tools-from-linux), rolling page accessed 2026-10-29. Windows executables can be invoked from Linux; OS path semantics remain distinct. Our framed stdio bridge, cancellation and identity binding are proposals needing T1 qualification.

### S19

**D — MCP transport.** [MCP transport specification, revision 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports). Explicitly pinned protocol revision, not a claim it is the newest revision. Defines stdio and Streamable HTTP, Origin validation and local-server security considerations. Does not define Edge attachment, tab selection or read-only browser authority.

### S20

**D — Chrome-specific security change.** [Changes to remote debugging switches](https://developer.chrome.com/blog/remote-debugging-port), published/updated **2025-03-17**. Chrome 136 requires a non-default data directory for these switches; default-profile debugging has credential-abuse implications. Do not silently assume this exact version threshold for Microsoft Edge.

### S21

**D — Chromium driver limits and endpoint risk.** [Unsupported operations with remote debugging](https://developer.chrome.com/docs/chromedriver/help/operation-not-supported-when-using-remote-debugging) and [ChromeDriver security considerations](https://developer.chrome.com/docs/chromedriver/security-considerations), rolling pages accessed 2026-10-29. Existing attach can lack commands dependent on launch-time automation extension; local-only default and low-privilege protected execution are documented. Edge-specific behavior remains untested; no anonymous remote driver recommendation follows.

### S22

**D — CDP operation reference.** Rolling tip-of-tree references, accessed 2026-10-29: [Accessibility](https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/) (`getFullAXTree`), [DOM](https://chromedevtools.github.io/devtools-protocol/tot/DOM/) (`getDocument`, `setFileInputFiles`), [Page](https://chromedevtools.github.io/devtools-protocol/tot/Page/) (`captureScreenshot`, navigation), [Input](https://chromedevtools.github.io/devtools-protocol/tot/Input/) (mouse/key/text), [Browser](https://chromedevtools.github.io/devtools-protocol/tot/Browser/) (download behavior/events). Tip-of-tree is not a stable installed-Edge schema; qualify supported methods against the approved build. Browser-domain capabilities cannot be assumed through extension debugger.

### S23

**D — Playwright files/actions.** [Downloads](https://playwright.dev/docs/downloads) and [actions/upload files](https://playwright.dev/docs/input#upload-files), rolling documentation accessed 2026-10-29. Download event/save semantics and file-input APIs support a controlled artifact adapter. Cross-OS staging, permissions and retention are our design, not automatically supplied by the APIs.

### S24

**D — Selenium upload.** [File upload](https://www.selenium.dev/documentation/webdriver/elements/file_upload/), rolling docs accessed 2026-10-29. File input receives a path; not general native dialog control. Remote file transfer and OS paths must be qualified.

### S25

**D — Microsoft remote-device variant.** [Remotely debug Windows devices](https://learn.microsoft.com/en-us/microsoft-edge/devtools/remote-debugging/windows), `ms.date` 2025-03-03; updated 2026-09-02. Remote Tools and Windows Device Portal require device configuration and additional deployment. Source example paths are not an airgap deployment manifest.

### S26

**D — offline driver management and telemetry.** [Selenium Manager](https://www.selenium.dev/documentation/selenium_manager/), rolling docs accessed 2026-10-29; configuration and data-collection sections. `SE_OFFLINE` disables its networking/downloads; `SE_AVOID_STATS` disables documented default-enabled statistics. Explicit local driver selection avoids runtime acquisition. No Selenium version/binary was qualified in this study.

### S27

**D — public browser/driver catalog snapshot.** [Microsoft Edge WebDriver downloads](https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver), observed 2026-10-29: stable **152.0.4191.66**, beta **154.0.4258.9**, dev **155.0.4268.0**. Mutable catalog/crawl observations do not establish installed build or compatibility. Operator inventory takes precedence; no executable downloaded.

## Evidence limits

The release API calls and source reads establish the above source pins only. No source tarball, extension, browser or driver was executed or installed. No artifact SHA-256 or deployment approval exists yet. Browser-side capabilities, Linux support on the actual distro, WSL pipe/loopback behavior, extension-store/source equivalence, SSO, local adversary isolation and recovery remain untested. The PoC gates deliberately separate each claim.
