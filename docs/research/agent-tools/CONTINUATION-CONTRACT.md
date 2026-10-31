# Bounded continuation contract

2026-10-31, after independent review4 approved projection at `8bc43097f20826cdc25b09d3454cb1ab4a7fadf3`.

Live mode on this evaluation branch requires the nonsecret selector `LAB_AGENT_TOOLS_PRIOR_USAGE=first-live-72b1`. Before state allocation and independently inside the guard, validate the committed first-live evidence SHA-256, original result SHA-256 and exact prior totals: 4 requests / 4147 input / 117 output. Missing, altered or malformed baseline refuses; callers cannot supply ceilings or reset cumulative counters. Probe may omit baseline for its no-spend case or explicitly exercise continuation.

Initialize request and observed-token totals from that baseline. Keep original ceilings of 10 total requests, 20k observed input, 4k observed output and 400 requested output per call. Keep serialized UTF-8 byte+512 admission at 20k per attempt, distinct from aggregate observed-token accounting; also refuse a next payload estimate beyond observed input remaining. This estimator is not exact tokenization; missing/incomplete usage refuses and observed overruns remain failed trials, not a retrospective guarantee they were prevented.

Emit baseline, new-attempt and cumulative counters distinctly without double-counting. Preserve reviewed projection/ref validation, retry-off, key handling, scope and owned cleanup. Run offline remaining-six/exhaustion/invalid-baseline tests and one continuation zero-HTTP native probe, then fresh focused independent review. No live/auth calls, paid-attempt marker reset, production edits, proxy or new provider engine. Root alone arms a new authenticated GUI command after handoff.
