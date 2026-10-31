# Owned agent-tool experiments

Status: deterministic macOS browser trial executed; desktop permission preflight executed; Pi adapter prepared only. Read the [report](../../docs/research/agent-tools/REPORT.md) and [contract](../../docs/research/agent-tools/CONTRACT.md) first.

On an approved macOS arm64 host with Python 3.12+ and existing Google Chrome, from repository root:

```sh
python3 -B experiments/agent-tools/acquire.py
python3 -B experiments/agent-tools/check_adapter.py
python3 -B experiments/agent-tools/browser_trial.py
python3 -B experiments/agent-tools/desktop_trial.py
```

Acquisition uses exact release URLs/hashes, never a package installer. It needs public network access; the later local trial is not proof of an airgap. Browser source skill data was separately read at the pinned source commit during this evaluation. To use `skills get core` offline, stage that commit's `skill-data` under `.tmp/agent-tools/agent-browser-source/skill-data`; browser trial commands do not require that skill directory. The desktop release includes native skills/helper. Review upstream licenses before redistributing.

Scripts create local `.tmp/agent-tools` caches, an ephemeral owned browser and loopback fixture listener, plus sanitized report evidence. Browser evidence is overwritten by a rerun; archive it first if preserving a run. Do not run simultaneous trials: the trusted config filename is shared. Desktop only probes metadata/skills/permissions, never prompts a grant or inspects an app. Its socket-only short absolute 0700 directory is temporary; all acquisition/state stays project-local. macOS Accessibility denial is an expected recorded blocker.

`pi-extension.ts` is prepared for explicit experimental loading and uses `mcp_bridge.py`. `check_adapter.py` verifies input restrictions without browser/model subprocesses. There is no model launcher in this slice: do not interpret an extension import or mock API as actual Pi integration. Root must coordinate credential injection and implement/verify budget enforcement before a model trial. Public LAB deliberately disables ambient extensions/MCP. A future experimental launcher must retain LAB workspace extension and Herdr ownership, explicitly load this extension, disable ambient tools, create/check the synthetic fixture, provide the trusted session/config via environment, and always close that exact session. The current adapter trusts that operator preparation and does not enforce browser identity independently.
