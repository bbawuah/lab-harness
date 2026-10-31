import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, lstatSync, existsSync, writeFileSync, rmSync, openSync, readSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { verifyPiRuntime } from "../src/runtime/pi.ts";
import { bindProjectRoot } from "../src/project.ts";
import { provisionWorkspaceRelayRun } from "../src/relay/workspace.ts";
import { createMessageStore } from "../vendor/relay/src/storage/store.ts";
import { request } from "../src/herdr/protocol.ts";
import { TerminalScreen } from "../docs/evidence/fullscreen/fixtures/screen.ts";

const actual = process.env.LAB_HERDR_ACTUAL === "1" ? test : test.skip;
const pause = (ms: number) => new Promise(done => setTimeout(done, ms));
const source = resolve(import.meta.dir, "..");
type Peer = { session_id: string; peer_id: string; name: string; generation: number; phase: string; lease_until: number };
function initialWalSidecarsPending(error: unknown, path: string, readiness: { seenSession: boolean }): boolean {
  const sqlite = error as { code?: string; errno?: number } | null;
  if (readiness.seenSession || sqlite?.code !== "SQLITE_CANTOPEN" || sqlite.errno !== 14) return false;
  const header = Buffer.alloc(100), fd = openSync(path, "r");
  let count: number;
  try { count = readSync(fd, header, 0, 100, 0); } finally { closeSync(fd); }
  return count === 100 && header.subarray(0, 16).toString() === "SQLite format 3\0" && header[18] === 2 && header[19] === 2
    && header.readUInt32BE(60) === 1 && header.readUInt32BE(68) === 0x4c525931
    && (!existsSync(path + "-wal") || !existsSync(path + "-shm"));
}
function committedPeerRows(db: Database, path: string, readiness: { seenSession: boolean }): Peer[] {
  // This is a read-only observer, not a production Relay opener. A freshly
  // created control inode precedes its schema transaction's commit. Observe
  // markers/schema/data in one snapshot, and retry only that exact empty state.
  try { const rows = db.transaction(() => {
    const app = (db.query("PRAGMA application_id").get() as { application_id: number }).application_id;
    const version = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
    const tables = db.query("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    if (app === 0 && version === 0 && tables.length === 0) return [];
    if (app !== 0x4c525931 || version !== 1 || !tables.some(table => table.name === "sessions")) throw new Error("Unexpected committed Relay observer schema");
    return db.query("SELECT session_id,peer_id,name,generation,phase,lease_until FROM sessions ORDER BY session_id").all() as Peer[];
  }).deferred();
    if (rows.length) readiness.seenSession = true;
    return rows;
  } catch (error) {
    // A readonly handle opened before WAL activation cannot create the first
    // WAL sidecars. Retry only this initial, marked, header-confirmed window;
    // all other SQLite failures and every post-readiness failure propagate.
    if (initialWalSidecarsPending(error, path, readiness)) return [];
    throw error;
  }
}
async function peerSnapshot(db: Database, path: string, readiness: { seenSession: boolean }, deadline: number): Promise<Peer[]> {
  let busy: unknown;
  for (;;) {
    if (Date.now() >= deadline) throw busy ?? new Error("Relay observer snapshot deadline");
    try { return committedPeerRows(db, path, readiness); }
    catch (error) {
      const sqlite = error as { code?: string; errno?: number };
      if (sqlite.code !== "SQLITE_BUSY" || sqlite.errno !== 5 || Date.now() >= deadline) throw error;
      busy = error;
      await pause(Math.min(10, Math.max(0, deadline - Date.now())));
    }
  }
}
test("readonly observer retries only SQLITE_BUSY until the existing snapshot deadline", async () => {
  const root = mkdtempSync(join(homedir(), ".lab-relay-observer-lock-")), path = join(root, "control.sqlite");
  const writer = new Database(path);
  writer.exec("CREATE TABLE sessions(session_id TEXT,peer_id TEXT,name TEXT,generation INTEGER,phase TEXT,lease_until INTEGER); PRAGMA application_id=1280465201; PRAGMA user_version=1; INSERT INTO sessions VALUES ('fixture-session','fixture-peer','fixture',0,'active',123)");
  const observer = new Database(path, { readonly: true, strict: true }), readiness = { seenSession: false };
  let release: ReturnType<typeof setTimeout> | undefined;
  try {
    expect(committedPeerRows(observer, path, readiness)).toHaveLength(1);
    writer.exec("BEGIN EXCLUSIVE; UPDATE sessions SET lease_until=124");
    let unlocked = false;
    release = setTimeout(() => { writer.exec("COMMIT"); unlocked = true; }, 30);
    const rows = await peerSnapshot(observer, path, readiness, Date.now() + 500);
    expect(unlocked).toBe(true); expect(rows[0]?.lease_until).toBe(124);
    writer.exec("BEGIN EXCLUSIVE");
    const deadline = Date.now() + 30;
    const failure = await peerSnapshot(observer, path, readiness, deadline).then(() => undefined, error => error);
    expect(failure).toMatchObject({ code: "SQLITE_BUSY", errno: 5 });
    expect(Date.now()).toBeGreaterThanOrEqual(deadline);
    writer.exec("ROLLBACK; PRAGMA application_id=7");
    await expect(peerSnapshot(observer, path, readiness, Date.now() + 500)).rejects.toThrow("Unexpected committed");
  } finally {
    if (release) clearTimeout(release);
    try { writer.exec("ROLLBACK"); } catch {}
    observer.close(); writer.close(); rmSync(root, { recursive: true, force: true });
  }
});
test("readonly observer waits for schema commit and first WAL sidecars, refusing foreign/partial schemas", () => {
  const root = mkdtempSync(join(homedir(), ".lab-relay-observer-")), path = join(root, "control.sqlite");
  const writer = new Database(path);
  writer.exec("PRAGMA user_version=0");
  const observer = new Database(path, { readonly: true, strict: true });
  const readiness = { seenSession: false }, rows = () => committedPeerRows(observer, path, readiness);
  try {
    expect(rows()).toEqual([]);
    writer.exec("BEGIN IMMEDIATE; CREATE TABLE sessions(session_id TEXT,peer_id TEXT,name TEXT,generation INTEGER,phase TEXT,lease_until INTEGER); PRAGMA application_id=1280465201; PRAGMA user_version=1; INSERT INTO sessions VALUES ('fixture-session','fixture-peer','fixture',0,'active',123)");
    expect(rows()).toEqual([]); // Schema is uncommitted.
    writer.exec("COMMIT");
    writer.exec("PRAGMA journal_mode=WAL");
    expect(existsSync(path + "-shm")).toBe(false);
    const cantopen = { code: "SQLITE_CANTOPEN", errno: 14 };
    // Exercise classification deterministically; Linux may successfully read
    // the committed rows here while Darwin's pre-WAL handle needs a retry.
    expect(initialWalSidecarsPending(cantopen, path, { seenSession: false })).toBe(true);
    expect(initialWalSidecarsPending(cantopen, path, { seenSession: true })).toBe(false);
    expect(initialWalSidecarsPending({ code: "SQLITE_CORRUPT", errno: 11 }, path, { seenSession: false })).toBe(false);
    expect(initialWalSidecarsPending({ code: "SQLITE_CANTOPEN", errno: 1 }, path, { seenSession: false })).toBe(false);
    const initialWalRows = rows();
    if (initialWalRows.length) expect(initialWalRows).toEqual([{ session_id: "fixture-session", peer_id: "fixture-peer", name: "fixture", generation: 0, phase: "active", lease_until: 123 }]);
    else expect(initialWalRows).toEqual([]);
    writer.exec("UPDATE sessions SET lease_until=124");
    expect(rows()).toEqual([{ session_id: "fixture-session", peer_id: "fixture-peer", name: "fixture", generation: 0, phase: "active", lease_until: 124 }]);
    expect(readiness.seenSession).toBe(true);
    writer.exec("PRAGMA application_id=7");
    expect(() => rows()).toThrow("Unexpected committed");
    writer.exec("PRAGMA application_id=1280465201; DROP TABLE sessions");
    expect(() => rows()).toThrow("Unexpected committed");
  } finally { observer.close(); writer.close(); rmSync(root, { recursive: true, force: true }); }
});
function ownedServerSockets(fields: string): string[] {
  // Linux lsof appends "type=STREAM" to the n field; Darwin ends at the path.
  return fields.split("\n").flatMap(line => {
    const socket = /^n(\/(?:private\/)?tmp\/lab-h-[A-Za-z0-9_-]+\/s\.sock)(?:\s|$)/.exec(line)?.[1];
    return socket ? [socket] : [];
  });
}
test("owned socket discovery accepts actual Darwin/Linux lsof fields without selecting another endpoint", () => {
  expect(ownedServerSockets("p169\nn/tmp/lab-h-owned/s.sock type=STREAM\nntype=STREAM\n")).toEqual(["/tmp/lab-h-owned/s.sock"]);
  expect(ownedServerSockets("p169\nn/private/tmp/lab-h-owned/s.sock\n")).toEqual(["/private/tmp/lab-h-owned/s.sock"]);
  expect(ownedServerSockets("n/tmp/lab-h-owned/s-client.sock type=STREAM\nn/tmp/other.sock\nn/tmp/lab-h-owned/s.socket\n")).toEqual([]);
});

actual("two owned Pi TUIs automatically message/reply, read without ack, refuse foreign ack and reconnect; native model tools survive process resume", async () => {
  const root = mkdtempSync(join(homedir(), ".lab-relay-pi-")), home = join(root, "home"), project = join(home, "project with spaces");
  const state = join(home, ".local/share/lab-harness/workspace"), agent = join(state, "agent");
  for (const path of [project, agent, join(state, "runs")]) mkdirSync(path, { recursive: true, mode: 0o700 });
  let modelRequests = 0, toolCall = 0;
  let modelRecipient = "", streamingProbeMarker = "";
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
      const chunk = (value: unknown) => "data: " + JSON.stringify(value) + "\n\n";
      if (streamingProbeMarker) {
        const payload = (delta: unknown, finish_reason: string | null) => chunk({ id: "stream-fixture", object: "chat.completion.chunk", created: 1, model: "fixture-relay", choices: [{ index: 0, delta, finish_reason }] });
        return new Response(new ReadableStream({ async start(controller) {
          controller.enqueue(new TextEncoder().encode(payload({ role: "assistant", content: "STREAMING_FIXTURE_DONE" }, null)));
          const deadline = Date.now() + 5000;
          while (!existsSync(streamingProbeMarker)) { if (Date.now() > deadline) { controller.error(new Error("Streaming slash fixture did not complete")); return; } await pause(10); }
          controller.enqueue(new TextEncoder().encode(payload({}, "stop") + "data: [DONE]\n\n")); controller.close();
        } }), { headers: { "content-type": "text/event-stream" } });
      }
      const tool = body.messages.at(-1)?.role !== "tool";
      const delta = tool ? { role: "assistant", tool_calls: [{ index: 0, id: "fixture-call-" + (++toolCall), type: "function", function: { name: "relay_send", arguments: JSON.stringify({ to: modelRecipient, requestKey: "native-retry-key", body: "Explicit provider-fixture mail" }) } }] } : { role: "assistant", content: "FIXTURE_DONE" };
      return new Response(chunk({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-relay", choices: [{ index: 0, delta, finish_reason: null }] }) +
        chunk({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "fixture-relay", choices: [{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } }) + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
    },
  });
  const endpoint = "http://127.0.0.1:" + server.port + "/v1";
  writeFileSync(join(state, "route.json"), JSON.stringify({ version: 1, kind: "local", endpoint, model: "fixture-relay" }), { mode: 0o600 });
  writeFileSync(join(state, "key"), "", { mode: 0o600 });
  const env = { HOME: home, PATH: "/usr/bin:/bin", TERM: "xterm-256color", LANG: "en_US.UTF-8" };
  const actors: { child: ReturnType<typeof Bun.spawn>; raw: string; view: TerminalScreen; peer?: Peer; socket?: string }[] = [];
  let store: ReturnType<typeof createMessageStore> | undefined;
  let control: Database | undefined;
  let namespace = "", busRoot = "";
  const observerReadiness = { seenSession: false };
  const evidence = join(source, ".tmp", "relay-pi-actual-" + root.slice(-6));
  mkdirSync(evidence, { recursive: true, mode: 0o700 });
  async function rows(deadline = Date.now() + 1000): Promise<Peer[]> {
    if (!control) {
      const base = join(state, "relay/projects");
      if (!existsSync(base)) return [];
      const key = readdirSync(base)[0]; if (!key) return [];
      busRoot = join(base, key);
      const path = join(busRoot, "control.sqlite");
      const entry = lstatSync(path, { throwIfNoEntry: false });
      if (!entry || entry.size === 0) return []; // Owned initial inode, no committed SQLite header yet.
      control = new Database(path, { readonly: true, strict: true });
    }
    return peerSnapshot(control, join(busRoot, "control.sqlite"), observerReadiness, deadline);
  }
  async function wait(check: (deadline: number) => boolean | Promise<boolean>, label: string, ms = 12000) {
    const until = Date.now() + ms;
    while (!await check(until)) {
      if (Date.now() > until || actors.some(actor => actor.child.exitCode !== null && !actor.peer)) throw new Error("Actual Relay timeout: " + label);
      await pause(40);
    }
  }
  async function start() {
    const startDeadline = Date.now() + 20000;
    const known = new Set((await rows(startDeadline)).map(peer => peer.peer_id));
    const actor = { child: undefined as any, raw: "", view: new TerminalScreen(160, 60), peer: undefined as Peer | undefined, socket: undefined as string | undefined };
    actor.child = Bun.spawn([join(source, "lab"), "--offline"], { cwd: project, env, terminal: { cols: 160, rows: 60, data(terminal, bytes) {
      const text = new TextDecoder().decode(bytes); actor.raw += text; actor.view.write(text);
      if (text.includes("\x1b[6n")) terminal.write("\x1b[1;1R");
      if (text.includes("\x1b]11;?")) terminal.write("\x1b]11;rgb:1111/1111/1111\x1b\\");
    } } });
    actors.push(actor);
    let trusted = false;
    await wait(async deadline => {
      if (!trusted && actor.raw.includes("Trust project folder?")) { trusted = true; actor.child.terminal!.write("\r"); }
      actor.peer = (await rows(deadline)).find(peer => peer.phase === "active" && !known.has(peer.peer_id));
      return !!actor.peer && actor.view.snapshot().lines.join("\n").includes(actor.peer.peer_id.slice(-6));
    }, "native peer registration and client rendering", Math.max(0, startDeadline - Date.now()));
    const pids: number[] = [];
    function children(pid: number) {
      const result = Bun.spawnSync([Bun.which("pgrep")!, "-P", String(pid)]);
      for (const value of result.stdout.toString().trim().split(/\s+/)) if (/^\d+$/.test(value)) { const id = Number(value); pids.push(id); children(id); }
    }
    children(actor.child.pid);
    const observations: { pid: number; exit: number; fields: string; }[] = [];
    for (const pid of pids) {
      const result = Bun.spawnSync([Bun.which("lsof")!, "-a", "-p", String(pid), "-U", "-Fn"]);
      const output = result.stdout.toString();
      observations.push({ pid, exit: result.exitCode, fields: output.slice(-1000) });
      for (const candidate of ownedServerSockets(output)) {
        const reply = await request(candidate, "ping");
        if (reply.type === "pong" && reply.version === "0.9.5") { actor.socket = candidate; break; }
      }
      if (actor.socket) break;
    }
    if (!actor.socket) throw new Error("Owned native server socket missing: " + JSON.stringify(observations).slice(-2500));
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
    await paste(a, "/relay-peers"); await visible(a, b.peer!.peer_id.slice(-6));
    await paste(a, "/relay-send " + b.peer!.peer_id + " intro-1 Explicit mail from A");
    await wait(() => store!.unread(namespace, b.peer!.peer_id) === 1, "durable send");
    const message = store.read(namespace, b.peer!.peer_id, 10)[0]!;
    expect(message.body).toBe("Explicit mail from A");
    await paste(a, "/relay-send " + b.peer!.peer_id + " intro-1 Explicit mail from A"); await visible(a, "Already stored; no duplicate created");
    expect(store.unread(namespace, b.peer!.peer_id)).toBe(1);
    await paste(b, "/relay-inbox"); await visible(b, "Explicit mail from A");
    const collapsedInbox = await screen(b);
    expect(collapsedInbox).toContain("Received from");
    expect(collapsedInbox).not.toContain(message.id);
    expect(collapsedInbox).not.toContain(message.from);
    // The exact pinned Pi app.tools.expand shortcut expands custom messages as
    // well as model tools. Preserve full metadata behind the native control.
    b.child.terminal!.write("\x0f"); await visible(b, message.id);
    expect(await screen(b)).toContain("Details (request and result)");
    b.child.terminal!.write("\x0f");
    await wait(async () => !(await screen(b)).includes(message.id), "native Relay details collapse");
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
    await wait(async deadline => (await rows(deadline)).some(peer => peer.peer_id === b.peer!.peer_id && peer.generation === oldGeneration + 1 && peer.phase === "active"), "native reload reconnect");
    // The ready notification is transient. A fresh successful inbox command
    // proves the reloaded handler can use the renewed binding.
    await paste(b, "/relay-inbox"); await visible(b, "Inbox empty");
    await paste(a, "/relay-send " + b.peer!.peer_id + " intro-1 Explicit mail from A"); await visible(a, "Already stored; no duplicate created");
    expect(store.unread(namespace, b.peer!.peer_id)).toBe(0);
    const lease = (await rows()).find(peer => peer.peer_id === a.peer!.peer_id)!.lease_until;
    await wait(async deadline => (await rows(deadline)).find(peer => peer.peer_id === a.peer!.peer_id)!.lease_until > lease, "host-only heartbeat", 18000);
    expect(modelRequests).toBe(0); // Inbox/presence never starts a model turn.
    await quit(a); await quit(b);
    expect((await rows()).every(peer => peer.phase === "released")).toBe(true);
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
    async function modelRun(sessionFile?: string, slashDuringStream = false) {
      const runRoot = mkdtempSync(join(state, "runs/h-")), runAgent = join(runRoot, "agent");
      mkdirSync(runAgent, { mode: 0o700 }); mkdirSync(join(runRoot, "home"), { mode: 0o700 });
      const runRef = provisionWorkspaceRelayRun({ stateRoot: state, installRoot: source, projectBinding: bindProjectRoot(project), runRoot });
      writeFileSync(join(runAgent, "models.json"), JSON.stringify({ providers: { "lab-fixture": { baseUrl: endpoint, api: "openai-completions", apiKey: "fixture-public-token", models: [{ id: "fixture-relay", reasoning: false, input: ["text"], contextWindow: 131072, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }), { mode: 0o600 });
      writeFileSync(join(runAgent, "settings.json"), JSON.stringify({ compaction: { enabled: false }, cacheWarming: "off", retry: { enabled: false } }), { mode: 0o600 });
      // Invoke the actual registered operator handler from a native streaming
      // event. Pi must defer its custom result rather than queue a steering
      // message and generate another provider request. The proxy forwards every
      // registration/delivery to the real Pi API; it replaces no native method.
      const streamingProbe = join(runRoot, "streaming-probe.ts");
      streamingProbeMarker = slashDuringStream ? join(runRoot, "slash-complete") : "";
      writeFileSync(streamingProbe, `import workspace from ${JSON.stringify(join(source, "src/pi/workspace-extension.ts"))};\nimport { writeFileSync } from "node:fs";\nexport default function(pi) {\n let peers, fired = false;\n const proxy = new Proxy(pi, { get(target, key) {\n  if (key === "registerCommand") return (name, command) => { if (name === "relay-peers") peers = command; return target.registerCommand(name, command); };\n  const value = target[key]; return typeof value === "function" ? value.bind(target) : value;\n } });\n workspace(proxy);\n pi.on("message_update", async (_event, ctx) => { if (!fired) { fired = true; await peers.handler("", ctx); writeFileSync(${JSON.stringify(streamingProbeMarker)}, "complete"); } });\n}\n`, { mode: 0o600 });
      const pi = Bun.spawn([...verifyPiRuntime().command, "--offline", "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--mode", "json", "--provider", "lab-fixture", "--model", "fixture-relay", "--session-dir", sessionDir, ...(sessionFile ? ["--session", sessionFile] : []), "-e", slashDuringStream ? streamingProbe : join(source, "src/pi/workspace-extension.ts"), "-p", "Send the explicit fixture message once."], {
        cwd: project, env: { ...env, HOME: join(runRoot, "home"), PI_CODING_AGENT_DIR: runAgent, PI_OFFLINE: "1", LAB_WORKSPACE_BUN: process.execPath, LAB_WORKSPACE_USER_HOME: home, LAB_WORKSPACE_ROOT: project, LAB_WORKSPACE_BINDING: JSON.stringify(bindProjectRoot(project)), LAB_INSTALL_ROOT: source, LAB_RELAY_RUN_REF: runRef }, stdout: "pipe", stderr: "pipe",
      });
      const timer = setTimeout(() => pi.kill("SIGTERM"), 20000);
      const [output, errors, code] = await Promise.all([new Response(pi.stdout).text(), new Response(pi.stderr).text(), pi.exited]);
      clearTimeout(timer); expect(code, errors.slice(-1000)).toBe(0);
      const events = output.split("\n").filter(Boolean).map(line => JSON.parse(line));
      const result = events.find(event => event.type === "tool_execution_end" && event.toolName === "relay_send");
      if (slashDuringStream) {
        expect(events.some(event => event.type === "message_end" && event.message?.customType === "relay-peers")).toBe(true);
        expect(output).toContain("STREAMING_FIXTURE_DONE");
      } else { expect(result, output.slice(-2500)).toBeDefined(); expect(result.isError).toBe(false); }
      return { result: result?.result.details, events };
    }
    const first = await modelRun();
    expect(first.result.duplicate).toBe(false);
    const files = readdirSync(sessionDir).filter(name => name.endsWith(".jsonl")); expect(files).toHaveLength(1);
    const resumed = await modelRun(join(sessionDir, files[0]!));
    expect(resumed.result.id).toBe(first.result.id); expect(resumed.result.duplicate).toBe(true);
    expect(store.unread(namespace, b.peer!.peer_id)).toBe(1);
    expect((await rows()).every(peer => peer.phase === "released")).toBe(true);
    await modelRun(undefined, true);
    expect(modelRequests).toBe(5); // Two tool requests per run + one plaintext stream; slash adds none.
    expect((await rows()).every(peer => peer.phase === "released")).toBe(true);
    writeFileSync(join(evidence, "model-tool-events.jsonl"), [...first.events, ...resumed.events].filter(event => event.type === "tool_execution_end").map(event => sanitize(JSON.stringify(event))).join("\n") + "\n");
    const sourceSHA = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: source }).stdout.toString().trim();
    const dirty = !!Bun.spawnSync(["git", "status", "--porcelain"], { cwd: source }).stdout.toString().trim();
    writeFileSync(join(evidence, "result.json"), JSON.stringify({ source: sourceSHA, dirty, environment: process.platform + "-" + process.arch, label: "actual owned Pi/Herdr sessions + owned Chat protocol fixture, not model quality", nativePeers: (await rows()).map(({ peer_id, name, generation, phase }) => ({ peer_id, name, generation, phase })), operatorMessaging: true, repeatedReadNotAck: true, foreignAckRefused: true, nativeReloadReconnected: true, noWakeupModelCalls: true, toolProtocolRequests: modelRequests, streamingSlashNonTriggering: true, processResumeSameReceipt: true, cleanup }, null, 2));
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
