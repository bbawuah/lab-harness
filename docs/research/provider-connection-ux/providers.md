# Provider, authentication, eligibility and billing — DESIGN

Checked 2026-10-29. **D** = current official documentation; **B** = reused pinned
baseline research; **R** = proposed LAB behavior; **U** = unverified for LAB or
an actual deployment. Source IDs resolve in [sources.md](sources.md).

| Choice shown to user | Authentication and eligibility | Billing label and unknowns | LAB disposition / evidence |
| --- | --- | --- | --- |
| OpenAI API | Explicit project API key, stored privately or named environment reference; API organization must authorize selected model | `API usage; credits and remaining balance unknown`. Eligible linked Pro/Business subscriptions may provide API credits, with conditions; purchased credits may be consumed afterward. Not signed-in Codex allowance | P1; D S1/S4, B baseline. LAB-specific credit coverage untested; never promise benefit applies |
| ChatGPT subscription | Native Codex clients support ChatGPT login. Third-party OSS plan sharing has its own registration, identity, scope and protocol requirements | `Subscription eligibility not verified for LAB`. Account/workspace limits and charge behavior unknown | P4 unavailable; D S1–S3. Native login instructions are not LAB authorization |
| Anthropic / Claude API | Claude Console API key; API access separate from consumer login. Supported cloud-provider access exists but is not a new LAB cloud adapter in this scope | `API usage; balance and limits unknown` | P1; D S5. No Claude account password or native cache reuse |
| Claude subscription | Native Anthropic apps/Claude Code have subscription use; certain third-party tools may be allowed at Anthropic's discretion with usage credits | `LAB eligibility unverified; usage credits may be charged`. No included-use promise | P4 unavailable; D S5. API is the product-development path; no client impersonation |
| Ollama, existing server | Explicit none for an unauthenticated server, or key for an authenticated compatible endpoint/proxy. No automatic server sign-in | `Self-hosted declaration; downstream route and cost unverified`. Local Ollama can forward cloud requests | P1 Chat adapter; D S6/S7, B. Host can be this machine, remote, IPv6, LAN or tailnet |
| Ollama direct cloud | Documentation offers key-authenticated hosted compatible API; distinct from local-server auth | `Cloud API; account eligibility and charges unknown` | Explicit compatible-server configuration only after destination review; no automatic migration to cloud; D S6/S7 |
| LM Studio, existing server | Explicit none or private API token. Token authentication documented for 0.4.0+; installed version unknown | `Operator-managed; cost unknown`. Local hostname does not prove inference locality | P1 Chat adapter; D S8/S9, B. Same flow for any host; LAB does not load/download models |
| Other OpenAI-compatible server | User selects protocol and supplies endpoint; explicit none/key. Compatibility is a claim to validate, not detected from brand/model | `Operator-managed; routing, entitlement and cost unknown` | P1; R/B. No universal browser auth or automatic probing |
| Existing LiteLLM gateway | Operator-issued client/virtual key, explicit environment reference or explicitly unauthenticated deployment. Never require administrative master key | `Gateway-managed; upstream identity, subscription rights, limits, retries and cost unknown` | P1; D S10/S11, B. Gateway owns upstream routing; LAB installs/manages nothing |

An API-credit benefit is not a new LAB auth method. Link/claim/manage it outside
LAB in the provider's official interface, then use the authorized API key. LAB
neither activates credit benefits nor enables recharge. Gateway browser/SSO login
is not equivalent to an inference credential; unsupported deployment auth shows
`Ask your gateway administrator for a supported client credential.`

## Endpoint and protocol fields

| Preset | Suggested endpoint (editable) | Initial Pi API / visible protocol |
| --- | --- | --- |
| OpenAI API | `https://api.openai.com/v1` | `openai-responses` / Responses |
| Anthropic API | `https://api.anthropic.com` | `anthropic-messages` / Anthropic Messages |
| Ollama | `http://localhost:11434/v1` | `openai-completions` / Chat Completions |
| LM Studio | `http://localhost:1234/v1` | `openai-completions` / Chat Completions |
| Compatible server / LiteLLM | No guessed URL | Explicit Chat, Responses or Messages, as supported by deployment |

These reuse the baseline presets, not an assertion of actual server support.
`openai-completions` means Chat Completions here, not legacy prompt Completions.
Preserve custom mount paths; show the resulting base URL and protocol together.
Do not append `/v1` blindly, infer protocol from a model name, or change adapter
when a request fails. Alternate protocols require an explicit connection revision.

Any syntactically valid HTTP(S) host is eligible for entry. Reject userinfo,
query, fragment, control characters, ambiguous encoded separators and non-HTTP
schemes before showing or persisting the URL. Display the normalized ASCII host,
port and path in full; encode/escape terminal controls in all remote labels.
An explicit non-loopback HTTP destination requires this acknowledgement:
`This connection uses unencrypted HTTP. Anyone on its network path may read
credentials and prompts. Continue with this destination? [No / Continue]`.
Never downgrade TLS after a failure. No port scanning or host discovery.

`localhost` is the machine/network namespace running LAB, including SSH hosts,
containers and WSL. Copy: `A loopback URL does not prove local inference. Confirm
where this server routes requests.` Routing declaration is operator-entered
`self-hosted / cloud / gateway / unknown`, never inferred security assurance.

## Subscription integration gate

S2 describes issued client IDs, real app identity, validated ID token/nonce,
account binding and plan-use scope. S3 restricts Responses request shape/tool
support. Reuse an audited supported upstream flow; no new token engine in LAB.
The pinned Pi gaps documented in the baseline remain unresolved here. Native
Codex device login is not assumed available for the third-party OSS flow.

Before enabling any subscription option: obtain documented LAB eligibility,
audit current upstream identity/account/refresh/revocation behavior, qualify the
protocol with fixtures, and separately authorize live account validation. Keep
API keys available without encouraging policy workarounds. No cache extraction,
borrowed client ID, forged native identity, password prompt or paid fallback.
