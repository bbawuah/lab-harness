# Dated primary evidence

Inspected 2026-10-31. Links below pin implementation evidence; rolling web documentation is not substituted for release behavior. Release times and executable hashes are in [CONTRACT](CONTRACT.md); observed binaries/browser versions and results are in [evidence](evidence/browser-trial.json). No social-post contents available after root's HTTP 403.

| Evidence | Exact primary source | What it supports |
|---|---|---|
| Browser release | https://github.com/vercel-labs/agent-browser/releases/tag/v0.41.0 | Release identity/assets |
| Desktop release | https://github.com/vercel-labs/agent-desktop/releases/tag/v1.0.2 | Release identity/assets |
| Browser license | https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/LICENSE | Apache-2.0 repository license |
| Desktop license | https://github.com/vercel-labs/agent-desktop/blob/a47ed664e0db00d1d4df364eb3fe8a5599882f3c/LICENSE | Apache-2.0 repository license |
| Browser architecture | https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/README.md | Native CLI, CDP, integrations/platform overview |
| Browser runtime skill | https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/skill-data/core/SKILL.md | Observe/ref/action loop, security, sessions, output |
| Security documentation at pin | https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/docs/content/docs/security.mdx | Opt-in controls and allowed-domain incompatibilities |
| Sessions documentation at pin | https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/docs/content/docs/sessions.mdx | Ephemeral default, restore/persistence, shared-CDP boundaries |
| Config parser | https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/cli/src/flags.rs | Explicit config and environment handling |
| Native launch | https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/cli/src/native/cdp/chrome.rs | Temporary profiles, executable selection, environment-dependent sandbox choices |
| MCP implementation | https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/cli/src/mcp.rs | Typed tools, one-shot calls, run_cli re-exec, session propagation |
| Generated tool catalog | https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/packages/%40agent-browser/sandbox/mcp-tools.json | Schemas, annotations and profiles; generated from CLI |
| Catalog usage | https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/packages/%40agent-browser/sandbox/README.md | One-shot MCP as integration surface |
| Desktop core skill | https://github.com/vercel-labs/agent-desktop/blob/a47ed664e0db00d1d4df364eb3fe8a5599882f3c/skills/agent-desktop/SKILL.md | Ref lifetime, inspect/act/verify, delivery and retry semantics |
| macOS skill | https://github.com/vercel-labs/agent-desktop/blob/a47ed664e0db00d1d4df364eb3fe8a5599882f3c/skills/agent-desktop-macos/SKILL.md | Exact manual TCC prerequisites; screenshot permission optional for AX-only operations |
| Socket validation | https://github.com/vercel-labs/agent-desktop/blob/a47ed664e0db00d1d4df364eb3fe8a5599882f3c/src/command_host/command_host_socket.rs | validate_parent rejects relative path |
| Socket connect | https://github.com/vercel-labs/agent-desktop/blob/a47ed664e0db00d1d4df364eb3fe8a5599882f3c/src/command_host/command_host_connect.rs | Unix endpoint length bound |
| Socket endpoint | https://github.com/vercel-labs/agent-desktop/blob/a47ed664e0db00d1d4df364eb3fe8a5599882f3c/src/command_host/command_host_endpoint.rs | temp-dir-derived endpoint and private host directory |

Existing enterprise/WSL primary sources and their dated qualifications remain in [airgap SOURCES](../airgap-browser/SOURCES.md), not re-certified by this macOS trial. Current LAB launcher/route context was read from `src/pi/workspace.ts`, `src/pi/workspace-config.ts`, `src/pi/workspace-extension.ts` and [model provider design](../model-providers.md) at base `5a4edc2797d005643a1fc2f4c40404f4a2974b39`. No production file was changed.
