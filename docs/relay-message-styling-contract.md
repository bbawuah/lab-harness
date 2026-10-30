# Relay message styling: frozen slice

Parent: held PR17, branch `feat/relay-human-messages`, exact head `a178daec969eaac639983750b497aa997e972eb0`. Child branch `feat/relay-message-styling` is based on that immutable commit. The parent branch, evidence, bootstrap pin and unexplained local reload failure stay unchanged. This styling slice neither resolves nor waives that hold and is not available on main.

## Mechanism and exact ownership

Coordinator is the sole writer. Product edits are limited to:

- `src/pi/relay-presentation.ts`: annotate generated lines with semantic roles while preserving its existing plain-text API and contents. Untrusted message text must never be classified as a heading by matching its contents.
- New `src/pi/relay-style.ts`: pure bounded decoration of those rows with the selected native Pi theme.
- `src/pi/relay-extension.ts`: pass the native renderer theme into decoration; no lifecycle, bridge, tool execution or notification changes.

Focused tests: new `tests/relay-style.test.ts`, renderer assertions in `tests/relay-extension.test.ts`, and the explicit synthetic release dependency list in `tests/project-selection.test.ts`. Documentation/evidence are this contract and `docs/evidence/relay-styling/**`; publication changes are the normal explicit `docs/source-manifest.json` refresh. No other product files or settings are in scope. No bootstrap/runtime repin, installer, appearance preferences/reload/persistence, provider, transport, read/ack/dedupe/lease or model-payload changes.

Use exact official Pi1.4.0 source `4a080252f06caf63a525d7873c5d94d3c23887e0`, [native Theme API](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/modes/interactive/theme/theme.ts). The supported `theme.fg`, `theme.style` and concrete semantic `theme.colors` allow an accent-backed badge with the theme's background as its text color; no hardcoded product palette or terminal-global OSC changes. Native color conversion owns RGB/indexed/ANSI output.

## Visible treatment

Only a small `Relay` badge receives an accent background. A direction marker and the existing explicit status/peer label form the header. A two-cell message rail separates plain message text. Existing status wording, bounds, labels, details and native expansion stay intact; no large card, new control, or added permanent hint.

The badge uses the selected theme's `accent` and `customMessageBg` concrete colors. Body uses `text`; rail uses `borderMuted`; secondary metadata uses `muted`. Error/pending/success remain explicit text and may use the matching semantic color. The monochrome branding header is untouched.

`NO_COLOR` or `TERM=dumb` bypasses color API calls. Plain labels and rails remain readable. ASCII mode uses `>` / `<` and `|`; Unicode mode uses arrows and a vertical rail. Very narrow widths fall back to the parent's plain renderer. Wrapping reserves decoration cells; expanded metadata is neither hidden nor reinterpreted. Untrusted ANSI/control/bidi text stays visibly escaped by the parent formatter. Each colored line closes its styles; body/details/neighboring output must not inherit the badge background.

## Verification and release boundaries

Focused regressions cover cell widths, Unicode/ASCII, color resets, body text that impersonates a Relay heading, selected light/dark/indexed theme primitives, no-color bypass, unchanged original model content/details, and expanded actionable identifiers. Actual pinned Pi sessions use disposable state and only operator slash commands, with zero provider requests. Capture native text plus actual outer ANSI color sequences; any browser-rendered screenshot is labelled as replay, not OS pixels. Light/dark/no-color/narrow checks do not claim physical-terminal contrast or mouse support.

Open a stacked draft against `feat/relay-human-messages`, link it, and return scoped evidence, focused checks and a fresh independent review to root. Do not request parent merge or change its hold. Installer distribution waits for parent resolution and normal reviewed integration.
