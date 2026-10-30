# Native Relay styling evidence

[Light and dark](light-dark.png) · [No-color and indexed](fallbacks.png) · [Narrow and expanded](narrow.png)

Actual clean source: `e866f03246b847106a090c41138d027f9f8a3fa7`. Stacked parent remains `a178daec969eaac639983750b497aa997e972eb0` on PR17. This is not installed on main; the parent reload HOLD remains unresolved. No installer pin was changed.

Four owned LAB CLI / native Pi / Herdr sessions ran on Darwin arm64 with project-local Bun1.4.2, Pi1.4.0 release source4a080252, and Herdr0.9.5 release source2ecf19a. Disposable preferences selected each mode before launch; no appearance reload was invoked. Operator commands exchanged the greeting and checked native details. This is not model inference or autonomous collaboration. The owned HTTP sink recorded0 requests. No service/model download, real user mailbox/key/configuration or global terminal setting was used.

All four sessions exited0 with server/client/worker/socket cleanup true (16 flags). Native Ctrl+O expanded/collapsed original IDs. The 72×24 outer-terminal capture preserves the actual native pane wrapping. ASCII direction/rail fallbacks were used by the native Pi locale. Extremely narrow widths and Unicode/control escaping are covered by focused renderer tests; physical IME/mouse/clipboard/WSL remain unqualified.

## Actual emitted color evidence

The raw PTY contains these native badge spans, sampled with literal ` Relay ` text:

- Dark: `0;38;2;21;21;21;48;2;142;207;255` — foreground #151515 on #8ECFFF.
- Light: `0;38;2;255;255;255;48;2;0;90;156` — foreground #FFFFFF on #005A9C.
- Indexed: `0;38;5;233;48;5;117`.
- NO_COLOR: the renderer emitted a plain `[Relay]` label; no native badge color pair was expected or observed. This does not claim that independent Herdr chrome emits no color.

Actual dark and light body/rail/secondary-text spans were also sampled. Their backgrounds match the selected native surface, including light text on #FFFFFF over a dark outer pane. `capture.json` records these SGR samples, source, raw hashes and cleanup. All colors come from native selected theme roles; there is no product-specific fixed palette.

The PNGs are **browser-rendered replay of native pane text with sampled ANSI colors**, not OS terminal pixels or physical contrast measurements. Frame, font and default canvas are editorial. Relay colors and text/surface pairs are based on recorded emitted SGR; unstyled native status text uses a neutral browser fallback. Header/footer are cropped; full sanitized text and PTY remain alongside the images. Only disposable filesystem paths and machine title are aliased. IDs remain available in raw and expanded text. Standard ANSI256 decoding in the browser does not establish a physical terminal's customized palette.

## Verification and limits

24 focused tests / 5203 assertions plus typecheck passed. Fresh scoped review round2 had no actionable findings; its independent renderer run passed21tests /5162assertions. Root reported both required CI jobs green at e866. No broad gate was duplicated and the parent reload issue was not rerun or reclassified. Styling adds no settings/reload/persistence/lifecycle/provider/transport/model-payload/read/ack/dedupe changes. The parent's bootstrap and evidence remain untouched.
