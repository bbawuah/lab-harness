# Appearance module evidence

Scope: synthetic private HOME and project fixtures only; no native Pi UI, user appearance files, model calls or shell settings. Host: macOS Darwin arm64; Bun 1.4.2. Linux execution is not qualified. The fixture sample is a **rendered MODULE SAMPLE**, not a native Pi or whole-product preview.

- `bun --no-env-file --no-install test tests/pi-appearance.test.ts tests/pi-appearance-store.test.ts`: six outer tests passed. The storage test starts a separate Bun process under an owned synthetic HOME; its six focused scenarios passed with 47 assertions.
- The storage scenarios exercise persistence, inherited scope, Cancel, user and project Reset, stale revision, replaced project binding, malformed/duplicate JSON, unsafe permissions, symlink/hardlink, existing lock, stale temporary sidecar, loader redirection refusal and pre-rename preservation of existing bytes.
- The directory replacement fixture opens the state-root directory FD, renames that directory and creates a replacement at its old name, then passes the original FD to the real helper. The committed preference file appears under the moved original; no appearance directory appears in the replacement.
- Focused strict TypeScript checking of the appearance module/helper and both test files passed using existing read-only Node and Bun type declarations from the parent checkout. No dependency was installed.

The test proves the specific FD replacement scenario, not a same-user sandbox. Locking serializes cooperating writers. An error or termination after rename has unknown commit/durability outcome and requires reload. Runtime Pi theme integration, actual NO_COLOR behavior outside the sample, Linux backend, UI command, terminal controls and whole-app contrast remain unqualified.

## Review fixes

On Darwin arm64 with Bun 1.4.2, the focused suite passed again; the synthetic HOME child ran nine storage scenarios with 64 assertions. New regressions save an override, replace the project, bind the replacement and require `PROJECT_CHANGED`; append 65,536 bytes after an initial two-byte `fstat` and require the bounded FD reader to reject the 65,538-byte stream; and refuse an installation symlink alias including when state lies under the alias target. The original inherited-FD directory replacement test still passes. Strict targeted TypeScript checking passed using the existing parent type declarations.

The theme test now independently checks the emitted field subset against the pinned Pi schema's exact token names, required/optional fields, no-extra-fields rules, name/appearance restrictions and color string or integer range for light and dark and all capability variants. It also demonstrates rejection of missing, extra and out-of-range fields. This is a schema-field projection, not a run of Pi's validator or native UI. The source hashes are recorded in the test. Linux, runtime Pi integration, whole-app contrast and NO_COLOR remain unqualified.
