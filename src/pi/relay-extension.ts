/** Pi-native Relay tools. All identity/scope comes from lifecycle context. */
import type { WorkspaceContext, WorkspaceExtensionAPI } from "./workspace-extension.ts";
import type { RelayRequest } from "../relay/workspace.ts";
import { relayPeerLabel, renderRelayView, safeRelayText, type RelayPeer, type RelayView } from "./relay-presentation.ts";

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
  // Presentation-only lookup; never fetch peers as a render side effect. A
  // successful explicit peers result updates the available catalog page.
  const peers = new Map<string, RelayPeer>();
  const catalog = () => [...peers.values()];
  function remember(result: unknown): void {
    if (!result || typeof result !== "object" || !("peers" in result) || !Array.isArray(result.peers)) return;
    for (const value of result.peers.slice(0, 50)) {
      if (!value || typeof value !== "object" || typeof value.id !== "string" || typeof value.name !== "string") continue;
      if (peers.size >= 256 && !peers.has(value.id)) peers.delete(peers.keys().next().value!);
      peers.set(value.id, { id: value.id, name: value.name, presence: typeof value.presence === "string" ? value.presence : undefined, self: value.self === true });
    }
  }
  const component = (view: RelayView, expanded: boolean) => ({
    render(width: number) {
      try { return renderRelayView(view, width, { expanded, ascii: process.env.TERM === "dumb" || process.env.LC_ALL === "C" || /(?:^|\.)ascii$/i.test(process.env.LANG ?? "") }); }
      catch { return ["Relay: presentation unavailable. Original data retained in session details.".slice(0, Math.max(0, width))]; }
    }, invalidate() {},
  });
  function errorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    // Pinned Pi turns an aborted native tool into text before renderResult.
    if (message === "Operation aborted") return "RELAY_CANCELLED";
    if (/^(?:Use \/relay-|RELAY_[A-Z0-9_]+$|LAB_BRIDGE_INPUT_LIMIT$)/.test(message)) return safeRelayText(message);
    if (error instanceof Error && error.name === "AbortError") return "RELAY_CANCELLED";
    return "RELAY_OUTCOME_UNKNOWN";
  }
  for (const definition of relayTools) pi.registerMessageRenderer("relay-" + definition.action, (message, options) => {
    const details = message.details as { version?: number; request?: RelayRequest; result?: unknown; peers?: RelayPeer[] } | undefined;
    let result: unknown;
    if (details?.version === 1) result = details.result;
    else { try { result = typeof message.content === "string" ? JSON.parse(message.content) : undefined; } catch { result = undefined; } }
    return component({ action: definition.action, request: details?.version === 1 ? details.request : undefined, result, peers: details?.version === 1 ? details.peers : catalog() }, options.expanded);
  });
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
      peers.clear();
      peers.set(identity.peerId, { id: identity.peerId, name: identity.name, self: true });
      ctx.ui.notify("Relay ready · " + relayPeerLabel(identity.peerId, catalog()) + ". Use /relay-peers.", "info");
      current.timer = setInterval(() => {
        if (active !== current || !current.ready) return;
        void bridge({ action: "relay-heartbeat", sessionId: id }, current.controller.signal).catch(() => {
          if (active !== current || current.controller.signal.aborted) return;
          current.ready = false;
          if (current.timer) clearInterval(current.timer);
          current.controller.abort();
          ctx.ui.notify("Relay ownership expired or binding changed. Exit and launch lab again; use native /resume to reopen this session. Reload cannot renew an expired run.", "error");
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
    const result = await bridge({ action: "relay", sessionId: id, request }, combined);
    remember(result);
    return result;
  }
  for (const definition of relayTools) {
    pi.registerTool({
      name: definition.name, label: definition.name, description: definition.description,
      parameters: { type: "object", properties: definition.properties, required: definition.required, additionalProperties: false },
      renderCall(args, _theme, context) { return component({ action: definition.action, request: args, peers: catalog(), pending: true }, context.expanded); },
      renderResult(result, options, _theme, context) {
        const rawError = context.isError ? result.content.filter(item => item.type === "text").map(item => item.text).join("\n") : undefined;
        return component({ action: definition.action, request: context.args, result: context.isError ? undefined : result.details, peers: catalog(), ...(rawError !== undefined ? { error: errorCode(rawError) } : {}) }, options.expanded);
      },
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
          const request = relaySlashRequest(definition.action, args);
          const result = await run(request, ctx);
          pi.sendMessage({ customType: "relay-" + definition.action, content: JSON.stringify(result, null, 2), details: { version: 1, request, result, peers: catalog() }, display: true }, { triggerTurn: false });
        } catch (error) {
          const view: RelayView = { action: definition.action, error: errorCode(error), peers: catalog() };
          // Notifications are transient native UI, not expandable transcript
          // messages. Do not advertise the tool-output expansion control here.
          ctx.ui.notify(renderRelayView(view, 80, { detailsHint: false }).join("\n"), "error");
        }
      },
    });
  }
}
