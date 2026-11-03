import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approvalChoices, approvalTitle, classify, decide, describeApproval, isSecretField, looksSecretValue, modeCycle, permissionModes, resolveTargetPath, valuePreview, type PermissionMode } from "../src/pi/permission.ts";
import { installPermissionExtension, readModeFile, writeModeFile, type PermissionContext, type ToolCallEvent } from "../src/pi/permission-extension.ts";
import { browserCallText, browserResultText } from "../src/pi/browser-extension.ts";
import { columns } from "../src/pi/display.ts";
import extension from "../src/pi/workspace-extension.ts";

const width = (row: string) => Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(row)).reduce((n, s) => n + columns(s.segment), 0);
const hostile = "rm \x1b[2J\x1b]8;;evil\x07x‮⁦gnp.exe 日本語🙂\u0000 " + "A".repeat(150);

function sandbox() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lab-permission-")));
  const project = join(root, "project"), outside = join(root, "outside");
  mkdirSync(join(project, "src"), { recursive: true }); mkdirSync(outside);
  writeFileSync(join(project, "src/a.ts"), "export const a = 1;\n");
  writeFileSync(join(outside, "secret.txt"), "x");
  return { root, project, outside, done: () => rmSync(root, { recursive: true, force: true }) };
}

test("mode × tool-class matrix matches the contract", () => {
  const classes = { read: "read", edit: "edit", write: "edit", bash: "bash", grep: "read", find: "read", ls: "read", lab_search: "read", lab_files: "read", relay_peers: "read", relay_inbox: "read", relay_send: "relay-send", relay_ack: "relay-ack", mystery_tool: "other" } as const;
  for (const [tool, klass] of Object.entries(classes)) expect(classify(tool, {})).toBe(klass);
  expect(classify("lab_browser", { operation: "snapshot" })).toBe("read");
  expect(classify("lab_browser", { operation: "read", ref: "@e1" })).toBe("read");
  for (const operation of ["fill", "click", "navigate", "unexpected"]) expect(classify("lab_browser", { operation })).toBe("browser");
  const expected: Record<PermissionMode, Record<string, string>> = {
    ask: { read: "run", "edit-in": "ask", "edit-out": "ask", bash: "ask", browser: "ask", "relay-send": "ask", "relay-ack": "run", other: "ask" },
    edits: { read: "run", "edit-in": "run", "edit-out": "ask", bash: "ask", browser: "ask", "relay-send": "ask", "relay-ack": "run", other: "ask" },
    "read-only": { read: "run", "edit-in": "refuse", "edit-out": "refuse", bash: "refuse", browser: "refuse", "relay-send": "refuse", "relay-ack": "refuse", other: "refuse" },
    auto: { read: "run", "edit-in": "run", "edit-out": "run", bash: "run", browser: "run", "relay-send": "run", "relay-ack": "run", other: "run" },
  };
  for (const mode of permissionModes) for (const [key, want] of Object.entries(expected[mode])) {
    const klass = key.startsWith("edit") ? "edit" : key as any;
    expect(decide(mode, "tool", klass, key === "edit-in").kind, `${mode}/${key}`).toBe(want as any);
  }
  expect((decide("read-only", "bash", "bash", false) as any).reason).toMatch(/^LAB_PERMISSION_REFUSED: bash .*read-only/);
  // Cycle never enters auto.
  let mode: PermissionMode = "auto"; const seen = new Set<string>();
  for (let i = 0; i < 6; i++) { mode = modeCycle[mode]; seen.add(mode); }
  expect([...seen].sort()).toEqual(["ask", "edits", "read-only"]);
});

test("edits-mode path integrity: realpath inside project only; no .., symlink, LAB-root or ambiguous escapes", () => {
  const s = sandbox();
  try {
    const runDir = join(s.project, ".lab-run"), state = join(s.project, ".lab-state"); mkdirSync(runDir); mkdirSync(state);
    const roots = { project: s.project, excluded: [runDir, state, join(s.root, "install")] };
    const inside = (path: string, cwd = s.project) => resolveTargetPath(path, cwd, roots).inside;
    expect(inside("src/a.ts")).toBe(true);
    expect(inside("@src/a.ts")).toBe(true);
    expect(inside(join(s.project, "src/new/deep/file.ts"))).toBe(true); // missing dirs under the project
    expect(inside("a.ts", join(s.project, "src"))).toBe(true);
    expect(inside("../outside/secret.txt")).toBe(false);
    expect(inside("src/../../outside/secret.txt")).toBe(false);
    expect(inside(join(s.outside, "secret.txt"))).toBe(false);
    expect(inside(".")).toBe(false); expect(inside(s.project)).toBe(false);
    expect(inside("~/x")).toBe(false);
    expect(inside("file://" + join(s.project, "src/a.ts"))).toBe(true);
    symlinkSync(s.outside, join(s.project, "link-out"));
    expect(inside("link-out/secret.txt")).toBe(false);
    expect(inside("link-out/new-file.txt")).toBe(false); // missing file under a symlinked directory
    symlinkSync(join(s.outside, "secret.txt"), join(s.project, "file-link"));
    expect(inside("file-link")).toBe(false);
    symlinkSync(join(s.root, "nowhere"), join(s.project, "dangling"));
    expect(inside("dangling")).toBe(false);
    symlinkSync(join(s.project, "src"), join(s.outside, "link-in"));
    expect(inside(join(s.outside, "link-in/a.ts"))).toBe(true); // resolves into the project
    expect(inside(".lab-run/permission-mode.json")).toBe(false);
    expect(inside(".lab-run")).toBe(false);
    expect(inside(".lab-state/x.json")).toBe(false);
    expect(inside("src/a b.ts")).toBe(false);
    expect(inside("src/‮a.ts")).toBe(false);
    expect(inside("src/a\n.ts")).toBe(false);
    expect(inside("")).toBe(false);
    expect(resolveTargetPath(42, s.project, roots).inside).toBe(false);
    expect(resolveTargetPath("link-out/secret.txt", s.project, roots).display).toContain("outside project");
  } finally { s.done(); }
});

test("secret masking for field names and credential-looking values", () => {
  for (const name of ["Password", "API key", "One-time code", "Card number", "PIN", "Access token", "CVV"]) expect(isSecretField(name, "textbox")).toBe(true);
  expect(isSecretField("Email", "textbox")).toBe(false);
  expect(isSecretField("x", "password")).toBe(true);
  for (const value of ["sk-abc123", "ghp_0123456789abcdef", "eyJhbGciOi.eyJzdWIiOi.sig", "4111 1111 1111 1111", "Zx9!kQ2#mL5$vB8@nR3w"]) expect(looksSecretValue(value), value).toBe(true);
  for (const value of ["ada@example.com", "hello world this is long text", "Amsterdam"]) expect(looksSecretValue(value), value).toBe(false);
  expect(valuePreview("hunter2", true)).toBe("•••• (masked, 7 chars)");
  expect(valuePreview("ada@example.com", false)).toBe('"ada@example.com"');
  expect(valuePreview("x".repeat(60), false, 10)).toBe('"xxxxxxxxxx… (60 chars)"');
  expect(valuePreview("a\x1b[31mb", false)).toBe('"a\\u{1b}[31mb"');
});

test("approval text shows the concrete action, escapes hostile text and fits 40/80/120 columns", () => {
  const s = sandbox();
  try {
    const facts = { cwd: s.project, roots: { project: s.project, excluded: [] }, fileSize: (p: string) => { try { return statSync(p).size; } catch { return undefined; } },
      browser: (input: Record<string, unknown>) => ({ origin: "http://127.0.0.1:4321", element: input.ref === "@e2" ? { role: "textbox", name: "Password" } : { role: "textbox", name: "Email \x1b[2J" } }) };
    const cases = [
      describeApproval("bash", { command: hostile + "\nsecond line", timeout: 30 }, facts),
      describeApproval("edit", { path: "src/a.ts", edits: [{ oldText: "export const a = 1;", newText: "export const a = 2;\n// " + hostile }] }, facts),
      describeApproval("write", { path: "src/a.ts", content: "one\ntwo\n" }, facts),
      describeApproval("write", { path: "../outside/new.txt", content: hostile }, facts),
      describeApproval("lab_browser", { operation: "fill", ref: "@e1", text: "ada@example.com" }, facts),
      describeApproval("lab_browser", { operation: "fill", ref: "@e2", text: "hunter2" }, facts),
      describeApproval("lab_browser", { operation: "navigate", url: "http://127.0.0.1:4321/\x1b]0;x\x07" }, facts),
      describeApproval("relay_send", { to: "peer-1", requestKey: "k", body: hostile }, facts),
      describeApproval("mystery", { a: hostile }, facts),
    ];
    const text = (n: number) => cases.map(c => approvalTitle(c, "ask", n));
    for (const n of [40, 80, 120]) for (const title of text(n)) {
      for (const row of title.split("\n")) expect(width(row), JSON.stringify(row)).toBeLessThanOrEqual(n);
      expect(title).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/);
    }
    const all = text(120);
    expect(all[0]).toContain("Run shell command?"); expect(all[0]).toContain("cwd: " + s.project); expect(all[0]).toContain("timeout: 30s"); expect(all[0]).toContain("second line");
    expect(all[1]).toContain("src/a.ts"); expect(all[1]).toContain("1 replacement(s) · −1 +2 line(s)"); expect(all[1]).toContain("- export const a = 1;"); expect(all[1]).toContain("+ export const a = 2;");
    expect(all[2]).toContain("overwrites 20 bytes · 3 line(s), 8 bytes");
    expect(all[3]).toContain("new file"); expect(all[3]).toContain("outside project");
    expect(all[4]).toContain("origin: http://127.0.0.1:4321"); expect(all[4]).toContain('fill @e1 textbox "Email \\u{1b}[2J"'); expect(all[4]).toContain('value: "ada@example.com"');
    expect(all[5]).toContain("•••• (masked, 7 chars)"); expect(all[5]).not.toContain("hunter2");
    expect(all[6]).toContain("navigate to: http://127.0.0.1:4321/\\u{1b}]0;x\\u{7}");
    expect(all[7]).toContain("to: peer-1");
    expect(approvalChoices(cases[0]!)).toEqual(["Allow once", "Allow for this session (this exact command in this folder)", "Deny", "Deny with note…"]);
    // Bash commands are shown in full up to 4,000 characters.
    // Fixed cwd: the temp project name is random and may itself contain "y".
    const long = approvalTitle(describeApproval("bash", { command: "echo " + "y".repeat(5000) }, { ...facts, cwd: "/p" }), "ask", 80);
    expect(long).toContain("more character(s) not shown"); expect(long.replace(/\n/g, "").split("y").length - 1).toBe(3995);
  } finally { s.done(); }
});

test("session-grant scopes: same tool and pattern only", () => {
  const facts = { cwd: "/p", roots: { project: "/p", excluded: [] } };
  const scope = (tool: string, input: Record<string, unknown>, f: any = facts) => describeApproval(tool, input, f).scope;
  expect(scope("bash", { command: "ls" })).toBe(scope("bash", { command: "ls" }));
  expect(scope("bash", { command: "ls" })).not.toBe(scope("bash", { command: "ls -la" }));
  expect(scope("bash", { command: "ls" })).not.toBe(scope("bash", { command: "ls" }, { ...facts, cwd: "/q" }));
  expect(scope("edit", { path: "/p/a" })).not.toBe(scope("write", { path: "/p/a" }));
  expect(scope("edit", { path: "/p/a" })).not.toBe(scope("edit", { path: "/p/b" }));
  expect(scope("relay_send", { to: "a", body: "1" })).toBe(scope("relay_send", { to: "a", body: "2" }));
  expect(scope("relay_send", { to: "a" })).not.toBe(scope("relay_send", { to: "b" }));
  const b = (element: any, origin = "http://o") => ({ ...facts, browser: () => ({ origin, element }) });
  const email = { role: "textbox", name: "Email" };
  expect(scope("lab_browser", { operation: "fill", ref: "@e1", text: "a" }, b(email))).toBe(scope("lab_browser", { operation: "fill", ref: "@e9", text: "b" }, b(email)));
  expect(scope("lab_browser", { operation: "fill", ref: "@e1" }, b(email))).not.toBe(scope("lab_browser", { operation: "click", ref: "@e1" }, b(email)));
  expect(scope("lab_browser", { operation: "fill", ref: "@e1" }, b(email))).not.toBe(scope("lab_browser", { operation: "fill", ref: "@e1" }, b({ role: "textbox", name: "Name" })));
  expect(scope("lab_browser", { operation: "navigate", url: "http://o/a" }, b(undefined))).not.toBe(scope("lab_browser", { operation: "navigate", url: "http://o/b" }, b(undefined)));
});

// ---------------------------------------------------------------------------
// Extension behaviour with a fake Pi API (no Pi process, no model)
// ---------------------------------------------------------------------------
function harness(opts: { mode?: PermissionMode; project?: string; answers?: (string | undefined | Error)[]; notes?: (string | undefined)[]; statePath?: string; excluded?: string[] } = {}) {
  const handlers = new Map<string, Function>(), commands = new Map<string, any>();
  const pi = { on(name: string, h: Function) { handlers.set(name, h); }, registerCommand(name: string, c: any) { commands.set(name, c); } };
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lab-permission-ext-")));
  const project = opts.project ?? join(root, "project"); mkdirSync(project, { recursive: true });
  const statePath = opts.statePath ?? join(root, "mode.json");
  if (opts.mode) writeModeFile(statePath, opts.mode);
  const prompts: { title: string; options: string[] }[] = [], notices: string[] = [], statuses: (string | undefined)[] = [];
  const answers = [...(opts.answers ?? [])], notes = [...(opts.notes ?? [])];
  const ui = {
    async select(title: string, options: string[]) { prompts.push({ title, options }); const a = answers.shift(); if (a instanceof Error) throw a; return a === "once" ? options[0] : a === "session" ? options[1] : a === "deny" ? options[2] : a === "note" ? options[3] : a; },
    async input() { return notes.shift(); },
    notify(m: string) { notices.push(m); }, setStatus(_k: string, t: string | undefined) { statuses.push(t); },
  };
  const ctx: PermissionContext = { hasUI: true, mode: "tui", cwd: project, ui };
  const gate = installPermissionExtension(pi as any, { statePath, projectRoot: project, excluded: opts.excluded ?? [], columns: () => 80 });
  const call = (toolName: string, input: Record<string, unknown>, c: Partial<PermissionContext> = {}) => handlers.get("tool_call")!({ type: "tool_call", toolName, toolCallId: "t", input } satisfies ToolCallEvent, { ...ctx, ...c });
  return { gate, call, ctx, prompts, notices, statuses, commands, handlers, project, statePath, done: () => rmSync(root, { recursive: true, force: true }) };
}

test("ask mode: allow once, allow for session (scoped), deny, deny with note, Esc", async () => {
  const h = harness({ answers: ["once", "session", "deny", "note", undefined] , notes: ["use the test script instead"] });
  try {
    expect(await h.call("read", { path: "a" })).toBeUndefined(); expect(h.prompts).toHaveLength(0);
    expect(await h.call("bash", { command: "ls" })).toBeUndefined(); // once
    expect(await h.call("bash", { command: "git status" })).toBeUndefined(); // session grant
    expect(await h.call("bash", { command: "git status" })).toBeUndefined(); // reused: no new prompt
    expect(h.prompts).toHaveLength(2);
    expect(await h.call("bash", { command: "ls" })).toMatchObject({ block: true, reason: expect.stringContaining("LAB_PERMISSION_DENIED: bash was not run (the user denied it)") });
    const noted = await h.call("bash", { command: "git commit -m x" });
    expect(noted.reason).toContain("User note: use the test script instead");
    const esc = await h.call("write", { path: "x", content: "" });
    expect(esc.reason).toContain("the approval was dismissed");
    expect(h.prompts[0]!.title).toContain("LAB ask mode · Run shell command?");
  } finally { h.done(); }
});

test("fail closed: no UI, non-TUI, throwing prompt, aborted turn, corrupt state", async () => {
  const h = harness({ answers: [new Error("render failed"), "once"] });
  try {
    for (const c of [{ hasUI: false }, { mode: "json" }, { mode: "print" }]) {
      const r = await h.call("bash", { command: "ls" }, c);
      expect(r).toMatchObject({ block: true }); expect(r.reason).toContain("no interactive approval is available");
      expect(await h.call("relay_send", { to: "p", body: "b" }, c)).toMatchObject({ block: true });
      expect(await h.call("lab_browser", { operation: "fill", ref: "@e1", text: "x" }, c)).toMatchObject({ block: true });
      expect(await h.call("relay_ack", { id: "m" }, c)).toBeUndefined();
      expect(await h.call("read", { path: "a" }, c)).toBeUndefined();
    }
    expect((await h.call("bash", { command: "ls" })).reason).toContain("the approval prompt failed");
    expect(await h.call("bash", { command: "ls" })).toBeUndefined(); // queue recovers after a failure
    const controller = new AbortController(); controller.abort();
    expect((await h.call("bash", { command: "ls" }, { signal: controller.signal })).reason).toContain("cancelled");
    // Malformed event input still produces a denial, never a throw.
    expect(await h.handlers.get("tool_call")!({ toolName: "bash", input: null }, { ...h.ctx, hasUI: false })).toMatchObject({ block: true });
  } finally { h.done(); }
  const root = mkdtempSync(join(tmpdir(), "lab-permission-state-"));
  try {
    const path = join(root, "m.json");
    expect(readModeFile(undefined)).toBe("ask"); expect(readModeFile(path)).toBe("ask");
    writeFileSync(path, "{not json", { mode: 0o600 }); expect(readModeFile(path)).toBe("ask");
    writeFileSync(path, JSON.stringify({ mode: "yolo" })); expect(readModeFile(path)).toBe("ask");
    writeModeFile(path, "auto"); expect(readModeFile(path)).toBe("auto");
    chmodSync(path, 0o644); expect(readModeFile(path)).toBe("ask"); // must be private
    chmodSync(path, 0o600);
    symlinkSync(path, join(root, "link.json")); expect(readModeFile(join(root, "link.json"))).toBe("ask");
    expect(() => writeModeFile(join(root, "link.json"), "auto")).toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
  // Without any state file (e.g. Pi loaded outside lab) the default is ask, and with no UI that denies.
  const bare = harness({ statePath: join(tmpdir(), "lab-permission-missing-" + process.pid + ".json") });
  try { expect(bare.gate.mode).toBe("ask"); expect(await bare.call("edit", { path: "a", edits: [] }, { hasUI: false })).toMatchObject({ block: true }); } finally { bare.done(); }
});

test("edits, read-only and auto modes; integrity exclusions; bash never auto-approved by edits", async () => {
  const h = harness({ mode: "edits", answers: ["deny", "deny", "deny", "deny"] });
  try {
    const run = join(h.project, ".run"); mkdirSync(run);
    expect(await h.call("edit", { path: "src/a.ts", edits: [] })).toBeUndefined();
    expect(await h.call("write", { path: join(h.project, "new.txt"), content: "x" })).toBeUndefined();
    expect(h.prompts).toHaveLength(0);
    expect(await h.call("write", { path: "../escape.txt", content: "x" })).toMatchObject({ block: true });
    expect(await h.call("bash", { command: "echo hi > a.txt" })).toMatchObject({ block: true });
    expect(await h.call("lab_browser", { operation: "click", ref: "@e1" })).toMatchObject({ block: true });
    expect(await h.call("relay_send", { to: "p", body: "b" })).toMatchObject({ block: true });
    expect(h.prompts).toHaveLength(4);
  } finally { h.done(); }
  const excluded = harness({ mode: "edits", answers: ["deny"] });
  try {
    // The LAB run directory under the project is never auto-approved.
    const gate2 = harness({ mode: "edits", project: excluded.project, excluded: [join(excluded.project, ".run")], answers: ["deny"] });
    mkdirSync(join(excluded.project, ".run"), { recursive: true });
    expect(await gate2.call("write", { path: ".run/permission-mode.json", content: '{"mode":"auto"}' })).toMatchObject({ block: true });
    expect(gate2.prompts).toHaveLength(1);
  } finally { excluded.done(); }
  const ro = harness({ mode: "read-only" });
  try {
    for (const [tool, input] of [["edit", { path: "a" }], ["write", { path: "a" }], ["bash", { command: "ls" }], ["lab_browser", { operation: "navigate", url: "http://x" }], ["relay_send", {}], ["relay_ack", {}], ["mystery", {}]] as const) {
      const r = await ro.call(tool, input as any); expect(r, tool).toMatchObject({ block: true }); expect(r.reason).toContain("read-only mode");
    }
    expect(await ro.call("lab_browser", { operation: "snapshot" })).toBeUndefined();
    expect(ro.prompts).toHaveLength(0);
  } finally { ro.done(); }
  const auto = harness({ mode: "auto" });
  try {
    for (const tool of ["edit", "write", "bash", "lab_browser", "relay_send", "mystery"]) expect(await auto.call(tool, { path: "../x", operation: "fill" }, { hasUI: false })).toBeUndefined();
  } finally { auto.done(); }
});

test("/lab-mode changes mode, persists privately, clears grants, shows the footer and refuses bad input", async () => {
  const h = harness({ answers: ["session"] });
  try {
    await h.handlers.get("session_start")!({ reason: "startup" }, h.ctx);
    expect(h.statuses.at(-1)).toBe("mode: ask · /lab-mode");
    expect(await h.call("bash", { command: "ls" })).toBeUndefined(); expect(h.gate.grants.size).toBe(1);
    await h.commands.get("lab-mode").handler("edits", h.ctx);
    expect(h.gate.mode).toBe("edits"); expect(h.gate.grants.size).toBe(0);
    expect(JSON.parse(readFileSync(h.statePath, "utf8"))).toEqual({ mode: "edits" });
    expect(statSync(h.statePath).mode & 0o777).toBe(0o600);
    expect(h.statuses.at(-1)).toBe("mode: edits · /lab-mode");
    await h.commands.get("lab-mode").handler("next", h.ctx); expect(h.gate.mode).toBe("read-only");
    await h.commands.get("lab-mode").handler("next", h.ctx); expect(h.gate.mode).toBe("ask");
    await h.commands.get("lab-mode").handler("yolo", h.ctx); expect(h.gate.mode).toBe("ask"); expect(h.notices.at(-1)).toContain("Unknown mode");
    await h.commands.get("lab-mode").handler("auto", h.ctx); expect(h.gate.mode).toBe("auto");
    // The selector form, as the operator would use it.
    const h2 = harness({ answers: [] });
    try {
      let shown: string[] = [];
      h2.ctx.ui.select = async (_t, options) => { shown = options; return options[2]; };
      await h2.commands.get("lab-mode").handler("", h2.ctx);
      expect(shown[0]).toContain("ask (current)"); expect(h2.gate.mode).toBe("read-only");
    } finally { h2.done(); }
    // A new extension instance (/reload) restores the mode from the file, with empty grants.
    const reloaded = harness({ statePath: h.statePath });
    try { expect(reloaded.gate.mode).toBe("auto"); expect(reloaded.gate.grants.size).toBe(0); } finally { reloaded.done(); }
    // Grants are dropped on /new, /resume and /fork.
    await h.commands.get("lab-mode").handler("ask", h.ctx);
    h.ctx.ui.select = async (_t, o) => o[1];
    await h.call("bash", { command: "ls" }); expect(h.gate.grants.size).toBe(1);
    for (const reason of ["new", "resume", "fork"]) { await h.call("bash", { command: "ls" }); await h.handlers.get("session_start")!({ reason }, h.ctx); expect(h.gate.grants.size).toBe(0); }
  } finally { h.done(); }
});

test("concurrent gated calls are serialized: one prompt at a time", async () => {
  const h = harness();
  try {
    let open = 0, maxOpen = 0;
    h.ctx.ui.select = async (_t, o) => { open++; maxOpen = Math.max(maxOpen, open); await new Promise(r => setTimeout(r, 10)); open--; return o[0]; };
    await Promise.all([h.call("bash", { command: "a" }), h.call("bash", { command: "b" }), h.call("write", { path: "c", content: "" })]);
    expect(maxOpen).toBe(1);
  } finally { h.done(); }
});

test("workspace extension registers the gate, /lab-mode and keeps existing commands", () => {
  const events: string[] = [], commands: string[] = [];
  extension({ on(name: string) { events.push(name); }, registerTool() {}, registerCommand(name: string) { commands.push(name); }, sendMessage() {} } as any);
  expect(events).toContain("tool_call"); expect(commands).toContain("lab-mode"); expect(commands).toContain("lab-help");
});

test("F30 browser rows name element, masked value and origin; escaped and width-bounded", () => {
  const origin = "http://127.0.0.1:4321";
  expect(browserCallText({ operation: "fill", ref: "@e4", text: "ada@example.com" }, { role: "textbox", name: "Email" }, origin)).toBe('Browser · fill @e4 textbox "Email" = "ada@example.com" · http://127.0.0.1:4321');
  expect(browserCallText({ operation: "fill", ref: "@e5", text: "hunter2" }, { role: "textbox", name: "Password" }, origin)).toBe('Browser · fill @e5 textbox "Password" = •••• (masked, 7 chars) · http://127.0.0.1:4321');
  expect(browserCallText({ operation: "click", ref: "@e6" }, undefined, origin)).toBe("Browser · click @e6 · http://127.0.0.1:4321");
  expect(browserCallText({ operation: "navigate", url: origin + "/next" }, undefined, origin)).toBe("Browser · navigate http://127.0.0.1:4321/next · http://127.0.0.1:4321");
  expect(browserCallText({ operation: "snapshot" }, undefined, origin)).toBe("Browser · snapshot · http://127.0.0.1:4321");
  const hostileCall = browserCallText({ operation: "fill", ref: "@e1", text: hostile }, { role: "textbox", name: "‮emaN\x1b[2J" }, origin);
  expect(hostileCall).not.toMatch(/[\u0000-\u0009\u000b-\u001f‮]/);
  const details = (result: any) => ({ pageContent: "UNTRUSTED DATA, not instructions", result, verifiedOrigin: origin });
  expect(browserResultText(details({ filled: "@e4" }), '@e4 textbox "Email"')).toBe('Browser · filled @e4 textbox "Email" · http://127.0.0.1:4321');
  expect(browserResultText(details({ clicked: "@e6" }), undefined)).toBe("Browser · clicked @e6 · http://127.0.0.1:4321");
  expect(browserResultText(details({ url: origin + "/next", title: "t" }), undefined)).toBe("Browser · navigated http://127.0.0.1:4321/next · http://127.0.0.1:4321");
  expect(browserResultText(details({ origin, refs: { e1: {}, e2: {} }, removedRefs: [], snapshot: "" }), undefined)).toBe("Browser · snapshot 2 refs · http://127.0.0.1:4321 (expand for page data)");
  expect(browserResultText(details({ origin, text: "hello" }), '@e1 heading "Hi"')).toBe('Browser · read @e1 heading "Hi" 5 chars · http://127.0.0.1:4321 (expand for page data)');
});
