# Initial publication plan

Publish the reviewed offline concept into this standalone repository, starting
from its public-safe README bootstrap. Export file contents only; import no
source Git history, internal reports, review transcripts or machine evidence.

## Export allowlist

The exact filenames and SHA-256 values are recorded in
[`source-manifest.json`](source-manifest.json) before export. Copy only:

- `contracts/protocol-v1.json`.
- `src/admission.ts`, `src/bound-worker.ts`, `src/cli.ts`, `src/fixtures.ts`,
  `src/ledger.ts`, `src/owned-processes.ts`, `src/protocol.ts`, `src/relay.ts`,
  `src/util.ts`, `src/workspace.ts`.
- `tests/cleanup-child.ts`, `tests/cleanup.test.ts`, `tests/crash-child.ts`,
  `tests/first-owner-crash-child.ts`, `tests/helpers.ts`, `tests/ledger.test.ts`,
  `tests/process-crash.test.ts`, `tests/relay.test.ts`,
  `tests/review-regressions.test.ts`, `tests/workspace.test.ts`.
- `tsconfig.json` and `vendor/relay/SOURCE.json`.
- `vendor/relay/src/directory/index.ts`,
  `vendor/relay/src/directory/validation.ts`,
  `vendor/relay/src/messages/contracts.ts`,
  `vendor/relay/src/messages/service.ts`,
  `vendor/relay/src/storage/diagnostics.ts`,
  `vendor/relay/src/storage/initialize.ts`, `vendor/relay/src/storage/paths.ts`,
  `vendor/relay/src/storage/publish.ts`, `vendor/relay/src/storage/store.ts`.

Omit optional inference/download/native-characterization tools and all their
historical manifests. They are unnecessary for the offline concept. Preserve
the owned-process helper and its harmless cleanup tests unchanged.

## Packaging and validation

1. Check Relay attribution and upstream license information; grant no new
   license by inference. Keep original vendor bytes and their pinned hashes.
2. Add pinned Bun and exact development dependencies with a lockfile. Install
   only in disposable state with lifecycle scripts disabled. Prove the demo,
   tests, strict typecheck and publication integrity check from a clean clone.
3. Document real SQLite/Relay and fixture boundaries, blocked native Pi,
   absent Herdr integration, unqualified WSL and incomplete historical local
   model attempts. Include no private paths, process logs, model assets or keys.
4. Add read-only GitHub CI for Linux and macOS. Linux results remain pending
   until GitHub actually executes them; macOS results do not qualify WSL.
5. Audit every new tracked file and all newly publishable Git metadata. Obtain
   one bounded independent read-only Codex review against the final commit.
6. After the content audit, make this existing repository public, push the
   feature branch with active controls, create and immediately register its PR.
   Use the app watcher for asynchronous CI. Merge only the exact reviewed head
   after green checks through the active approved route; report any refusal
   without retrying through another route.

Only the packaging files enumerated in `source-manifest.json` may accompany
the exported files. Full local validation logs stay outside this repository.
