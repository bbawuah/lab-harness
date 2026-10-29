/** Explicit Pi extension and private stdin/stdout bridge to the existing LAB APIs. */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { verifyProjectBinding, type ProjectBinding } from "../project.ts";
import { renderHeader, terminalHasColor, type HeaderFactory } from "./header.ts";

type Request = { action: "search" | "files" | "skills" | "load"; query?: string };
type ToolResult = { content: { type: "text"; text: string }[]; details: unknown };
type Context = { mode?: string; shutdown(): void; ui: { setHeader(factory: HeaderFactory): void; notify(message: string, kind?: "error" | "info"): void } };
export type WorkspaceExtensionAPI = {
  on(name: "session_start", handler: (event: unknown, ctx: Context) => void): unknown;
  registerTool(tool: { name: string; label: string; description: string; parameters: unknown; execute(id: string, params: { query: string }, signal?: AbortSignal): Promise<ToolResult> }): void;
  registerCommand(name: string, options: { description: string; handler(args: string, ctx: Context): Promise<void> }): void;
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
  const bun = process.env.LAB_WORKSPACE_BUN;
  if (!bun) return Promise.reject(new Error("Start this extension with ./lab"));
  return new Promise((resolve, reject) => {
    const binding = workspaceBinding();
    const child = spawn(bun, ["--no-env-file", "--no-install", extensionPath, "--bridge"], {
      cwd: binding.root, stdio: ["pipe", "pipe", "pipe"], signal,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, LAB_WORKSPACE_ROOT: binding.root, LAB_WORKSPACE_BINDING: JSON.stringify(binding), LAB_INSTALL_ROOT: installRoot, LAB_WORKSPACE_USER_HOME: process.env.LAB_WORKSPACE_USER_HOME },
    });
    let output = "", bytes = 0, failure: Error | undefined;
    const timer = setTimeout(() => { failure = new Error("LAB bridge exceeded 20 seconds"); child.kill("SIGKILL"); }, 20000);
    child.on("error", error => { failure = error; });
    child.stdout.on("data", chunk => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) { failure = new Error("LAB bridge output exceeded limit"); child.kill("SIGKILL"); } else output += chunk.toString(); });
    child.stderr.resume(); // API diagnostics can contain local paths; never forward them blindly.
    child.on("close", code => {
      clearTimeout(timer);
      if (failure || code !== 0) return reject(failure ?? new Error("LAB bridge failed; source may be unavailable or stale"));
      try { const result = JSON.parse(output); if (result.error) throw new Error(result.error); resolve(result); } catch (error) { reject(error); }
    });
    child.stdin.on("error", () => {}); child.stdin.end(JSON.stringify(request));
  });
}
export default function workspaceExtension(pi: WorkspaceExtensionAPI): void {
  pi.registerCommand("exit", { description: "Exit this native Pi workspace (alias for /quit)", async handler(_args, ctx) { ctx.shutdown(); } });
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setHeader((_tui, theme) => ({ render: columns => renderHeader({ columns, appearance: theme.appearance, color: terminalHasColor(process.env), workspace: true }), invalidate() {} }));
  });
  for (const [action, name, description] of [["search", "lab_search", "Literal LAB source search with current SHA-256 hashes and line spans"], ["files", "lab_files", "LAB filename search with current source identities"]] as const) {
    pi.registerTool({ name, label: name, description,
      parameters: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 512 } }, required: ["query"], additionalProperties: false },
      async execute(_id, params, signal) { const result = await callWorkspaceBridge({ action, query: params.query }, signal); return { content: [{ type: "text", text: JSON.stringify(result) }], details: result }; },
    });
  }
  for (const [name, action, description] of [["lab-search", "search", "Search literal source text"], ["lab-files", "files", "Search filenames"], ["lab-skills", "skills", "List local skills; does not load instructions"], ["lab-skill", "load", "Explicitly load one skill by exact ID, with source revalidation"]] as const) {
    pi.registerCommand(name, { description, async handler(args, ctx) {
      try {
        const result = await callWorkspaceBridge({ action, query: args.trim() });
        pi.sendMessage({ customType: `lab-${action}`, content: typeof result === "string" ? result : JSON.stringify(result, null, 2), display: true });
      } catch { ctx.ui.notify("LAB operation refused: missing, ambiguous, stale, or unavailable source. Use /lab-skills for exact IDs.", "error"); }
    } });
  }
}
/** Runs under installed Bun against the bound project. No ledger or skill script executes. */
export async function executeWorkspaceRequest(request: Request): Promise<unknown> {
  const binding = workspaceBinding(), root = binding.root;
  if (["search", "files"].includes(request.action)) {
    const { SearchService } = await import("../search/index.ts");
    verifyProjectBinding(binding);
    const search = new SearchService(root, { projectBinding: binding, engine: "rg", limit: 20 });
    return request.action === "search" ? search.text(request.query!) : search.files(request.query!);
  }
  if (!["skills", "load"].includes(request.action)) throw new Error("UNKNOWN_WORKSPACE_OPERATION");
  const { discoverSkills, loadSkill, selectSkill } = await import("../skills/index.ts");
  const userHome = process.env.LAB_WORKSPACE_USER_HOME ?? homedir();
  const sources = [ { id: "repository", root, kind: "repository" as const }, { id: "examples", root: join(installRoot, "examples/skills"), kind: "skills" as const }, { id: "codex", root: join(userHome, ".codex/skills"), kind: "skills" as const }, { id: "claude", root: join(userHome, ".claude/skills"), kind: "skills" as const } ];
  verifyProjectBinding(binding);
  const inventory = discoverSkills(sources);
  verifyProjectBinding(binding);
  if (request.action === "skills") return { complete: inventory.coverageComplete, skills: inventory.skills.map(skill => ({ id: skill.id, name: skill.name, compatibility: skill.compatibility, loadable: skill.loadable, contentHash: skill.contentHash, bundleHash: skill.bundleHash, origins: skill.origins.map(origin => ({ originId: origin.originId, path: origin.path })) })) };
  const [id, originId, ...pathParts] = (request.query ?? "").split(" ");
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
    const input = await new Promise<string>((resolve, reject) => { let input = ""; process.stdin.on("data", chunk => { input += chunk.toString(); if (input.length > 4096) reject(new Error("INPUT_LIMIT")); }); process.stdin.on("end", () => resolve(input)); process.stdin.on("error", reject); });
    console.log(JSON.stringify(await executeWorkspaceRequest(JSON.parse(input))));
  } catch { console.log(JSON.stringify({ error: "LAB_SOURCE_UNAVAILABLE_OR_STALE" })); process.exitCode = 1; }
}
