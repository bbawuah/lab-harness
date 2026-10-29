# Docs/evidence validation — 2026-10-29

Research-only results; no provider interoperability or runtime acceptance claim.
No accounts, secrets, inference, provider installs, user browser tabs or global
configuration were accessed. No subagent was used. Independent D0 approval is
still required before implementation; this self-check is not that approval.

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
| Publication | Read-only check failed on allowlist coverage; original existing currentFiles hashes all match; root/integrator must add new files |
| Runtime/full gate | Not run; no runtime changed, no qualification claimed |

Command: `bun --no-env-file --no-install scripts/check-publication.ts` with
existing Bun 1.4.2. Exact reported error:

```text
Publication allowlist differs from working files; inspect changes before explicit refresh
```

Publication-file scanning ran before that failure, including existing sensitive
filename/content guards. The manifest was not edited. Final handoff gives all
new paths and exact hashes; integrator reviews these, refreshes its owned
manifest and runs publication checks on the integrated head. Re-check hashes
if any artifact changes. Evidence does not cover native task admission, real
terminal input/accessibility, subscription eligibility or any live billing.
