# Capability acceptance and staged implementation contracts — DESIGN

These are proposed future PR boundaries, not implementation authorization or
completed tests. Exact paths below are planning targets; coordinator must freeze
ownership against its latest tree before delegation. Existing shared extension,
launcher, Relay and publication files remain coordinator-owned. D0 requires a
fresh critical review of baseline unresolved findings as well as this UX. This
research does not clear that gate or qualify native controlled admission.

## Evidence model and acceptance

Saved observations bind connection ID/revision, protocol, operation, timestamp
and result. Model-specific observations also require the exact model ID;
connection/inventory discovery may have no selected model. Before Save, discovery
binds an immutable draft attempt/generation plus destination/protocol/auth
snapshot, and persists nothing. Only a matching Save may associate its results
with the new revision; edited/cancelled attempts and their late results are
discarded. Any endpoint/protocol/credential revision change resets
current validity; retain prior evidence labelled historical. Environment key
changes cannot be detected from a stored name alone: re-resolving for a fresh run
makes old auth observations historical, never current identity proof. Do not
store credential hashes merely to imply verification. Account/billing/route
claims need their own provenance; successful HTTP does not establish them.

| Field | Accepted evidence | Required counterexample fixture |
| --- | --- | --- |
| Configured | Complete locally valid revision, exact references, atomic activation | Partial write/corrupt version/missing reference; original remains active |
| Endpoint reached | Bounded response from selected destination for named operation | HTTP 401 still means endpoint responded, not auth success; DNS/TLS/redirect cannot mean ready |
| Authentication | Accepted for a specific authenticated operation; explicit none is `Not required by configuration`, never account-verified | Public model listing with wrong/unused key must not prove credential acceptance |
| Model visible | Exact ID in dated inventory, source and freshness shown | Hidden LiteLLM alias absent; LM Studio JIT model listed but not loaded |
| Inference observed | Valid terminal native stream/result for exact model/revision | HTTP 200 with interrupted/malformed stream; no success on headers alone |
| Tools declared | Catalog/server/operator evidence labelled separately | Model name/tool endpoint support cannot prove round trip |
| Tools observed | Valid native structured call, safe fixed fixture result and subsequent valid model result | Plain text imitating a tool call, malformed arguments, arbitrary tool requested, missing final response |
| Context/output | Server capacity vs configured budgets separately sourced | Pi injected default or legacy 8192 is not discovered maximum; validate baseline 8K budget constraints |
| Images/reasoning | Per-model/protocol metadata with provenance; separately tested if claimed | Unsupported image/reasoning content cannot be silently discarded |
| Price/quota/locality | Provider/operator evidence with scope/time, otherwise unknown | Zero native numeric price cannot render Free; localhost cannot render Local-only; balance unknown cannot render Unlimited |

Minimum UX acceptance: all seven screens traversable with keyboard and linear
input; 80x24, 40x16 and 20-column wrap; NO_COLOR/TERM=dumb; screen-reader state
announcements; focus restored after recoverable error; fixed hidden key display;
secret paste/newline/escape injection; escape/control characters in labels and
URLs; every Back/Cancel/EOF/close transition; failed browser/clipboard; expired
code and late callback; retries bind same attempt or deliberately create a new
one. Snapshot evidence is DESIGN until recorded from the shipped runtime.

## Small implementation contracts

| Contract / phase | Exact proposed writer scope | Dependencies / acceptance / review exit |
| --- | --- | --- |
| C1 P1 profile schema/store | New `src/providers/profile.ts`, `src/providers/store.ts`, `tests/provider-store.test.ts` | Depends D0. Versioned baseline envelope, IDs/revisions, private storage, lock/atomic activation, no-network migration. Fixtures: symlink/hardlink/permissions, contention, crash/cancel, malformed v1/v2; old selection survives. Exit: independent schema/privacy review, no ambiguous credential precedence |
| C2 P1 wizard reducer/copy | New `src/providers/setup.ts`, `src/providers/setup-copy.ts`, `tests/provider-setup.test.ts` | Depends C1 interface. Pure transition/effect intents; no HTTP, global env or shared UI edits. Seven screens, exact copy and lifecycle semantics from terminal.md. Exit: table-driven transition tests for every back/cancel/error and no-network save/list; accessibility review |
| C3 P1 native provider boundary | New `src/providers/pi-provider.ts`, `tests/provider-protocol.test.ts`, `tests/fixtures/provider-server.ts` | Depends C1 and baseline pinned Pi public seam audit. Delegate protocols to Pi; frozen per-run destination/key; redirect manual/refusal, explicit-none wire stripping, pre-persistence sanitized streams/results. Actual pinned Pi loopback fixtures for Chat/Responses/Messages, fragmented SSE, tools, abort, poisoned historical auth and two-origin redirects. Exit: independent protocol/privacy review; fixture success explicitly not cloud qualification |
| C4 P1 coordinator integration | Coordinator only: `src/pi/workspace.ts`, `src/pi/workspace-config.ts`, `src/pi/workspace-extension.ts`, `scripts/start.ts`, `tests/pi-workspace.test.ts` (new test path only if absent) | Depends C1–C3. Wire wizard, per-run isolated auth, exact generated membership, fresh launch, resume/import cancellation, no warming/retry/auto-compaction. Freeze latest shared-file interfaces first. Exit: actual pinned-runtime A→B no-history-leak tests, 8K overflow/manual compaction fixtures, clean install and exact-head required platform checks; runtime repin owned by integrator |
| C5 P2 metadata discovery | New `src/providers/discovery.ts`, `tests/provider-discovery.test.ts` | Depends C3 policy boundary, C2 consent. 10s/1MiB/1000-item/5-page proposed bounds reviewed before implementation; cache freshness, manual alias retained. Test public/denied/empty/oversize/redirect/malformed lists; draft discovery without a model, no persistence before Save, cancellation/edit invalidation and ignored late results; zero inference/load/pull calls. Exit: no credentials to changed origin, no readiness inflation, independent review |
| C6 P2 explicit diagnostic checks | New `src/providers/checks.ts`, `tests/provider-checks.test.ts` | Depends C3, C5 observation interface; separate paid inference/tool consent. Fixed synthetic content, one/two-request bounds, no project/history, safe echo tool only, no automatic retry. Exit: fixture proof cancellation/late completion cannot mark success; user authorization separately required for real paid tests |
| C7 P3 routed switching/resume | Proposed new `src/providers/session-policy.ts`, `tests/provider-session-policy.test.ts`; coordinator hooks `src/pi/workspace-extension.ts` | Separate approved P3 design required. Idle/abort, history destination consent, conversion loss, remote-state isolation, missing-profile pause. Exit: native protocol/history fixtures and independent review; no P1 shortcut |
| C8 P4 eligibility/auth audit | First new design under `docs/research/provider-connection-ux/`; only after approval propose `src/providers/auth-flow.ts`, `tests/provider-auth-flow.test.ts` | Revalidate official rights and upstream support, actual app/client identity, identity/scopes/account/refresh/revoke, device support per flow. Mock only before live authorization; no borrowed caches or custom OAuth engine. Exit: eligibility decision plus audited upstream protocol evidence and fresh independent review; not cleared by this package |

Paths are proposed file scopes, not claims those modules currently exist. Each
contract must define exported types/effect ownership before parallel writers
start; shared files cannot be delegated to multiple authors. Integrator owns
README/help publication updates and immutable runtime bootstrap pin. No gate
may be marked passed from static source inspection alone.

## Required P1 adversarial scenarios

1. Configure/save/list/select each preset with sentinel credentials; assert zero
   endpoint traffic, no secret resolution while listing, no ambient auth import.
2. A has messages/tool results; launch B fresh; native resume/import/reload and
   CLI resume flags must refuse before inference. Repeat changed endpoint/key
   revision and legacy unknown route. Old files remain byte-preserved.
3. Reject 301/302/303/307/308 before following same-origin or second-origin
   Location. Destination receives zero requests. Explicit none has no auth,
   cookie, proxy auth or SDK dummy key headers, including Request inputs/casing.
4. Echo sentinel secrets in HTTP/SSE failure, nested diagnostics, setup throw,
   fallback success and final native result; absent from terminal/session/logs.
   Partial safe content remains incomplete; no success event fabricated.
5. Concurrent profiles and in-flight rotation/disconnect preserve frozen route
   and secret. No replacement account after missing key/401/403/429. Run state
   and next-launch default remain distinct; disconnected default needs repair.
6. Unknown cost/tools/context preserved through native conversion/footer; manual
   operational bounds explicit; reserve + keep + output < configured context.
   P1 disables automatic warming/retries/compaction, including overflow path.

## Validation of this docs-only package

Validate local Markdown targets, HTML self-containment and narrow rendering,
PNG/HTML hashes and DESIGN labelling, diff ownership and whitespace. Recheck
public source URLs; record unavailable pages as unknown instead of pretending
all links passed. Publication checking is read-only. Root subsequently authorized
this writer to
refresh the manifest for these ten files through the repository workflow, verify
actual hashes and preserve all original/Relay anchors. No full runtime gate or
installation is needed to evaluate this research. Root receives the final head,
review disposition and publication result and owns CI monitoring and merge.
