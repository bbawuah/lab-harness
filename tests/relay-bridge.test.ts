import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { bindProjectRoot } from "../src/project.ts";
import { provisionWorkspaceRelayRun } from "../src/relay/workspace.ts";
import { callWorkspaceBridge } from "../src/pi/workspace-extension.ts";
import type { RelayBridgeRequest } from "../src/pi/relay-extension.ts";

test("real Bun bridge binds two native identities, preserves unread mail/retries and refuses foreign ack", async () => {
  const root = mkdtempSync(join(homedir(), ".lab-relay-bridge-"));
  const names = ["HOME", "LAB_WORKSPACE_USER_HOME", "LAB_WORKSPACE_ROOT", "LAB_WORKSPACE_BINDING", "LAB_INSTALL_ROOT", "LAB_WORKSPACE_BUN", "LAB_RELAY_RUN_REF"] as const;
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const home = join(root, "private home"), project = join(home, "project B"), state = join(home, ".local/share/lab-harness/workspace"), install = resolve(import.meta.dir, "..");
  try {
    for (const path of [project, join(state, "runs")]) mkdirSync(path, { recursive: true, mode: 0o700 });
    process.env.HOME = home;
    const binding = bindProjectRoot(project);
    Object.assign(process.env, { LAB_WORKSPACE_USER_HOME: home, LAB_WORKSPACE_ROOT: project, LAB_WORKSPACE_BINDING: JSON.stringify(binding), LAB_INSTALL_ROOT: install, LAB_WORKSPACE_BUN: process.execPath });
    const refs = [0, 1].map(() => provisionWorkspaceRelayRun({ stateRoot: state, installRoot: install, projectBinding: binding, runRoot: mkdtempSync(join(state, "runs/h-")) }));
    const call = async (index: number, request: RelayBridgeRequest, signal?: AbortSignal): Promise<any> => {
      process.env.LAB_RELAY_RUN_REF = refs[index]!;
      return callWorkspaceBridge(request, signal);
    };
    const a = await call(0, { action: "relay-bind", sessionId: "native-A" });
    const b = await call(1, { action: "relay-bind", sessionId: "native-B" });
    const peers = await call(0, { action: "relay", sessionId: "native-A", request: { action: "peers" } });
    expect(peers.peers).toHaveLength(2); expect(peers.peers.find((peer: any) => peer.self).id).toBe(a.peerId);
    const body = "💬".repeat(2000) + " explicit payload";
    const send: RelayBridgeRequest = { action: "relay", sessionId: "native-A", request: { action: "send", to: b.peerId, requestKey: "owned-key", body } };
    const receipt = await call(0, send), duplicate = await call(0, send);
    expect(receipt.state).toBe("stored"); expect(duplicate.id).toBe(receipt.id); expect(duplicate.duplicate).toBe(true);
    const read = () => call(1, { action: "relay", sessionId: "native-B", request: { action: "inbox" } });
    expect((await read()).messages[0].body).toBe(body); expect((await read()).unread).toBe(1);
    await expect(call(0, { action: "relay", sessionId: "native-A", request: { action: "ack", ids: [receipt.id] } })).rejects.toThrow("RELAY_CONFLICT");
    expect((await read()).unread).toBe(1);
    expect(await call(1, { action: "relay", sessionId: "native-B", request: { action: "ack", ids: [receipt.id] } })).toEqual({ acknowledged: 1, ignored: 0 });
    expect((await read()).unread).toBe(0);
    await call(1, { action: "relay", sessionId: "native-B", request: { action: "send", to: a.peerId, requestKey: "reply-key", replyTo: receipt.id, body: "Reply" } });
    const reply = await call(0, { action: "relay", sessionId: "native-A", request: { action: "inbox" } });
    expect(reply.messages[0].replyTo).toBe(receipt.id);
    const abort = new AbortController();
    const waiting = call(1, { action: "relay", sessionId: "native-B", request: { action: "inbox", waitMs: 10000 } }, abort.signal);
    const observed = waiting.then(() => undefined, (error: unknown) => error);
    abort.abort(); expect(await observed).toBeInstanceOf(Error);
    expect((await call(0, { action: "relay", sessionId: "native-A", request: { action: "peers" } })).peers.find((peer: any) => peer.id === b.peerId).presence).toBe("online");
    await expect(call(0, { action: "relay", sessionId: "native-A", request: { action: "send", to: b.peerId, requestKey: "large", body: "x".repeat(140000) } })).rejects.toThrow("LAB_BRIDGE_INPUT_LIMIT");
    await call(0, { action: "relay-release", sessionId: "native-A" });
    await call(1, { action: "relay-release", sessionId: "native-B" });
  } finally {
    for (const name of names) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name]; }
    rmSync(root, { recursive: true, force: true });
  }
}, 15000);
