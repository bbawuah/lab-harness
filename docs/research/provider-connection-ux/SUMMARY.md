# Provider connection UX — DESIGN

2026-10-29 · Research/design only · Not implemented or runtime-qualified.

This narrows the [existing provider research](../model-providers.md),
[architecture ADR](../../architecture.md#adr-explicit-pi-backed-model-connections)
and [build plan](../../build-plan.md#continued-workspace-phases) into terminal
interaction contracts. Their Pi ownership, private revision model, fresh-session
P1 boundary and separate D0 review remain authoritative. No architecture rewrite,
new router, provider installation, account operation or controlled native task
admission is proposed here. Existing native task admission remains blocked.

## Decisions to review

- P1 connects OpenAI API, Anthropic API, Ollama, LM Studio, compatible servers and
  existing LiteLLM using an explicit API key/environment reference or explicit
  no-auth. Provider, protocol, host and billing identity are separate choices.
- Subscription sign-in is an explanatory, unavailable P4 option. Native client
  login, third-party eligibility, API credits and gateway billing are distinct.
  A Pi adapter or a successful sign-in does not prove LAB entitlement.
- Save sends no request. Metadata discovery and inference/tool tests are separate
  explicit actions. Each result is scoped to a connection revision, model,
  protocol, operation and observation time. Unknown is never displayed as free,
  unlimited, local-only, supported or ready.
- P1 profile/credential/endpoint changes apply only to a fresh launch. Preserve
  old transcripts; refuse resume/import even if the model name matches. Never
  select a replacement account, cloud route or model after failure.
- LAB never asks for an account password, imports native client caches, spoofs
  a client identity, launches a login automatically or stores secrets in history.

## Review package

| Artifact | Purpose |
| --- | --- |
| [Provider/auth/billing matrix](providers.md) | Choices, eligibility, host/protocol defaults and precise unknowns |
| [Terminal specification](terminal.md) | Screens, transitions, copy, keyboard behavior and persistence |
| [Recovery matrix](recovery.md) | Safe feedback and permitted recovery per failure |
| [Acceptance and staged contracts](contracts.md) | Small proposed file scopes, dependencies and review exits |
| [Dated official sources](sources.md) | Focused revalidation; baseline research reused |
| [DESIGN HTML](design.html) / [PNG](design.png) | Synthetic visual evidence; no runtime or account evidence |
| [Evidence provenance](evidence.json) | Capture identity and hashes |
| [Validation](validation.md) | Observed checks and pending publication integration |

## Important new clarification

The current OpenAI API-credit guide describes a benefit for eligible linked
subscriptions, separate from signed-in usage; it also excludes Codex API-key
usage from that benefit. LAB must show API billing/credit eligibility as unknown
for the actual organization and route, with provider billing authoritative.
Do not repeat the blanket claim that a subscription can never supply API credits.
See S4 in [sources](sources.md). Claude's third-party allowance is conditional and
may consume usage credits; LAB/Pi eligibility is not established (S5).

## Provenance and integration handoff

Sole writer: top-level T3 thread `mcp:679ab07e-d75e-4cd9-9535-55d523e51a53`,
branch `design/provider-connection-ux`, baseline HEAD
`43a6ac2267d0261998453d56bd7f834956531812`. App-bound worktree basename and shell cwd
both `design-provider-connection-ux`; branch/HEAD verified before writing. No
applicable AGENTS.md found in this checkout or its ancestor chain. One isolated
read-only Codex reviewer was subsequently requested by root;
review provenance and disposition are recorded in [validation](validation.md).
OpenAI Docs skill used for focused official-source checks.

Root extended this task’s ownership to the normal `docs/source-manifest.json`
additions for these ten files. The repository refresh workflow computes actual
SHA-256 values and records `status: "added"` without `originalSHA256`. Original
export provenance, existing current-file entries and immutable Relay anchors
remain unchanged. Local publication validation is recorded in validation.md;
this is not a full runtime/CI gate claim. Root owns CI monitoring and merge.
No runtime pin or shared extension change belongs to this task.
