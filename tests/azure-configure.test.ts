import { expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadWorkspaceRoute, writePrivate } from "../src/pi/workspace-config.ts";

test("scripted --configure saves all Azure auth modes without terminal, command execution or model requests", async () => {
  mkdirSync(resolve(".tmp"), { recursive: true });
  const root = mkdtempSync(resolve(".tmp/azure-configure-")), install = join(root, "release"), home = join(root, "home"), project = join(root, "project");
  try {
    for (const path of [install, home, project]) mkdirSync(path, { recursive: true, mode: 0o700 });
    for (const path of ["src", "scripts", "contracts"]) cpSync(resolve(path), join(install, path), { recursive: true });
    // Route-only setup still verifies the runtime; isolate that dependency here.
    writePrivate(join(install, "src/runtime/pi.ts"), 'export function verifyPiRuntime(){return {command:["/fixture/pi"],version:"fixture"};}');
    const config = join(home, "input-route.json"), key = join(home, "input-key"), state = join(home, "workspace");
    for (const mode of ["api-key", "custom-header", "bearer-command"]) {
      const credential = mode === "bearer-command" ? "exit 99" : "private-fixture-key";
      writePrivate(config, JSON.stringify({ version: 2, kind: "azure", endpoint: "https://gateway.example.invalid/team/openai/v1", model: "unknown-openai-model", deployment: "team-code", auth: { mode, header: "Ocp-Apim-Subscription-Key" }, capabilities: { contextWindow: 32768, maxTokens: 4096, reasoning: true, input: ["text", "image"] } }));
      writePrivate(key, credential + "\n");
      const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", join(install, "scripts/start.ts"), "--configure"], { cwd: project,
        env: { HOME: home, PATH: "/usr/bin:/bin", LAB_WORKSPACE_STATE_ROOT: state, LAB_ROUTE_CONFIG_FILE: config, LAB_ROUTE_KEY_FILE: key }, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(code).toBe(0); expect(stderr).toBe(""); expect(stdout).toContain("No model request was made"); expect(stdout).not.toContain(credential);
      expect(loadWorkspaceRoute(state)).toMatchObject({ key: credential, route: { kind: "azure", auth: { mode } } });
      expect(readFileSync(join(state, "route.json"), "utf8")).not.toContain(credential);
      const invalid = Bun.spawnSync([process.execPath, "--no-env-file", "--no-install", join(install, "scripts/start.ts"), "--configure", "--single-pane"], { cwd: project,
        env: { HOME: home, PATH: "/usr/bin:/bin", LAB_WORKSPACE_STATE_ROOT: state, LAB_ROUTE_CONFIG_FILE: config, LAB_ROUTE_KEY_FILE: key } });
      expect(invalid.exitCode).toBe(1);
      expect(invalid.stderr.toString()).toContain("scripted --configure separately");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
