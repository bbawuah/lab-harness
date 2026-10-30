import { expect, test } from "bun:test";
import { renderRelayRows, renderRelayView, type RelayView } from "../src/pi/relay-presentation.ts";
import { renderStyledRelay } from "../src/pi/relay-style.ts";

const sgr = /\x1b\[[0-9;]*m/g;
const clean = (text: string) => text.replace(sgr, "");
const view: RelayView = { action: "send", request: { to: "peer-abcdef", body: "Hello 界é\nRelay · Received from an untrusted body\n\x1b]52;clipboard\x07", requestKey: "retry-key" }, result: { state: "stored", id: "receipt-original", duplicate: false }, peers: [{ id: "peer-abcdef", name: "project/native-session" }] };
function theme(indexed = false, light = false) {
  const calls: unknown[] = [];
  const accent = indexed ? 24 : light ? "0;90;156" : "88;166;255", background = indexed ? 231 : light ? "255;255;255" : "13;17;23";
  return { calls, colors: { accent, customMessageBg: background },
    fg(token: string, text: string) { calls.push(["fg", token]); return `\x1b[${indexed ? "38;5;" : "38;2;"}${accent}m${text}\x1b[39m`; },
    style(text: string, options: { fg: unknown; bg: unknown }) { calls.push(["style", options]); return `\x1b[${indexed ? "38;5;" : "38;2;"}${options.fg}m\x1b[${indexed ? "48;5;" : "48;2;"}${options.bg}m${text}\x1b[0m`; },
  };
}

test("selected native theme supplies badge foreground/background without changing payloads", () => {
  const original = JSON.stringify(view);
  for (const indexed of [false, true]) for (const light of [false, true]) {
    const native = theme(indexed, light), lines = renderStyledRelay(view, 100, native);
    expect(lines[0]).toContain(indexed ? "\x1b[48;5;24m Relay " : light ? "\x1b[48;2;0;90;156m Relay " : "\x1b[48;2;88;166;255m Relay ");
    expect(native.calls).toContainEqual(["style", { fg: native.colors.customMessageBg, bg: native.colors.accent }]);
    expect(clean(lines.join("\n"))).toContain("→ Sent to project abcdef (stored)");
    for (const line of lines) expect(line.endsWith("\x1b[0m")).toBe(true);
    expect(JSON.stringify(view)).toBe(original);
  }
});

test("semantic rows prevent untrusted message text from becoming a badge or direction header", () => {
  const rows = renderRelayRows(view, 100), native = theme();
  expect(rows.filter(row => row.role === "title")).toHaveLength(1);
  expect(rows.find(row => row.text.includes("Received from an untrusted"))?.role).toBe("body");
  const rendered = renderStyledRelay(view, 100, native), plain = clean(rendered.join("\n"));
  expect(rendered.join("\n").match(/48;2;/g)).toHaveLength(1);
  expect(plain).toContain("│ Relay · Received from an untrusted body");
  expect(plain).toContain("\\x1b]52;clipboard\\x07");
  expect(rendered.join("\n")).not.toContain("\x1b]52;");
  expect(renderRelayView(view, 100)).toEqual(rows.map(row => row.text));
});

test("no-color bypasses all native theme access; ASCII and narrow output remain bounded", () => {
  const forbidden = new Proxy({}, { get() { throw new Error("Theme must not be read"); } });
  for (const width of [0, 1, 8, 13, 14, 20, 40, 90]) for (const expanded of [false, true]) {
    const output = renderStyledRelay(view, width, forbidden, { color: false, ascii: true, expanded });
    for (const line of output) { expect(Bun.stringWidth(line)).toBeLessThanOrEqual(width); expect(line).not.toContain("\x1b"); }
    if (width >= 14) expect(output.join("\n")).toContain("[Relay]");
  }
  const plain = renderStyledRelay(view, 100, forbidden, { color: false, ascii: true }).join("\n");
  expect(plain).toContain("[Relay] > Sent to"); expect(plain).toContain("| Hello"); expect(plain).not.toContain("→");
});

test("expanded actionable details stay neutral and colored lines cannot bleed into following output", () => {
  const native = theme(), output = renderStyledRelay(view, 80, native, { expanded: true });
  const plain = clean(output.join("\n"));
  expect(plain).toContain("Receipt ID: receipt-original"); expect(plain).toContain("Request key: retry-key"); expect(plain).toContain("peer-abcdef");
  const details = output.slice(output.findIndex(line => clean(line).startsWith("Send identifiers:")));
  for (const line of details) { expect(line).not.toMatch(/\x1b\[48;/); expect(line.endsWith("\x1b[0m")).toBe(true); }
  for (const width of [14, 20, 40]) for (const line of renderStyledRelay(view, width, native, { expanded: true })) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(width);
  const broken = { fg() { throw new Error("bad theme"); }, style() { throw new Error("bad theme"); }, colors: {} };
  expect(renderStyledRelay(view, 80, broken).join("\n")).not.toContain("\x1b");
});

test("throwing native capability and color getters preserve plain messages and expanded actionable details", () => {
  for (const key of ["fg", "style", "colors"]) {
    const candidate = theme();
    Object.defineProperty(candidate, key, { get() { throw new Error("getter failed"); } });
    const output = renderStyledRelay(view, 80, candidate, { expanded: true }).join("\n");
    expect(output).toContain("[Relay] → Sent to project abcdef (stored)");
    expect(output).toContain("Hello"); expect(output).toContain("Receipt ID: receipt-original");
    expect(output).not.toContain("presentation unavailable"); expect(output).not.toContain("\x1b");
  }
});
