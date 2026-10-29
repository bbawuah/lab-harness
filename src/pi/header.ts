/** Opt-in startup branding only. No tools, request hooks, admission or acceptance changes. */
import mark from "./terminal-mark.json";

export type HeaderOptions = { columns: number; appearance?: "light" | "dark"; color?: boolean; workspace?: boolean };
export const NATIVE_LAB_LABEL = "Native LAB activation: BLOCKED";
export const NATIVE_LAB_DETAIL = "Request admission unqualified";
const attribution = "Powered by Pi";
const reset = "\x1b[0m";
const gray = (value: number) => Math.max(232, Math.min(255, 232 + Math.round((value - 8) / 10)));

/** Half-blocks carry two sampled pixels; transparent halves keep the terminal background. */
export function renderTerminalMark(appearance: "light" | "dark"): string[] {
  const pixels = mark[appearance];
  const lines: string[] = [];
  for (let row = 0; row < mark.pixelRows; row += 2) {
    let line = "";
    for (let col = 0; col < mark.columns; col++) {
      const top = pixels[row]![col]!, bottom = pixels[row + 1]![col]!;
      if (top < 0 && bottom < 0) line += " ";
      else if (top < 0) line += `\x1b[38;5;${gray(bottom)}m▄${reset}`;
      else if (bottom < 0) line += `\x1b[38;5;${gray(top)}m▀${reset}`;
      else line += `\x1b[38;5;${gray(top)};48;5;${gray(bottom)}m▀${reset}`;
    }
    lines.push(line);
  }
  return lines;
}

export function terminalHasColor(env: NodeJS.ProcessEnv): boolean {
  return env.NO_COLOR === undefined && env.TERM !== "dumb" &&
    (/256color|direct|kitty|wezterm|foot/.test(env.TERM ?? "") || /truecolor|24bit/.test(env.COLORTERM ?? ""));
}

// Text is deliberately ASCII, so wrapping by character count also respects terminal columns.
function wrap(text: string, columns: number): string[] {
  const lines: string[] = [];
  let rest = text;
  while (rest.length > columns) {
    const space = rest.lastIndexOf(" ", columns);
    const end = space > 0 ? space : columns;
    lines.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }
  if (rest) lines.push(rest);
  return lines;
}

/** Pure fixture seam. Pi supplies the current render width and theme appearance. */
export function renderHeader(options: HeaderOptions): string[] {
  const columns = Number.isFinite(options.columns) ? Math.max(0, Math.floor(options.columns)) : 0;
  if (!columns) return [];
  const text = options.workspace
    ? ["LAB-HARNESS", attribution, "Interactive coding workspace", "Controlled LAB tasks: unavailable"]
    : ["LAB-HARNESS", attribution, NATIVE_LAB_LABEL, NATIVE_LAB_DETAIL];
  if (!options.color || columns < mark.columns + 3 + Math.max(...text.map(line => line.length))) {
    return ["[B] (text fallback)", ...text].flatMap(line => wrap(line, columns));
  }
  const logo = renderTerminalMark(options.appearance ?? "dark");
  return logo.map((line, row) => line + (text[row - 3] ? `   ${text[row - 3]}` : ""));
}

// Structural subset of the supported Pi API keeps this extension dependency-free.
export type HeaderTheme = { readonly appearance?: "light" | "dark" };
export type HeaderComponent = { render(columns: number): string[]; invalidate(): void };
export type HeaderFactory = (tui: unknown, theme: HeaderTheme) => HeaderComponent;
export type HeaderAPI = {
  on(name: "session_start", handler: (event: unknown, ctx: {
    mode?: string; ui: { setHeader(factory: HeaderFactory): void };
  }) => void): unknown;
};

export default function header(pi: HeaderAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setHeader((_tui, theme) => ({
      render: columns => renderHeader({ columns, appearance: theme.appearance, color: terminalHasColor(process.env) }),
      invalidate() {},
    }));
  });
}
