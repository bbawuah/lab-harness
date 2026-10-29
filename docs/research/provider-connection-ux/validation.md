# Docs/evidence validation — 2026-10-29

Research-only results; no provider interoperability or runtime acceptance claim.
No accounts, secrets, inference, provider installs, user browser tabs or global
configuration were accessed. Root requested one subsequent isolated read-only
Codex review; its provenance and disposition are recorded below. Independent D0
approval is still required before implementation; this package does not clear it.

| Check | Observed result |
| --- | --- |
| App binding / branch / start HEAD | Worktree basename `design-provider-connection-ux`, branch `design/provider-connection-ux`, HEAD `43a6ac2267d0261998453d56bd7f834956531812`; app path and shell cwd agreed |
| Instructions | No applicable AGENTS.md in checkout or ancestor chain |
| Baseline reuse | Read model-providers.md, architecture provider ADR and build-plan phases; no broad market survey repeated |
| Markdown local links | All relative file targets exist; referenced ADR/build-plan headings inspected |
| Official sources | S1–S13 read; S14 timed out twice and is marked baseline-only, not freshly verified |
| HTML | Self-contained inline CSS, no external asset/script dependencies; explicit DESIGN labels |
| Desktop evidence | T3 html_preview, 1000x1143, light; visually inspected, no console messages |
| Narrow evidence | T3 html_preview, 360x1970, light; visually inspected single column and wrapped fields, no console messages; not a terminal accessibility test |
| PNG/source identity | PNG dimensions verified; SHA-256 matches evidence.json for HTML and PNG |
| Ownership / whitespace | Only assigned docs directory changed; git diff --check passes |
| Publication | After root authorized the normal refresh, local check passed: 191 allowed files, 190 current hashes, 9 pinned Relay files. Manifest delta is exactly ten new paths/current entries; all existing entries and original anchors unchanged |
| Runtime/full gate | Not run; no runtime changed, no qualification claimed |

Command: `bun --no-env-file --no-install scripts/check-publication.ts` with
existing Bun 1.4.2. The initial pre-refresh check reported:

```text
Publication allowlist differs from working files; inspect changes before explicit refresh
```

Root subsequently extended scope to the normal publication additions for these
ten files. Read scripts/refresh-publication.ts, publication-policy.ts and
check-publication.ts before running
`bun --no-env-file --no-install scripts/refresh-publication.ts --reviewed-files`.
Actual bytes were hashed locally; no copied handoff hashes were trusted. The
publication check includes sensitive-content guards and original/Relay anchors.
Re-check hashes if any artifact changes. Root monitors CI and owns merge; no CI
polling, unchanged-head rerun or full-gate claim is made here. Evidence does not
cover native task admission, real terminal input/accessibility, subscription
eligibility or any live billing.


## Independent review and disposition

One isolated, read-only Codex `gpt-6-astra` review used live-catalog settings
`reasoningEffort: high`, `serviceTier: default`; returned settings matched.
Task ID:
`node:delegated-task:command%3Amcp%3A3176661f-5d9c-400b-bd80-d1997e12336c%3Adelegate-task%3Aprovider-ux-review-r1`.
Inspected HEAD: `6567d037b48abf135fc6b7980b81489cd4fdfb1f`.
Reviewer verified isolated app/cwd binding and clean branch, read all ten
artifacts and baseline documents, inspected PNG and hashes, checked all 18
relative file links, and revalidated focused official auth/credit sources.
No grandchildren, source edits, accounts, model calls or installations.

Verdict: **approve research/design package; no must-fix findings**. One optional
clarification was accepted by the author: onboarding discovery now explicitly
uses an immutable draft attempt/destination/protocol/auth snapshot, permits
connection-level evidence without a selected model, persists nothing before Save
and rejects late results after edits/cancel. Terminal and acceptance contracts
now agree. This clarification and publication/provenance bookkeeping followed
the reviewed head; no second review is claimed. HTML/PNG are unchanged and their
hashes were rechecked; no visual change required re-rendering. Broader D0 and
runtime/admission qualification remain outside this approval.
