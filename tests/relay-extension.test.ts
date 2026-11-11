import { expect, test } from "bun:test";
import { installRelayExtension, relaySlashRequest, type RelayBridgeRequest } from "../src/pi/relay-extension.ts";
import type { WorkspaceContext, WorkspaceExtensionAPI } from "../src/pi/workspace-extension.ts";

function host(bridge?: (request: RelayBridgeRequest, signal?: AbortSignal) => Promise<unknown>) {
  const events = new Map<string, ((event: unknown, ctx: WorkspaceContext) => void | Promise<void>)[]>();
  const tools = new Map<string, any>(), commands = new Map<string, any>(), messages: unknown[] = [], messageOptions: unknown[] = [], notices: string[] = [], calls: RelayBridgeRequest[] = [];
  const renderers = new Map<string, any>();
  let shutdowns = 0;
  const api: WorkspaceExtensionAPI = { on(name, handler) { events.set(name, [...events.get(name) ?? [], handler]); }, registerTool(tool) { tools.set(tool.name, tool); }, registerCommand(name, command) { commands.set(name, command); }, registerMessageRenderer(name, renderer) { renderers.set(name, renderer); }, sendMessage(message, options) { messages.push(message); messageOptions.push(options); } };
  installRelayExtension(api, async (request, signal) => {
    calls.push(request);
    if (bridge) return bridge(request, signal);
    return request.action === "relay-bind" ? { peerId: "peer-" + request.sessionId, name: "session-" + request.sessionId } : { operation: request.action, session: request.sessionId };
  });
  const ctx = (id: string): WorkspaceContext => ({ mode: "tui", sessionManager: { getSessionId: () => id }, shutdown() { shutdowns++; }, ui: { setEditorComponent() {}, setHeader() {}, notify(message) { notices.push(message); } } });
  const event = async (name: string, context: WorkspaceContext) => { for (const handler of events.get(name) ?? []) await handler({}, context); };
  return { renderers, tools, commands, messages, messageOptions, notices, calls, ctx, event, shutdowns: () => shutdowns };
}

test("every Relay operator result is explicitly nontriggering, including delivery during a stream", async () => {
  const h = host(), ctx = h.ctx("operator-during-stream");
  await h.event("session_start", ctx);
  for (const [action, args] of [["peers", ""], ["send", "peer-B key-1 explicit body"], ["inbox", "0"], ["ack", "message-1"]]) await h.commands.get("relay-" + action).handler(args, ctx);
  expect(h.messages).toHaveLength(4);
  expect(h.messageOptions).toEqual(Array.from({ length: 4 }, () => ({ triggerTurn: false })));
  await h.event("session_shutdown", ctx);
});

test("Relay auto-binds once, exposes every native tool, and fences stale context through switch/shutdown", async () => {
  const h = host(), a = h.ctx("native-A"), b = h.ctx("native-B");
  expect([...h.tools.keys()]).toEqual(["relay_peers", "relay_send", "relay_inbox", "relay_ack"]);
  await expect(h.tools.get("relay_peers").execute("early", {}, undefined, undefined, a)).rejects.toThrow("RELAY_SESSION_NOT_READY");
  await h.event("session_start", a); await h.event("session_start", a);
  expect(h.calls.filter(call => call.action === "relay-bind")).toHaveLength(1);
  await h.tools.get("relay_peers").execute("ok", {}, undefined, undefined, a);
  expect(h.calls.at(-1)).toEqual({ action: "relay", sessionId: "native-A", request: { action: "peers" } });
  await expect(h.tools.get("relay_send").execute("forged", { to: "peer-B", requestKey: "key", body: "hello", from: "foreign" }, undefined, undefined, a)).rejects.toThrow("RELAY_INVALID_PARAMETERS");
  expect(h.calls.at(-1)).toMatchObject({ action: "relay", sessionId: "native-A" });
  await h.event("session_start", b);
  expect(h.calls.slice(-2)).toEqual([{ action: "relay-release", sessionId: "native-A" }, { action: "relay-bind", sessionId: "native-B" }]);
  await expect(h.tools.get("relay_peers").execute("old", {}, undefined, undefined, a)).rejects.toThrow("RELAY_SESSION_NOT_READY");
  await h.event("session_shutdown", b);
  expect(h.calls.at(-1)).toEqual({ action: "relay-release", sessionId: "native-B" });
  await expect(h.tools.get("relay_inbox").execute("after", {}, undefined, undefined, b)).rejects.toThrow("RELAY_SESSION_NOT_READY");
});

test("shutdown cancels an owned inbox wait and never acknowledges as a side effect", async () => {
  const h = host(async (request, signal) => {
    if (request.action === "relay-bind") return { peerId: "owned-peer", name: "owned-session" };
    if (request.action !== "relay") return {};
    return new Promise((_resolve, reject) => { signal!.addEventListener("abort", () => reject(new Error("OWNED_WAIT_CANCELLED")), { once: true }); });
  }), context = h.ctx("native-wait");
  await h.event("session_start", context);
  const pending = h.tools.get("relay_inbox").execute("wait", { waitMs: 10000 }, undefined, undefined, context);
  const observed = pending.then(() => undefined, (error: unknown) => error);
  await h.event("session_shutdown", context);
  expect((await observed as Error).message).toBe("OWNED_WAIT_CANCELLED");
  expect(h.calls.some(call => call.action === "relay" && call.request.action === "ack")).toBe(false);
});

test("startup failure is visible without forwarding raw diagnostics; slash replies use exact explicit payload", async () => {
  const failed = host(async () => { throw new Error("PRIVATE_FIXTURE_DIAGNOSTIC"); });
  await failed.event("session_start", failed.ctx("native-fail"));
  expect(failed.shutdowns()).toBe(1); expect(failed.notices.join(" ")).not.toContain("PRIVATE_FIXTURE_DIAGNOSTIC");
  await failed.event("session_shutdown", failed.ctx("native-fail"));
  expect(relaySlashRequest("send", "peer-B hello-1 Hello there")).toEqual({ action: "send", to: "peer-B", requestKey: "hello-1", body: "Hello there" });
  expect(relaySlashRequest("send", "peer-A reply-1 --reply-to message-1 Reply text")).toEqual({ action: "send", to: "peer-A", requestKey: "reply-1", body: "Reply text", replyTo: "message-1" });
  expect(() => relaySlashRequest("send", "peer-only")).toThrow("Use /relay-send");
  expect(relaySlashRequest("inbox", "500")).toEqual({ action: "inbox", waitMs: 500 });
  expect(relaySlashRequest("ack", "one two")).toEqual({ action: "ack", ids: ["one", "two"] });
});

test("received messages show sender and body while retaining metadata for tools and expanded details", async () => {
  const inbox = { messages: [
    { id: "message-1", from: "opaque-peer-1", senderName: "demo/reviewer", body: "Review complete.\nReady for you.\x1b[2J" },
    { id: "message-2", from: "legacy-peer", body: "Second message" },
  ], unread: 3, timedOut: false };
  const h = host(async request => request.action === "relay-bind" ? { peerId: "self", name: "recipient" } : inbox);
  const ctx = h.ctx("recipient");
  await h.event("session_start", ctx);
  try {
    await h.commands.get("relay-inbox").handler("", ctx);
    const message = h.messages[0] as { content: string; details: unknown };
    expect(message.content).toContain("Session demo/reviewer sent:\nReview complete.");
    expect(message.content).toContain("Session legacy-peer sent:\nSecond message");
    expect(message.content).toContain("1 more message in your inbox.");
    expect(message.content).not.toContain("message-1");
    expect(message.details).toEqual(inbox);
    const renderer = h.renderers.get("relay-inbox");
    const compact = renderer(message, {}).render(40).join("\n");
    expect(compact).not.toContain("\x1b");
    expect(compact).not.toContain("opaque-peer-1");
    expect(renderer(message, { expanded: true }).render(100).join("\n")).toContain('"id": "message-1"');
    const tool = h.tools.get("relay_inbox");
    const result = await tool.execute("read", {}, undefined, undefined, ctx);
    expect(JSON.parse(result.content[0].text)).toEqual(inbox);
    expect(tool.renderResult(result, {}).render(40)).toEqual(renderer(message, {}).render(40));
    expect(renderer({ content: "", details: { messages: [], unread: 0 } }, {}).render(80)).toEqual(["No new Relay messages."]);
    expect(h.calls.some(call => call.action === "relay" && call.request.action === "ack")).toBe(false);
  } finally { await h.event("session_shutdown", ctx); }
});

test("Relay blocks remain distinct and fit narrow terminals without color", async () => {
  const { relayInboxComponent } = await import("../src/pi/relay-display.ts");
  const { columns } = await import("../src/pi/display.ts");
  const details = { messages: [{ from: "sender", senderName: "reviewer", body: "A longer message with 日本語 and 👋.\nA second line." }], unread: 1 };
  const component = relayInboxComponent(details, "");
  for (const width of [1, 2, 3, 4, 20, 40, 80]) {
    for (const line of component.render(width)) {
      const cells = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(line)].reduce((sum, item) => sum + columns(item.segment), 0);
      expect(cells).toBeLessThanOrEqual(width);
    }
  }
  expect(component.render(80)[0]).toBe("╭─ Relay · Session reviewer");
  expect(component.render(80)[2]).toStartWith("│  A longer message");
  expect(component.render(80).at(-1)).toBe("╰─");
  expect(component.render(0)).toEqual([]);
});
