import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import header, { NATIVE_LAB_LABEL, renderHeader, renderTerminalMark, terminalHasColor,
  type HeaderAPI, type HeaderFactory, type HeaderTheme } from "../src/pi/header.ts";
import mark from "../src/pi/terminal-mark.json";
import { deriveTerminalMark } from "../scripts/pi/derive-terminal-mark.ts";

const plain = (value: string) => value.replace(/\x1b\[[0-9;]*m/g, "");

test("pixel LB is extracted exactly from both exact owner-authorized SVG byte identities", () => {
  expect(deriveTerminalMark()).toEqual(mark);
  for (const source of mark.provenance.sources) {
    expect(createHash("sha256").update(readFileSync(new URL(`../${source.path}`, import.meta.url))).digest("hex")).toBe(source.sha256);
  }
  expect(mark.columns).toBe(24);
  expect(mark.pixelRows).toBe(32);
  for (const appearance of ["light", "dark"] as const) {
    expect(mark[appearance]).toHaveLength(32);
    for (const row of mark[appearance]) {
      expect(row).toHaveLength(24);
      expect(row.every(pixel => Number.isInteger(pixel) && pixel >= -1 && pixel <= 255)).toBe(true);
    }
    // Canonical vertical gutter between stem/top tile, and lower tile separation.
    expect(mark[appearance].slice(0, 18).every(row => row[7] === -1)).toBe(true);
    expect(mark[appearance][27]![15]).toBe(-1);
  }
  expect(mark.light.map(row => row.map(pixel => pixel < 0))).toEqual(mark.dark.map(row => row.map(pixel => pixel < 0)));
});

test("half-blocks have exact dimensions, neutral 256-color values, and reset every cell", () => {
  for (const appearance of ["light", "dark"] as const) {
    const rows = renderTerminalMark(appearance);
    expect(rows).toHaveLength(16);
    for (const row of rows) {
      expect(plain(row)).toHaveLength(24);
      expect(plain(row)).toMatch(/^[ ▀▄█]+$/);
      const codes = [...row.matchAll(/\x1b\[([^m]+)m/g)].map(match => match[1]!);
      for (const code of codes) expect(code === "0" || /^(?:38;5;\d+)(?:;48;5;\d+)?$/.test(code)).toBe(true);
      for (const match of row.matchAll(/(?:38|48);5;(\d+)/g)) {
        expect(Number(match[1])).toBeGreaterThanOrEqual(232);
        expect(Number(match[1])).toBeLessThanOrEqual(255);
      }
      expect(row.endsWith(" ") || row.endsWith("\x1b[0m")).toBe(true);
    }
  }
  // Reconstruct the text-only silhouette, including solid cells: captures must
  // retain the same geometry when the pane API strips ANSI color information.
  const rows = renderTerminalMark("dark").map(plain);
  const reconstructed = rows.flatMap(row => [
    [...row].map(cell => cell === "█" || cell === "▀"),
    [...row].map(cell => cell === "█" || cell === "▄"),
  ]);
  expect(reconstructed).toEqual(mark.dark.map(row => row.map(pixel => pixel >= 0)));
  expect(rows.join("")).toContain("█");
  expect(renderTerminalMark("light")).not.toEqual(renderTerminalMark("dark"));
});

test("every render respects columns, retaining branding, attribution and blocked label", () => {
  for (let columns = 1; columns <= 120; columns++) for (const color of [false, true]) {
    const lines = renderHeader({ columns, color, appearance: "light" });
    expect(lines.every(line => plain(line).length <= columns)).toBe(true);
    const text = lines.map(plain).join(" ");
    if (columns >= 29) {
      expect(text).toContain("LAB-HARNESS");
      expect(text).toContain("Powered by Pi");
      expect(text).toContain(NATIVE_LAB_LABEL);
    }
  }
  for (const columns of [0, -1, NaN, Infinity]) expect(renderHeader({ columns, color: true })).toEqual([]);
});

test("no-color, dumb and narrow terminals use an explicit readable text fallback", () => {
  for (const env of [{ NO_COLOR: "", TERM: "xterm-256color" }, { NO_COLOR: "1", COLORTERM: "truecolor" },
    { TERM: "dumb", COLORTERM: "truecolor" }, { TERM: "vt100" }, {}]) expect(terminalHasColor(env)).toBe(false);
  for (const env of [{ TERM: "xterm-256color" }, { COLORTERM: "truecolor" }]) expect(terminalHasColor(env)).toBe(true);
  for (const options of [{ columns: 80, color: false }, { columns: 40, color: true }]) {
    const text = renderHeader(options).join("\n");
    expect(text).toContain("[LB] (text fallback)");
    expect(text).toContain("LAB-HARNESS");
    expect(text).toContain("Powered by Pi");
    expect(text).toContain(NATIVE_LAB_LABEL);
    expect(text).not.toContain("\x1b");
    expect(text).not.toMatch(/[▀▄█]/);
  }
});

test("default extension registers only session_start and replaces only the TUI header", () => {
  let handler: Parameters<HeaderAPI["on"]>[1] | undefined;
  const registrations: string[] = [];
  header({ on(name, callback) { registrations.push(name); handler = callback; } });
  expect(registrations).toEqual(["session_start"]);
  const factories: HeaderFactory[] = [];
  const ui = { setHeader: (factory: HeaderFactory) => { factories.push(factory); } };
  for (const mode of ["rpc", "print", undefined]) handler!({}, { mode, ui });
  expect(factories).toHaveLength(0);
  handler!({}, { mode: "tui", ui });
  expect(factories).toHaveLength(1);
  const theme: HeaderTheme = { appearance: "light" };
  const component = factories[0]!(undefined, theme);
  expect(component.render(80).map(plain).join("\n")).toContain("Powered by Pi");
  component.invalidate();
  expect(component.render(14).every(line => plain(line).length <= 14)).toBe(true);
});

test("workspace header describes native coding without changing legacy defaults", () => {
  const workspace=renderHeader({columns:80,color:false,workspace:true}).join("\n");
  expect(workspace).toContain("Interactive coding workspace");
  expect(workspace).toContain("Controlled LAB tasks: unavailable");
  expect(workspace).not.toContain("BLOCKED");
  expect(renderHeader({columns:80,color:false}).join("\n")).toContain("Native LAB activation: BLOCKED");
});
