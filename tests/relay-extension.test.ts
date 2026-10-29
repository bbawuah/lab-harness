import { expect, test } from "bun:test";
import { installRelayExtension, relaySlashRequest, type RelayBridgeRequest } from "../src/pi/relay-extension.ts";
import type { WorkspaceContext, WorkspaceExtensionAPI } from "../src/pi/workspace-extension.ts";

function host(bridge?: (request: RelayBridgeRequest, signal?: AbortSignal) => Promise<unknown>) {
  const events = new Map<string, ((event: unknown, ctx: WorkspaceContext) => void | Promise<void>)[]>();
  const tools = new Map<string, any>(), commands = new Map<string, any>(), messages: unknown[] = [], notices: string[] = [], calls: RelayBridgeRequest[] = [];
  let shutdowns = 0;
  const api: WorkspaceExtensionAPI = { on(name, handler) { events.set(name, [...events.get(name) ?? [], handler]); }, registerTool(tool) { tools.set(tool.name, tool); }, registerCommand(name, command) { commands.set(name, command); }, sendMessage(message) { messages.push(message); } };
  installRelayExtension(api, async (request, signal) => {
    calls.push(request);
    if (bridge) return bridge(request, signal);
    return request.action === "relay-bind" ? { peerId: "peer-" + request.sessionId, name: "session-" + request.sessionId } : { operation: request.action, session: request.sessionId };
  });
  const ctx = (id: string): WorkspaceContext => ({ mode: "tui", sessionManager: { getSessionId: () => id }, shutdown() { shutdowns++; }, ui: { setHeader() {}, notify(message) { notices.push(message); } } });
  const event = async (name: string, context: WorkspaceContext) => { for (const handler of events.get(name) ?? []) await handler({}, context); };
  return { tools, commands, messages, notices, calls, ctx, event, shutdowns: () => shutdowns };
}

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
