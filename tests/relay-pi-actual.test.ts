import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { verifyPiRuntime } from "../src/runtime/pi.ts";
import { bindProjectRoot } from "../src/project.ts";
import { provisionWorkspaceRelayRun } from "../src/relay/workspace.ts";
import { createMessageStore } from "../vendor/relay/src/storage/store.ts";
import { request } from "../src/herdr/protocol.ts";

const actual = process.env.LAB_HERDR_ACTUAL === "1" ? test : test.skip;
const pause = (ms: number) => new Promise(done => setTimeout(done, ms));
const source = resolve(import.meta.dir, "..");
type Peer = { session_id: string; peer_id: string; name: string; generation: number; phase: string; lease_until: number };

actual("two owned Pi TUIs automatically message/reply, read without ack, refuse foreign ack and reconnect; native model tools survive process resume", async () => {
  const root = mkdtempSync(join(homedir(), ".lab-relay-pi-")), home = join(root, "home"), project = join(home, "project with spaces");
  const state = join(home, ".local/share/lab-harness/workspace"), agent = join(state, "agent");
  for (const path of [project, agent, join(state, "runs")]) mkdirSync(path, { recursive: true, mode: 0o700 });
  let modelRequests = 0, toolCall = 0;
  let modelRecipient = "";
  // Owned protocol fixture, never a model/account/cloud service. TUI operator
  // messaging must make zero calls. Later print-mode calls prove actual Pi tools.
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    async fetch(incoming) {
      modelRequests++;
      if (new URL(incoming.url).pathname !== "/v1/chat/completions" || modelRequests > 12) return new Response("Unexpected fixture request", { status: 400 });
      const body = await incoming.json() as any;
      const names = body.tools?.map((tool: any) => tool.function?.name) ?? [];
      if (!["relay_peers", "relay_send", "relay_inbox", "relay_ack"].every(name => names.includes(name))) return new Response("Relay tools missing", { status: 400 });
      const tool = body.messages.at(-1)?.role !== "tool";
      const delta = tool ? { role: "assistant", tool_calls: [{ index: 0, id: "fixture-call-" + (++toolCall), type: "function", function: { name: "relay_send", arguments: JSON.stringify({ to: modelRecipient, requestKey: "native-retry-key", body: "Explicit provider-fixture mail" }) } }] } : { role: "assistant", content: "FIXTURE_DONE" };
      const chunk = (value: unknown) => "data: " + JSON.stringify(value) + "\n\n";
      return new Response(chunk({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-relay", choices: [{ index: 0, delta, finish_reason: null }] }) +
        chunk({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-relay", choices: [{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } }) + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
    },
  });
  const endpoint = "http://127.0.0.1:" + server.port + "/v1";
  writeFileSync(join(state, "route.json"), JSON.stringify({ version: 1, kind: "local", endpoint, model: "fixture-relay" }), { mode: 0o600 });
  writeFileSync(join(state, "key"), "", { mode: 0o600 });
  const env = { HOME: home, PATH: "/usr/bin:/bin", TERM: "xterm-256color", LANG: "en_US.UTF-8" };
  const actors: { child: ReturnType<typeof Bun.spawn>; raw: string; peer?: Peer; socket?: string }[] = [];
  let store: ReturnType<typeof createMessageStore> | undefined;
  let control: Database | undefined;
  let namespace = "", busRoot = "";
  const evidence = join(source, ".tmp", "relay-pi-actual-" + root.slice(-6));
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  function rows(): Peer[] {
    if (!control) {
      const base = join(state, "relay/projects");
      if (!existsSync(base)) return [];
      const key = readdirSync(base)[0]; if (!key) return [];
      busRoot = join(base, key);
      if (!existsSync(join(busRoot, "control.sqlite"))) return [];
      control = new Database(join(busRoot, "control.sqlite"), { readonly: true, strict: true });
    }
    return control.query("SELECT session_id,peer_id,name,generation,phase,lease_until FROM sessions ORDER BY session_id").all() as Peer[];
  }
  async function wait(check: () => boolean, label: string, ms = 12000) {
    const until = Date.now() + ms;
    while (!check()) {
      if (Date.now() > until || actors.some(actor => actor.child.exitCode !== null && !actor.peer)) throw new Error("Actual Relay timeout: " + label);
      await pause(40);
    }
  }
  async function start() {
    const known = new Set(rows().map(peer => peer.peer_id));
    const actor = { child: undefined as any, raw: "", peer: undefined as Peer | undefined, socket: undefined as string | undefined };
    actor.child = Bun.spawn([join(source, "lab"), "--offline"], { cwd: project, env, terminal: { cols: 160, rows: 60, data(terminal, bytes) {
      const text = new TextDecoder().decode(bytes); actor.raw += text;
      if (text.includes("\x1b[6n")) terminal.write("\x1b[1;1R");
      if (text.includes("\x1b]11;?")) terminal.write("\x1b]11;rgb:1111/1111/1111\x1b\\");
    } } });
    actors.push(actor);
    let trusted = false;
    await wait(() => {
      if (!trusted && actor.raw.includes("Trust project folder?")) { trusted = true; actor.child.terminal!.write("\r"); }
      actor.peer = rows().find(peer => peer.phase === "active" && !known.has(peer.peer_id));
      return !!actor.peer && actor.raw.includes(actor.peer.name);
    }, "native peer registration and client rendering", 20000);
    const pids: number[] = [];
    function children(pid: number) {
      const result = Bun.spawnSync([Bun.which("pgrep")!, "-P", String(pid)]);
      for (const value of result.stdout.toString().trim().split(/\s+/)) if (/^\d+$/.test(value)) { const id = Number(value); pids.push(id); children(id); }
    }
    children(actor.child.pid);
    for (const pid of pids) {
      const output = Bun.spawnSync([Bun.which("lsof")!, "-a", "-p", String(pid), "-U", "-Fn"]).stdout.toString();
      actor.socket ??= output.split("\n").find(line => /^n\/.*\/lab-h-[^/]+\/s\.sock$/.test(line))?.slice(1);
    }
    if (!actor.socket) throw new Error("Owned native server socket missing");
    return actor;
  }
  async function paste(actor: typeof actors[number], text: string) {
    actor.child.terminal!.write("\x1b[200~" + text + "\x1b[201~");
    await pause(300); actor.child.terminal!.write("\r"); await pause(150);
  }
  async function screen(actor: typeof actors[number]): Promise<string> {
    return (await request(actor.socket!, "pane.read", { pane_id: "w1:p2", source: "visible", lines: 100, format: "text", strip_ansi: true })).read.text;
  }
  async function visible(actor: typeof actors[number], text: string) {
    const until = Date.now() + 10000;
    for (;;) { if ((await screen(actor)).includes(text)) return; if (Date.now() > until) throw new Error("Expected native screen text: " + text); await pause(50); }
  }
  async function quit(actor: typeof actors[number]) {
    await paste(actor, "/exit");
    const timer = setTimeout(() => actor.child.kill("SIGTERM"), 10000);
    try { expect(await actor.child.exited).toBe(0); } finally { clearTimeout(timer); }
  }
  const sanitize = (text: string) => text.replaceAll(project, "$PROJECT").replaceAll(home, "$HOME").replaceAll(root, "$FIXTURE");
  try {
    const a = await start(), b = await start();
    expect(a.peer!.peer_id).not.toBe(b.peer!.peer_id);
    store = createMessageStore({ path: join(busRoot, "messages.sqlite") });
    namespace = store.listPeers((control!.query("SELECT namespace FROM sessions LIMIT 1").get() as { namespace: string }).namespace)[0]!.namespace;
    await paste(a, "/relay-peers"); await visible(a, b.peer!.name);
    await paste(a, "/relay-send " + b.peer!.peer_id + " intro-1 Explicit mail from A");
    await wait(() => store!.unread(namespace, b.peer!.peer_id) === 1, "durable send");
    const message = store.read(namespace, b.peer!.peer_id, 10)[0]!;
    expect(message.body).toBe("Explicit mail from A");
    await paste(a, "/relay-send " + b.peer!.peer_id + " intro-1 Explicit mail from A"); await visible(a, '"duplicate": true');
    expect(store.unread(namespace, b.peer!.peer_id)).toBe(1);
    await paste(b, "/relay-inbox"); await visible(b, "Explicit mail from A");
    await paste(b, "/relay-inbox"); await visible(b, "Explicit mail from A");
    expect(store.unread(namespace, b.peer!.peer_id)).toBe(1);
    await paste(a, "/relay-ack " + message.id); await visible(a, "RELAY_CONFLICT");
    expect(store.unread(namespace, b.peer!.peer_id)).toBe(1);
    writeFileSync(join(evidence, "sender-screen.txt"), sanitize(await screen(a)));
    writeFileSync(join(evidence, "recipient-screen.txt"), sanitize(await screen(b)));
    await paste(b, "/relay-ack " + message.id);
    await wait(() => store!.unread(namespace, b.peer!.peer_id) === 0, "explicit recipient ack");
    await paste(b, "/relay-send " + a.peer!.peer_id + " reply-1 --reply-to " + message.id + " Reply from B");
    await wait(() => store!.unread(namespace, a.peer!.peer_id) === 1, "reply");
    const reply = store.read(namespace, a.peer!.peer_id, 10)[0]!;
    expect(reply.replyTo).toBe(message.id); expect(reply.conversationId).toBe(message.conversationId);
    const oldGeneration = b.peer!.generation;
    await paste(b, "/reload");
    await wait(() => rows().some(peer => peer.peer_id === b.peer!.peer_id && peer.generation === oldGeneration + 1 && peer.phase === "active"), "native reload reconnect");
    // The ready notification is transient. A fresh successful inbox command
    // proves the reloaded handler can use the renewed binding.
    await paste(b, "/relay-inbox"); await visible(b, '"messages": []');
    await paste(a, "/relay-send " + b.peer!.peer_id + " intro-1 Explicit mail from A"); await visible(a, '"duplicate": true');
    expect(store.unread(namespace, b.peer!.peer_id)).toBe(0);
    const lease = rows().find(peer => peer.peer_id === a.peer!.peer_id)!.lease_until;
    await wait(() => rows().find(peer => peer.peer_id === a.peer!.peer_id)!.lease_until > lease, "host-only heartbeat", 18000);
    expect(modelRequests).toBe(0); // Inbox/presence never starts a model turn.
    await quit(a); await quit(b);
    expect(rows().every(peer => peer.phase === "released")).toBe(true);
    const cleanup = [a, b].map(actor => {
      const run = control!.query("SELECT run_root FROM runs WHERE session_id=?").get(actor.peer!.session_id) as { run_root: string };
      const result = JSON.parse(readFileSync(join(run.run_root, "attachment.json"), "utf8")).cleanup;
      expect(result).toEqual({ serverExited: true, clientExited: true, workerStopped: true, socketsRemoved: true });
      return result;
    });

    // Native protocol fixture: run the same shipped extension in actual Pi JSON
    // mode, then resume its own session with a new run capability. Context128K
    // and disabled helpers are fixture configuration, not default-model claims.
    modelRecipient = b.peer!.peer_id;
    const sessionDir = join(state, "fixture-sessions"); mkdirSync(sessionDir, { mode: 0o700 });
    async function modelRun(sessionFile?: string) {
      const runRoot = mkdtempSync(join(state, "runs/h-")), runAgent = join(runRoot, "agent");
      mkdirSync(runAgent, { mode: 0o700 }); mkdirSync(join(runRoot, "home"), { mode: 0o700 });
      const runRef = provisionWorkspaceRelayRun({ stateRoot: state, installRoot: source, projectBinding: bindProjectRoot(project), runRoot });
      writeFileSync(join(runAgent, "models.json"), JSON.stringify({ providers: { "lab-fixture": { baseUrl: endpoint, api: "openai-completions", apiKey: "fixture-public-token", models: [{ id: "fixture-relay", reasoning: false, input: ["text"], contextWindow: 131072, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }), { mode: 0o600 });
      writeFileSync(join(runAgent, "settings.json"), JSON.stringify({ compaction: { enabled: false }, cacheWarming: "off", retry: { enabled: false } }), { mode: 0o600 });
      const pi = Bun.spawn([...verifyPiRuntime().command, "--offline", "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--mode", "json", "--provider", "lab-fixture", "--model", "fixture-relay", "--session-dir", sessionDir, ...(sessionFile ? ["--session", sessionFile] : []), "-e", join(source, "src/pi/workspace-extension.ts"), "-p", "Send the explicit fixture message once."], {
        cwd: project, env: { ...env, HOME: join(runRoot, "home"), PI_CODING_AGENT_DIR: runAgent, PI_OFFLINE: "1", LAB_WORKSPACE_BUN: process.execPath, LAB_WORKSPACE_USER_HOME: home, LAB_WORKSPACE_ROOT: project, LAB_WORKSPACE_BINDING: JSON.stringify(bindProjectRoot(project)), LAB_INSTALL_ROOT: source, LAB_RELAY_RUN_REF: runRef }, stdout: "pipe", stderr: "pipe",
      });
      const timer = setTimeout(() => pi.kill("SIGTERM"), 20000);
      const [output, errors, code] = await Promise.all([new Response(pi.stdout).text(), new Response(pi.stderr).text(), pi.exited]);
      clearTimeout(timer); expect(code, errors.slice(-1000)).toBe(0);
      const events = output.split("\n").filter(Boolean).map(line => JSON.parse(line));
      const result = events.find(event => event.type === "tool_execution_end" && event.toolName === "relay_send");
      expect(result, output.slice(-2500)).toBeDefined(); expect(result.isError).toBe(false);
      return { result: result.result.details, events };
    }
    const first = await modelRun();
    expect(first.result.duplicate).toBe(false);
    const files = readdirSync(sessionDir).filter(name => name.endsWith(".jsonl")); expect(files).toHaveLength(1);
    const resumed = await modelRun(join(sessionDir, files[0]!));
    expect(resumed.result.id).toBe(first.result.id); expect(resumed.result.duplicate).toBe(true);
    expect(store.unread(namespace, b.peer!.peer_id)).toBe(1);
    expect(rows().every(peer => peer.phase === "released")).toBe(true);
    writeFileSync(join(evidence, "model-tool-events.jsonl"), [...first.events, ...resumed.events].filter(event => event.type === "tool_execution_end").map(event => sanitize(JSON.stringify(event))).join("\n") + "\n");
    const sourceSHA = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: source }).stdout.toString().trim();
    const dirty = !!Bun.spawnSync(["git", "status", "--porcelain"], { cwd: source }).stdout.toString().trim();
    writeFileSync(join(evidence, "result.json"), JSON.stringify({ source: sourceSHA, dirty, environment: process.platform + "-" + process.arch, label: "actual owned Pi/Herdr sessions + owned Chat protocol fixture, not model quality", nativePeers: rows().map(({ peer_id, name, generation, phase }) => ({ peer_id, name, generation, phase })), operatorMessaging: true, repeatedReadNotAck: true, foreignAckRefused: true, nativeReloadReconnected: true, noWakeupModelCalls: true, toolProtocolRequests: modelRequests, processResumeSameReceipt: true, cleanup }, null, 2));
  } finally {
    for (const actor of actors) {
      if (actor.child.exitCode === null) { actor.child.kill("SIGTERM"); await actor.child.exited; }
      actor.child.terminal?.close();
      writeFileSync(join(evidence, "terminal-" + actors.indexOf(actor) + ".ansi"), sanitize(actor.raw));
    }
    store?.close(); control?.close(true); server.stop(true);
    rmSync(root, { recursive: true, force: true });
  }
}, 90000);
