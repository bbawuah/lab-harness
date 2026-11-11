import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const actual = process.env.LAB_HERDR_ACTUAL === "1" ? test : test.skip;
actual("native Pi spawns a visible child tab and receives its Relay result automatically while idle", async () => {
  const root = mkdtempSync(join(homedir(), ".lab-agents-native-")), home = join(root, "home"), project = join(home, "project"), state = join(home, ".local/share/lab-harness/workspace");
  for (const path of [project, state]) mkdirSync(path, { recursive: true, mode: 0o700 });
  const calls: string[] = [];
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
    const body = await req.json() as any;
    const last = body.messages.at(-1), text = JSON.stringify(last.content);
    let delta: unknown, finish = "stop";
    if (calls.length > 12) return new Response("fixture call bound", { status: 400 });
    if (last.role === "tool") { delta = { role: "assistant", content: "FIXTURE_TOOL_DONE" }; calls.push("tool-result"); }
    else if (text.includes("STOP_FIXTURE")) {
      const id = /STOP_FIXTURE ([a-z0-9-]+)/.exec(text)![1];
      delta = { role: "assistant", tool_calls: [{ index: 0, id: "stop-call", type: "function", function: { name: "agent_stop", arguments: JSON.stringify({ id }) } }] };
      finish = "tool_calls"; calls.push("agent_stop");
    }
    else if (text.includes("Incoming Relay messages")) { delta = { role: "assistant", content: "RECEIVED_CHILD_RESULT" }; calls.push("received"); }
    else {
      const child = text.includes("CHILD_FIXTURE");
      const parent = /parent Relay peer is ([A-Za-z0-9_-]+)/.exec(text)?.[1];
      const name = child ? "relay_send" : "agent_spawn";
      const args = child ? { to: parent, requestKey: "child-result", body: "CHILD_RESULT_PAYLOAD" } : { name: "reviewer", task: "CHILD_FIXTURE", requestKey: "spawn-once" };
      delta = { role: "assistant", tool_calls: [{ index: 0, id: "call-" + calls.length, type: "function", function: { name, arguments: JSON.stringify(args) } }] };
      finish = "tool_calls"; calls.push(name);
    }
    const chunk = (delta: unknown, finish_reason: string | null) => "data: " + JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-agents", choices: [{ index: 0, delta, finish_reason }] }) + "\n\n";
    return new Response(chunk(delta, null) + chunk({}, finish) + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
  } });
  writeFileSync(join(state, "route.json"), JSON.stringify({ version: 1, kind: "local", endpoint: `http://127.0.0.1:${server.port}/v1`, model: "fixture-agents" }), { mode: 0o600 });
  writeFileSync(join(state, "key"), "", { mode: 0o600 });
  let output = "";
  const child = Bun.spawn([resolve(import.meta.dir, "../lab"), "--offline", "--mode", "auto"], { cwd: project,
    env: { HOME: home, PATH: process.env.PATH, SHELL: "/bin/sh", TERM: "xterm-256color" },
    terminal: { cols: 140, rows: 40, data(terminal, bytes) {
      const text = new TextDecoder().decode(bytes); output += text;
      if (text.includes("\x1b[6n")) terminal.write("\x1b[1;1R");
      if (text.includes("\x1b]11;?")) terminal.write("\x1b]11;rgb:1111/1111/1111\x1b\\");
    } },
  });
  const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
  function transcripts(): string {
    const base = join(state, "agent/sessions");
    try { return readdirSync(base).flatMap(dir => readdirSync(join(base, dir)).filter(f => f.endsWith(".jsonl")).map(f => readFileSync(join(base, dir, f), "utf8"))).join("\n"); } catch { return ""; }
  }
  let trusted = false;
  async function wait(check: () => boolean, label: string) {
    const deadline = Date.now() + 15000;
    while (!check()) {
      if (!trusted && output.includes("Trust project folder?")) { trusted = true; child.terminal!.write("\r"); }
      if (Date.now() > deadline || child.exitCode !== null) throw new Error(label + "\n" + output.slice(-5000));
      await pause(50);
    }
  }
  async function paste(text: string) { child.terminal!.write("\x1b[200~" + text + "\x1b[201~"); await pause(300); child.terminal!.write("\r"); }
  try {
    await wait(() => output.includes("Relay ready:"), "parent startup");
    await paste("SPAWN_FIXTURE");
    await wait(() => transcripts().includes("RECEIVED_CHILD_RESULT"), "idle Relay reply");
    expect(calls.filter(x => x === "agent_spawn")).toHaveLength(1);
    expect(calls.filter(x => x === "relay_send")).toHaveLength(1);
    expect(output).toContain("reviewer");
    expect(output).toContain("CHILD_RESULT_PAYLOAD");
    await paste("/reload");
    await pause(2200); expect(calls.filter(x => x === "received")).toHaveLength(1);
    const descendants: number[] = [];
    function collect(pid: number) {
      const found = Bun.spawnSync([Bun.which("pgrep")!, "-P", String(pid)]).stdout.toString().trim();
      for (const value of found.split(/\s+/)) if (/^\d+$/.test(value)) { const id = Number(value); descendants.push(id); collect(id); }
    }
    collect(child.pid);
    expect(descendants.length).toBeGreaterThanOrEqual(5);
    const spawned = transcripts().split("\n").filter(Boolean).map(line => JSON.parse(line)).find(entry => entry.message?.toolName === "agent_spawn" && entry.message.details?.id);
    expect(spawned).toBeDefined();
    await paste("STOP_FIXTURE " + spawned.message.details.id);
    await wait(() => transcripts().includes('"state":"stopped"'), "native child stop");
    expect(calls.filter(x => x === "agent_stop")).toHaveLength(1);
    await pause(250);
    await paste("/exit");
    await wait(() => child.exitCode !== null, "workspace exit");
    expect(await child.exited).toBe(0);
    const parentRun = readdirSync(join(state, "runs")).find(n => n.startsWith("h-"))!;
    const attachment = JSON.parse(readFileSync(join(state, "runs", parentRun, "attachment.json"), "utf8"));
    expect(attachment.cleanup.serverExited).toBe(true);
    expect(attachment.cleanup.workerStopped).toBe(true);
    expect(attachment.cleanup.socketsRemoved).toBe(true);
    for (const pid of descendants) expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([child.exited, pause(5000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; }
    child.terminal!.close(); server.stop(true); rmSync(root, { recursive: true, force: true });
  }
}, 45000);
