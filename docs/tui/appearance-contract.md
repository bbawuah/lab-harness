# TUI appearance: phase 1 contract

Status: design for coordinator acceptance; no module, command or product behavior is implemented by this document. The T3 thread is attached to its own worktree, branch `t3/appearance-contract`, initially at `60bac602975222344223594ac02cf59892503235`. The explicitly checked `origin/main` was `7abae5f9a7a152e9692e81c763b44076b0f46257`; local `main` was stale at `83c18d8754cb633ad2805723e12df899b2cbd9a6`. This is not a rebase or a claim that local main is current.

## Ownership and boundary

After acceptance, the appearance writer owns only new `src/pi/appearance*.ts`, `tests/pi-appearance*.test.ts`, this document and `docs/evidence/appearance/**`. The coordinator alone owns existing `src/pi/workspace-config.ts`, `src/pi/workspace.ts`, `src/pi/workspace-extension.ts`, Herdr config integration, CLI/help, README, guide, publication and bootstrap. The split owner alone edits Herdr interactive/shell tests. Existing baseline reader/parser artifacts belong to another completed task; do not edit them, fork a renderer or add dependencies. The coordinator registers a future `/lab-appearance` command and wires the adapter; the name is a boundary, not a claim that a command exists. No module writer starts until this committed contract is accepted.

## User experience and limits

A keyboard-focused Pi `ui.custom` overlay selects scope, light, dark or follow terminal, a semantic preset or custom semantic colors, and supported padding. It shows a sample with text, border, focused selection, success, warning and error labels. Changes stage in memory; Apply validates and commits, Cancel/escape/EOF closes with no writes, and Reset stages inheritance until Apply. Show the active scope, inherited value, detected versus fallback mode, capability/contrast uncertainty and any errors in text. Restore focus on close or recoverable error. Navigation and status must remain understandable without color; sample focus uses a visible marker and status uses words. Test at 80x24, 40x16 and 20 columns, with bounded clipping/wrapping and no trapped focus.

Follow terminal is available only when the adapter provides a reliable, current terminal light/dark report. It is not universal OS theme detection. An unavailable or stale report resolves to dark and is explicitly labelled fallback; a later reliable report may update the sample/effective derived theme without writing preferences. No probing that changes terminal settings. Preserve the canonical monochrome B mark and its existing light/dark adaptations; accents do not recolor or replace it.

Expose native `editorPaddingX` 0–3 and `outputPad` 0 or 1 (transcript horizontal padding), not an invented universal density setting. Native Pi determines other spacing, wrapping and glyphs. The overlay may use an ASCII fallback for its own markers; it does not promise whole-app ASCII, arbitrary wrapping or a full viewport rewrite. Fonts, size and line height belong to the terminal. Do not edit terminal profiles, send palette-changing OSC, alter global settings or overwrite the regular shell theme. Herdr theme integration belongs to the coordinator and requires separate qualification.

## Frozen data and exports

All exports below are from new `src/pi/appearance.ts`; supporting new `appearance*.ts` files may be private implementation. Plain objects contain exactly the stated keys; reject unknown keys, null, duplicate JSON keys, wrong types, non-finite numbers and unsupported versions rather than silently repairing. Hex is exactly `#RRGGBB`, case-normalized to uppercase. Paths are never accepted from UI/model inputs. `ProjectBinding` is the existing type from `src/project.ts`.

```ts
export type Mode = "light" | "dark" | "terminal";
export type Color = string; // validated #RRGGBB
export type Palette = { accent: Color; text: Color; background: Color;
  border: Color; focus: Color; success: Color; warning: Color; error: Color };
export type PaletteChoice = { kind: "preset"; name: "standard" }
  | { kind: "custom"; light: Palette; dark: Palette };
export type Preferences = { mode: Mode; palette: PaletteChoice;
  editorPaddingX: 0 | 1 | 2 | 3; outputPad: 0 | 1 };
export type Scope = { kind: "user" } | { kind: "project"; binding: ProjectBinding };
export type Capability = { color: "truecolor" | "256" | "16" | "none" | "unknown";
  terminalAppearance: "light" | "dark" | "unknown" };
export type Snapshot = { revision: string; user: Preferences | null;
  project: Preferences | null; scope: Scope };
export type Draft = { base: Snapshot; value: Preferences | null };
export type Effective = { preferences: Preferences; mode: "light" | "dark";
  modeSource: "explicit" | "terminal" | "fallback"; palette: Palette;
  color: Capability["color"]; contrast: "pass" | "unknown" };
export type NativeArtifacts = { settings: { theme: string; editorPaddingX: 0 | 1 | 2 | 3;
  outputPad: 0 | 1 }; theme: { name: string; appearance: "light" | "dark";
  colors: Record<string, string | number> } };
export type AppearanceErrorCode = "INVALID_INPUT" | "INVALID_COLOR" | "BAD_CONTRAST"
  | "INVALID_STORE" | "PRIVATE_PATH" | "PROJECT_CHANGED" | "CONFLICT" | "IO";
export class AppearanceError extends Error { readonly code: AppearanceErrorCode }
export function normalizePreferences(value: unknown): Preferences;
export function loadAppearance(options: { stateRoot: string; installRoot: string;
  scope: Scope }): Snapshot;
export function beginAppearance(snapshot: Snapshot): Draft;
export function stageAppearance(draft: Draft, value: unknown): Draft;
export function resetAppearance(draft: Draft): Draft;
export function resolveAppearance(draft: Draft, capability: Capability): Effective;
export function buildNativeArtifacts(effective: Effective): NativeArtifacts;
export function applyAppearance(options: { stateRoot: string; installRoot: string;
  draft: Draft }): Snapshot;
```

`beginAppearance` copies the selected scope's saved value, or null when absent. `stageAppearance` returns a new draft; it normalizes a complete preference and validates known truecolor contrast before accepting it. `resetAppearance` returns a new draft with null, never writes. `resolveAppearance` uses draft value when present; project null inherits saved user, then defaults; user null inherits defaults. Defaults are `{mode:"dark", palette:{kind:"preset",name:"standard"}, editorPaddingX:1, outputPad:1}`. User reset removes the user value; project reset removes only that project entry. Cancel discards the draft without invoking apply. No partial project merge: a saved project value is a complete preference. `Snapshot.revision` is SHA-256 of exact store bytes, or literal `absent`; a caller cannot manufacture authority by editing the snapshot. Apply reloads and validates under a private exclusive lock, compares revision, revalidates the binding and draft, then writes or removes the selected value; mismatch is `CONFLICT`, with no overwrite. A successful Apply returns a freshly loaded snapshot. A failure before rename preserves the prior complete store; an IO error after the helper has started or a termination has an unknown commit/durability outcome and requires reload; contention fails clearly, with no unsafe stale-lock deletion. No cross-process cache can bypass reload or binding verification.

Standard palettes are fixed: light `{accent:#005A9C,text:#202020,background:#FFFFFF,border:#595959,focus:#005A9C,success:#176B32,warning:#785600,error:#A11B1B}`; dark `{accent:#8ECFFF,text:#F2F2F2,background:#151515,border:#B0B0B0,focus:#8ECFFF,success:#8DDAA0,warning:#F2CE71,error:#FFAAAA}`. Validate each palette against its own background using WCAG relative luminance and contrast ratio: text, accent, success, warning and error at least 4.5:1; border and focus at least 3:1. Never accept a known failing custom palette. The sample uses these eight roles and always prints focus and status labels.

The adapter supplies capabilities from actual reliable evidence; `NO_COLOR` forces `none`. Never claim truecolor from a guess. For 256, map each RGB role to the nearest standard xterm index 16–255 by squared sRGB channel distance (lowest index wins ties), and calculate contrast on those emitted standard RGB values; reject known failures. Terminal remapping can still make actual contrast unknown, so a pass describes this standard-palette sample only. For 16, terminal-remapped colors make actual contrast unknown unless the actual palette is reliably supplied by a future separately approved interface; `unknown` and `none` also report unknown. No-color sample emits no color SGR and relies on terminal defaults and non-color cues. Even a passing sample is not a whole-app guarantee: Pi, Herdr, terminal palette remapping and the shell have independent rendering. `buildNativeArtifacts` emits a schema-valid Pi theme named `lab-appearance` using the selected pinned Pi built-in light/dark theme as the complete token base; replace `accent`, `text`, `border`, `borderAccent`, `success`, `warning`, `error` with their corresponding semantic colors (`borderAccent` uses focus), and use background for Pi background tokens. Keep all other pinned tokens from that base. Validate the complete emitted theme against the pinned schema and assess the actual sample after downgrade; do not imply all remaining native tokens meet contrast. In none/unknown capability do not assert rendered palette contrast. This mapping applies to Pi only, not shell or Herdr.

## Storage and integration

One versioned private store at `$HOME`'s validated application state root, `appearance/preferences.json`, outside project and installation, contains exactly `{version:1,user:Preferences|null,projects:Record<string,{binding:ProjectBinding,preferences:Preferences}>}`. Project keys are lowercase SHA-256 of UTF-8 `JSON.stringify([binding.root,binding.device,binding.inode])`; verify both key and exact binding on every load and commit. An explicit trusted selected binding is required for project scope; no project file or implicit override. A replaced directory, changed source binding, collision or malformed record fails clearly; do not silently inherit or attach old preferences to a new inode. Absence of the store means empty user and projects; missing selected project means inheritance. Invalid/unreadable state is an error, not absence. No automatic import of native Pi preferences or `$HOME/.pi`; any migration requires separately scoped explicit approval and a defined source.

`stateRoot` and `installRoot` are trusted coordinator inputs, nevertheless validate them as absolute canonical paths and refuse traversal, NUL, symlink ancestors, unowned/shared-writable state ancestors, state inside install or selected project, and unsafe destination files. Use the existing workspace private guards and atomic 0600 write primitive, with additional checks necessary for destination ownership, regular file, single link, private permissions, no symlinks and bounded 64 KiB reads. Do not assume the current `writePrivate` alone checks destinations or serializes concurrent writers. Create private 0700 directories and exclusive 0600 temporary files in the same directory; revalidate before atomic rename, clean up on failure, and keep the old store on errors before rename. After rename, fsync or process failure has an unknown durability outcome; report this and reload. Lock and recheck source/destination identity to prevent conflicting commits; if platform primitives cannot uphold these guarantees, fail closed. Reset of the last entry atomically writes the empty envelope; no unsafe unlink of a substituted path. Generated theme files are owned private artifacts outside project/install, checked with the same protections, never discovered from arbitrary user paths. Apply commits only the preference store; coordinator owns materializing artifacts and merging `theme`, `editorPaddingX`, `outputPad` and explicitly owned theme path into generated Pi agent settings. Existing LAB overwrites those settings each launch, so global Pi settings are not the source of truth. Coordinator handles runtime activation and reports failure separately from a successful preference commit; do not claim an atomic transaction across Pi, Herdr and the store.

Pinned Pi's `ctx.ui.setTheme(name)` immediately persists its selected name; hover/sample preview must never call it. `ui.custom` is the supported focused overlay; `setEditorComponent` replaces the editor only. Explicit owned theme paths can load with `--no-themes` discovery disabled, but integration must verify the actual CLI/resource-loader route at pinned runtime. No preview writes settings, artifacts or store; runtime changes only follow explicit Apply and coordinator integration. Native whole-app preview and live refresh remain unqualified until that integration is tested.

## Acceptance and evidence

Unit fixtures cover strict normalization, defaults, all scopes and inheritance, distinct project keys and replaced bindings, malformed/unknown fields, invalid colors, contrast and capability downgrade, private ownership/modes, symlink/hardlink and path substitution, atomic failure, contention, stale revision/cache, persistence across reload, Cancel and Reset. Test failures before rename leave old bytes intact; test that no project or global Pi file is read or written. Use only owned synthetic private HOME and mock native UI adapter; never read actual user appearance, files, accounts or keys. Exercise light, dark, detected terminal, fallback, 256, 16, unknown and NO_COLOR; demonstrate focus and error/status without color. Record synthetic inputs, dimensions, commands and results under `docs/evidence/appearance/**`, without real personal paths. Screenshots are labelled DESIGN until a real UI is integrated; a module fixture is labelled **rendered MODULE SAMPLE**, not a native Pi or whole-product preview. Coordinator separately qualifies actual pinned Pi theme integration, Herdr and whole-app behavior. No full gates, model calls, installs, PR watch or merge in this phase.

## Release source basis

Pi 1.4.0 release source [`4a080252f06caf63a525d7873c5d94d3c23887e0`](https://github.com/earendil-works/pi/tree/4a080252f06caf63a525d7873c5d94d3c23887e0) is distinct from historical `b857fbd8a9225ab7b0c15d7a6965b2f109c9317a`. Relevant release files: [extension UI types](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/extensions/types.ts), [interactive mode](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/modes/interactive/interactive-mode.ts), [settings manager](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/settings-manager.ts), [resource loader](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/resource-loader.ts), and [theme schema](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/modes/interactive/theme/theme-schema.ts). Herdr 0.9.5 release [`2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01`](https://github.com/herdrdev/herdr/tree/2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01) is distinct from historical `bc8c28988f75c538d4ca058b702f5adbea30566e`; its [config model](https://github.com/herdrdev/herdr/blob/2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01/src/config/model.rs) exposes separate theme/UI controls, not a guarantee that Pi colors cover Herdr or the shell. Pins and artifact hashes remain in the existing runtime contracts.

## Phase 2 bounded handoff

The accepted pure normalization, staging, resolution and Pi artifact functions have a focused module sample; it is not a native Pi or whole-product preview. The coordinator selected the pinned-directory helper below to address the path substitution gap. Its focused synthetic macOS fixtures cover persistence and directory replacement; Linux and real Pi integration remain unqualified.

The copied Pi theme color constants in `src/pi/appearance-theme.ts` identify the release commit, original file hashes and MIT terms. The focused test `bun --no-env-file --no-install test tests/pi-appearance.test.ts` uses synthetic in-memory data only and exercises staging/reset, scoped inheritance, validation, light/dark/fallback and capability qualification, non-color sample labels and safe error output. No native UI was run. A focused strict TypeScript check uses the parent checkout’s existing read-only type declarations. Neither check qualifies runtime integration.

## Selected storage primitive (phase 2b)

The synchronous caller validates and opens the existing private state root as a no-follow directory FD, then starts an owned bounded Bun helper with that FD inherited as descriptor 3. Preferences and scope travel as bounded stdin JSON, never as argv paths or credentials. The helper lazily loads the fixed one-argument POSIX `fchdir` from the protected system library, after rejecting loader-redirection variables; on Linux use only the absolute root-owned libc candidates and ancestor checks used by the existing immutable-publication guard. Unsupported backends fail with canonical `IO`. The child `fchdir`s to descriptor 3, creates or opens the fixed private `appearance` directory, opens and pins it with a second `fchdir`, and uses fixed relative names for all subsequent operations. The caller never changes the UI process cwd. No `/dev/fd` path, variadic FFI, compiler, new dependency or environment mutation is needed.

Exclusive private lock and revision comparison serialize cooperating writers; validate scope and binding before and during Apply. Open files no-follow and check owner, mode, regular type, link count and size; write an exclusive private temporary file, fsync it, atomically rename within the pinned directory and fsync the directory. An IO error after helper spawn or a terminated child has an unknown commit/durability outcome: the caller must reload, not claim rollback. A killed helper can leave the lock or temporary file; subsequent writes fail `CONFLICT` without deleting a stale lock or sidecar. Pinning prevents redirecting writes through a replaced directory name; it does not sandbox a malicious process with the same user identity. Fixed relative operations, time/output bounds, canonical errors and no inherited credentials are required. Regression tests replace the directory name after its FD is opened and prove no write lands in the replacement.

Coordinator integration revision (2026-10-30): generated Pi settings and themes
belong to a private per-run agent directory. A project's appearance must not
rewrite another running project's theme. Persisted preferences remain in the
reviewed user store; Apply updates this runner and future launches, while other
open runners keep their current appearance. Preserve the historical agent tree
without importing its authentication. Pass the existing project's native session
directory through supported `--session-dir`; preserve its exact Pi 1.4.0 encoded
cwd naming (source `session-manager.ts:getDefaultSessionDirPath`, release
`4a080252f06caf63a525d7873c5d94d3c23887e0`). Theme migration reads only private
appearance fields from historical settings, never native auth. The operator-only
appearance dialog owns staged preview, Apply/Cancel/Reset, native resource reload,
and help. No model tools or provider protocol/authentication changes are added.
