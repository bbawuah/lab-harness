# Owned agent-tool experiments

Status: deterministic macOS browser trial executed; desktop permission preflight executed; first actual Pi/model attempt PARTIAL (see FIRST-LIVE.md), no automatic retry. Read the [report](../../docs/research/agent-tools/REPORT.md) and [contract](../../docs/research/agent-tools/CONTRACT.md) first.

On an approved macOS arm64 host with Python 3.12+ and existing Google Chrome, from repository root:

```sh
python3 -B experiments/agent-tools/acquire.py
python3 -B experiments/agent-tools/check_adapter.py
python3 -B experiments/agent-tools/browser_trial.py
python3 -B experiments/agent-tools/desktop_trial.py
```

Acquisition uses exact release URLs/hashes, never a package installer. It needs public network access; the later local trial is not proof of an airgap. Browser source skill data was separately read at the pinned source commit during this evaluation. To use `skills get core` offline, stage that commit's `skill-data` under `.tmp/agent-tools/agent-browser-source/skill-data`; browser trial commands do not require that skill directory. The desktop release includes native skills/helper. Review upstream licenses before redistributing.

Scripts create local `.tmp/agent-tools` caches, an ephemeral owned browser and loopback fixture listener, plus sanitized report evidence. Browser evidence is overwritten by a rerun; archive it first if preserving a run. Do not run simultaneous trials: the trusted config filename is shared. Desktop only probes metadata/skills/permissions, never prompts a grant or inspects an app. Its socket-only short absolute 0700 directory is temporary; all acquisition/state stays project-local. macOS Accessibility denial is an expected recorded blocker.

`pi-extension.ts` is prepared for explicit experimental loading and uses `mcp_bridge.py`. `check_adapter.py` verifies input restrictions without browser/model subprocesses. The [prepared model runner](../../docs/research/agent-tools/RUNNER.md) has a zero-HTTP native probe and an explicit credential-gated live mode. Read that operator contract before use. Public LAB still disables ambient extensions/MCP. Run offline checks with `bun --no-env-file --no-install experiments/agent-tools/check_budget.ts`, `check_setup.ts`, and `python3 -B experiments/agent-tools/check_cleanup.py`. From a TTY, `bun --no-env-file --no-install experiments/agent-tools/model-runner.ts --probe` launches only the owned fixture and native guarded Pi/Herdr with a loopback sink; it must observe zero HTTP requests. No model success is claimed until the distinct authorized live scenario passes.

Projection checks: `python3 -B experiments/agent-tools/check_projection.py`; deterministic owned bridge replay: `python3 -B experiments/agent-tools/projection_replay.py` (zero model calls; private diagnostics remain ignored); observation guards: `bun --no-env-file --no-install experiments/agent-tools/check_observation.ts`. Existing first-live evidence is not overwritten by these commands.

Continuation accounting: read [CONTINUATION.md](../../docs/research/agent-tools/CONTINUATION.md). Offline check: `bun --no-env-file --no-install experiments/agent-tools/check_continuation.ts`. A live attempt requires root authorization plus the evidence-bound nonsecret selector; this README does not authorize another call.
