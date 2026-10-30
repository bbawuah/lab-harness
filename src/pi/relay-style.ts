/** Small native-theme decoration. No configuration, IO, or Relay operation. */
import { renderRelayRows, renderRelayView, type RelayRenderOptions, type RelayView } from "./relay-presentation.ts";

type NativeTheme = {
  fg(token: string, text: string): string;
  bg(token: string, text: string): string;
  style(text: string, options: { fg: unknown; bg: unknown }): string;
  colors: { accent: unknown; customMessageBg: unknown };
};
export type RelayStyleOptions = RelayRenderOptions & { color?: boolean };

/** The same native Theme object is supplied to custom-message and tool hooks. */
export function renderStyledRelay(view: RelayView, width: number, theme: unknown, options: RelayStyleOptions = {}): string[] {
  const size = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
  // No decorations are useful when the label itself cannot fit. Preserve the
  // parent's grapheme-safe narrow fallback, including actionable identifiers.
  if (size < 14) return renderRelayView(view, size, options);
  const rows = renderRelayRows(view, size - 2, options);
  const native = theme as NativeTheme | undefined;
  const plain = (row: typeof rows[number]) => {
    if (row.role === "title") {
      const rest = row.text.replace(/^Relay(?: · | - )?/, "");
      const direction = row.direction === "in" ? (options.ascii ? "< " : "← ") : row.direction === "out" ? (options.ascii ? "> " : "→ ") : "";
      return `[Relay] ${direction}${rest}`;
    }
    if (row.role === "body") return (options.ascii ? "| " : "│ ") + row.text;
    if (row.role === "title-continuation") return "  " + row.text;
    return row.text;
  };
  if (options.color === false) return rows.map(plain);
  try {
    // Even capability getters belong inside the fallback boundary. Unusual or
    // unavailable native themes must not replace readable messages/details.
    if (typeof native?.fg !== "function" || typeof native?.bg !== "function" || typeof native?.style !== "function") return rows.map(plain);
    // Access only trusted native theme colors, not caller- or message-supplied
    // ANSI. No product palette or terminal-global color setting is introduced.
    const colors = native.colors;
    if (!colors || colors.accent === undefined || colors.customMessageBg === undefined) return rows.map(plain);
    return rows.map(row => {
      let line: string;
      if (row.role === "title") {
        const rest = row.text.replace(/^Relay(?: · | - )?/, "");
        const direction = row.direction === "in" ? (options.ascii ? "< " : "← ") : row.direction === "out" ? (options.ascii ? "> " : "→ ") : "";
        const badge = native.style(" Relay ", { fg: colors.customMessageBg, bg: colors.accent });
        const status = view.error ? "error" : view.pending ? "muted" : "text";
        line = badge + native.bg("customMessageBg", " " + native.fg("accent", direction) + native.fg(status, rest));
      } else if (row.role === "body") {
        line = native.bg("customMessageBg", native.fg("borderMuted", options.ascii ? "| " : "│ ") + native.fg("text", row.text));
      } else if (row.role === "title-continuation") line = native.bg("customMessageBg", "  " + native.fg("text", row.text));
      else line = native.bg("customMessageBg", native.fg(row.role === "detail" ? "text" : "muted", row.text));
      // Close the badge and all foreground attributes at every line boundary.
      // Expanded details and neighboring native components cannot inherit them.
      return line + "\x1b[0m";
    });
  } catch { return rows.map(plain); }
}
