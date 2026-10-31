# Agent tools follow-up contract

2026-10-31. Research plus authorized owned-fixture experiments; no production integration changes.

Binding verified: existing app-bound browser-research worktree, clean at 87107f8. Fetched main 5a4edc2797d005643a1fc2f4c40404f4a2974b39 and created Git branch `research/agent-browser-desktop` there. T3 still labels the branch with the old research name; the worktree path is unchanged and actual Git HEAD is authoritative. Old branch/history preserved. No applicable repository AGENTS found. PR17/18 remain untouched.

## Scope and evidence contract

Own `docs/research/agent-tools/**`, `experiments/agent-tools/**` and normal publication-manifest refresh. Acquisition, caches and disposable state use project-local `.tmp/agent-tools` (excluded by existing publication policy), never a global installation. Read upstream skills before tool operation. Source-proven, deterministic local observations, operator actions and real model/Pi tool observations are separate evidence classes.

First trial: native macOS arm64 tools, ephemeral owned browser, loopback synthetic fixture, bounded snapshot/reference/form/action/assertion/screenshot/error/close checks. Desktop reads target only an owned disposable fixture application's PID; interactions only if existing AX permission allows them. No personal app enumeration, desktop-wide capture, user profiles/cookies, TCC bypass or security-setting changes. Genuine permission failures are outcomes.

Model gate: no inference until root coordinates credential injection, exact route/model and budget. No credential-store searches or secret output. Maximum planned successful browser scenario: 12 requests, 20k input/4k output tokens. Tool subprocesses receive no provider key. Any integration trial must use an explicitly labelled experimental Pi/LAB launcher and scoped tool extension; CLI success alone is not model integration or public-launcher support. Public launcher currently does not load these tools.

Produce pinned runnable trial scripts, sanitized machine evidence and native captures where possible, concise primary-source report, self-contained HTML report rendered through T3, and a fresh independent review before draft PR. No watcher, production code, full product gate, merge or frozen-PR changes.

## First source map / release pins

- [agent-browser v0.41.0](https://github.com/vercel-labs/agent-browser/releases/tag/v0.41.0), published 2026-10-29T02:52:55Z; source `1453dd37a40c730fe00f592bc32198a896ff8747`. Native Rust browser CLI/daemon; not the previous Playwright stack. macOS arm64 release binary SHA-256 `a402fef2489c221b17522aa21f103ca5dc47f00ff5879d4a72c39881544730ab` from release API. Apache-2.0.
- [agent-desktop v1.0.2](https://github.com/vercel-labs/agent-desktop/releases/tag/v1.0.2), published 2026-10-30T21:17:30Z; source `a47ed664e0db00d1d4df364eb3fe8a5599882f3c`. macOS arm64 native archive SHA-256 `7bee385196d7b478de80cf05ca4304aaa38f0eba593b3406ad3c247c1773be19`. Apache-2.0. Native OS accessibility; scoped refs and delivery/retry envelopes.
- Inspect version-matched READMEs, bundled browser/desktop/platform skills, Rust session/config/security/launch/action code and JSON output contracts. Verify ambient config avoidance, opt-in safeguards, profile/allowlist incompatibility, sandbox flags and no-telemetry claim before execution.
- Reuse [airgap findings](../airgap-browser/SUMMARY.md) for enterprise/WSL and borrowed-profile caveats; re-evaluate implementation-specific Playwright autoattach findings for native Rust instead of assuming equivalence. Reuse [model design](../model-providers.md) for explicit route and credential ownership.
- [Supplied social post](https://x.com/ctatedev/status/2116323148706771302): root received HTTP 403. Contents unavailable; no claims inferred and no access-denial bypass.

Release hashes above are expected acquisition identities, not yet observed execution evidence. Findings and trial results follow in separate files.
