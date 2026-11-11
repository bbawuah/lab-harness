import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cloudEndpoints, modelsForRoute, writePrivate } from "../src/pi/workspace-config.ts";
import { verifyPiRuntime } from "../src/runtime/pi.ts";

const actual = process.env.LAB_HERDR_ACTUAL === "1" ? test : test.skip;
actual("native cloud adapters resolve private keys and use the correct HTTP API without a gateway", async () => {
  const runtime = verifyPiRuntime();
  for (const kind of ["anthropic", "openai"] as const) {
    const root = mkdtempSync(join(tmpdir(), "lab-cloud-adapter-"));
    const requests: { path: string; authorized: boolean; model: string }[] = [];
    const key = "owned-protocol-fixture";
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
      const body = await req.json() as { model: string };
      requests.push({ path: new URL(req.url).pathname, authorized: kind === "anthropic" ? req.headers.get("x-api-key") === key : req.headers.get("authorization") === "Bearer " + key, model: body.model });
      return Response.json({ type: "error", error: { type: "authentication_error", message: "OWNED_FIXTURE_DENIAL" } }, { status: 401 });
    } });
    const model = kind === "anthropic" ? "claude-sonnet-4-5" : "gpt-4.1";
    const models = modelsForRoute({ version: 1, kind, endpoint: cloudEndpoints[kind], model }) as { providers: Record<string, { baseUrl: string }> };
    // Only this isolated protocol fixture replaces the official endpoint. Production validation forbids it.
    models.providers[kind]!.baseUrl = `http://127.0.0.1:${server.port}` + (kind === "openai" ? "/v1" : "");
    writePrivate(join(root, "models.json"), JSON.stringify(models));
    const child = Bun.spawn([...runtime.command, "--offline", "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-session", "--provider", kind, "--model", model, "--mode", "json", "--print", "fixture request"], {
      cwd: root, env: { HOME: root, PATH: "/usr/bin:/bin", PI_CODING_AGENT_DIR: root, PI_OFFLINE: "1", LAB_WORKSPACE_API_KEY: key }, stdout: "pipe", stderr: "pipe",
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    try {
      const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]); await child.exited;
      expect(requests, stderr + stdout).toHaveLength(1);
      expect(requests[0]).toEqual({ path: kind === "anthropic" ? "/v1/messages" : "/v1/responses", authorized: true, model });
      expect(stdout + stderr).toContain("OWNED_FIXTURE_DENIAL");
      expect(stdout + stderr).not.toContain(key);
    } finally { clearTimeout(timer); server.stop(true); rmSync(root, { recursive: true, force: true }); }
  }
}, 25000);
