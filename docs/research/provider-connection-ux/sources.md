# Focused official-source register

Retrieved/read 2026-10-29, unless the row explicitly records a failure. These are
living documentation pages, not release pins. No account, key, private server,
inference call or installation was used. The [baseline](../model-providers.md)
retains the pinned Pi 1.4.0 source audit and market comparison; not repeated here.
Dated retrieval does not establish future availability or an installed version.

| ID | Official source | Rechecked finding / limitation |
| --- | --- | --- |
| S1 | [OpenAI: Authentication](https://learn.chatgpt.com/docs/auth) | Native Codex sign-in, API-key access and headless/device options. Does not confer LAB rights; its cache-copy fallback is deliberately excluded from LAB |
| S2 | [OpenAI: OSS registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) | Distinct third-party registration, issued client identity, verified identity and plan permission; upstream compliance unresolved |
| S3 | [OpenAI: preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) | Plan sharing uses constrained Responses behavior, including streaming/store false and tool restrictions; ordinary API adapter success is insufficient |
| S4 | [OpenAI: API credits for subscribers](https://developers.openai.com/api/docs/guides/chatgpt-api-credits) | Eligible subscriptions can link to an owned API organization; expiring grants and purchased balances are separate. Codex API-key use excluded. LAB coverage/account balance unverified |
| S5 | [Anthropic: account login and subscription authentication](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account) | API recommended for third-party products; discretionary approved-tool use may draw usage credits; no misrepresented identity. Page says updated over two weeks ago, not an exact publication date |
| S6 | [Ollama: authentication](https://docs.ollama.com/api/authentication) | Local API needs no auth by default; direct cloud needs key; a signed-in local server can send cloud requests |
| S7 | [Ollama: OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) | Compatibility is a subset; local and hosted endpoints differ; Responses is stateless |
| S8 | [LM Studio: authentication](https://lmstudio.ai/docs/developer/core/authentication) | Optional API tokens since 0.4.0, default no auth; permissions chosen when token created |
| S9 | [LM Studio: list models](https://lmstudio.ai/docs/developer/openai-compat/models) | List can include downloaded/JIT-loadable models; not proof already loaded |
| S10 | [LiteLLM: virtual keys](https://docs.litellm.ai/docs/proxy/virtual_keys) | Client keys can have budgets/access controls/rotation; actual deployment policies unknown |
| S11 | [LiteLLM: model discovery](https://docs.litellm.ai/docs/proxy/model_discovery) | Hidden models can remain callable; wildcard discovery credentials and invocation access can differ |
| S12 | [Anthropic: API errors](https://platform.claude.com/docs/en/api/errors) | Auth, permission, billing/rate and streaming failures differ; statuses are evidence, not a universal billing diagnosis |
| S13 | [Ollama FAQ](https://docs.ollama.com/faq) | Server context configuration and cloud behavior require operator knowledge; LAB does not modify them |
| S14 | [LM Studio: tools](https://lmstudio.ai/docs/developer/openai-compat/tools) | Two retrieval attempts timed out. Tool-format limitation remains baseline-only evidence, not freshly verified |

All interaction wording, timeout/size proposals and acceptance conditions in
this package are **R: LAB design decisions**, not vendor promises. Actual OAuth
eligibility, gateway routes, model permissions, server versions, quota balances,
pricing and runtime interoperability remain **U**. Browser/device login drawings
are conditional P4 designs; they are not screenshots of working integrations.
