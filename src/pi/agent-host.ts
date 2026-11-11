import { createServer, type Socket } from "node:net";
import { randomUUID, randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { request } from "../herdr/protocol.ts";
import { privateDirectory, readPrivate, writePrivate } from "./workspace-config.ts";
import { writeModeFile } from "./permission-extension.ts";
import { parseMode } from "./permission.ts";
import { bindWorkspaceRelaySession, openBoundWorkspaceRelay, provisionWorkspaceRelayRun, type WorkspaceRelayRunOptions } from "../relay/workspace.ts";

type Agent = { id: string; name: string; parent: string; peerId: string; sessionId: string; tabId?: string; state: "starting" | "running" | "exited" | "stopped" | "unknown"; exitCode?: number; runRef: string; exitFile: string; fingerprint: string };
export type AgentHostOptions = WorkspaceRelayRunOptions & { socket: string; workspaceId: string; command: string[]; environment: Record<string, string>; transport?: typeof request };

/** Workspace-owned host; models never choose a command, socket, project, or permission mode. */
export async function startAgentHost(options: AgentHostOptions) {
  const transport = options.transport ?? request;
  const socketPath = join(dirname(options.socket), "agents.sock"), token = randomBytes(32).toString("hex");
  const agents = new Map<string, Agent>(), retries = new Map<string, string>();
  const runs = new Map<string, { agent: string }>([[options.environment.LAB_RELAY_RUN_REF!, { agent: options.environment.LAB_WORKSPACE_AGENT_DIR! }]]);
  const clients = new Set<Socket>();
  let closing = false, queue: Promise<unknown> = Promise.resolve();
  const publicAgent = (a: Agent) => ({ id: a.id, name: a.name, parent: a.parent, peerId: a.peerId, sessionId: a.sessionId, tabId: a.tabId, state: a.state, exitCode: a.exitCode });
  function refresh(a: Agent) {
    if (a.state === "running" && existsSync(a.exitFile)) {
      const status = readFileSync(a.exitFile, "utf8").trim();
      if (!/^\d{1,3}$/.test(status) || Number(status) > 255) throw new Error("LAB_AGENT_EXIT_INVALID");
      a.state = "exited"; a.exitCode = Number(status);
    }
  }
  async function dispatch(method: string, input: Record<string, unknown>) {
    if (closing) throw new Error("LAB_AGENT_HOST_CLOSING");
    const allowed = ["token", "runRef", "sessionId", ...(method === "agent_spawn" ? ["name", "task", "requestKey", "permissionMode"] : method === "agent_stop" ? ["id"] : [])];
    if (Object.keys(input).some(k => !allowed.includes(k)) || input.token !== token || typeof input.runRef !== "string" || !runs.has(input.runRef) || typeof input.sessionId !== "string") throw new Error("LAB_AGENT_BINDING_REFUSED");
    const caller = openBoundWorkspaceRelay(input.runRef, input.sessionId);
    let parent: string;
    try { caller.peers({ limit: 1 }); parent = caller.identity.peerId; } finally { caller.close(); }
    if (method === "agent_register") {
      const a = [...agents.values()].find(a => a.runRef === input.runRef);
      if (a) { a.sessionId = input.sessionId; a.peerId = parent; }
      return { registered: true };
    }
    for (const a of agents.values()) refresh(a);
    if (method === "agent_list") return { agents: [...agents.values()].map(publicAgent) };
    if (method === "agent_stop") {
      const a = agents.get(String(input.id));
      if (!a || a.parent !== parent) throw new Error("LAB_AGENT_NOT_OWNED");
      if (a.state === "stopped" || a.state === "exited") return publicAgent(a);
      if (!a.tabId) throw new Error("LAB_AGENT_OUTCOME_UNKNOWN");
      await transport(options.socket, "tab.close", { tab_id: a.tabId }, 5000);
      a.state = "stopped";
      return publicAgent(a);
    }
    if (method !== "agent_spawn" || typeof input.name !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(input.name) || typeof input.task !== "string" || !input.task.trim() || Buffer.byteLength(input.task) > 16000 || typeof input.requestKey !== "string" || !/^[\x21-\x7e]{1,128}$/.test(input.requestKey)) throw new Error("LAB_AGENT_INVALID_REQUEST");
    const key = parent + ":" + input.requestKey, fingerprint = JSON.stringify([input.name, input.task]);
    const previous = retries.get(key);
    if (previous) { const a = agents.get(previous)!; if (a.fingerprint !== fingerprint) throw new Error("LAB_AGENT_REQUEST_CONFLICT"); return publicAgent(a); }
    if ([...agents.values()].filter(a => ["starting", "running", "unknown"].includes(a.state)).length >= 8 || agents.size >= 64) throw new Error("LAB_AGENT_LIMIT");
    const source = runs.get(input.runRef)!;
    const run = mkdtempSync(join(options.stateRoot, "runs", "a-")), agent = join(run, "agent");
    privateDirectory(agent);
    for (const name of ["models.json", "settings.json"]) writePrivate(join(agent, name), readPrivate(join(source.agent, name)));
    const permission = join(run, "permission-mode.json");
    const mode = parseMode(input.permissionMode);
    if (!mode) throw new Error("LAB_AGENT_INVALID_MODE");
    writeModeFile(permission, mode);
    const runRef = provisionWorkspaceRelayRun({ stateRoot: options.stateRoot, installRoot: options.installRoot, projectBinding: options.projectBinding, runRoot: run, ...(options.groupId ? { groupId: options.groupId } : {}) });
    const sessionId = input.name + "-" + randomUUID(), identity = bindWorkspaceRelaySession(runRef, sessionId);
    const a: Agent = { id: randomUUID(), name: input.name, parent, peerId: identity.peerId, sessionId, state: "starting", runRef, exitFile: join(run, "pi-exit"), fingerprint };
    agents.set(a.id, a); retries.set(key, a.id); runs.set(runRef, { agent });
    const command = [...options.command];
    command[2] = a.exitFile;
    command.push("--session-id", sessionId, "--", `You are ${input.name}, a child agent in a visible Herdr tab. Your parent Relay peer is ${parent}. Work on the explicit task below, then send the parent a concise result using relay_send. Shared project files are visible to other agents; coordinate edits. Do not copy private session history.\n\nTask:\n${input.task}`);
    const env: Record<string, string> = { ...options.environment, PI_CODING_AGENT_DIR: agent, LAB_WORKSPACE_AGENT_DIR: agent, LAB_RELAY_RUN_REF: runRef, LAB_PERMISSION_STATE: permission, LAB_AGENT_SOCKET: socketPath, LAB_AGENT_TOKEN: token };
    delete env.LAB_BROWSER_REF;
    try {
      const result = await transport(options.socket, "layout.apply", { workspace_id: options.workspaceId, tab_label: input.name, focus: false, root: { type: "pane", label: input.name, cwd: options.projectBinding.root, command, env } }, 10000);
      if (typeof result.layout?.tab_id !== "string") throw new Error("LAB_AGENT_OUTCOME_UNKNOWN");
      a.tabId = result.layout.tab_id; a.state = "running";
    } catch { a.state = "unknown"; }
    return publicAgent(a);
  }
  const server = createServer(client => {
    clients.add(client); client.on("close", () => clients.delete(client)); client.on("error", () => {});
    client.setTimeout(20000, () => client.destroy()); client.setEncoding("utf8");
    let buffer = "", used = false;
    client.on("data", chunk => {
      if (used) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 128 * 1024) { used = true; client.destroy(); return; }
      if (!buffer.includes("\n")) return;
      used = true;
      let message: { id: string; method: string; params: Record<string, unknown> };
      try { message = JSON.parse(buffer.slice(0, buffer.indexOf("\n"))); } catch { client.destroy(); return; }
      if (!message || typeof message !== "object" || typeof message.id !== "string" || typeof message.method !== "string" || !message.params || typeof message.params !== "object" || Array.isArray(message.params)) { client.destroy(); return; }
      queue = queue.then(async () => {
        try { const result = await dispatch(message.method, message.params); client.end(JSON.stringify({ id: message.id, result }) + "\n"); }
        catch (error) { const code = error instanceof Error && /^LAB_AGENT_[A-Z_]+$/.test(error.message) ? error.message : "LAB_AGENT_OPERATION_REFUSED"; client.end(JSON.stringify({ id: message.id, error: { code } }) + "\n"); }
      });
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, () => { server.off("error", reject); resolve(); }); });
  chmodSync(socketPath, 0o600);
  return { environment: { LAB_AGENT_SOCKET: socketPath, LAB_AGENT_TOKEN: token }, async close() {
    closing = true; await queue;
    for (const client of clients) client.destroy();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const a of agents.values()) {
      let relay;
      try { relay = openBoundWorkspaceRelay(a.runRef, a.sessionId); relay.release(); }
      catch { /* A child may already have shut down or changed its native session. */ }
      finally { relay?.close(); }
    }
  } };
}
