# Terminal screen, state and copy specification — DESIGN

All commands/actions below are proposed UX, not current command documentation.
P1 is the baseline API-key/none phase; P2 adds discovery; P4 login screens stay
unavailable until their integration gate clears. [Recovery](recovery.md) defines
failures. [Acceptance](contracts.md) defines proof before shipping.

## Common interaction contract

Header: `Connect a model · Step N of 7`; persistent footer:
`Enter Continue · Esc Back · Ctrl+C Cancel`. Numbered alternatives and ordinary
line input must work without cursor positioning. Tab/Shift+Tab moves focus;
Up/Down selects; Enter activates the focused choice; Space toggles a checkbox.
Never bind single-letter actions while typing text. Default focus is the least
committing action: Continue for local input, Cancel for network/cost confirmation.
No inference starts merely because Enter advances a form.

Back retains validated non-secret fields in memory. Changing provider resets
protocol, endpoint, model and capability draft; changing endpoint/auth/protocol
invalidates discovery and observations. Warn before discarding entered fields.
Back from a private-key field clears the key and shows `Key cleared. Enter it
again to continue.` Cancel/Ctrl+C invalidates pending attempts, drops draft
secrets, closes owned listeners/requests and returns to the original selection:
`Connection setup cancelled. Saved settings unchanged.` EOF does the same;
non-TTY configuration requiring secret entry stops with `Private entry requires
an interactive terminal. Run lab --configure in a terminal.` It must not read
script/stdin bytes as answers. Save is the only persistence boundary.

At 80+ columns use label/value rows; below 60 use one field per line. At 40x16
paginate sections with a visible step and `More / Back`; no clipped destination,
model ID or hidden charge warning. At 20 columns keep linear wrapped labels and
values navigable; never silently truncate identifying text. Long URLs have a
separate full-text view and explicit Copy action. NO_COLOR/TERM=dumb use ASCII
labels (`Selected`, `Unknown`, `Failed`) and numbered choices, no icons required.
Screen-reader/linear mode emits each state once, does not redraw a spinner or
countdown every second, announces focus, errors next to fields and final state.
Respect reduced motion; no required animation, color, mouse or clipboard.
Escape untrusted text, including ANSI/OSC/BiDi control characters, before display.

## Seven screens

| Step/state | Exact principal copy and fields | Transition / persistence |
| --- | --- | --- |
| 1 Provider | `Choose the service you want to connect.` Choices: OpenAI API; Anthropic / Claude API; Ollama; LM Studio; Other compatible server; Existing LiteLLM; Saved profiles. Footer: `Saving setup sends no request.` | Selection is draft only. Saved profiles goes to manager below |
| 2 Auth method | `How should LAB authenticate?` Provider-appropriate: Private API key/token; Explicit environment reference; No authentication (server presets only). Informational row: `Subscription sign-in — unavailable in this LAB phase` with `Why?` | No automatic ambient credential lookup. Why opens eligibility text from providers.md, then returns; no browser opens |
| 3 Endpoint | `Where should requests go?` Connection label; base URL; protocol; routing declaration. `Review this destination before attaching a credential.` | Local validation only. Preserve custom path. Show HTTP warning when applicable. Changing destination requires fresh credential confirmation; no reuse by hostname similarity |
| 4 Credential or login | Key branch: `Enter the credential for {destination}. Input is hidden.` Environment branch: `Environment variable name (value will not be displayed):`. None branch: `No credential will be sent. Confirm this server allows unauthenticated access.` | Key input shows fixed `[hidden]`, not a length-revealing mask or suffix. Paste accepted as one value, control/newline input rejected safely; no echo/secret reveal/copy button. Missing named variable is repairable and never triggers fallback. P4 login conditional below |
| 5 Model | `Enter the exact model ID or gateway alias.` Separate friendly label optional. P2 action: `Discover models — sends a metadata request`. P1: manual or pinned catalog only | No auto-select cheapest/first/default paid model. IDs matched exactly, not fuzzily. Discovery failure preserves manual entry and prior inventory marked stale |
| 6 Capabilities | `What is known about this model?` Context capacity; configured context; maximum output; text/image input; reasoning; tool support; pricing. Every field shows provenance and observed date or `Unknown` | Unknown factual capacity remains unknown; launch requires explicit bounded operational limits. P1 minimum configured context 4096; reserve + keep + output < context. No metadata-derived automatic enabling of tools/images/reasoning |
| 7 Review | `Review connection. Saving sends no request.` Show label, exact destination/protocol/model, auth source (never value), billing, routing declaration, capabilities and individual check states | Actions: Save without opening; Save and open fresh workspace; Edit; Cancel. Default Save without opening. Opening is network-silent until explicit model use; bootstrap/startup must uphold baseline no-warming policy |

Example review copy (fictional endpoint/model; DESIGN):

```text
Review connection — DESIGN
Name          Team gateway
Destination   https://gateway.example.invalid/team/v1
Protocol      Chat Completions
Model         team-code
Authentication Private key (not tested)
Billing       Gateway-managed; cost and quota unknown
Route         Gateway; downstream location unverified
Context       8192 configured (operator-entered)
Output        1024 configured (operator-entered)
Tools         Unknown; no round trip observed
Connection    Configured; no request made

[Save without opening] [Edit] [Cancel]
```

Save result: `Saved {label}, revision {n}. No request was made.` On save failure,
show `Could not save. Previous settings remain active.` Retain non-secret draft
for retry; do not claim successful save before atomic activation. If optional
network tests were used, replace the no-request sentence with `Saved {label},
revision {n}. See recorded checks below.` Never falsely erase test history.

## Conditional P4 browser/device sign-in

This is a state-machine contract for an eligible, audited upstream adapter,
not a promise any provider supports either flow. For P1, no auth request is made
and no login button is actionable. No account password, email magic-link code,
API key or refresh token is entered into a generic login prompt in LAB.

| State | Copy/actions | Required behavior |
| --- | --- | --- |
| Explain | `Sign in on {verified provider domain}. LAB never asks for your account password. Eligibility and charges depend on your account.` Start sign-in / Back / Cancel | Start only after eligible provider+method selection and deliberate activation |
| Preparing | `Preparing sign-in…` Cancel | Unique attempt/generation; bounded initiation timeout. No active credential replacement |
| Browser ready | `Open the sign-in page on this device?` display validated domain and safe full URL. Open browser / Copy link / Back / Cancel | No automatic opening. Use OS opener with argument array, no shell. Only adapter-approved HTTPS authorization origin/path; refuse credentials, unsafe schemes/control characters. Full ephemeral URL is not logged |
| Device ready | `On a device you trust, open {verification URL} and enter the code below.` Code / `Expires in {remaining}` / Copy code / Copy link / Cancel | Only if upstream supports this exact client flow. Code shown in ephemeral terminal view, never session/log/history. Clipboard only after action; report success/failure honestly. Do not promise clipboard deletion |
| Waiting | `Waiting for approval in your browser. You can cancel here.` Retry open / Copy link / Back / Cancel | Poll only at upstream interval; honor slow_down and expiry. Browser opening is not authentication success; callbacks validate attempt/state/nonce/identity/scopes in audited adapter |
| Return/identity check | `Checking the returned account…` | Late callback after cancellation/expiry cannot save. Mismatched account: `The returned account differs from the selected account. Nothing was changed.` Start again / Back |
| Complete | `Sign-in completed. Model access and billing are not yet verified.` Show verified account/workspace label, expiry if known, no token | Draft credential remains separate until review/save; no automatic discovery or inference |
| Expired | `This sign-in attempt expired. Start again for a new code or link.` Start again / Back / Cancel | Expiry supplied by adapter, not a fabricated fixed duration. New attempt invalidates old one; no automatic renewal loop |
| Denied/unsupported | `Sign-in was not approved.` or `This sign-in method is unavailable for LAB.` Back / Choose API key / Cancel | No native-client impersonation, borrowed cache, account substitution or credential scraping |

Every login attempt has a finite adapter-provided expiry; if the protocol supplies
none, use a documented reviewed local timeout, initially proposed 5 minutes.
Initiation timeout proposed 30 seconds. These are LAB proposal values, not vendor
limits. On terminal close/cancel, stop local work and discard transient tokens;
remote authorization may still need provider-side revocation. Clear code/link
from the active view where possible, without promising scrollback erasure.

SSH/headless: `This browser must reach the sign-in callback on the machine
running LAB.` Prefer a supported device flow; Copy link alone does not repair
an inaccessible loopback callback. If device flow unavailable: `Browser callback
cannot be reached here. Use an API key or complete an approved callback setup.`
No automatic tunnel or cache-copy fallback. WSL: Windows-browser and WSL-loopback
reachability are unverified; keep the same fallback and explicit callback error.
Do not claim Relay/browser bridge research grants OAuth callback capability.
Copy unavailable: `Clipboard unavailable. Select and copy the displayed link.`
Browser opener failure: `Could not open a browser. Your sign-in attempt is still
waiting. Copy the link or cancel.` Retry open does not create a second attempt.

## Check actions and status vocabulary

Manager offers `Review checks`, never a vague `Test connection` that silently
runs inference. All check actions bind the selected saved revision. Each shows
operation, destination, credential source, data sent and a cancel action first.

| Action | Consent copy / execution limit | Result vocabulary |
| --- | --- | --- |
| Save / list / select | No request; do not resolve secret or refresh tokens for list | `Configured`, `Credential reference present` (not authenticated) |
| Discover models (P2) | `Send a metadata request to {destination}? No project content is sent. The server may contact upstream services.` Default Cancel. Proposed 10s, 1 MiB, 1000 models, at most 5 explicitly bounded pages, no automatic retry | `Metadata reachable at {time}`; auth `Accepted for model listing` only where meaningful, otherwise `Not established`; inventory `Fresh/Stale` |
| Inference check (later explicit validation action) | `Send the displayed synthetic prompt to {model} at {destination}? This may use paid credits. Price and quota are unknown. No project/history is included.` Show exact prompt `Reply with OK.` and configured output cap; Run once / Cancel | `Inference observed at {time}` only on valid complete response; response content need not exactly equal OK to prove transport, but report content mismatch separately |
| Tool check (separate consent) | `Run a synthetic tool round trip? This sends up to two model requests and may use paid credits. No files or shell commands are used.` Fixed tool lab_connection_echo with fixed harmless input/result | `Tool round trip observed at {time}` only after call, validated fixed tool result and final response; no arbitrary requested tool executes |

Proposed inference timeout 60s and tool timeout 120s; cancel is always available.
No automatic retry, fallback, warming, pull, load, quota lookup or billing-account
probe. The test's output cap is not a guaranteed monetary ceiling. An outcome
can remain unknown after timeout/cancel; upstream may have executed/charged.
Checks do not confer controlled task admission or general model quality.

## Saved state, switching and lifecycle

Persist only the baseline versioned connections/profiles, explicit credential
reference, selected default and dated non-secret observations/capability
provenance. Private keys use opaque IDs and guarded owner-only 0600 storage,
private directories, no symlink/hardlink, bounded size, atomic revision activation
and exclusive writer lock. No project files contain secrets. Do not persist an
unfinished wizard or login URL/code/PKCE values. Explicit environment references
store names only; re-resolve for fresh launch, never capture value into config.
No native auth cache, .env autoload, credential command or project-supplied URL.

Manager header: `Current session: {A/revision}. Next launch: {B/revision}.
Saved default: {C}.` Actions Configure / Choose for next fresh launch / Set
default / Review checks / Rotate credential / Disconnect / Remove / Cancel.
Selection is distinct from default. No startup discovery or credential refresh
just to display this manager. Missing references remain visible as Needs repair.

- **Switch:** `Changing connection requires a fresh session. Exit this workspace
  and launch {B}. Existing history will not be sent.` Active work must finish or
  explicitly abort before exiting; selection does not mutate the running route.
  Native resume/import: `Routed resume is not yet supported. Start a fresh
  session. Your existing session files are preserved.` CLI resume flags refused.
- **Rotate:** `Replace the credential for {destination}? This creates a new
  revision for future launches. Existing runs retain their current credential.`
  Validate/store atomically, invalidate checks, never remotely revoke the old
  key automatically. Explain provider revocation separately; clear failed draft.
- **Disconnect:** `Stop using this connection in future launches? Existing runs
  must exit to stop using their captured credential. This does not revoke access
  at the provider.` Default Cancel. Mark unavailable/remove default reference,
  no replacement identity. Remove LAB-owned secret only when no other saved
  reference needs it; external environment value is never deleted. Retained
  revision metadata must not retain secret bytes as a rollback convenience.
- **Remove:** `Remove this saved connection and its profiles? Session history
  will remain. Provider credentials are not revoked.` List affected profiles;
  never delete unrelated secrets or historical transcripts. Running snapshots
  remain until exit; do not falsely report upstream disconnection.
- **Revoke:** `Revoke the key or app authorization in the provider's official
  account settings. LAB has not revoked it.` Safe external link is explicit;
  deployment-specific gateway revocation goes to its administrator, no admin API.
- **Reconnect:** Re-enter key or use separately enabled official login. Preserve
  identity/profile label, create revision, reset observations, review destination
  and billing again. Revoked/expired credentials never select another account.

P3 is deferred: idle/abort boundary, explicit history routing consent, conversion
loss review, no tool re-execution or remote state-ID reuse, and missing-profile
pause are required before any in-process switch/resume is offered. P1 has no
`Continue this history on another provider` action.
