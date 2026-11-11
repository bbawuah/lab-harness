import { request } from "../herdr/protocol.ts";
import type { WorkspaceExtensionAPI, WorkspaceContext } from "./workspace-extension.ts";
import type { GatedFamily, PermissionMode } from "./permission.ts";

export const agentFamily: GatedFamily = {
  family: "Agents", tools: ["agent_spawn", "agent_list", "agent_stop"], sessionGrants: false, inAuto: "run",
  isRead: name => name === "agent_list",
  describe: (name, input) => ({ heading: name === "agent_spawn" ? "Start an agent in a Herdr tab?" : "Stop this child agent?", lines: [JSON.stringify(input)], scope: JSON.stringify(input), scopeLabel: "this agent operation" }),
};
export function installAgentExtension(pi: WorkspaceExtensionAPI, mode: () => PermissionMode, call = callAgentHost): void {
  pi.on("session_start", async (_event, ctx) => {
    if (!process.env.LAB_AGENT_SOCKET) return;
    try { await call("agent_register", {}, ctx); }
    catch { ctx.ui.notify("Agent host could not register this session. Agent controls may be unavailable.", "error"); }
  });
  const definitions = [
    { name: "agent_spawn", description: "Start a child agent in a visible Herdr tab in this project. Shares files, inherits permission mode and the configured model, receives only the explicit task. Reuse requestKey after unknown outcomes. Returns its Relay peer ID for messages.", properties: { name: { type: "string", pattern: "^[A-Za-z0-9_-]{1,40}$" }, task: { type: "string", minLength: 1, maxLength: 16000 }, requestKey: { type: "string", minLength: 1, maxLength: 128 } }, required: ["name", "task", "requestKey"] },
    { name: "agent_list", description: "List agents launched in this Herdr workspace and their process state. Use relay_peers to discover other sessions on the project bus.", properties: {}, required: [] },
    { name: "agent_stop", description: "Close a child agent's tab and stop its process. Only the session that spawned it can stop it.", properties: { id: { type: "string", minLength: 1 } }, required: ["id"] },
  ];
  for (const d of definitions) pi.registerTool({ name: d.name, label: d.name, description: d.description,
    parameters: { type: "object", properties: d.properties, required: d.required, additionalProperties: false },
    async execute(_id, input, signal, _update, ctx) {
      if (!ctx) throw new Error("LAB_AGENT_SESSION_REQUIRED");
      const result = await call(d.name, d.name === "agent_spawn" ? { ...input, permissionMode: mode() } : input, ctx, signal);
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
  pi.registerCommand("agents", { description: "List agents in this Herdr workspace", async handler(_args, ctx) {
    try { const result = await call("agent_list", {}, ctx); pi.sendMessage({ customType: "lab-agents", content: JSON.stringify(result, null, 2), display: true }, { triggerTurn: false }); }
    catch { ctx.ui.notify("Agent host unavailable. Start this session with the updated lab launcher.", "error"); }
  } });
}
async function callAgentHost(method: string, input: Record<string, unknown>, ctx: WorkspaceContext, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw new Error("LAB_AGENT_CANCELLED");
  const socket = process.env.LAB_AGENT_SOCKET, token = process.env.LAB_AGENT_TOKEN;
  if (!socket || !token) throw new Error("LAB_AGENT_HOST_UNAVAILABLE");
  const response = await request(socket, method, { ...input, token, runRef: process.env.LAB_RELAY_RUN_REF, sessionId: ctx.sessionManager?.getSessionId() }, 15000);
  return response;
}
