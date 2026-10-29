/** Explicit Pi extension and private stdin/stdout bridge to the existing LAB APIs. */
import { workspaceCommands, workspaceHelp } from "./commands.ts";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { verifyProjectBinding, type ProjectBinding } from "../project.ts";
import { renderHeader, terminalHasColor, type HeaderFactory } from "./header.ts";
import { installRelayExtension, type RelayBridgeRequest } from "./relay-extension.ts";

type SourceRequest = { action: "search" | "files" | "skills" | "load"; query?: string };
type Request = SourceRequest | RelayBridgeRequest;
type ToolResult = { content: { type: "text"; text: string }[]; details: unknown };
export type WorkspaceContext = { mode?: string; sessionManager?: { getSessionId(): string }; shutdown(): void; ui: { setHeader(factory: HeaderFactory): void; notify(message: string, kind?: "error" | "info"): void } };
export type WorkspaceExtensionAPI = {
  on(name: "session_start" | "session_shutdown", handler: (event: unknown, ctx: WorkspaceContext) => void | Promise<void>): unknown;
  registerTool(tool: { name: string; label: string; description: string; parameters: unknown; execute(id: string, params: Record<string, unknown>, signal?: AbortSignal, update?: unknown, ctx?: WorkspaceContext): Promise<ToolResult> }): void;
  registerCommand(name: string, options: { description: string; handler(args: string, ctx: WorkspaceContext): Promise<void> }): void;
  sendMessage(message: { customType: string; content: string; display: boolean; details?: unknown }): void;
};
const extensionPath = fileURLToPath(import.meta.url);
const installRoot = resolve(dirname(extensionPath), "../..");
function workspaceBinding(): ProjectBinding {
  const serialized = process.env.LAB_WORKSPACE_BINDING;
  if (!serialized || !process.env.LAB_WORKSPACE_ROOT) throw new Error("WORKSPACE_BINDING_REQUIRED");
  const binding = verifyProjectBinding(JSON.parse(serialized));
  if (binding.root !== process.env.LAB_WORKSPACE_ROOT) throw new Error("WORKSPACE_ROOT_MISMATCH");
  if (process.env.LAB_INSTALL_ROOT !== installRoot) throw new Error("INSTALL_ROOT_MISMATCH");
  return binding;
}
export function callWorkspaceBridge(request: Request, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) return Promise.reject(new DOMException("LAB_BRIDGE_CANCELLED", "AbortError"));
  const bun = process.env.LAB_WORKSPACE_BUN;
  if (!bun) return Promise.reject(new Error("Start this extension with ./lab"));
  const serialized = JSON.stringify(request);
  if (Buffer.byteLength(serialized) > 128 * 1024) return Promise.reject(new Error("LAB_BRIDGE_INPUT_LIMIT"));
  return new Promise((resolve, reject) => {
    const binding = workspaceBinding();
    const child = spawn(bun, ["--no-env-file", "--no-install", extensionPath, "--bridge"], {
      cwd: binding.root, stdio: ["pipe", "pipe", "pipe"], signal,
      env: { PATH: process.env.PATH, HOME: process.env.LAB_WORKSPACE_USER_HOME ?? process.env.HOME, LAB_WORKSPACE_ROOT: binding.root, LAB_WORKSPACE_BINDING: JSON.stringify(binding), LAB_INSTALL_ROOT: installRoot, LAB_WORKSPACE_USER_HOME: process.env.LAB_WORKSPACE_USER_HOME, LAB_RELAY_RUN_REF: process.env.LAB_RELAY_RUN_REF },
    });
    let output = "", bytes = 0, failure: Error | undefined;
    const timer = setTimeout(() => { failure = new Error("LAB bridge exceeded 20 seconds"); child.kill("SIGKILL"); }, 20000);
    child.on("error", error => { failure = error; });
    child.stdout.on("data", chunk => { bytes += chunk.length; if (bytes > 1024 * 1024) { failure = new Error("LAB bridge output exceeded limit"); child.kill("SIGKILL"); } else output += chunk.toString(); });
    child.stderr.resume(); // API diagnostics can contain local paths; never forward them blindly.
    child.on("close", code => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      try { const result = JSON.parse(output); if (typeof result?.error === "string" && /^(?:RELAY|LAB)_[A-Z0-9_]+$/.test(result.error)) throw new Error(result.error); if (code !== 0) throw new Error("LAB_BRIDGE_REFUSED"); resolve(result); } catch (error) { reject(error); }
    });
    child.stdin.on("error", () => {}); child.stdin.end(serialized);
  });
}
export default function workspaceExtension(pi: WorkspaceExtensionAPI): void {
  pi.registerCommand("exit", { description: "Exit this native Pi workspace (alias for /quit)", async handler(_args, ctx) { ctx.shutdown(); } });
  pi.registerCommand("lab-help", { description: "Show LAB workspace commands", async handler() {
    pi.sendMessage({ customType: "lab-help", content: workspaceHelp(), display: true });
  } });
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setHeader((_tui, theme) => ({ render: columns => renderHeader({ columns, appearance: theme.appearance, color: terminalHasColor(process.env), workspace: true }), invalidate() {} }));
  });
  for (const [action, name, description] of [["search", "lab_search", "Literal LAB source search with current SHA-256 hashes and line spans"], ["files", "lab_files", "LAB filename search with current source identities"]] as const) {
    pi.registerTool({ name, label: name, description,
      parameters: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 512 } }, required: ["query"], additionalProperties: false },
      async execute(_id, params, signal) { if (typeof params.query !== "string") throw new Error("LAB_INVALID_QUERY"); const result = await callWorkspaceBridge({ action, query: params.query }, signal); return { content: [{ type: "text", text: JSON.stringify(result) }], details: result }; },
    });
  }
  for (const { name, action, description } of workspaceCommands) {
    pi.registerCommand(name, { description, async handler(args, ctx) {
      try {
        const result = await callWorkspaceBridge({ action, query: args.trim() });
        pi.sendMessage({ customType: `lab-${action}`, content: typeof result === "string" ? result : JSON.stringify(result, null, 2), display: true });
      } catch { ctx.ui.notify("LAB operation refused: missing, ambiguous, stale, or unavailable source. Use /lab-skills for exact IDs.", "error"); }
    } });
  }
  installRelayExtension(pi, callWorkspaceBridge);
}
/** Runs under installed Bun against the bound project. No ledger or skill script executes. */
export async function executeWorkspaceRequest(request: Request): Promise<unknown> {
  const binding = workspaceBinding(), root = binding.root;
  if (request.action.startsWith("relay")) {
    const relayRequest = request as RelayBridgeRequest;
    if (Object.keys(request).some(key => !["action", "sessionId", "request"].includes(key)) || typeof relayRequest.sessionId !== "string") throw new Error("RELAY_INVALID_BINDING");
    const runRef = process.env.LAB_RELAY_RUN_REF;
    if (!runRef) throw new Error("RELAY_RUN_BINDING_REQUIRED");
    const relay = await import("../relay/workspace.ts");
    verifyProjectBinding(binding);
    if (relayRequest.action === "relay-bind") return relay.bindWorkspaceRelaySession(runRef, relayRequest.sessionId);
    const session = relay.openBoundWorkspaceRelay(runRef, relayRequest.sessionId);
    try {
      if (relayRequest.action === "relay-heartbeat") { session.heartbeat(); return { renewed: true }; }
      if (relayRequest.action === "relay-release") { session.release(); return { released: true }; }
      if (relayRequest.action !== "relay") throw new Error("RELAY_UNKNOWN_OPERATION");
      const operation = relayRequest.request;
      if (operation.action === "peers") { const { action, ...input } = operation; return session.peers(input); }
      if (operation.action === "send") return session.send(operation);
      if (operation.action === "inbox") { const { action, ...input } = operation; return await session.inbox(input); }
      if (operation.action === "ack") { const { action, ...input } = operation; return session.ack(input); }
      throw new Error("RELAY_UNKNOWN_OPERATION");
    } finally { session.close(); }
  }
  const sourceRequest = request as SourceRequest;
  if (["search", "files"].includes(request.action)) {
    const { SearchService } = await import("../search/index.ts");
    verifyProjectBinding(binding);
    const search = new SearchService(root, { projectBinding: binding, engine: "rg", limit: 20 });
    return request.action === "search" ? search.text(sourceRequest.query!) : search.files(sourceRequest.query!);
  }
  if (!["skills", "load"].includes(request.action)) throw new Error("UNKNOWN_WORKSPACE_OPERATION");
  const { discoverSkills, loadSkill, selectSkill } = await import("../skills/index.ts");
  const userHome = process.env.LAB_WORKSPACE_USER_HOME ?? homedir();
  const sources = [ { id: "repository", root, kind: "repository" as const }, { id: "examples", root: join(installRoot, "examples/skills"), kind: "skills" as const }, { id: "codex", root: join(userHome, ".codex/skills"), kind: "skills" as const }, { id: "claude", root: join(userHome, ".claude/skills"), kind: "skills" as const } ];
  verifyProjectBinding(binding);
  const inventory = discoverSkills(sources);
  verifyProjectBinding(binding);
  if (request.action === "skills") return { complete: inventory.coverageComplete, skills: inventory.skills.map(skill => ({ id: skill.id, name: skill.name, compatibility: skill.compatibility, loadable: skill.loadable, contentHash: skill.contentHash, bundleHash: skill.bundleHash, origins: skill.origins.map(origin => ({ originId: origin.originId, path: origin.path })) })) };
  const [id, originId, ...pathParts] = (sourceRequest.query ?? "").split(" ");
  const skill = inventory.skills.find(skill => skill.id === id);
  const locations = skill?.origins.filter(origin => !originId || origin.originId === originId && origin.path === pathParts.join(" "));
  if (!skill || locations?.length !== 1) throw new Error("AMBIGUOUS_OR_UNAVAILABLE_SKILL");
  verifyProjectBinding(binding);
  const loaded = loadSkill(selectSkill(skill, locations[0]!), sources, inventory);
  verifyProjectBinding(binding);
  const source = sources.find(source => source.id === loaded.selection.originId)!;
  return `Explicit LAB skill load. Instruction SHA-256: ${loaded.selection.contentHash}; bundle SHA-256: ${loaded.selection.bundleHash}\nOrigin: ${loaded.selection.originId}/${loaded.selection.path}\nLocal instruction path: ${join(source.root, loaded.selection.path)}\nResources remain at the original local bundle; loading does not execute scripts.\n\n${loaded.text}`;
}
if (process.argv.includes("--bridge")) {
  try {
    process.stdin.setEncoding("utf8");
    const input = await new Promise<string>((resolve, reject) => { let input = "", bytes = 0; process.stdin.on("data", chunk => { bytes += Buffer.byteLength(chunk); if (bytes > 128 * 1024) { process.stdin.destroy(); reject(new Error("LAB_BRIDGE_INPUT_LIMIT")); } else input += chunk; }); process.stdin.on("end", () => resolve(input)); process.stdin.on("error", reject); });
    const output = JSON.stringify(await executeWorkspaceRequest(JSON.parse(input)));
    if (Buffer.byteLength(output) > 1024 * 1024) throw new Error("LAB_BRIDGE_OUTPUT_LIMIT");
    console.log(output);
  } catch (error) {
    const relayCode = error && typeof error === "object" && "code" in error && typeof error.code === "string" && ["invalid", "conflict", "unknown_peer", "too_large", "backpressure", "unsupported"].includes(error.code) ? "RELAY_" + error.code.toUpperCase() : undefined;
    const message = error instanceof Error && /^(?:RELAY|LAB)_[A-Z0-9_]+$/.test(error.message) ? error.message : relayCode ?? "LAB_SOURCE_UNAVAILABLE_OR_STALE";
    console.log(JSON.stringify({ error: message })); process.exitCode = 1;
  }
}
