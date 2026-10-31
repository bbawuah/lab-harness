# Prepared native Pi/LAB model trial

Status: **first authenticated live run PARTIAL; complete acceptance still pending**. See [actual sequence/spend and projection correction](FIRST-LIVE.md). Root owns credential injection and any newly authorized remaining allowance. No credential lookup or model request was made by this worker during the correction.

## One live entrypoint, after root's credential-ready handoff

From this research branch's worktree root, in the authenticated graphical terminal, root's private wrapper injects `OLLAMA_API_KEY` in memory and sets nonsecret `LAB_AGENT_TOOLS_CREDENTIAL_READY=1` and `LAB_AGENT_TOOLS_PRIOR_USAGE=first-live-72b1`, then executes:

```sh
bun --no-env-file --no-install experiments/agent-tools/model-runner.ts --live
```

The route is fixed to `https://ollama.com/v1`; model is `gemma4:31b`. No interactive config, persistent key file, secret argv, auth lookup or alternative transport is implemented. This is an experimental launcher; public LAB availability is unchanged. This historical entrypoint is not permission to retry: root must provide a new reviewed wrapper and remaining allowance. Do not paste the key into a command or report. Root separately pins the trusted Bun executable and reviewed commit for its private wrapper.

Already acquired in this worktree: repository-pinned Pi 1.4.0 and Herdr 0.9.5, agent-browser 0.41.0 and approved existing Chrome 156.0.8078.74. Runner calls existing full Pi-tree/hash and Herdr-artifact verification before allocating state. See repository `contracts/pi-runtime.json` and `contracts/herdr-source.json`; Pi runtime release commit is `4a080252f06caf63a525d7873c5d94d3c23887e0`, distinct from the historical source-inspection pin. No automatic acquisition in runner. Native browser/helper acquisition remains in the original experiment. Python 3.12+, installed Chrome and a TTY are required. Browser binaries must remain the acquired pinned artifacts; this runner currently relies on the acquisition hash verification, unlike its per-run Pi/Herdr verification.

## Actual prepared proof

[Native probe](evidence/runner-probe.json) records actual verified Pi and Herdr, successful real LAB Relay heartbeat after registration, exactly `lab_owned_browser` active, and synchronous pre-request exit 78. The provider route for this probe was an owned loopback HTTP sink; it received **zero requests**. No cloud placeholder request was sent. Browser cleanup, native Pi-child exit, Herdr server/client/worker/socket cleanup, real Relay release with closed database handles, and exact disposable app-state removal are recorded. The outer runner returns 0 for this successful probe; inner Pi exit 78 is intentional.

The [first guard-only probe](evidence/runner-probe-first.json) preceded healthy Relay provisioning and is not full startup acceptance. A [subsequent refusal](evidence/runner-probe-relay-refused.json) exposed missing actual-user-home bridge binding under Herdr's isolated environment. Passing the same `LAB_WORKSPACE_USER_HOME` as the normal LAB launcher fixed it without reading user data. [Injected failure](evidence/runner-failure-cleanup.json) verifies cleanup after browser launch but before Herdr; outer exit 1, zero inference. `check_setup.ts` injects setup-directory failure and verifies fresh app-state removal; `check_cleanup.py` covers original desktop-timeout/browser-close findings. These checks do not constitute model proof.

## Limits and accounting

- [Continuation accounting](CONTINUATION.md) binds prior 4/4147/117 spend to immutable evidence before allocation and independently in the guard; the original ceilings are cumulative, leaving at most six further admissions.
- Native Pi `before_provider_request` modifies the serialized payload to `max_tokens=400`, allows at most ten admissions (stricter than twelve), and refuses cumulative serialized UTF-8 bytes plus 512 units/request above 20,000. **These admission units are not exact model tokens.** They are a conservative heuristic, not a tokenizer guarantee.
- The guard records native assistant usage, including input/cache counts and output. It refuses missing usage, Pi-shaped all-zero placeholder counters and zero input totals for this nonempty exchange, plus observed totals above 20k input/4k output. An observed overrun is a failed trial, not proof it was prevented. Ten requested 400-token output caps bound requested output at 4k if the provider honors them; exact server behavior remains unverified until live execution.
- Both agent and provider retries are disabled; compaction is disabled. The native guard has a 120-second deadline, child wrapper 130 seconds, browser commands 30 seconds, bounded stdout/events. No new provider engine or proxy is used.
- Pi catches exceptions from pre-request hooks. Refusal **unconditionally exits the owned Pi process**, even if evidence writing fails. Recording errors terminate rather than escape as caught hook exceptions. Normal refusal records a bounded code before the synchronous exit, ensuring it cannot fall through to dispatch. The outer controller performs cleanup; the native sink probe demonstrates this path.

## Scope, state and acceptance

A new synthetic project/page/session is prepared; fixture title is checked before tools are enabled. Explicit LAB workspace extension, scoped browser adapter and budget guard are the only loaded extensions. Ambient MCP, skills, context files, themes and builtin tools are disabled; active tool allowlist contains only the fixture adapter. Browser subprocess environment excludes the key. The adapter accepts refs/synthetic text only and forwards a narrow official one-shot MCP subset, not shell/eval/navigation/upload or arbitrary files.

A uniquely named 0700 disposable subtree under normal LAB application experiments state holds only fresh agent/Relay state because real Relay requires separation from installation/project. Existing ancestor permissions/owners/symlinks are validated, not changed. No normal user route/key/auth/session/appearance/Relay state is imported. Exact state location is private in the ignored run directory; public evidence aliases it. Setup failures remove freshly allocated state where ownership is known; uncertain process/Relay cleanup retains it and fails the run. No shared state root is deleted.

A successful live run must contain real native Pi tool events, independently observed `Saved: Fixture Model`, a matching final model response, no refusal, verified cleanup and an actual native browser screenshot. Result and bounded synthetic events are at `.tmp/agent-tools/model-runs/run-*/result.json`; successful live screenshot is adjacent `model-native.png`. Raw stdout and provider headers are not persisted. The printed result pointer uses `<WORKTREE>`; expand it locally. Exit 0 means the selected mode's acceptance and cleanup passed; exit 1 means failed acceptance/cleanup (or setup error). Missing key/gate and missing runtimes fail before browser/model work. Root must inspect `liveAcceptance:true` plus usage and cleanup rather than infer model success from an exit code or this probe.

## Version-matched mechanism evidence

- [Pi release request-hook error handling](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/extensions/runner.ts#L1368): caught hook exceptions explain the synchronous refusal design.
- [Pi release extension events](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/extensions/types.ts): pre-request, usage/message and tool events.
- [Pi release settings](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/settings-manager.ts): separate retry layers.
- [Pi release CLI](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/cli/args.ts): explicit extension/tool flags and print/JSON mode.

## Review fixes and process ownership

The second independent review found log-write failure could let Pi swallow a refusal exception, missing usage could appear as default zero counters, and Pi descendants were not proven stopped. Fixes add unconditional exits on logging/refusal failure, reject unavailable zero usage, and launch native Pi in a dedicated POSIX process group. The wrapper stops/verifies that exact group on normal completion, timeout, output failure or signal; the parent independently verifies group absence before Relay cleanup/app-state removal. The actual [in-flight helper probe](evidence/runner-group-cleanup.json) created and stopped only an owned leader/helper group. `check_guard.ts` injects an unavailable evidence destination and models helper/group cleanup failure offline.

This group boundary covers Pi's normal child bridges/adapters, which inherit its group; it is not a system-wide descendant scanner. The agent-browser daemon/browser may detach and is separately closed by the exact owned session with profile cleanup verification. An unverified group, native worker, Relay release or browser close fails acceptance and retains app state. The previous healthy probe before group hardening is retained separately.
