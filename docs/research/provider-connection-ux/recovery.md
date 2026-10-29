# Error and recovery matrix — DESIGN

Messages are fixed templates with escaped, bounded non-secret placeholders.
Preserve the selected connection/revision unless the user explicitly changes it.
Raw provider messages, HTTP bodies/headers, redirects, stack traces, credential
suffixes and echoed inputs never reach terminal, logs, transcripts or history.
An allowlisted request ID must also pass a conservative length/character check.
Operation labels distinguish saving, discovery, sign-in, inference and tools.
Status alone does not establish provider billing semantics. S12 in
[sources](sources.md) informs categories; this UX policy is a LAB proposal.

| Failure / stage | Exact feedback | Recovery and state |
| --- | --- | --- |
| Invalid URL, protocol, model input | `Check {field}. No request was sent.` | Focus field; keep other safe draft fields; no auto-correction to another host/model |
| Unsupported/corrupt config | `Saved configuration could not be read safely. No connection was selected.` | Explicit repair/restore validated revision; never downgrade/fallback silently |
| Locked/private store or save error | `Could not save. Previous settings remain active.` | Retry after lock/permissions repair; cancel leaves original revision. Never weaken file permissions |
| Missing key/environment value | `The selected credential is unavailable. No request was sent.` | Replace explicit key or repair named variable; no ambient search/native-cache import |
| HTTP 401 | `Authentication was rejected for {operation}. Check or replace this credential.` | Profile stays saved; auth marked rejected for operation; no automatic re-login loop |
| HTTP 403 | `Access was denied for {operation}. Check account, model and gateway permissions.` | No claim key invalid; edit permissions outside LAB or choose explicitly; preserve configuration |
| HTTP 402 / recognized billing code | `The provider reported a billing restriction. Review billing with the provider or gateway administrator.` | No automatic purchase/recharge/account switch; show safe allowlisted code only |
| HTTP 429, reason unknown | `The provider limited this request. Rate or balance details are unknown.` | Manual retry same route, bounded Retry-After shown if safely parsed; no countdown that automatically resends |
| Known credit_balance_exhausted | `API credits are exhausted for this request. Review the selected organization's billing.` | Specific to recognized official response; do not infer from generic 429 or propagate arbitrary server text |
| DNS/refused/offline | `Could not reach {destination} for {operation}.` | Check host, server and network; manual retry; no scan/server install/cloud substitute. Offline startup mode does not prove inference isolation |
| TLS trust/hostname failure | `TLS verification failed. Check the destination and trusted certificate configuration.` | No insecure toggle, HTTP downgrade or global CA mutation. Administrator-managed trust setup outside wizard |
| Any redirect | `The endpoint redirected this request. LAB did not follow it.` | Explicit endpoint edit/review; do not open Location or forward credentials, even same origin |
| HTTP 404 / model-not-found | `The endpoint or model was not found. Check the base URL, protocol and exact model ID.` | Manual entry or explicit discovery; listing not definitive; no replacement model |
| Empty/denied/malformed discovery | `Model listing is unavailable. Enter an exact model ID or try discovery again.` | Keep cached inventory labelled stale with original timestamp, and saved profile; no forced auth reset |
| Discovery bounds exceeded | `Model listing exceeded the configured limit. Results are incomplete.` | Do not treat truncation as complete; manual ID or deliberately bounded next page; no implicit unbounded pagination |
| Unsupported tools/images/reasoning | `This request needs a capability that is unavailable or unverified.` | Review capability provenance/content; explicit compatible fresh profile; no silent image removal/tool text emulation |
| Context overflow | `This conversation exceeds the configured model budget. Shorten it or start fresh.` | No automatic summary, compaction or model upgrade; manual compaction remains a separate model request under baseline policy |
| Timeout / HTTP 5xx / overload | `The request did not complete. Its remote outcome is unknown.` | Cancel/explicit retry same route; warn `Retry may create another charge.` No automatic retries P1 |
| Stream failure after HTTP 200 | `The response was interrupted. Partial output is not a completed result.` | Preserve safe partial content as incomplete, never mark inference/tool success; do not replay tool actions |
| Cancel while request active | `Cancelled locally. The server may still finish or charge for this request.` | Abort owned work; late result cannot promote state; keep prior successful observations separately dated |
| Browser cannot open / clipboard unavailable | `Could not open a browser. Copy the link or cancel.` / `Clipboard unavailable. Select and copy the displayed link.` | Same attempt remains active until expiry; manual selection always available |
| OAuth expired / denied / wrong state | `Sign-in expired.` / `Sign-in was not approved.` / `Sign-in response could not be verified. Nothing was changed.` | Discard attempt; fresh explicit retry, never accept late callback or alter active credential |
| Credential expired/revoked during use | `This credential can no longer authorize the request. Reconnect to continue.` | Pause future requests; no account swap. P4 refresh only via audited adapter with bounded failure handling |
| Native resume/import P1 | `Routed resume is not yet supported. Start a fresh session. Your existing session files are preserved.` | Cancel before replay/inference, including matching-model and routing-unknown legacy histories |

Every failure records at most operation, revision ID, model ID, safe category,
status/code, bounded request ID and timestamp. Secret-containing fields are
excluded before native persistence, including successful fallback diagnostics.
Never ask the user to paste a raw log or token to recover.
