import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { verifyPiRuntime } from "../src/runtime/pi.ts";
import { assertAzureCatalogModel, modelsForRoute, routeEnvironment, routeSettings, validateRoute, writePrivate } from "../src/pi/workspace-config.ts";
const actual = process.env.LAB_AZURE_ACTUAL === "1" || process.env.LAB_HERDR_ACTUAL === "1" ? test : test.skip;
function sse(events: unknown[]) { return events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""); }
function responseEvents(text: string) {
  const item = { id: "msg_fixture", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
  return [
    { type: "response.created", response: { id: "resp_fixture", status: "in_progress", output: [] } },
    { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } },
    { type: "response.content_part.added", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } },
    { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: text },
    { type: "response.output_item.done", output_index: 0, item },
    { type: "response.completed", response: { id: "resp_fixture", status: "completed", output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } },
  ];
}
actual("pinned Pi native Azure streams Responses with deployment and each selected authentication mode", async () => {
  mkdirSync(resolve(".tmp"), { recursive: true });
  const root = mkdtempSync(resolve(".tmp/azure-actual-"));
  const runtime = verifyPiRuntime();
  const requests: { url: URL; headers: Headers; body: any }[] = [];
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    requests.push({ url: new URL(request.url), headers: request.headers, body: await request.json() });
    return new Response(new ReadableStream({ start(controller) {
      const events = responseEvents("AZURE_FIXTURE_OK");
      controller.enqueue(new TextEncoder().encode(sse(events.slice(0, 4))));
      setTimeout(() => { controller.enqueue(new TextEncoder().encode(sse(events.slice(4)))); controller.close(); }, 30);
    } }), { headers: { "content-type": "text/event-stream" } });
  } });
  try {
    for (const mode of ["api-key", "custom-header", "bearer-command"]) {
      const home = join(root, mode), agent = join(home, "agent"); mkdirSync(agent, { recursive: true, mode: 0o700 });
      const route = validateRoute({ version: 2, kind: "azure", endpoint: `http://127.0.0.1:${server.port}/openai/v1`, model: "gpt-5.4", deployment: "team-code", apiVersion: "v1", auth: { mode, header: "Ocp-Apim-Subscription-Key" } });
      assertAzureCatalogModel(route, runtime.command, home);
      expect(() => assertAzureCatalogModel({ ...route, model: "missing-catalog-model" }, runtime.command, home)).toThrow("explicit model capabilities");
      writePrivate(join(agent, "models.json"), JSON.stringify(modelsForRoute(route)));
      writePrivate(join(agent, "settings.json"), JSON.stringify({ ...routeSettings(route), retry: { enabled: false } }));
      const child = Bun.spawn([...runtime.command, "--offline", "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-session", "--no-tools", "-e", resolve("src/runtime/azure.ts"), "--provider", "azure", "--model", "gpt-5.4", "--mode", "json", "Reply OK"], {
        cwd: home, env: { HOME: home, PATH: "/usr/bin:/bin", PI_CODING_AGENT_DIR: agent, ...routeEnvironment(route, mode === "bearer-command" ? "printf fixture-entra-token" : "fixture-key", { HOME: home, PATH: "/usr/bin:/bin" }) }, stdout: "pipe", stderr: "pipe",
      });
      const timer = setTimeout(() => child.kill(), 15000);
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]); clearTimeout(timer);
      expect(stderr).toBe(""); expect(code).toBe(0);
      expect(stdout).toContain('"type":"text_delta"'); expect(stdout).toContain("AZURE_FIXTURE_OK");
      const request = requests.at(-1)!;
      expect(request.url.pathname).toBe("/openai/v1/responses"); expect(request.url.searchParams.get("api-version")).toBe("v1");
      expect(request.body.model).toBe("team-code"); expect(request.body.stream).toBe(true);
      expect(request.headers.get("api-key")).toBe(mode === "api-key" ? "fixture-key" : null);
      expect(request.headers.get("authorization")).toBe(mode === "bearer-command" ? "Bearer fixture-entra-token" : null);
      expect(request.headers.get("ocp-apim-subscription-key")).toBe(mode === "custom-header" ? "fixture-key" : null);
    }
    expect(requests).toHaveLength(3);
  } finally { server.stop(true); rmSync(root, { recursive: true, force: true }); }
}, 60000);
