import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { azureErrorMessage } from "../src/runtime/azure.ts";
import { assertAzureCatalogModel, loadWorkspaceRoute, modelsForRoute, routeEnvironment, routeSettings, validateRoute, workspaceNetworkEnvironment, writePrivate } from "../src/pi/workspace-config.ts";
const roots: string[] = [];
function temporary() { mkdirSync(resolve(".tmp"), { recursive: true }); const root = mkdtempSync(resolve(".tmp/azure-test-")); roots.push(root); return root; }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
export function azureRoute(endpoint = "https://resource.openai.azure.com", mode = "api-key", extra = {}) {
  return validateRoute({ version: 2, kind: "azure", endpoint, model: "gpt-5.4", deployment: "team-code", auth: { mode, header: "Ocp-Apim-Subscription-Key" }, ...extra });
}
test("Azure retains the native catalog, explicit deployment map, version and private header references", () => {
  const route = azureRoute();
  expect(route.apiVersion).toBe("v1");
  expect(modelsForRoute(route)).toEqual({ providers: { azure: { baseUrl: route.endpoint, apiKey: "$LAB_WORKSPACE_API_KEY", authHeader: false, headers: {} } } });
  expect(routeEnvironment(route, "fixture", {})).toMatchObject({ AZURE_OPENAI_DEPLOYMENT_NAME_MAP: "gpt-5.4=team-code", AZURE_OPENAI_API_VERSION: "v1", PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1" });
  for (const mode of ["custom-header", "bearer-command"]) expect(JSON.stringify(modelsForRoute(azureRoute(undefined, mode)))).toContain("$LAB_WORKSPACE_AUTH_HEADER");
  expect(routeEnvironment(azureRoute(undefined, "custom-header"), "fixture-subscription", {})).toMatchObject({ LAB_WORKSPACE_AUTH_HEADER: "fixture-subscription", LAB_WORKSPACE_API_KEY: "lab-header-auth" });
});
test("bearer commands are bounded, private on stdin, and errors never expose output", () => {
  const home = temporary();
  const env = { HOME: home, PATH: "/usr/bin:/bin" };
  expect(routeEnvironment(azureRoute(undefined, "bearer-command"), "printf fixture-token", env).LAB_WORKSPACE_AUTH_HEADER).toBe("Bearer fixture-token");
  expect(() => routeEnvironment(azureRoute(undefined, "bearer-command"), "echo secret-output >&2; exit 1", env)).toThrow("Azure bearer command failed");
  expect(() => routeEnvironment(azureRoute(undefined, "bearer-command"), "printf 'two tokens'", env)).toThrow("only one access token");
});
test("route validation rejects credential URLs, remote plaintext, deployment map injection and dangerous headers", () => {
  for (const endpoint of ["https://key@resource.invalid", "https://resource.invalid?key=secret", "http://resource.invalid", "https://resource.invalid/#key"]) expect(() => azureRoute(endpoint)).toThrow();
  for (const deployment of ["a,b=c", "a/b", "a b", "a\n"]) expect(() => azureRoute(undefined, "api-key", { deployment })).toThrow();
  for (const header of ["Host", "Authorization", "Cookie", "a\r\nb"]) expect(() => azureRoute(undefined, "custom-header", { auth: { mode: "custom-header", header } })).toThrow();
});
test("v1 routes migrate in memory to bounded configurable v2 limits and still load their key", () => {
  const root = temporary();
  for (const kind of ["local", "litellm"]) {
    writePrivate(join(root, "route.json"), JSON.stringify({ version: 1, kind, endpoint: "http://127.0.0.1:9/v1", model: "alias" }));
    writePrivate(join(root, "key"), "fixture");
    const { route } = loadWorkspaceRoute(root);
    expect(route.version).toBe(2); expect(route.capabilities).toMatchObject({ contextWindow: 128000, maxTokens: 16384 });
    const custom = validateRoute({ ...route, capabilities: { contextWindow: 32768, maxTokens: 4096, reasoning: true, input: ["text", "image"] } });
    expect(JSON.stringify(modelsForRoute(custom))).toContain('"contextWindow":32768');
    expect(routeSettings(custom)).toMatchObject({ compaction: { reserveTokens: 8192, keepRecentTokens: 8192 } });
  }
});
test("network allowlist preserves proxy and CA controls without ambient provider credentials", () => {
  expect(workspaceNetworkEnvironment({ HTTPS_PROXY: "http://proxy.invalid:8080", HTTP_PROXY: "http://proxy.invalid:8080", NO_PROXY: "127.0.0.1", NODE_EXTRA_CA_CERTS: "/private/ca.pem", OPENAI_API_KEY: "never", AZURE_OPENAI_BASE_URL: "never" })).toEqual({ PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0", HTTPS_PROXY: "http://proxy.invalid:8080", HTTP_PROXY: "http://proxy.invalid:8080", NO_PROXY: "127.0.0.1", NODE_EXTRA_CA_CERTS: "/private/ca.pem" });
});

test("local migration preserves colon-tagged IDs and Azure errors have actionable sanitized messages", () => {
  expect(validateRoute({ version: 1, kind: "local", model: "qwen3:32b", endpoint: "http://127.0.0.1:9/v1" }).model).toBe("qwen3:32b");
  for (const [status, advice] of [[401, "auth mode"], [403, "RBAC"], [404, "deployment"], [429, "quota"]] as const) {
    expect(azureErrorMessage(`${status} upstream private-fixture-token`)).toContain(advice);
    expect(azureErrorMessage(`${status} upstream private-fixture-token`)).not.toContain("private-fixture-token");
  }
  expect(azureErrorMessage("untrusted backend body")).toContain("proxy");
});
