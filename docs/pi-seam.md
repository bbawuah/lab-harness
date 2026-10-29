# Pi request seam and bounded advisory extension

Native LAB activation remains **blocked-unqualified**. No fixture or Herdr
process result changes `admission()` or the `activate-pi` refusal. No inference
or paid provider call is required by this slice. LiteLLM stays an existing
client destination; no gateway or model hosting is deployed.

The inspected source is Pi commit
`b857fbd8a9225ab7b0c15d7a6965b2f109c9317a`, package 1.4.0.
`contracts/pi-source.json` records hashes of the actual inspected source bytes.
Source was read as data; the package is not installed by this repository.

The ordinary `before_provider_request` handler is not a rejection boundary:
[`extensions/runner.ts:1368`](https://github.com/earendil-works/pi/blob/b857fbd8a9225ab7b0c15d7a6965b2f109c9317a/packages/coding-agent/src/core/extensions/runner.ts#L1368)
catches handler exceptions, emits an error, and returns the current payload.
[`sdk.ts:412`](https://github.com/earendil-works/pi/blob/b857fbd8a9225ab7b0c15d7a6965b2f109c9317a/packages/coding-agent/src/core/sdk.ts#L412)
installs an agent stream function which starts cache warming and calls
`modelRuntime.streamSimple`. Summaries and compaction can call that function
through separate retry paths; branch summary and bug report generation do so
in `agent-session.ts`. A wrapper throwing ordinary exceptions would also
violate the documented `StreamFn` error-stream contract in `agent/src/types.ts`.

The deeper candidate seam is the final prepared provider request, after virtual
model resolution and auth-dependent base URL changes:
[`model-runtime.ts:660–755`](https://github.com/earendil-works/pi/blob/b857fbd8a9225ab7b0c15d7a6965b2f109c9317a/packages/coding-agent/src/core/model-runtime.ts#L660).
This is an inference about an implementation seam, not a supported admission
API. Both `stream` and `streamSimple`, resolved models, provider-internal
retries and other provider capabilities would need qualification. An agent-only
wrapper misses cache warming: `cache-warmer.ts:330` independently calls the
model runtime. Auth resolution can override the base URL after an earlier
model comparison. These are concrete reasons to keep the qualification gate.

`src/pi/advisory-extension.ts` implements only the justified observation bridge:
native `ui_prompt_start/end` produce paired `herdr:blocked` events for Herdr's
existing managed Pi TUI extension. Session/model selection and aborted
settlement emit `lab:pi-observation` with explicitly advisory authority. Nested
prompts, shutdown and unload are paired; arbitrary prompt titles are omitted.
The bridge registers no tools, reads no credentials, launches no process and
does not accept tasks or change Pi's native approvals/sandbox. Load explicitly
with Pi's extension option after reviewing it; it is never globally installed.
RPC is intentionally ignored because Herdr's managed bridge is TUI-only.

The tests use a labelled event fixture, not native Pi. Actual TUI pairing,
compaction/queue cancellation, model-switch/resume admission, actual provider
retries, cache warming, local route behavior and WSL remain unqualified. A full
request gate requires upstream support or a separately reviewed runtime adapter
that preserves vendor behavior; this change does not silently introduce one.
