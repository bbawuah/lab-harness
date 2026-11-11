/** Private user state and explicit route setup for native Pi coding. */
import { constants, lstatSync, mkdirSync, openSync, readFileSync, closeSync, fstatSync, writeFileSync, renameSync, chmodSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";

export type WorkspaceRoute = { version: 1; kind: "local" | "litellm" | "anthropic" | "openai"; endpoint: string; model: string };
export const cloudEndpoints = { anthropic: "https://api.anthropic.com", openai: "https://api.openai.com/v1" } as const;
export function workspaceProvider(route: WorkspaceRoute): string {
  return route.kind === "anthropic" || route.kind === "openai" ? route.kind : "lab-workspace";
}
export function validateRoute(value: unknown): WorkspaceRoute {
  const route = value as WorkspaceRoute;
  if (!route || route.version !== 1 || !["local", "litellm", "anthropic", "openai"].includes(route.kind)) throw new Error("Invalid workspace route; run ./lab --configure");
  let url: URL;
  try { url = new URL(route.endpoint); } catch { throw new Error("Endpoint must be an explicit HTTP(S) URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Endpoint cannot contain credentials, query, or fragment");
  if ((route.kind === "anthropic" || route.kind === "openai") && url.toString().replace(/\/$/, "") !== cloudEndpoints[route.kind]) throw new Error("Invalid workspace route: direct providers require their official HTTPS endpoint");
  if (typeof route.model !== "string" || !route.model.trim() || route.model.length > 200 || /[\x00-\x20\x7f]/.test(route.model)) throw new Error("Enter the exact model ID or LiteLLM alias without spaces");
  return { version: 1, kind: route.kind, endpoint: url.toString().replace(/\/$/, ""), model: route.model };
}
export function privateDirectory(path: string): void {
  let cursor = resolve(path);
  for (;;) {
    const ancestor = lstatSync(cursor, { throwIfNoEntry: false });
    if (ancestor && (!ancestor.isDirectory() || ancestor.isSymbolicLink())) throw new Error("Workspace state ancestor must be a real directory, without symlinks");
    if (dirname(cursor) === cursor) break;
    cursor = dirname(cursor);
  }
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat && (stat.uid !== process.getuid?.() || !stat.isDirectory() || stat.isSymbolicLink())) throw new Error("Workspace state directory must be owned by this user");
  mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700);
}
/** App state is separate from both installed code and the caller's project. */
export function workspaceStatePath(override = process.env.LAB_WORKSPACE_STATE_ROOT): string {
  const home = resolve(homedir()), selected = override ?? join(home, ".local/share/lab-harness/workspace"), root = resolve(selected);
  if (!isAbsolute(selected) || !root.startsWith(home + sep) || root === home) throw new Error("LAB_WORKSPACE_STATE_ROOT must be an absolute application directory beneath this user's home");
  return root;
}
export function workspaceStateRoot(installRoot: string, override = process.env.LAB_WORKSPACE_STATE_ROOT, _projectRoot?: string): string {
  const home = resolve(homedir()), root = workspaceStatePath(override);
  for (const excluded of [installRoot]) {
    if (excluded && (root === resolve(excluded) || root.startsWith(resolve(excluded) + sep))) throw new Error("Workspace state must be outside the installed release; choose LAB_WORKSPACE_STATE_ROOT beneath your home");
  }
  let cursor = root;
  while (cursor !== home) {
    const stat = lstatSync(cursor, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0)) throw new Error("Stable workspace state requires user-owned ancestors without symlinks or shared write access");
    cursor = dirname(cursor);
  }
  privateDirectory(root);
  return root;
}
export function readPrivate(path: string): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid?.() || stat.nlink !== 1 || stat.size > 65536 || (stat.mode & 0o077) !== 0) throw new Error("Workspace state must be a private regular file (mode 0600)");
    return readFileSync(fd, "utf8");
  } finally { closeSync(fd); }
}
export function writePrivate(path: string, text: string): void {
  const temporary = `${path}.${randomUUID()}`;
  writeFileSync(temporary, text, { flag: "wx", mode: 0o600 }); renameSync(temporary, path);
}
/** No echo, shell, command argument, or readline history contains this input. */
export async function readPrivateKey(required = false): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Private key input requires an interactive terminal");
  process.stdout.write(required ? "API key (private; required): " : "API key (private; blank for unauthenticated local server): ");
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      process.stdin.off("data", data); process.stdin.off("end", ended); process.stdin.setRawMode(wasRaw); process.stdin.pause(); process.stdout.write("\n");
      if (error) reject(error); else resolve(value);
    };
    const ended = () => finish(new Error("Private input ended"));
    const data = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\x03" || char === "\x04") return finish(new Error("Route setup cancelled"));
        if (char === "\r" || char === "\n") return finish();
        if (char === "\x7f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " " && char !== "\x7f" && value.length < 8192) value += char;
      }
    };
    process.stdin.on("data", data); process.stdin.once("end", ended);
  });
}
export async function configureWorkspace(root: string): Promise<WorkspaceRoute> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("First run requires a terminal; run ./lab --configure interactively");
  process.stdout.write("LAB interactive coding workspace. Controlled LAB tasks remain unavailable.\nChoose an existing endpoint; setup makes no model request.\nanthropic / openai = direct cloud API with your own key. local = local/self-hosted OpenAI-compatible server, including LAN or tailnet URLs. litellm = your existing LiteLLM endpoint.\n");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let route: WorkspaceRoute;
  try {
    let kind: string;
    do {
      kind = (await rl.question("Route (anthropic, openai, local or litellm): ")).trim();
      if (!["anthropic", "openai", "local", "litellm"].includes(kind)) process.stdout.write("Choose anthropic, openai, local or litellm.\n");
    } while (!["anthropic", "openai", "local", "litellm"].includes(kind));
    const endpoint = kind === "anthropic" || kind === "openai" ? cloudEndpoints[kind] : (await rl.question("Explicit OpenAI-compatible base URL (including /v1 where required): ")).trim();
    if (kind === "anthropic" || kind === "openai") process.stdout.write(`Using ${endpoint}. Enter a model ID supported by the bundled Pi runtime and your account.\n`);
    const model = (await rl.question("Exact model ID or existing LiteLLM alias: ")).trim();
    route = validateRoute({ version: 1, kind, endpoint, model });
  } finally { rl.close(); }
  const key = await readPrivateKey(route.kind !== "local");
  if (route.kind !== "local" && !key) throw new Error("Invalid workspace route: this provider requires an explicit API key");
  privateDirectory(root);
  writePrivate(join(root, "key"), key);
  writePrivate(join(root, "route.json"), JSON.stringify(route) + "\n");
  return route;
}
export function loadWorkspaceRoute(root: string): { route: WorkspaceRoute; key: string } {
  const route = validateRoute(JSON.parse(readPrivate(join(root, "route.json"))));
  const key = readPrivate(join(root, "key"));
  if (/[\x00-\x1f\x7f]/.test(key) || key.length > 8192 || route.kind !== "local" && !key) throw new Error("Invalid private route key; run ./lab --configure");
  return { route, key };
}
export function modelsForRoute(route: WorkspaceRoute): unknown {
  if (route.kind === "anthropic" || route.kind === "openai") {
    return { providers: { [route.kind]: { baseUrl: route.endpoint, apiKey: "$LAB_WORKSPACE_API_KEY" } } };
  }
  return { providers: { "lab-workspace": { baseUrl: route.endpoint, api: "openai-completions", apiKey: "$LAB_WORKSPACE_API_KEY", models: [{ id: route.model, name: route.model, reasoning: false, input: ["text"], contextWindow: 8192, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } };
}
