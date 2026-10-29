# Pull requests and protected main

The repository's active [main ruleset](https://github.com/bbawuah/lab-harness/rules/26146689)
requires pull requests, resolved conversations and an up-to-date branch with
successful GitHub Actions checks. It prevents branch deletion and force pushes,
has no bypass actors, and requires **zero human approvals**. Independent source
review remains part of the implementation workflow; it is not represented as a
GitHub human approval. Publication authorization does not authorize a main merge.

The exact required status names are `check (ubuntu-24.04)` and
`check (macos-14)`. Preserve these names unless the ruleset and workflow receive
a coordinated migration. The workflow runs on every pull request and main push;
transient feature names are not hardcoded. Concurrency cancels obsolete runs for
the same pull request or branch.

Both matrix jobs use pinned checkout, Bun and Python setup actions, a read-only
repository token and no persisted checkout credentials. Bun development packages
install from the frozen lockfile without lifecycle scripts. Herdr downloads only
the manifest-pinned official binary into owned project state. The job requires
the executable to exist and sets `LAB_HERDR_ACTUAL=1` independently of the package
script: actual terminal tests fail rather than silently skip when acquisition is
missing. No credentials, model calls or inference service are needed.

Checks cover ledger/Relay regressions, actual owned Herdr output/status/cleanup,
the integrated source/skill/Relay/operator flow, strict types, exact publication
allowlist/current identities and the independently immutable Relay manifest. Both
fixture and actual-terminal demos run. The deterministic search/FTS5 comparison
checks retrieval semantics and availability; its timings are not a performance
gate or WSL evidence.

The media job installs only hash-pinned Pillow binary wheels in a project-local
virtual environment. `docs/demos/audit.py --check` is read-only and needs no font,
Pi installation or private executable paths. It decodes all nine GIF frames,
checks durations/scene counts/transcript equality and text bounds, independently
samples 864 ANSI foreground/background half cells from the palette PNGs, probes
private-path refusal, and checks captured result/acceptance, stale-source refusal,
no-prompt status and owned cleanup. Source and asset hashes bind those checks to
the recorded provenance. CI does not regenerate or silently refresh media or
publication manifests.

These jobs qualify their Ubuntu and macOS runners. WSL, native Pi request
admission/routing/cancellation and production operation remain unqualified.
