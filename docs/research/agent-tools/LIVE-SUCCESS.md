# Verified live continuation — passed

On 2026-10-31 Brian ran the single authorized GUI continuation at source `715cddeb6ec0e63659de55345771d42973015fd9`. Root inspected the saved result, events, native pixels and cleanup. No additional model/auth calls were made while publishing this evidence.

The actual experimental Pi + LAB workspace extension + healthy Relay + owned Herdr invoked `lab_owned_browser`: **snapshot → fill `@e4` with `Fixture Model` → click `@e5` → get_result**. All four tool completions report `isError:false`. The model then stopped with exactly **Saved: Fixture Model**. Independent local fixture observation agrees; it is separate from the final model confirmation. Pi exited 0 and `liveAcceptance:true`.

| Accounting | Requests | Reported input tokens | Reported output tokens |
|---|---:|---:|---:|
| Original partial run | 4 | 4147 | 117 |
| Successful continuation | 5 | 3104 | 115 |
| Cumulative | 9 | 7251 | 232 |

Usage is complete; no observed budget overrun. Original caps remain 10 requests / 20,000 input / 4,000 output, 400 requested output per call. Per-attempt byte-plus-margin admission was 15,764, distinct from measured tokens. Monetary cost was not measured. This is five real cloud requests to `https://ollama.com/v1` using `gemma4:31b`; a zero probe-sink counter is not zero network traffic. No further attempt is authorized by this report.

## Evidence and provenance

- [Sanitized successful result](evidence/live-success.json), bound to original result SHA-256 `44cf586d5864eaf6a9355374204376b7858c4e163acf2f8bc3328169b6989f9d`.
- [Recorded event sequence](evidence/live-success-events.json), with only ephemeral session identity removed.
- [Native screenshot](evidence/model-native.png) and [provenance](evidence/model-native-provenance.json): 35,709 bytes, SHA-256 `d0265b2b9915f7b5c59dc36d32981435435d3308e9872a204a3af501aac7d11e`. Real browser pixels of the owned fixture, not an HTML mockup or replay.
- Prior [first-live PARTIAL](FIRST-LIVE.md) and its immutable evidence remain unchanged. It did not achieve final verification; this separate continuation did.

Exact runtime versions: agent-browser 0.41.0/source `1453dd37a40c730fe00f592bc32198a896ff8747`; approved Chrome 156.0.8078.74; Pi 1.4.0/release `4a080252f06caf63a525d7873c5d94d3c23887e0`; Herdr 0.9.5. Artifact identities and acquisition contracts remain in [CONTRACT](CONTRACT.md), [RUNNER](RUNNER.md) and repository runtime contracts. No runtime bytes changed for publication.

All recorded browser/profile, Pi child/process group, Herdr server/client/worker/sockets, Relay, listener and disposable app-state cleanup checks passed. Root additionally verified the recorded Pi PID/group and owned app-state directory absent, runner lock absent and both paid-attempt markers preserved. Private locations and process identifiers are not published.

## Limits

This establishes one bounded model-driven synthetic browser scenario on macOS/Chrome. Production LAB still does not load the experimental adapter. Desktop Accessibility remains **BLOCKED PERMISSION**. Windows/WSL/Edge, existing profiles, concurrency, crash recovery, airgap cold start and zero network egress remain **not tested/qualified by this experiment**, not assertions of incompatibility. No generic model-quality claim follows from this result.
