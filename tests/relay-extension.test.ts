import { expect, test } from "bun:test";
import { installRelayExtension, relaySlashRequest, type RelayBridgeRequest } from "../src/pi/relay-extension.ts";
import type { WorkspaceContext, WorkspaceExtensionAPI } from "../src/pi/workspace-extension.ts";

function host(bridge?: (request: RelayBridgeRequest, signal?: AbortSignal) => Promise<unknown>) {
  const events = new Map<string, ((event: unknown, ctx: WorkspaceContext) => void | Promise<void>)[]>();
  const tools = new Map<string, any>(), commands = new Map<string, any>(), renderers = new Map<string, any>(), messages: any[] = [], messageOptions: unknown[] = [], notices: string[] = [], calls: RelayBridgeRequest[] = [];
  let shutdowns = 0;
  const api: WorkspaceExtensionAPI = { on(name, handler) { events.set(name, [...events.get(name) ?? [], handler]); }, registerTool(tool) { tools.set(tool.name, tool); }, registerCommand(name, command) { commands.set(name, command); }, registerMessageRenderer(type, renderer) { renderers.set(type, renderer); }, sendMessage(message, options) { messages.push(message); messageOptions.push(options); } };
  installRelayExtension(api, async (request, signal) => {
    calls.push(request);
    if (bridge) return bridge(request, signal);
    return request.action === "relay-bind" ? { peerId: "peer-" + request.sessionId, name: "session-" + request.sessionId } : { operation: request.action, session: request.sessionId };
  });
  const ctx = (id: string): WorkspaceContext => ({ mode: "tui", sessionManager: { getSessionId: () => id }, shutdown() { shutdowns++; }, ui: { setHeader() {}, notify(message) { notices.push(message); } } });
  const event = async (name: string, context: WorkspaceContext) => { for (const handler of events.get(name) ?? []) await handler({}, context); };
  return { tools, commands, renderers, messages, messageOptions, notices, calls, ctx, event, shutdowns: () => shutdowns };
}

test("every Relay operator result is explicitly nontriggering, including delivery during a stream", async () => {
  const h = host(), ctx = h.ctx("operator-during-stream");
  await h.event("session_start", ctx);
  for (const [action, args] of [["peers", ""], ["send", "peer-B key-1 explicit body"], ["inbox", "0"], ["ack", "message-1"]]) await h.commands.get("relay-" + action).handler(args, ctx);
  expect(h.messages).toHaveLength(4);
  expect(h.messageOptions).toEqual(Array.from({ length: 4 }, () => ({ triggerTurn: false })));
  await h.event("session_shutdown", ctx);
});

test("native tool and slash renderers hide metadata without changing model data or making bridge calls", async () => {
  const peer = { id: "pi-" + "b".repeat(64), name: "readme-review/native-uuid-b", presence: "online", self: false };
  const receipt = Object.freeze({ id: "original-message-id", state: "stored", duplicate: false, requestKey: "original-request-key", createdAt: 12, expiresAt: 34 });
  const h = host(async request => request.action === "relay-bind" ? { peerId: "pi-" + "a".repeat(64), name: "readme-review/native-uuid-a" }
    : request.action === "relay" && request.request.action === "peers" ? { peers: [peer], total: 1 } : receipt), ctx = h.ctx("native-original");
  await h.event("session_start", ctx);
  expect(h.notices[0]).toContain("Relay ready"); expect(h.notices[0]).not.toContain("native-uuid"); expect(h.notices[0]).not.toContain("pi-");
  await h.tools.get("relay_peers").execute("catalog", {}, undefined, undefined, ctx);
  const args = { to: peer.id, body: "hello\n\x1b[31mnot terminal control", requestKey: "original-request-key" };
  const tool = h.tools.get("relay_send"), result = await tool.execute("send", args, undefined, undefined, ctx);
  expect(result).toEqual({ content: [{ type: "text", text: JSON.stringify(receipt) }], details: receipt }); expect(result.details).toBe(receipt);
  const before = JSON.stringify(result), calls = h.calls.length, context = { args, expanded: false, isError: false, executionStarted: true, isPartial: false };
  const collapsed = tool.renderResult(result, { expanded: false, isPartial: false }, {}, context).render(90).join("\n");
  expect(collapsed).toContain("Sent to readme-review bbbbbb (stored)"); expect(collapsed).toContain("hello"); expect(collapsed).toContain("\\x1b"); expect(collapsed).not.toContain("\x1b");
  for (const hidden of [receipt.id, receipt.requestKey, peer.id, "createdAt"]) expect(collapsed).not.toContain(hidden);
  const expanded = tool.renderResult(result, { expanded: true, isPartial: false }, {}, context).render(90).join("\n");
  for (const detail of [receipt.id, receipt.requestKey, peer.id, "createdAt"]) expect(expanded).toContain(detail);
  expect(JSON.stringify(result)).toBe(before); expect(h.calls).toHaveLength(calls);
  await h.commands.get("relay-send").handler(peer.id + " original-request-key hello", ctx);
  const message = h.messages.at(-1);
  expect(message.content).toBe(JSON.stringify(receipt, null, 2)); expect(message.details.result).toBe(receipt);
  const slash = h.renderers.get("relay-send");
  expect(slash(message, { expanded: false }, {}).render(90).join("\n")).not.toContain(receipt.id);
  expect(slash(message, { expanded: true }, {}).render(90).join("\n")).toContain(receipt.id);
  expect(h.messageOptions.at(-1)).toEqual({ triggerTurn: false });
  const badLegacy = slash({ content: "\x1b]52;private\x07" }, { expanded: false }, {}).render(20).join("\n");
  expect(badLegacy).not.toContain("\x1b"); expect(badLegacy).not.toContain("private");
  await h.event("session_shutdown", ctx);
});

test("failed native tools retain exceptions; their presentation never forwards arbitrary provider or control text", async () => {
  const failure = new Error("RELAY_CONFLICT"), h = host(async request => { if (request.action === "relay-bind") return { peerId: "owned-peer", name: "project/native" }; throw failure; }), ctx = h.ctx("error");
  await h.event("session_start", ctx);
  const tool = h.tools.get("relay_send");
  await expect(tool.execute("failed", { to: "peer", body: "hello", requestKey: "k" }, undefined, undefined, ctx)).rejects.toBe(failure);
  const view = tool.renderResult({ content: [{ type: "text", text: "\x1b]52;private\x07" }], details: undefined }, { expanded: false }, {}, { args: {}, isError: true }).render(90).join("\n");
  expect(view).toContain("Send failed"); expect(view).toContain("may have stored"); expect(view).not.toContain("private"); expect(view).not.toContain("\x1b");
  await h.commands.get("relay-ack").handler("", ctx);
  const notice = h.notices.at(-1)!;
  expect(notice).toContain("Ack failed"); expect(notice).toContain("Use /relay-ack");
  expect(notice).not.toContain("Ctrl+O"); expect(notice).not.toContain("Details:");
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
