/** Pi-native Relay tools. All identity/scope comes from lifecycle context. */
import type { WorkspaceContext, WorkspaceExtensionAPI } from "./workspace-extension.ts";
import type { RelayRequest } from "../relay/workspace.ts";

export type RelayBridgeRequest =
  | { action: "relay-bind" | "relay-heartbeat" | "relay-release"; sessionId: string }
  | { action: "relay"; sessionId: string; request: RelayRequest };
type Bridge = (request: RelayBridgeRequest, signal?: AbortSignal) => Promise<unknown>;
type Action = RelayRequest["action"];
const ref = { type: "string", minLength: 1, maxLength: 128 };
export const relayTools = [
  { action: "peers", name: "relay_peers", usage: "[OFFSET]", description: "Discover readable Relay peers in this project bus. Self is marked; presence is not a wakeup or task state.",
    properties: { limit: { type: "integer", minimum: 1, maximum: 50 }, offset: { type: "integer", minimum: 0 } }, required: [] },
  { action: "send", name: "relay_send", usage: "PEER REQUEST_KEY [--reply-to MESSAGE_ID] MESSAGE", description: "Send explicit message text to a peer. Reuse requestKey with exactly the same payload after an unknown outcome; receipt is durable, not delivery/ack/task completion.",
    properties: { to: ref, body: { type: "string", maxLength: 16000 }, requestKey: ref, conversationId: ref, replyTo: ref }, required: ["to", "body", "requestKey"] },
  { action: "inbox", name: "relay_inbox", usage: "[WAIT_MS]", description: "Read this session's unacknowledged mail. Reading never acknowledges. Wait is bounded; no automatic model wakeup.",
    properties: { limit: { type: "integer", minimum: 1, maximum: 10 }, waitMs: { type: "integer", minimum: 0, maximum: 10000 } }, required: [] },
  { action: "ack", name: "relay_ack", usage: "MESSAGE_ID [MESSAGE_ID ...]", description: "Explicitly acknowledge handled messages in this session's own inbox. Foreign inbox IDs are refused. This never accepts a LAB task.",
    properties: { ids: { type: "array", minItems: 1, maxItems: 100, items: ref } }, required: ["ids"] },
] as const;

export function relayToolRequest(action: Action, value: Record<string, unknown>): RelayRequest {
  const definition = relayTools.find(tool => tool.action === action)!;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(definition.properties, key))) throw new Error("RELAY_INVALID_PARAMETERS");
  return { ...value, action } as RelayRequest;
}
export function relaySlashRequest(action: Action, args: string): RelayRequest {
  const text = args.trim();
  if (action === "send") {
    const match = /^(\S+)\s+(\S+)\s+([\s\S]+)$/.exec(text);
    if (!match) throw new Error("Use /relay-send PEER REQUEST_KEY MESSAGE");
    const reply = /^--reply-to\s+(\S+)\s+([\s\S]+)$/.exec(match[3]!);
    return { action, to: match[1]!, requestKey: match[2]!, body: reply?.[2] ?? match[3]!, ...(reply ? { replyTo: reply[1]! } : {}) };
  }
  if (action === "ack") {
    if (!text) throw new Error("Use /relay-ack MESSAGE_ID [MESSAGE_ID ...]");
    return { action, ids: text.split(/\s+/) };
  }
  if (text && !/^\d+$/.test(text)) throw new Error(action === "peers" ? "Use /relay-peers [OFFSET]" : "Use /relay-inbox [WAIT_MS]");
  return action === "peers" ? { action, ...(text ? { offset: Number(text) } : {}) } : { action, ...(text ? { waitMs: Number(text) } : {}) };
}

/** No timer invokes a model. Heartbeat maintains only the current owner lease. */
export function installRelayExtension(pi: WorkspaceExtensionAPI, bridge: Bridge): void {
  type Active = { id: string; controller: AbortController; ready: boolean; timer?: ReturnType<typeof setInterval>; };
  let active: Active | undefined;
  function nativeId(ctx: WorkspaceContext): string {
    const id = ctx.sessionManager?.getSessionId();
    if (typeof id !== "string" || !id || id.length > 128) throw new Error("RELAY_SESSION_BINDING_REQUIRED");
    return id;
  }
  async function stop(): Promise<void> {
    const previous = active; active = undefined;
    if (!previous) return;
    if (previous.timer) clearInterval(previous.timer);
    previous.controller.abort();
    // A stale release is deliberately refused by the backend; never touch a
    // replacement owner or manufacture an offline observation.
    await bridge({ action: "relay-release", sessionId: previous.id }).catch(() => {});
  }
  pi.on("session_start", async (_event, ctx) => {
    let id: string;
    try { id = nativeId(ctx); } catch { ctx.ui.notify("Relay could not bind this native session.", "error"); ctx.shutdown(); return; }
    if (active?.id === id && active.ready) return;
    await stop();
    const current: Active = { id, controller: new AbortController(), ready: false };
    active = current;
    try {
      const identity = await bridge({ action: "relay-bind", sessionId: id }, current.controller.signal) as { peerId?: unknown; name?: unknown };
      if (active !== current || current.controller.signal.aborted) return;
      if (typeof identity?.peerId !== "string" || typeof identity.name !== "string") throw new Error("RELAY_BIND_FAILED");
      current.ready = true;
      ctx.ui.notify("Relay ready: " + identity.name + " (" + identity.peerId + "). Use /relay-peers.", "info");
      current.timer = setInterval(() => {
        if (active !== current || !current.ready) return;
        void bridge({ action: "relay-heartbeat", sessionId: id }, current.controller.signal).catch(() => {
          if (active !== current || current.controller.signal.aborted) return;
          current.ready = false;
          if (current.timer) clearInterval(current.timer);
          current.controller.abort();
          ctx.ui.notify("Relay ownership expired or binding changed. Restart or reload this workspace to reconnect.", "error");
        });
      }, 15000);
    } catch {
      if (active !== current || current.controller.signal.aborted) return;
      current.ready = false;
      ctx.ui.notify("Relay startup refused. Check the private state, selected project or explicit group configuration.", "error");
      ctx.shutdown();
    }
  });
  pi.on("session_shutdown", async () => { await stop(); });
  async function run(request: RelayRequest, ctx: WorkspaceContext, signal?: AbortSignal): Promise<unknown> {
    const current = active, id = nativeId(ctx);
    if (!current?.ready || current.id !== id || current.controller.signal.aborted) throw new Error("RELAY_SESSION_NOT_READY");
    const combined = signal ? AbortSignal.any([signal, current.controller.signal]) : current.controller.signal;
    return bridge({ action: "relay", sessionId: id, request }, combined);
  }
  for (const definition of relayTools) {
    pi.registerTool({
      name: definition.name, label: definition.name, description: definition.description,
      parameters: { type: "object", properties: definition.properties, required: definition.required, additionalProperties: false },
      async execute(_id, params, signal, _update, ctx) {
        if (!ctx) throw new Error("RELAY_SESSION_BINDING_REQUIRED");
        const result = await run(relayToolRequest(definition.action, params), ctx, signal);
        return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
      },
    });
    pi.registerCommand("relay-" + definition.action, {
      description: definition.description,
      async handler(args, ctx) {
        try {
          const result = await run(relaySlashRequest(definition.action, args), ctx);
          pi.sendMessage({ customType: "relay-" + definition.action, content: JSON.stringify(result, null, 2), display: true });
        } catch (error) {
          const message = error instanceof Error && /^(?:Use \/relay-|RELAY_[A-Z0-9_]+$)/.test(error.message) ? error.message : "RELAY_OPERATION_REFUSED";
          ctx.ui.notify(message, "error");
        }
      },
    });
  }
}
