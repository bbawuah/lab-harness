/** Private user state and explicit route setup for native Pi coding. */
import { spawnSync } from "node:child_process";
import { constants, lstatSync, mkdirSync, mkdtempSync, rmSync, openSync, readFileSync, closeSync, fstatSync, writeFileSync, renameSync, chmodSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";

export type ModelCapabilities = { contextWindow: number; maxTokens: number; reasoning: boolean; input: ("text" | "image")[] };
export type WorkspaceRoute = {
  version: 2; kind: "local" | "litellm" | "azure"; endpoint: string; model: string;
  capabilities?: ModelCapabilities;
  deployment?: string; apiVersion?: string;
  auth?: { mode: "api-key" | "custom-header" | "bearer-command"; header?: string };
};
const defaults: ModelCapabilities = { contextWindow: 128000, maxTokens: 16384, reasoning: false, input: ["text"] };
const legacyV1: ModelCapabilities = { contextWindow: 8192, maxTokens: 1024, reasoning: false, input: ["text"] };
export function validateRoute(value: unknown): WorkspaceRoute {
  const route = value as Omit<WorkspaceRoute, "version"> & { version: 1 | 2 };
  if (!route || ![1, 2].includes(route.version) || !["local", "litellm", "azure"].includes(route.kind) || (route.version === 1 && route.kind === "azure")) throw new Error("Invalid workspace route; run ./lab --configure");
  let url: URL;
  try { url = new URL(route.endpoint); } catch { throw new Error("Endpoint must be an explicit HTTP(S) URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[\x00-\x20\x7f]/.test(route.endpoint)) throw new Error("Endpoint cannot contain credentials, query, fragment or whitespace");
  if (route.kind === "azure" && url.protocol !== "https:" && !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)) throw new Error("Azure endpoint requires HTTPS (HTTP is allowed only for loopback fixtures)");
  if (typeof route.model !== "string" || !route.model || route.model.length > 200 || /[\x00-\x20\x7f]/.test(route.model) || (route.kind === "azure" && !/^[a-zA-Z0-9][a-zA-Z0-9._/+-]{0,199}$/.test(route.model))) throw new Error("Enter the exact model ID or LiteLLM alias without spaces or routing separators");
  let capabilities = route.capabilities;
  if (capabilities) {
    if (!Number.isSafeInteger(capabilities.contextWindow) || capabilities.contextWindow < 4096 || capabilities.contextWindow > 10000000 || !Number.isSafeInteger(capabilities.maxTokens) || capabilities.maxTokens < 1 || capabilities.maxTokens >= capabilities.contextWindow || typeof capabilities.reasoning !== "boolean" || !Array.isArray(capabilities.input) || capabilities.input[0] !== "text" || capabilities.input.length > 2 || capabilities.input.some(v => !["text", "image"].includes(v))) throw new Error("Invalid model capabilities; set contextWindow >= 4096, maxTokens < contextWindow, reasoning and input");
    capabilities = { contextWindow: capabilities.contextWindow, maxTokens: capabilities.maxTokens, reasoning: capabilities.reasoning, input: [...new Set(capabilities.input)] };
  }
  // A saved v1 route was used with the old fixed 8192/1024 text-only limits; keep them so an
  // upgrade never sends a small local model requests larger than it accepted before.
  const fallback = route.version === 1 ? { ...legacyV1 } : { ...defaults };
  const result: WorkspaceRoute = { version: 2, kind: route.kind, endpoint: url.toString().replace(/\/$/, ""), model: route.model, ...(capabilities ? { capabilities } : route.kind !== "azure" ? { capabilities: fallback } : {}) };
  if (route.kind === "azure") {
    if (typeof route.deployment !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(route.deployment)) throw new Error("Azure deployment must be the exact deployment name, using letters, numbers, dots, underscores or hyphens");
    const apiVersion = route.apiVersion ?? "v1";
    if (typeof apiVersion !== "string" || !/^[a-zA-Z0-9._-]{1,80}$/.test(apiVersion)) throw new Error("Invalid Azure API version");
    if (!route.auth || !["api-key", "custom-header", "bearer-command"].includes(route.auth.mode)) throw new Error("Invalid Azure authentication mode");
    if (route.auth.mode === "custom-header" && (typeof route.auth.header !== "string" || !/^[a-zA-Z][a-zA-Z0-9-]{0,99}$/.test(route.auth.header) || /^(api-key|authorization|proxy-authorization|host|content-length|connection|transfer-encoding|cookie)$/i.test(route.auth.header))) throw new Error("Invalid Azure custom authentication header");
    Object.assign(result, { deployment: route.deployment, apiVersion, auth: { mode: route.auth.mode, ...(route.auth.mode === "custom-header" ? { header: route.auth.header } : {}) } });
  }
  return result;
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
export function workspaceStateRoot(installRoot: string, override = process.env.LAB_WORKSPACE_STATE_ROOT, projectRoot?: string): string {
  const home = resolve(homedir()), root = workspaceStatePath(override);
  for (const excluded of [installRoot, projectRoot]) {
    if (excluded && (root === resolve(excluded) || root.startsWith(resolve(excluded) + sep))) throw new Error("Workspace state must be outside the installed release and selected project; choose LAB_WORKSPACE_STATE_ROOT beneath your home");
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
export async function readPrivateKey(prompt = "API key (private; blank for unauthenticated local server): "): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Private key input requires an interactive terminal");
  process.stdout.write(prompt);
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
/** Only these network settings cross LAB's Pi environment boundary. */
export function workspaceNetworkEnvironment(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const result: Record<string, string> = { PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" };
  for (const name of ["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy", "NODE_EXTRA_CA_CERTS"]) if (env[name] !== undefined) result[name] = env[name]!;
  return result;
}
export function routeProvider(route: WorkspaceRoute): string { return route.kind === "azure" ? "azure" : "lab-workspace"; }
export function routeSettings(route: WorkspaceRoute): Record<string, unknown> {
  const capacity = route.capabilities?.contextWindow;
  return { defaultProvider: routeProvider(route), defaultModel: route.model, packages: [], enableInstallTelemetry: false, enableAnalytics: false,
    ...(capacity ? { compaction: { reserveTokens: Math.min(16384, Math.floor(capacity / 4)), keepRecentTokens: Math.min(20000, Math.floor(capacity / 4)) } } : {}) };
}
/** Catalog models stay intact; the Azure extension omits SDK api-key auth in header modes. */
export function modelsForRoute(route: WorkspaceRoute): unknown {
  const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  if (route.kind !== "azure") return { providers: { "lab-workspace": { baseUrl: route.endpoint, api: "openai-completions", apiKey: "$LAB_WORKSPACE_API_KEY", models: [{ id: route.model, name: route.model, ...route.capabilities ?? defaults, cost }] } } };
  const mode = route.auth!.mode;
  const headers = mode === "api-key" ? {} : { [mode === "custom-header" ? route.auth!.header! : "Authorization"]: "$LAB_WORKSPACE_AUTH_HEADER" };
  return { providers: { azure: { baseUrl: route.endpoint, apiKey: "$LAB_WORKSPACE_API_KEY", authHeader: false, headers,
    ...(route.capabilities ? { models: [{ id: route.model, api: "azure-openai-responses", ...route.capabilities, cost }] } : {}) } } };
}
export function routeEnvironment(route: WorkspaceRoute, key: string, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const result = workspaceNetworkEnvironment(env);
  if (route.kind !== "azure") return { ...result, LAB_WORKSPACE_API_KEY: key || "lab-local-no-key" };
  Object.assign(result, { AZURE_OPENAI_BASE_URL: route.endpoint, AZURE_OPENAI_API_VERSION: route.apiVersion!, AZURE_OPENAI_DEPLOYMENT_NAME_MAP: `${route.model}=${route.deployment}` });
  if (route.auth!.mode === "api-key") return { ...result, LAB_WORKSPACE_API_KEY: key };
  let token = key;
  if (route.auth!.mode === "bearer-command") {
    // The private command goes through stdin, never argv. Discard stderr, including
    // command tracing/errors which could contain credentials.
    const child = spawnSync("/bin/sh", [], { input: key + "\n", encoding: "utf8", timeout: 30000, maxBuffer: 16384, env });
    if (child.error || child.status !== 0) throw new Error("Azure bearer command failed; check the private command and sign in with your approved identity tool");
    token = child.stdout.trim();
    if (!token || /[\x00-\x20\x7f]/.test(token) || token.length > 8192) throw new Error("Azure bearer command must print only one access token");
    token = `Bearer ${token}`;
  }
  return { ...result, LAB_WORKSPACE_API_KEY: "lab-header-auth", LAB_AZURE_AUTH_MODE: route.auth!.mode, LAB_WORKSPACE_AUTH_HEADER: token };
}
/** Check exact catalog membership offline; never accept Pi's fuzzy model fallback. */
export function assertAzureCatalogModel(route: WorkspaceRoute, command: string[], root: string): void {
  if (route.kind !== "azure" || route.capabilities) return;
  privateDirectory(root);
  const probe = mkdtempSync(join(root, "catalog-"));
  try {
    const child = spawnSync(command[0]!, [...command.slice(1), "--offline", "--no-extensions", "--no-mcp", "--no-skills", "--no-context-files", "--list-models"], {
      cwd: probe, encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024,
      env: { HOME: probe, PATH: "/usr/bin:/bin", PI_CODING_AGENT_DIR: join(probe, "agent"), ...workspaceNetworkEnvironment({}), AZURE_OPENAI_API_KEY: "catalog-only-no-request", NO_COLOR: "1" },
    });
    if (child.error || child.status !== 0) throw new Error("Azure catalog could not be read from pinned Pi; run setup:pi");
    const exact = child.stdout.split("\n").some(line => { const fields = line.trim().split(/\s+/); return fields[0] === "azure" && fields[1] === route.model; });
    if (!exact) throw new Error("Azure model is absent from pinned Pi's catalog; configure explicit model capabilities");
  } finally { rmSync(probe, { recursive: true, force: true }); }
}
function validateKey(route: WorkspaceRoute, key: string): void {
  if (/[\x00-\x1f\x7f]/.test(key) || key.length > 8192 || (route.kind !== "local" && !key)) throw new Error("Invalid private route key; run ./lab --configure");
}
export async function configureWorkspace(root: string): Promise<WorkspaceRoute> {
  let route: WorkspaceRoute, key: string;
  if (process.env.LAB_ROUTE_CONFIG_FILE) {
    route = validateRoute(JSON.parse(readPrivate(process.env.LAB_ROUTE_CONFIG_FILE)));
    key = process.env.LAB_ROUTE_KEY_FILE ? readPrivate(process.env.LAB_ROUTE_KEY_FILE).replace(/\r?\n$/, "") : await readPrivateKey();
  } else {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("First run requires a terminal; run ./lab --configure interactively or set LAB_ROUTE_CONFIG_FILE and LAB_ROUTE_KEY_FILE");
    process.stdout.write("Choose an existing endpoint. Saving setup makes no model request.\nlocal = compatible server; litellm = existing gateway; azure = Azure OpenAI or APIM.\n");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const kind = (await rl.question("Route (local, litellm or azure): ")).trim();
      const endpoint = (await rl.question(kind === "azure" ? "Azure resource root or APIM API base URL (include gateway path, without /responses): " : "OpenAI-compatible base URL (including /v1 where required): ")).trim();
      const model = (await rl.question(kind === "azure" ? "Exact Pi catalog model ID (e.g. gpt-5.4): " : "Exact local model ID or LiteLLM alias: ")).trim();
      let deployment: string | undefined, apiVersion: string | undefined, auth: WorkspaceRoute["auth"];
      if (kind === "azure") {
        deployment = (await rl.question("Exact Azure deployment name: ")).trim();
        apiVersion = (await rl.question("API version [v1]: ")).trim() || "v1";
        const mode = (await rl.question("Authentication (api-key, custom-header or bearer-command): ")).trim() as NonNullable<WorkspaceRoute["auth"]>["mode"];
        const header = mode === "custom-header" ? (await rl.question("Custom key header name (e.g. Ocp-Apim-Subscription-Key): ")).trim() : undefined;
        auth = { mode, ...(header ? { header } : {}) };
      }
      let capabilities: ModelCapabilities | undefined;
      if (kind !== "azure" || (await rl.question("Use explicit capabilities for a model absent from Pi's catalog? [y/N]: ")).trim().toLowerCase() === "y") {
        capabilities = {
          contextWindow: Number((await rl.question(`Context window tokens [${defaults.contextWindow}]: `)).trim() || defaults.contextWindow),
          maxTokens: Number((await rl.question(`Maximum output tokens [${defaults.maxTokens}]: `)).trim() || defaults.maxTokens),
          reasoning: (await rl.question("Reasoning support? [y/N]: ")).trim().toLowerCase() === "y",
          input: (await rl.question("Image input support? [y/N]: ")).trim().toLowerCase() === "y" ? ["text", "image"] : ["text"],
        };
      }
      route = validateRoute({ version: 2, kind, endpoint, model, deployment, apiVersion, auth, capabilities });
    } finally { rl.close(); }
    key = await readPrivateKey(route.auth?.mode === "bearer-command" ? "Private command to print an Entra access token (hidden; no inline secrets): " : undefined);
  }
  validateKey(route, key);
  privateDirectory(root);
  if (route.kind === "azure") { const { verifyPiRuntime } = await import("../runtime/pi.ts"); assertAzureCatalogModel(route, verifyPiRuntime().command, root); }
  writePrivate(join(root, "key"), key);
  writePrivate(join(root, "route.json"), JSON.stringify(route) + "\n");
  return route;
}
export function loadWorkspaceRoute(root: string): { route: WorkspaceRoute; key: string } {
  const route = validateRoute(JSON.parse(readPrivate(join(root, "route.json"))));
  const key = readPrivate(join(root, "key")); validateKey(route, key);
  return { route, key };
}
