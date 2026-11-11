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

actual("native Azure completes a read-tool round trip and maps HTTP errors into LAB repair advice", async () => {
  mkdirSync(resolve(".tmp"), { recursive: true });
  const root = mkdtempSync(resolve(".tmp/azure-tool-errors-")), runtime = verifyPiRuntime();
  let status = 200, turns = 0, sawToolOutput = false, proxyConnections = 0;
  const proxy = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { open(socket) { proxyConnections++; socket.end(); }, data() {} } });
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    expect(new URL(request.url).pathname).toBe("/gateway/openai/v1/responses");
    expect(new URL(request.url).searchParams.get("api-version")).toBe("2025-04-01-preview");
    const body = await request.json() as any;
    expect(body.model).toBe("custom-deployment");
    if (status !== 200) return Response.json({ error: { code: `fixture_${status}`, message: "Synthetic Azure failure" } }, { status });
    turns++;
    if (body.input.some((item: any) => item.type === "function_call_output")) {
      sawToolOutput = body.input.some((item: any) => item.type === "function_call_output" && JSON.stringify(item.output).includes("HARMLESS_TOOL_FIXTURE"));
      return new Response(sse(responseEvents("TOOL_ROUND_TRIP_OK")), { headers: { "content-type": "text/event-stream" } });
    }
    expect(body.tools.some((tool: any) => tool.name === "read")).toBe(true);
    const item = { type: "function_call", id: "fc_fixture", call_id: "call_fixture", name: "read", arguments: JSON.stringify({ path: "fixture.txt" }), status: "completed" };
    return new Response(sse([
      { type: "response.created", response: { id: "resp_tool", status: "in_progress", output: [] } },
      { type: "response.output_item.added", output_index: 0, item: { ...item, arguments: "", status: "in_progress" } },
      { type: "response.function_call_arguments.delta", output_index: 0, item_id: item.id, delta: item.arguments },
      { type: "response.function_call_arguments.done", output_index: 0, item_id: item.id, arguments: item.arguments },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response: { id: "resp_tool", status: "completed", output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } },
    ]), { headers: { "content-type": "text/event-stream" } });
  } });
  try {
    for (const code of [200, 401, 403, 404, 429]) {
      status = code;
      const home = join(root, String(code)), agent = join(home, "agent"); mkdirSync(agent, { recursive: true, mode: 0o700 });
      writePrivate(join(home, "fixture.txt"), "HARMLESS_TOOL_FIXTURE\n");
      const route = validateRoute({ version: 2, kind: "azure", endpoint: `http://127.0.0.1:${server.port}/gateway/openai/v1`, model: "fixture-unknown-gpt", deployment: "custom-deployment", apiVersion: "2025-04-01-preview", auth: { mode: "api-key" }, capabilities: { contextWindow: 32768, maxTokens: 4096, reasoning: false, input: ["text", "image"] } });
      writePrivate(join(agent, "models.json"), JSON.stringify(modelsForRoute(route)));
      writePrivate(join(agent, "settings.json"), JSON.stringify({ ...routeSettings(route), retry: { enabled: false, provider: { maxRetries: 0 } } }));
      const env = { HOME: home, PATH: "/usr/bin:/bin", HTTPS_PROXY: `http://127.0.0.1:${proxy.port}`, HTTP_PROXY: `http://127.0.0.1:${proxy.port}`, NO_PROXY: "127.0.0.1,localhost" };
      const child = Bun.spawn([...runtime.command, "--offline", "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-session", "--tools", "read", "-e", resolve("src/runtime/azure.ts"), "--provider", "azure", "--model", route.model, "--mode", "json", "Read the harmless fixture"], { cwd: home, env: { ...env, PI_CODING_AGENT_DIR: agent, ...routeEnvironment(route, "fixture-key", env) }, stdout: "pipe", stderr: "pipe" });
      const timer = setTimeout(() => child.kill(), 15000);
      const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]); clearTimeout(timer);
      expect(stderr).toBe(""); expect(exit).toBe(0);
      const events = stdout.trim().split("\n").map(line => JSON.parse(line));
      const messages = events.filter(event => event.type === "message_end" && event.message?.role === "assistant").map(event => event.message);
      if (code === 200) {
        expect(stdout).toContain('"type":"tool_execution_end"');
        expect(messages.at(-1).content).toContainEqual(expect.objectContaining({ type: "text", text: "TOOL_ROUND_TRIP_OK" }));
        expect(sawToolOutput).toBe(true); expect(turns).toBe(2);
      } else {
        expect(messages.at(-1).stopReason).toBe("error");
        expect(messages.at(-1).errorMessage).toContain(`LAB Azure ${code}:`);
        expect(messages.at(-1).errorMessage).not.toContain("Synthetic Azure failure");
      }
    }
    expect(proxyConnections).toBe(0);
  } finally { server.stop(true); proxy.stop(true); rmSync(root, { recursive: true, force: true }); }
}, 90000);
