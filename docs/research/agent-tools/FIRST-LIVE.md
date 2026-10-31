# First actual model run: PARTIAL, not accepted

The user ran root's private authenticated GUI wrapper against reviewed source `72b1c74ef2f590a26be8b4dbb1a13b904f7f2d7e`. [Sanitized evidence](evidence/first-live-partial.json) preserves the actual recorded events and cleanup. The original private result/events/process files remain untouched; the result hash is recorded. No credentials or private-state-location file are published.

The native Pi + LAB workspace extension/healthy Relay + owned Herdr path made **four real requests** to `https://ollama.com/v1`, model `gemma4:31b`. Reported cumulative usage was **4147 input / 117 output tokens**. This proves actual model-to-tool invocation in the experimental launcher; it does not qualify the complete scenario or public LAB launcher.

| Sequence | Actual recorded result |
|---|---|
| Model snapshot | Tool succeeded |
| Model fill with `e4` | Refused; exact `@eN` syntax required |
| Model fill with `@e4` | Tool succeeded |
| Model click with `@e5` | Tool succeeded |
| Next provider request | Refused by `ADMISSION_FAILED`; accumulated admitted byte+margin units were 18,912 |
| Final verification | No `get_result` tool, final model confirmation or native screenshot; no independently persisted final DOM assertion |
| Cleanup | Browser/profile, native Pi/group, Herdr server/client/worker/sockets, Relay release, listeners and exact application-state removal all recorded successful |

Inner Pi exit was 78, `liveAcceptance:false`, outer failure `MODEL_ACCEPTANCE_FAILED`. The old result's `sinkRequests:0` is the **probe-only loopback counter**, not a statement that the live run made zero provider requests. Tool success alone does not establish a persisted DOM result, and this report does not reconstruct one.

## Cause and bounded correction

The pinned [official MCP implementation](https://github.com/vercel-labs/agent-browser/blob/1453dd37a40c730fe00f592bc32198a896ff8747/cli/src/mcp.rs#L4217) returns model text, structured response and repeated serialized stdout. The old bridge forwarded the entire envelope, repeating semantic data and launch/lifecycle diagnostics in the model transcript. The byte-based admission guard stopped the next request as designed; its units are not actual token counts.

The bridge now validates the pinned version, process and structured exit, `isError`, response success/error, consistent serialized response, exact known shapes, complete snapshot refs, boundary and truncation. It returns one semantic result with explicit untrusted-page label, original boundary/origin and all exact semantic fields; only transport duplication and lifecycle diagnostics leave model context. Unknown or oversized shapes fail rather than silently slice. Raw diagnostics stay bounded and private under the owned ignored run. Ref syntax remains strict; tool instructions now show `@e4` explicitly.

[Deterministic owned-fixture replay](evidence/projection-replay.json), **not another model run**, measured serialized UTF-8 bytes:

| Operation | Prior full MCP envelope | New projection |
|---|---:|---:|
| Snapshot | 2326 | 677 |
| Fill | 1586 | 151 |
| Click | 1589 | 152 |
| Result text | 1142 | 217 |
| Total successful tool outputs | 6643 | 1197 |

That is about 82% less tool-output serialization in this fixture. It is not a measured reduction in provider tokens or full request payloads, nor proof that a future model run will fit. Deterministic replay verified `Saved: Fixture Model`, retained all five snapshot refs, rejected bare `e4`, and closed its own browser/listener with no remaining profile. It cannot supply the missing final validation for the earlier live run.

A [separate injected failure](evidence/failed-observation-probe.json) now preserves a bounded independent local `#result` observation before cleanup when available. It records empty output in the untouched fixture, labels it `notModelConfirmation:true`, keeps acceptance false and verifies cleanup. Real failure observations must match the owned origin and reused browser, succeed without truncation, and stay within 1000 bytes; unavailable observation is explicit. No cloud request is needed for this capture.

## Spend and next gate

The four requests and 4147/117 reported tokens remain prior cumulative spend in `experiments/agent-tools/prior-spend.json`. Future result accounting adds current reported usage to that baseline and marks missing current usage explicitly; this is reporting, not a new overall budget grant. Root must separately allocate and enforce the remaining overall allowance before any new authenticated GUI command. Existing per-run guard caps, retry-off, key handling, route/model, navigation/tool scope and cleanup were not enlarged or bypassed. No paid-attempt marker was reset and no new model/auth call was made for this correction. PR19 stays draft; complete live acceptance remains pending a newly authorized reviewed run. Desktop AX remains permission-blocked.
