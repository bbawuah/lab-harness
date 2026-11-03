import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DesktopSession, type Identity } from "../src/desktop/session.ts";
import { DesktopApprovals, canonicalInput, describeDesktopApproval, redeem } from "../src/desktop/approval.ts";
import { callRow, maskedValue } from "../src/desktop/display.ts";
import { envelope, permissions, snapshot, windows } from "../src/desktop/projection.ts";
import { createHostRoot, hostEnvironment, OwnedHost, type Transport } from "../src/desktop/host.ts";
import { accessibilityAdvice, setupReport } from "../src/desktop/setup.ts";
import { grantSubject } from "../src/desktop/responsible.ts";
import { desktopArtifact } from "../src/desktop/runtime.ts";
import { installDesktopExtension, type DesktopContext } from "../src/pi/desktop-extension.ts";
import { columns } from "../src/pi/browser-extension.ts";

const ok = (command: string, data: unknown) => JSON.stringify({ version: "2.5", ok: true, command, data });
const err = (command: string, code: string, delivery?: string, retry?: string) =>
  JSON.stringify({ version: "2.5", ok: false, command, error: { code, message: "m", ...(delivery ? { disposition: { delivery, retry } } : {}) } });
const window = { id: "w-1", title: "Doc", app_name: "Fixture", pid: 4242, is_focused: true, accessible: true };
const snap = (id = "s0001", app = "Fixture", windowId = "w-1", name = "Save") => ok("snapshot", { app, window: { id: windowId, title: "Doc" }, snapshot_id: id, complete: true, tree: { role: "window", children: [
  { role: "button", name, ref_id: `@${id}:e1` },
  { role: "textfield", name: "Password", value: "hunter2", states: ["secure"], ref_id: `@${id}:e2` },
  { role: "textfield", name: "Name", value: "Ada", ref_id: `@${id}:e3` },
] } });
const acted = (command: string, delivery = "delivered_verified") => ok(command, { action: command, disposition: { delivery, retry: "unsafe" }, steps: [], surfaces: [] });

type Reply = string | Error | ((args: string[]) => string | Error);
class FakeTransport implements Transport {
  calls: string[][] = []; stops = 0; removed = false; stopFails = false;
  constructor(readonly root: string, public replies: Record<string, Reply[]> = {}) {}
  async run(args: string[]) {
    this.calls.push(args);
    const key = args[0]!;
    const queue = this.replies[key];
    let reply: Reply | undefined = key === "list-windows" && (!queue || !queue.length) ? ok("list-windows", [window]) : queue?.shift();
    if (typeof reply === "function") reply = reply(args);
    if (reply === undefined) throw new Error("unexpected " + key);
    if (reply instanceof Error) throw reply;
    return { code: JSON.parse(reply).ok ? 0 : 1, stdout: reply + "\n" };
  }
  async stopHosts() { this.stops++; if (this.stopFails) throw new Error("LAB_DESKTOP_CLEANUP_FAILED: x"); }
  remove() { this.removed = true; rmSync(this.root, { recursive: true }); }
  exists() { return existsSync(this.root); }
  dispatched(command: string) { return this.calls.filter(a => a[0] === command).length; }
}
const privateRoot = () => { const root = mkdtempSync(join(tmpdir(), "lab-desktop-test-")); chmodSync(root, 0o700); return root; };
const exe = "/Applications/Fixture.app/Contents/MacOS/Fixture";
function setup(replies: Record<string, Reply[]> = {}, identity: Identity = () => exe) {
  const root = privateRoot(), transport = new FakeTransport(root, replies);
  const session = DesktopSession.create(root, { transport, identity });
  return { root, transport, session };
}
async function bound(replies: Record<string, Reply[]> = {}, identity?: Identity) {
  const s = setup({ snapshot: [snap()], ...replies }, identity);
  await s.session.bind(windows([window])[0]!);
  await s.session.execute({ operation: "snapshot" }, undefined);
  return s;
}
const approve = (s: DesktopSession, input: any, id = "call-1") => new DesktopApprovals().grant(id, input, s.bindingKey()!);

describe("desktop projection", () => {
  test("envelope refuses wrong version, command, multiple lines, oversize and bad codes", () => {
    expect(envelope(ok("click", {}), "click").ok).toBe(true);
    expect(() => envelope(JSON.stringify({ version: "2.4", ok: true, command: "click", data: {} }), "click")).toThrow("LAB_DESKTOP_RESPONSE");
    expect(() => envelope(ok("type", {}), "click")).toThrow("LAB_DESKTOP_RESPONSE");
    expect(() => envelope(ok("click", {}) + "\n" + ok("click", {}), "click")).toThrow("LAB_DESKTOP_RESPONSE");
    expect(() => envelope("x".repeat(256 * 1024 + 1), "click")).toThrow("LAB_DESKTOP_OUTPUT_LIMIT");
    expect(() => envelope("not json", "click")).toThrow("LAB_DESKTOP_RESPONSE");
    expect(() => envelope(JSON.stringify({ version: "2.5", ok: false, command: "click", error: { code: "bad code\u001b", message: "" } }), "click")).toThrow("LAB_DESKTOP_RESPONSE");
    expect(() => envelope(err("click", "X", "maybe", "safe"), "click")).toThrow("LAB_DESKTOP_RESPONSE");
  });
  test("permissions and windows are strictly shaped", () => {
    expect(permissions({ accessibility: { state: "denied" }, screen_recording: { state: "granted" }, automation: { state: "not_required" } }).accessibility).toBe("denied");
    expect(() => permissions({ accessibility: { state: "yes" } })).toThrow();
    expect(windows([window])[0]).toEqual({ id: "w-1", title: "Doc", app: "Fixture", pid: 4242, focused: true, accessible: true });
    expect(() => windows([{ ...window, id: "../x" }])).toThrow();
    expect(() => windows([{ ...window, pid: 1 }])).toThrow();
  });
  test("snapshot must be of the bound window, refs must belong to it, secure values are dropped", () => {
    const data = JSON.parse(snap()).data;
    const s = snapshot(data, { app: "Fixture", windowId: "w-1" });
    expect([...s.refs.keys()]).toEqual(["@s0001:e1", "@s0001:e2", "@s0001:e3"]);
    expect(s.refs.get("@s0001:e2")!.value).toBeUndefined();
    expect(JSON.stringify(s.tree)).not.toContain("hunter2");
    expect(() => snapshot(data, { app: "Fixture", windowId: "w-2" })).toThrow("LAB_DESKTOP_WINDOW_MISMATCH");
    expect(() => snapshot({ ...data, app: "Other" }, { app: "Fixture", windowId: "w-1" })).toThrow("LAB_DESKTOP_WINDOW_MISMATCH");
    const foreign = JSON.parse(snap()).data; foreign.tree.children[0].ref_id = "@s9999:e1";
    expect(() => snapshot(foreign, { app: "Fixture", windowId: "w-1" })).toThrow("LAB_DESKTOP_RESPONSE");
    const deep: any = { role: "group" }; let n = deep; for (let i = 0; i < 40; i++) { n.children = [{ role: "group" }]; n = n.children[0]; }
    expect(() => snapshot({ ...data, tree: deep }, { app: "Fixture", windowId: "w-1" })).toThrow("LAB_DESKTOP_OUTPUT_LIMIT");
  });
});

describe("desktop binding", () => {
  test("bind verifies the window and its process, then snapshot targets only that window", async () => {
    const { session, transport } = await bound();
    expect(session.binding()).toMatchObject({ app: "Fixture", windowId: "w-1", pid: 4242, executable: exe });
    expect(transport.calls.find(a => a[0] === "snapshot")).toEqual(["snapshot", "--app=Fixture", "--window-id=w-1", "-i", "--compact"]);
    expect(lstatSync(join(transport.root, "binding.json")).mode & 0o077).toBe(0);
  });
  test("bind refuses a window whose process cannot be verified", async () => {
    const { session } = setup({}, () => undefined);
    await expect(session.bind(windows([window])[0]!)).rejects.toThrow("LAB_DESKTOP_UNBOUND");
    expect(session.binding()).toBeUndefined();
  });
  test("no binding: model operations are refused without calling the tool", async () => {
    const { session, transport } = setup();
    await expect(session.execute({ operation: "snapshot" }, undefined)).rejects.toThrow("LAB_DESKTOP_UNBOUND");
    expect(transport.calls).toEqual([]);
  });
  test("pid replacement, a closed window or a changed executable unbinds; nothing is dispatched", async () => {
    for (const [list, identity] of [[ok("list-windows", [{ ...window, pid: 5000 }]), () => exe], [ok("list-windows", []), () => exe], [ok("list-windows", [window]), () => "/tmp/other"]] as const) {
      let calls = 0;
      const { session, transport } = await bound({ "list-windows": [ok("list-windows", [window]), ok("list-windows", [window]), list] }, pid => (calls++ < 2 ? exe : identity()));
      const input = { operation: "click" as const, ref: "@s0001:e1" };
      await expect(session.execute(input, approve(session, input))).rejects.toThrow("LAB_DESKTOP_UNBOUND");
      expect(transport.dispatched("click")).toBe(0);
      expect(session.binding()).toBeUndefined();
      expect(session.failed()).toBe(false);
    }
  });
  test("a snapshot of another window is a fault: failed marker, host stopped, survives rebind", async () => {
    const { session, transport, root } = setup({ snapshot: [snap("s0001", "Fixture", "w-9")] });
    await session.bind(windows([window])[0]!);
    await expect(session.execute({ operation: "snapshot" }, undefined)).rejects.toThrow("LAB_DESKTOP_FAILED: LAB_DESKTOP_WINDOW_MISMATCH");
    expect(transport.stops).toBe(1);
    const ref = join(privateRoot(), "ref.json"); session.save(ref);
    const again = DesktopSession.rebind(ref, { transport, identity: () => exe });
    expect(again.failed()).toBe(true);
    await expect(again.execute({ operation: "snapshot" }, undefined)).rejects.toThrow("LAB_DESKTOP_FAILED");
    expect(again.status()).toContain("stopped after a failure");
    expect(existsSync(join(root, "failed"))).toBe(true);
  });
});

describe("desktop refs, secrets and approvals", () => {
  test("stale and foreign refs are refused; every action clears refs", async () => {
    const { session, transport } = await bound({ click: [acted("click")] });
    const stale = { operation: "click" as const, ref: "@s0002:e1" };
    await expect(session.execute(stale, approve(session, stale))).rejects.toThrow("LAB_DESKTOP_STALE_REF");
    const input = { operation: "click" as const, ref: "@s0001:e1" };
    expect(await session.execute(input, approve(session, input))).toMatchObject({ action: "click", verified: true, refsCleared: true });
    const again = { operation: "read" as const, ref: "@s0001:e3", property: "text" as const };
    await expect(session.execute(again, undefined)).rejects.toThrow("LAB_DESKTOP_STALE_REF");
    expect(transport.dispatched("get")).toBe(0);
  });
  test("secure fields are never readable or typable", async () => {
    const { session, transport } = await bound();
    await expect(session.execute({ operation: "read", ref: "@s0001:e2", property: "value" }, undefined)).rejects.toThrow("LAB_DESKTOP_SECURE_FIELD");
    const type = { operation: "type" as const, ref: "@s0001:e2", text: "hunter2" };
    await expect(session.execute(type, approve(session, type))).rejects.toThrow("LAB_DESKTOP_SECURE_FIELD");
    expect(transport.dispatched("get") + transport.dispatched("type")).toBe(0);
  });
  test("actions need a genuine, unused token for this exact input and binding", async () => {
    const { session, transport } = await bound({ click: [acted("click")], snapshot: [snap(), snap()] });
    const input = { operation: "click" as const, ref: "@s0001:e1" };
    await expect(session.execute(input, undefined)).rejects.toThrow("LAB_DESKTOP_NOT_APPROVED");
    await expect(session.execute(input, { toolCallId: "x", input: canonicalInput(input), binding: session.bindingKey()! })).rejects.toThrow("LAB_DESKTOP_NOT_APPROVED");
    await expect(session.execute(input, approve(session, { operation: "click", ref: "@s0001:e3" }))).rejects.toThrow("LAB_DESKTOP_NOT_APPROVED");
    await expect(session.execute(input, new DesktopApprovals().grant("y", input, "w-1\u00004242\u0000/other"))).rejects.toThrow("LAB_DESKTOP_NOT_APPROVED");
    const token = approve(session, input);
    await session.execute(input, token);
    await session.execute({ operation: "snapshot" }, undefined);
    await expect(session.execute(input, token)).rejects.toThrow("LAB_DESKTOP_NOT_APPROVED");
    expect(transport.dispatched("click")).toBe(1);
    expect(redeem(undefined, input, "")).toBe(false);
  });
  test("inputs are bounded and allowlisted", async () => {
    const { session, transport } = await bound();
    for (const input of [
      { operation: "type", ref: "@s0001:e3", text: "a\u001b[2J" }, { operation: "type", ref: "@s0001:e3", text: "x".repeat(4001) },
      { operation: "press", key: "cmd+q" }, { operation: "scroll", ref: "@s0001:e1", direction: "down", amount: 11 },
      { operation: "click", ref: "@s0001:e1", app: "Finder" }, { operation: "launch" },
    ] as any[]) await expect(session.execute(input, approve(session, input))).rejects.toThrow(/LAB_DESKTOP_(INPUT|NOT_APPROVED)/);
    expect(transport.calls.filter(a => !["list-windows", "snapshot"].includes(a[0]!))).toEqual([]);
  });
  test("type passes text after -- and press is scoped to the bound window", async () => {
    const { session, transport } = await bound({ type: [acted("type")], press: [acted("press")], snapshot: [snap(), snap()] });
    const type = { operation: "type" as const, ref: "@s0001:e3", text: "--app=Finder" };
    await session.execute(type, approve(session, type));
    expect(transport.calls.find(a => a[0] === "type")).toEqual(["type", "@s0001:e3", "--", "--app=Finder"]);
    const press = { operation: "press" as const, key: "return" };
    await session.execute(press, approve(session, press));
    expect(transport.calls.find(a => a[0] === "press")).toEqual(["press", "return", "--app=Fixture", "--window-id=w-1"]);
  });
  test("masking in rows and prompts", () => {
    const element = { role: "textfield", name: "API key" };
    expect(maskedValue("abc", element)).toBe("•••• (masked, 3 chars)");
    expect(maskedValue("ghp_abcdefghijklmnop")).toContain("masked");
    expect(maskedValue("Ada", { role: "textfield", name: "Name" })).toBe('"Ada"');
    expect(callRow({ operation: "type", ref: "@s0001:e3", text: "Ada" }, { app: "TextEdit", title: "Untitled", element: { role: "textfield", name: "Name" } })).toBe('Desktop · type textfield "Name" = "Ada" in TextEdit · Untitled');
    const text = describeDesktopApproval({ operation: "type", ref: "@s0001:e2", text: "hunter2" }, { app: "Fixture", title: "Doc", element: { role: "textfield", name: "Password" }, uncertain: true });
    expect(text.lines.join("\n")).not.toContain("hunter2");
    expect(text.lines.join("\n")).toContain("delivery is unknown");
  });
});

describe("desktop delivery outcomes", () => {
  test("not_delivered + safe is a plain refusal; the session stays usable", async () => {
    const { session } = await bound({ click: [err("click", "STALE_REF", "not_delivered", "safe")], snapshot: [snap(), snap()] });
    const input = { operation: "click" as const, ref: "@s0001:e1" };
    await expect(session.execute(input, approve(session, input))).rejects.toThrow("LAB_DESKTOP_REFUSED: STALE_REF. Nothing was done.");
    expect(session.failed()).toBe(false); expect(session.uncertain()).toBe(false);
    await session.execute({ operation: "snapshot" }, undefined);
  });
  for (const [delivery, retry] of [["delivery_uncertain", "unsafe"], ["unknown", "unknown"], ["delivered_unverified", "unsafe"], ["not_delivered", "unknown"]]) {
    test(`error with ${delivery}/${retry} is uncertain and never retried`, async () => {
      const { session, transport } = await bound({ click: [err("click", "ACTION_FAILED", delivery, retry)] });
      const input = { operation: "click" as const, ref: "@s0001:e1" };
      await expect(session.execute(input, approve(session, input))).rejects.toThrow("LAB_DESKTOP_UNCERTAIN");
      expect(transport.dispatched("click")).toBe(1);
      expect(session.uncertain()).toBe(true); expect(session.failed()).toBe(false);
      expect(session.status()).toContain("delivery is unknown");
    });
  }
  test("error without disposition is uncertain", async () => {
    const { session } = await bound({ click: [err("click", "INTERNAL")] });
    const input = { operation: "click" as const, ref: "@s0001:e1" };
    await expect(session.execute(input, approve(session, input))).rejects.toThrow("LAB_DESKTOP_UNCERTAIN");
  });
  test("success delivered_unverified is reported unverified, never as proof", async () => {
    const { session } = await bound({ click: [acted("click", "delivered_unverified")] });
    const input = { operation: "click" as const, ref: "@s0001:e1" };
    expect(await session.execute(input, approve(session, input))).toMatchObject({ verified: false, delivery: "delivered_unverified" });
  });
  test("PERM_DENIED names no app to the model and does nothing", async () => {
    const { session } = await bound({ get: [err("get", "PERM_DENIED", "not_delivered", "safe")] });
    await expect(session.execute({ operation: "read", ref: "@s0001:e3", property: "text" }, undefined)).rejects.toThrow("LAB_DESKTOP_PERMISSION_DENIED");
  });
});

describe("desktop faults and cleanup", () => {
  for (const [name, reply] of [
    ["timeout", new Error("LAB_DESKTOP_TIMEOUT")], ["cancel", new Error("LAB_DESKTOP_CANCELLED")], ["oversize", new Error("LAB_DESKTOP_OUTPUT_LIMIT")],
    ["malformed", () => "{"], ["unknown shape", () => ok("click", { action: "click" })], ["lost reply", new Error("spawn EPIPE")],
  ] as const) {
    test(`${name} during an action fails closed and says it may have happened`, async () => {
      const { session, transport } = await bound({ click: [reply as Reply] });
      const input = { operation: "click" as const, ref: "@s0001:e1" };
      await expect(session.execute(input, approve(session, input))).rejects.toThrow(/LAB_DESKTOP_FAILED: LAB_DESKTOP_[A-Z_]+\. .*may have happened/);
      expect(session.failed()).toBe(true); expect(transport.stops).toBe(1);
      await expect(session.execute({ operation: "snapshot" }, undefined)).rejects.toThrow("LAB_DESKTOP_FAILED");
      expect(transport.dispatched("click")).toBe(1);
    });
  }
  test("close stops hosts then removes the root; unverifiable cleanup keeps it and claims nothing", async () => {
    const a = await bound();
    await a.session.close(); expect(a.transport.removed).toBe(true); expect(existsSync(a.root)).toBe(false);
    const b = await bound(); b.transport.stopFails = true;
    await expect(b.session.close()).rejects.toThrow("LAB_DESKTOP_CLEANUP_FAILED");
    expect(existsSync(b.root)).toBe(true); expect(b.session.failed()).toBe(true);
    b.transport.stopFails = false; await b.session.close(); expect(existsSync(b.root)).toBe(false);
  });
  test("release unbinds and stops the host but keeps the root for another attach", async () => {
    const { session, transport, root } = await bound();
    await session.release();
    expect(session.binding()).toBeUndefined(); expect(transport.stops).toBe(1); expect(existsSync(root)).toBe(true);
  });
});

describe("owned host", () => {
  test("private short root and credential-free environment", () => {
    const root = createHostRoot(privateRoot());
    expect(lstatSync(root).mode & 0o077).toBe(0);
    const env = hostEnvironment({ root, binary: "/x", helper: "/y" });
    expect(Object.keys(env).sort()).toEqual(["AGENT_DESKTOP_HOME", "AGENT_DESKTOP_MACOS_HELPER_PATH", "HOME", "LANG", "NO_COLOR", "PATH", "TMPDIR"]);
    expect(env.TMPDIR.startsWith(root)).toBe(true);
    rmSync(root, { recursive: true });
  });
  test("run kills its own process group on timeout, cancel and output limit", async () => {
    const root = createHostRoot(privateRoot());
    const sleeper = join(root, "sleeper"); writeFileSync(sleeper, "#!/bin/sh\nsleep 30\n", { mode: 0o700 });
    const flood = join(root, "flood"); writeFileSync(flood, "#!/bin/sh\nhead -c 400000 /dev/zero\n", { mode: 0o700 });
    await expect(new OwnedHost({ root, binary: sleeper, helper: "/y" }).run([], { timeoutMs: 100 })).rejects.toThrow("LAB_DESKTOP_TIMEOUT");
    const abort = new AbortController(); setTimeout(() => abort.abort(), 50);
    await expect(new OwnedHost({ root, binary: sleeper, helper: "/y" }).run([], { signal: abort.signal })).rejects.toThrow("LAB_DESKTOP_CANCELLED");
    await expect(new OwnedHost({ root, binary: flood, helper: "/y" }).run([])).rejects.toThrow("LAB_DESKTOP_OUTPUT_LIMIT");
    const host = new OwnedHost({ root, binary: sleeper, helper: "/y" });
    expect(host.hostPids()).toEqual([]); await host.stopHosts(); host.remove();
    expect(existsSync(root)).toBe(false);
  });
});

describe("setup and grantee", () => {
  test("generic runtimes are never suggested as the grantee", () => {
    const bun = { pid: 1, executable: "/opt/homebrew/Cellar/bun/1.4.2/bin/bun", name: "bun" };
    const lines = accessibilityAdvice(bun).join("\n");
    expect(lines).toContain("Do NOT grant it"); expect(lines).toContain("Terminal or iTerm2");
    expect(grantSubject(bun).recommended).toBe(false);
    const terminal = { pid: 2, executable: "/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal", bundle: "/System/Applications/Utilities/Terminal.app", name: "Terminal", bundleId: "com.apple.Terminal" };
    const advice = accessibilityAdvice(terminal).join("\n");
    expect(advice).toContain("add Terminal"); expect(advice).toContain("Revoke it there");
    const report = setupReport({ accessibility: "denied", screenRecording: "denied", automation: "not_required" }, bun, true);
    expect(report.ready).toBe(false); expect(report.lines.at(-1)).toContain("from Terminal or iTerm2");
  });
  test("only macOS 13+ is supported", () => {
    expect(() => desktopArtifact("linux", "x64", "6.0.0")).toThrow("LAB_DESKTOP_UNSUPPORTED");
    expect(() => desktopArtifact("darwin", "arm64", "21.6.0")).toThrow("LAB_DESKTOP_UNSUPPORTED");
    expect(desktopArtifact("darwin", "arm64", "22.0.0").archiveSHA256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("desktop Pi extension", () => {
  function fakePi() {
    const handlers: Record<string, Function[]> = {}, tools: any[] = [], commands: Record<string, any> = {};
    return { handlers, tools, commands, api: { on: (n: string, h: Function) => { (handlers[n] ??= []).push(h); }, registerTool: (t: any) => tools.push(t), registerCommand: (n: string, o: any) => { commands[n] = o; } } };
  }
  const ui = (answer?: string | Error) => {
    const seen: { titles: string[]; notes: string[]; status?: string } = { titles: [], notes: [] };
    return { seen, ctx: { hasUI: true, mode: "tui", ui: {
      async select(title: string) { seen.titles.push(title); if (answer instanceof Error) throw answer; return answer; },
      notify(m: string) { seen.notes.push(m); }, setStatus(_k: string, t?: string) { seen.status = t; },
    } } as DesktopContext };
  };
  async function harness(mode?: string, replies: Record<string, Reply[]> = {}) {
    const s = await bound({ click: [acted("click")], ...replies });
    const pi = fakePi();
    installDesktopExtension(pi.api, { session: s.session, permissionMode: () => mode, columns: () => 60 });
    const gate = (input: any, ctx: DesktopContext, id = "c1") => pi.handlers.tool_call![0]!({ toolName: "lab_desktop", toolCallId: id, input }, ctx);
    return { ...s, pi, gate, tool: pi.tools[0] };
  }
  const click = { operation: "click", ref: "@s0001:e1" };
  test("without LAB_DESKTOP_REF no tool is registered, but /lab-desktop explains how to opt in", async () => {
    const pi = fakePi(); installDesktopExtension(pi.api, {});
    expect(pi.tools).toEqual([]);
    const { ctx, seen } = ui(); await pi.commands["lab-desktop"].handler("", ctx);
    expect(seen.notes[0]).toContain("--desktop");
  });
  test("reads are not gated; actions ask allow once / deny in every mode including auto", async () => {
    for (const mode of [undefined, "ask", "edits", "auto"]) {
      const h = await harness(mode);
      expect(await h.gate({ operation: "snapshot" }, ui().ctx)).toBeUndefined();
      const { ctx, seen } = ui("Allow once");
      expect(await h.gate(click, ctx)).toBeUndefined();
      expect(seen.titles).toHaveLength(1);
      expect(seen.titles[0]).toContain('click button "Save"');
      expect(seen.titles[0]).toContain("in Fixture · Doc");
      const result = await h.tool.execute("c1", click, undefined, undefined, ctx);
      expect(result.isError).toBeUndefined();
      expect(seen.status).toBe("● desk Fixture · Doc");
    }
  });
  test("read-only refuses, deny/Esc/no-UI/prompt errors deny, and nothing is dispatched", async () => {
    const h = await harness("read-only");
    expect((await h.gate(click, ui("Allow once").ctx))!.reason).toContain("read-only");
    for (const [answer, why] of [["Deny", "the user denied it"], [undefined, "dismissed"], [new Error("render"), "prompt failed"]] as const) {
      const g = await harness("auto");
      expect((await g.gate(click, ui(answer as any).ctx))!.reason).toContain(why);
      const result = await g.tool.execute("c1", click);
      expect(result.details.error).toContain("LAB_DESKTOP_NOT_APPROVED");
      expect(g.transport.dispatched("click")).toBe(0);
    }
    const n = await harness("auto");
    const { seen, ctx } = ui("Allow once");
    expect((await n.gate(click, { ...ctx, hasUI: false }))!.reason).toContain("no interactive approval");
    expect(seen.titles).toEqual([]);
  });
  test("an approval for one call cannot be used by another call id or input", async () => {
    const h = await harness("ask", { snapshot: [snap(), snap()] });
    await h.gate(click, ui("Allow once").ctx, "c1");
    expect((await h.tool.execute("c2", click)).details.error).toContain("LAB_DESKTOP_NOT_APPROVED");
    expect((await h.tool.execute("c1", { operation: "click", ref: "@s0001:e3" })).details.error).toContain("LAB_DESKTOP_NOT_APPROVED");
    expect(h.transport.dispatched("click")).toBe(0);
  });
  test("uncertain delivery: row says so, next prompt warns", async () => {
    const h = await harness("ask", { click: [err("click", "X", "delivery_uncertain", "unsafe")], snapshot: [snap(), snap()] });
    await h.gate(click, ui("Allow once").ctx);
    const result = await h.tool.execute("c1", click);
    const row = h.tool.renderResult(result, {}, undefined, { isError: true }).render(200).join("\n");
    expect(row).toBe("! Delivery unknown. Not retried. Look at Fixture, then tell the agent what happened.");
    await h.session.execute({ operation: "snapshot" }, undefined);
    const { ctx, seen } = ui("Deny"); await h.gate(click, ctx, "c2");
    expect(seen.titles[0]).toContain("delivery is unknown");
  });
  test("hostile AX text is escaped and wrapped at widths 1–120 in rows and prompts", async () => {
    const hostile = "Save\u001b]8;;http://x\u0007‮evil​\u0085 \u{1F600}界".repeat(3);
    const h = await harness("ask", { snapshot: [snap(), snap("s0002", "Fixture", "w-1", hostile)] });
    await h.session.execute({ operation: "snapshot" }, undefined);
    const input = { operation: "type", ref: "@s0002:e1", text: "x‮y" };
    const { ctx, seen } = ui("Deny"); await h.gate(input, ctx);
    for (let width = 1; width <= 120; width++) {
      const rows = [...h.tool.renderCall(input).render(width), ...h.tool.renderResult({ details: { error: "LAB_DESKTOP_REFUSED: " + hostile }, isError: true }, {}).render(width)];
      for (const row of rows) {
        expect(/[\u0000-\u001f\u007f-\u009f‪-‮​]/.test(row)).toBe(false);
        expect(Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(row)).reduce((n, g) => n + columns(g.segment), 0)).toBeLessThanOrEqual(width);
      }
    }
    for (const row of seen.titles[0]!.split("\n")) expect(/[\u0000-\u001f\u007f-\u009f‪-‮]/.test(row)).toBe(false);
  });
  test("attach with Accessibility off names the grantee and lists no windows", async () => {
    const root = privateRoot();
    const transport = new FakeTransport(root, { permissions: [ok("permissions", { accessibility: { state: "denied" }, screen_recording: { state: "denied" }, automation: { state: "not_required" } })] });
    const session = DesktopSession.create(root, { transport, identity: () => exe });
    const pi = fakePi();
    installDesktopExtension(pi.api, { session, responsible: () => ({ pid: 1, executable: "/opt/homebrew/bin/bun", name: "bun" }) });
    const { ctx, seen } = ui();
    await pi.commands["lab-desktop"].handler("attach", ctx);
    expect(seen.notes[0]).toContain("Accessibility is off for /opt/homebrew/bin/bun");
    expect(seen.notes[0]).toContain("Do NOT grant it");
    expect(transport.calls).toEqual([["permissions"]]);
  });
  test("attach lists windows, the user picks one, and the status item shows it", async () => {
    const root = privateRoot();
    const transport = new FakeTransport(root, { permissions: [ok("permissions", { accessibility: { state: "granted" }, screen_recording: { state: "denied" }, automation: { state: "not_required" } })] });
    const session = DesktopSession.create(root, { transport, identity: () => exe });
    const pi = fakePi(); installDesktopExtension(pi.api, { session });
    const { ctx, seen } = ui("Fixture · Doc · pid 4242");
    await pi.commands["lab-desktop"].handler("attach", ctx);
    expect(session.binding()?.windowId).toBe("w-1");
    expect(seen.status).toBe("● desk Fixture · Doc");
    await pi.commands["lab-desktop"].handler("release", ctx);
    expect(seen.status).toBe("desk off");
    await pi.handlers.session_shutdown![0]!({ reason: "quit" });
    expect(existsSync(root)).toBe(false);
  });
});
