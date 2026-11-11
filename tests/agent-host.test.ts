import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { bindProjectRoot } from "../src/project.ts";
import { startAgentHost } from "../src/pi/agent-host.ts";
import { provisionWorkspaceRelayRun, bindWorkspaceRelaySession, openBoundWorkspaceRelay } from "../src/relay/workspace.ts";
import { writePrivate } from "../src/pi/workspace-config.ts";
import { writeModeFile } from "../src/pi/permission-extension.ts";
import { request } from "../src/herdr/protocol.ts";
import { installAgentExtension, agentFamily } from "../src/pi/agent-extension.ts";
import { classify, decide } from "../src/pi/permission.ts";
import type { WorkspaceExtensionAPI, WorkspaceContext } from "../src/pi/workspace-extension.ts";

test("agent tools obey mode gates and spawning uses authoritative extension mode", async () => {
  const tools = new Map<string, any>();
  const pi = { on() {}, sendMessage() {}, registerCommand() {}, registerTool(tool: any) { tools.set(tool.name, tool); } } as WorkspaceExtensionAPI;
  let received: unknown;
  installAgentExtension(pi, () => "edits", async (_method, input) => { received = input; return {}; });
  const spawn = tools.get("agent_spawn");
  expect(spawn.parameters.properties.permissionMode).toBeUndefined();
  await spawn.execute("call", { name: "worker", task: "Review", requestKey: "k", permissionMode: "auto" }, undefined, undefined, {} as WorkspaceContext);
  expect(received).toMatchObject({ permissionMode: "edits" });
  for (const tool of ["agent_spawn", "agent_stop"]) {
    const klass = classify(tool, {}, agentFamily);
    expect(decide("read-only", tool, klass, true, agentFamily).kind).toBe("refuse");
    expect(decide("ask", tool, klass, true, agentFamily).kind).toBe("ask");
    expect(decide("edits", tool, klass, true, agentFamily).kind).toBe("ask");
    expect(decide("auto", tool, klass, true, agentFamily).kind).toBe("run");
  }
  expect(decide("read-only", "agent_list", classify("agent_list", {}, agentFamily), true, agentFamily).kind).toBe("run");
});

export function agentFixture() {
  const root = mkdtempSync(join(homedir(), ".lab-agents-test-")), sockets = mkdtempSync("/tmp/lab-at-");
  const stateRoot = join(root, "state"), runRoot = join(stateRoot, "runs/root"), installRoot = join(root, "install"), project = join(root, "project"), agent = join(runRoot, "agent");
  for (const path of [agent, installRoot, project]) mkdirSync(path, { recursive: true, mode: 0o700 });
  const options = { stateRoot, runRoot, installRoot, projectBinding: bindProjectRoot(project), socket: join(sockets, "herdr.sock"), workspaceId: "w-test", command: ["/bin/sh", "/fixture/wrapper", "/fixture/exit", "/fixture/pi"] };
  const runRef = provisionWorkspaceRelayRun({ stateRoot, runRoot, installRoot, projectBinding: options.projectBinding });
  const identity = bindWorkspaceRelaySession(runRef, "parent");
  writePrivate(join(agent, "models.json"), "{}"); writePrivate(join(agent, "settings.json"), "{}");
  const permission = join(runRoot, "mode.json"); writeModeFile(permission, "edits");
  const environment = { LAB_RELAY_RUN_REF: runRef, LAB_PERMISSION_STATE: permission, LAB_WORKSPACE_AGENT_DIR: agent, LAB_BROWSER_REF: "/private/browser", LAB_WORKSPACE_ROOT: project };
  return { root, sockets, options, environment, identity, runRef, clean() { rmSync(root, { recursive: true, force: true }); rmSync(sockets, { recursive: true, force: true }); } };
}

test("agent host creates a distinct session/tab, deduplicates retries, inherits mode and fences sibling stop", async () => {
  const f = agentFixture(); const calls: { method: string; params: any }[] = [];
  const host = await startAgentHost({ ...f.options, environment: f.environment, transport: async (_socket, method, params) => { calls.push({ method, params }); return { layout: { tab_id: "child-tab" } }; } });
  const base = { token: host.environment.LAB_AGENT_TOKEN, runRef: f.runRef, sessionId: "parent" };
  const call = (method: string, params = {}) => request(host.environment.LAB_AGENT_SOCKET, method, { ...base, ...params });
  try {
    const child = await call("agent_spawn", { name: "reviewer", task: "Review without editing", requestKey: "one", permissionMode: "edits" });
    expect(child.state).toBe("running"); expect(child.parent).toBe(f.identity.peerId); expect(child.peerId).not.toBe(f.identity.peerId);
    const launch = calls[0]!.params;
    expect(launch.focus).toBe(false); expect(launch.tab_label).toBe("reviewer"); expect(launch.root.env.LAB_BROWSER_REF).toBeUndefined();
    expect(JSON.parse(readFileSync(launch.root.env.LAB_PERMISSION_STATE, "utf8")).mode).toBe("edits");
    expect(launch.root.env.LAB_RELAY_RUN_REF).not.toBe(f.runRef);
    expect(launch.root.command).toContain(child.sessionId); expect(launch.root.command.at(-1)).toContain(f.identity.peerId);
    expect(await call("agent_spawn", { name: "reviewer", task: "Review without editing", requestKey: "one", permissionMode: "edits" })).toEqual(child);
    expect(calls).toHaveLength(1);
    await expect(call("agent_spawn", { name: "reviewer", task: "Different task", requestKey: "one", permissionMode: "edits" })).rejects.toThrow("CONFLICT");
    await expect(call("agent_spawn", { name: "reviewer", task: "Review", requestKey: "two", permissionMode: "edits", cwd: "/" })).rejects.toThrow("REFUSED");
    await expect(call("agent_list", { token: "wrong" })).rejects.toThrow("REFUSED");
    await expect(call("agent_stop", { id: child.id, runRef: launch.root.env.LAB_RELAY_RUN_REF, sessionId: child.sessionId })).rejects.toThrow("NOT_OWNED");
    const sender = openBoundWorkspaceRelay(f.runRef, "parent"), receiver = openBoundWorkspaceRelay(launch.root.env.LAB_RELAY_RUN_REF, child.sessionId);
    try { sender.send({ action: "send", to: child.peerId, body: "Hello child", requestKey: "hello" }); expect((await receiver.inbox()).messages[0]!.body).toBe("Hello child"); } finally { sender.close(); receiver.close(); }
    expect((await call("agent_list")).agents).toHaveLength(1);
    expect((await call("agent_stop", { id: child.id })).state).toBe("stopped");
    expect(calls.at(-1)).toEqual({ method: "tab.close", params: { tab_id: "child-tab" } });
  } finally { await host.close(); f.clean(); }
});

test("unknown spawn outcomes remain recorded and retry never launches twice", async () => {
  const f = agentFixture(); let launches = 0;
  const host = await startAgentHost({ ...f.options, environment: f.environment, transport: async () => { launches++; throw new Error("lost response"); } });
  const params = { token: host.environment.LAB_AGENT_TOKEN, runRef: f.runRef, sessionId: "parent", name: "worker", task: "Inspect", requestKey: "once", permissionMode: "ask" };
  try {
    const a = await request(host.environment.LAB_AGENT_SOCKET, "agent_spawn", params);
    expect(a.state).toBe("unknown");
    expect(await request(host.environment.LAB_AGENT_SOCKET, "agent_spawn", params)).toEqual(a);
    expect(launches).toBe(1);
  } finally { await host.close(); f.clean(); }
});
