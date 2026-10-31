# Evidence-bound remaining allowance

The projection correction at `8bc43097f20826cdc25b09d3454cb1ab4a7fadf3` was independently approved. This subsequent experiment-only delta prevents the next authorized live attempt from starting with zero prior spend. No new model/auth call was made.

The required nonsecret selector is **`LAB_AGENT_TOOLS_PRIOR_USAGE=first-live-72b1`**. Both the launcher (before allocation) and the guard independently validate the committed first-live evidence:

- Evidence SHA-256: `c8f08e22b590369b628e67e3ebc1350e35ee21c67d312558b83d1766694d794d`.
- Original private result SHA-256 recorded in that evidence: `bbec342f25a292be47b11576d9955f8508fcb49fcebc339fe2d1fa81b69bae77`.
- Exact baseline: **4 requests, 4147 observed input tokens, 117 observed output tokens**.

Caller-provided totals or ceilings are unsupported. Live mode refuses an absent/unknown selector, changed bytes, malformed content or inconsistent totals. Probe mode may omit the selector for a zero-spend probe, but the continuation probe supplies it. This selector is an accounting input, not permission to retry or reset root's paid-attempt lock.

## What is enforced

The original cumulative ceilings remain **10 requests / 20,000 observed input / 4,000 observed output**, with **400 requested output tokens per call**. Counters start from the validated baseline, leaving at most six further admissions and 15,853/3,883 observed input/output tokens. A request cannot follow an admission without complete valid usage. Duplicate usage is refused. Output admission reserves the requested 400 against observed output remaining.

Serialized UTF-8 payload bytes plus 512 units/request remain capped at **20,000 per attempt**, separately from cumulative actual usage. The next payload estimate must also fit the currently observed input allowance remaining. This estimate is not a model tokenizer; unexpected server usage can still exceed the estimate. Such an observed overrun immediately fails the trial and refuses further work. No exact preflight token guarantee is claimed. Both retry layers, model/route/key handling, projection/ref validation, deadlines and owned cleanup remain unchanged.

Native events record the baseline once, then explicitly distinguish attempt and cumulative usage. Final `result.json` has `budget.baseline`, `budget.attempt`, `budget.cumulative` and `usageComplete`; it does not add baseline twice. Request counts always derive from admission events, even if the latest request has no usage. If any usage is missing, token totals are null, with separately labelled last-known reported tokens when available. Observed overruns are retained before refusal; `usageComplete:true` means all usage was reported, not that it was within budget or accepted. `observedBudgetExceeded:true` identifies that failed case. The historical first-live evidence and its original files are unchanged.

## Actual checks

[Continuation native probe](evidence/continuation-probe.json) used verified Pi + LAB/healthy Relay + owned Herdr, validated the baseline in both layers and exited synchronously before provider dispatch. The owned loopback sink received zero requests. It records baseline 4/4147/117, attempt 0/0/0, cumulative 4/4147/117 and verified browser, Pi group, Herdr, Relay, listener and app-state cleanup. It is not a live model attempt.

`check_continuation.ts` checks exact evidence binding, missing/unknown selector, malformed/changed hash, six remaining admissions and seventh refusal, observed input/output exhaustion, invalid counters/ceiling injection and no double-counting. Updated budget tests also check incomplete/duplicate/missing/zero usage. Prior projection/observation/guard/cleanup regressions remain applicable.

## Root's next reviewed command

After independent review and root's new authorization, its private GUI wrapper supplies the in-memory key, `LAB_AGENT_TOOLS_CREDENTIAL_READY=1` and `LAB_AGENT_TOOLS_PRIOR_USAGE=first-live-72b1`, then runs from this worktree:

```sh
bun --no-env-file --no-install experiments/agent-tools/model-runner.ts --live
```

Route/model remain `https://ollama.com/v1` / `gemma4:31b`. The worker does not access credentials, reset locks, run this live command or claim acceptance. Root must pin the reviewed commit/runtime and issue the new command; the earlier wrapper is stale. Complete live acceptance remains pending, and the first attempt remains PARTIAL.

Review5 found stale final request counts when a later admitted request lacked usage, plus lost overrun totals on thrown observation. The reporting fix derives counts from admissions and records observed overruns before refusal. `check_budget_report.ts` reproduces baseline4 → completedrequest5 → missing-usage request6 (count6, token totals unknown), then verifies that an observed aggregate20247 input overrun remains visible and failed. The budget ceilings/admission enforcement and cleanup are unchanged by this reporting fix.
