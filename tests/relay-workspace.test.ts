import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { bindProjectRoot } from "../src/project.ts";
import { bindWorkspaceRelaySession, openBoundWorkspaceRelay, provisionWorkspaceRelayRun, type BoundWorkspaceRelay, type WorkspaceRelayRunOptions } from "../src/relay/workspace.ts";
import { createMessageStore } from "../vendor/relay/src/storage/store.ts";
import { createMessageService } from "../vendor/relay/src/messages/service.ts";
import { createDirectory } from "../vendor/relay/src/directory/index.ts";

// All data is explicitly owned disposable state under this user's HOME. Nothing
// uses a default workspace path, native session store, route, key, or credential.
const fixtures: { root: string }[] = [];
const helpers: BoundWorkspaceRelay[] = [];
function fixture() {
  const root = mkdtempSync(join(homedir(), ".lab-relay-unit-"));
  chmodSync(root, 0o700);
  const stateRoot = join(root, "state"), installRoot = join(root, "install"), project = join(root, "project");
  for (const path of [stateRoot, installRoot, project, join(stateRoot, "runs")]) mkdirSync(path, { mode: 0o700 });
  let time = 1_800_000_000_000;
  const timing = { now: () => time };
  const run = (overrides: Partial<WorkspaceRelayRunOptions> = {}) => {
    const runRoot = mkdtempSync(join(stateRoot, "runs/r-"));
    const options: WorkspaceRelayRunOptions = { stateRoot, installRoot, projectBinding: bindProjectRoot(project), runRoot, ...overrides };
    const ref = provisionWorkspaceRelayRun(options, timing);
    return { ref, options };
  };
  const open = (ref: string, session: string) => {
    const helper = openBoundWorkspaceRelay(ref, session, timing); helpers.push(helper); return helper;
  };
  const bind = (ref: string, session: string) => bindWorkspaceRelaySession(ref, session, timing);
  const f = { root, stateRoot, installRoot, project, run, open, bind, timing, advance: (ms: number) => { time += ms; } };
  fixtures.push(f); return f;
}
afterEach(() => {
  for (const h of helpers.splice(0)) h.close();
  for (const f of fixtures.splice(0)) rmSync(f.root, { recursive: true, force: true });
});
function paths(refPath: string) {
  const ref = JSON.parse(readFileSync(refPath, "utf8"));
  return { ref, control: join(ref.busRoot, "control.sqlite"), messages: join(ref.busRoot, "messages.sqlite") };
}
function sql<T>(path: string, fn: (db: Database) => T): T {
  const db = new Database(path, { create: false, strict: true });
  try { return fn(db); } finally { db.close(); }
}
function pair() {
  const f = fixture(), a = f.run(), b = f.run();
  const alice = f.bind(a.ref, "alice-native"), bob = f.bind(b.ref, "bob-native");
  return { f, a, b, alice, bob, sender: f.open(a.ref, "alice-native"), receiver: f.open(b.ref, "bob-native") };
}
function send(h: BoundWorkspaceRelay, to: string, key: string = randomUUID(), body = "fixture message") {
  return h.send({ action: "send", to, body, requestKey: key });
}

test("same project has a stable bus, durable native-session peers, aliases and private state", () => {
  const { f, a, b, alice, bob, sender, receiver } = pair();
  expect(alice.busId).toBe(bob.busId); expect(alice.namespace).toBe(bob.namespace);
  expect(alice.peerId).not.toBe(bob.peerId); expect(alice.name).toStartWith("project/alice-native-");
  expect(f.bind(a.ref, "alice-native")).toEqual(alice);
  expect(sender.peers().peers).toContainEqual({ id: bob.peerId, name: bob.name, presence: "online", lastSeenAt: f.timing.now(), self: false });
  expect(receiver.peers({ limit: 1 }).nextOffset).toBe(1);
  expect(receiver.peers({ limit: 1, offset: 1 }).nextOffset).toBeUndefined();
  expect(receiver.peers({ offset: 100 }).peers).toEqual([]);
  const p = paths(a.ref);
  for (const file of [a.ref, b.ref, p.control, p.messages]) expect(lstatSync(file).mode & 0o077).toBe(0);
  expect(provisionWorkspaceRelayRun(a.options, f.timing)).toBe(a.ref);
  sender.close();
  // Per-operation helpers closing must not release/rebind the logical session.
  expect(f.open(a.ref, "alice-native").identity).toEqual(alice);
  expect(receiver.peers().peers.find(p => p.id === alice.peerId)?.presence).toBe("online");
});

test("read is repeatable until explicit recipient ack; mixed foreign ack refuses every ID", async () => {
  const { alice, bob, sender, receiver } = pair();
  const own = send(sender, bob.name), foreign = send(receiver, alice.peerId);
  const first = await receiver.inbox();
  expect(first.messages.map(m => m.id)).toEqual([own.id]); expect(first.unread).toBe(1);
  expect(await receiver.inbox()).toEqual(first);
  expect(() => receiver.ack({ ids: [own.id, foreign.id] })).toThrow("foreign recipient");
  expect((await receiver.inbox()).unread).toBe(1);
  expect(receiver.ack({ ids: [own.id, own.id, "unknown-fixture-id"] })).toEqual({ acknowledged: 1, ignored: 1 });
  expect(receiver.ack({ ids: [own.id] })).toEqual({ acknowledged: 0, ignored: 1 });
  expect(await receiver.inbox()).toEqual({ messages: [], unread: 0, timedOut: false });
  expect((await sender.inbox()).messages.map(m => m.id)).toEqual([foreign.id]);
});

test("fixed identity rejects unknown fields and model-supplied scope/sender overrides", async () => {
  const { sender, bob } = pair();
  for (const key of ["namespace", "from", "sender", "sessionId", "runRef", "statePath", "generation", "owner", "peerId", "groupId", "action"]) {
    const extra = { [key]: "override" };
    expect(() => sender.peers(extra)).toThrow();
    expect(() => sender.ack({ ids: [], ...extra })).toThrow();
    await expect(sender.inbox(extra)).rejects.toThrow();
    expect(() => sender.send({ action: "send", to: bob.peerId, body: "body", requestKey: "K", ...extra } as any)).toThrow();
  }
  expect(() => send(sender, bob.peerId, "x".repeat(129))).toThrow("128 characters");
  expect(() => send(sender, " " + bob.peerId)).toThrow();
  expect(() => sender.send({ action: "send", to: bob.peerId, body: "x", requestKey: "K", replyTo: "r".repeat(129) })).toThrow();
  await expect(sender.inbox({ limit: NaN })).rejects.toThrow();
  expect(() => sender.peers({ offset: -1 })).toThrow();
  expect(() => sender.peers({ limit: 51 })).toThrow();
  expect(() => sender.peers({ limit: 0 })).toThrow();
  expect(() => sender.ack({ ids: Array.from({ length: 101 }, (_, i) => `m${i}`) })).toThrow();
  expect(() => sender.peers({ unknown: "x".repeat(128 * 1024) } as any)).toThrow();
  expect(() => send(sender, bob.peerId, "oversize-input", "x".repeat(128 * 1024))).toThrow("input exceeds 128 KiB");
  const accessor = Object.defineProperty({}, "limit", { get: () => 1, enumerable: true });
  expect(() => sender.peers(accessor)).toThrow("invalid Relay request field");
});

test("release/rebind on the same run supports Pi reload, freezes old helpers, and advances once", async () => {
  const { f, a, sender, bob, receiver } = pair();
  const receipt = send(sender, bob.peerId, "before-reload");
  sender.release();
  const rebound = f.bind(a.ref, "alice-native");
  expect(rebound.generation).toBe(sender.identity.generation + 1);
  expect(rebound.peerId).toBe(sender.identity.peerId); expect(rebound.name).toBe(sender.identity.name);
  expect(f.bind(a.ref, "alice-native")).toEqual(rebound);
  for (const operation of [() => sender.peers(), () => send(sender, bob.peerId), () => sender.ack({ ids: [] }), () => sender.heartbeat(), () => sender.release()]) expect(operation).toThrow("stale");
  await expect(sender.inbox()).rejects.toThrow("stale");
  const current = f.open(a.ref, "alice-native");
  expect(send(current, bob.peerId, "before-reload")).toMatchObject({ id: receipt.id, duplicate: true });
  expect((await receiver.inbox()).unread).toBe(1);
  expect(() => f.bind(a.ref, "next-native-session")).toThrow("Release");
  current.release(); const next = f.bind(a.ref, "next-native-session");
  expect(next.peerId).not.toBe(current.identity.peerId);
  expect(() => current.heartbeat()).toThrow("stale");
});

test("live capability cannot steal ownership; expiry enables a new run and fences every stale action", async () => {
  const { f, a, sender, receiver, bob } = pair();
  const contender = f.run();
  expect(() => f.bind(contender.ref, "alice-native")).toThrow("live owner");
  expect(() => f.open(contender.ref, "alice-native")).toThrow("stale");
  f.advance(59_999); receiver.heartbeat();
  expect(() => f.bind(contender.ref, "alice-native")).toThrow("live owner");
  f.advance(1);
  expect(receiver.peers().peers.find(p => p.id === sender.identity.peerId)?.presence).toBe("offline");
  expect(() => f.bind(a.ref, "alice-native")).toThrow("new run capability");
  const replacement = f.bind(contender.ref, "alice-native");
  expect(replacement.generation).toBe(1);
  const h = f.open(contender.ref, "alice-native");
  for (const op of [() => sender.peers(), () => send(sender, bob.peerId), () => sender.ack({ ids: [] }), () => sender.heartbeat(), () => sender.release()]) expect(op).toThrow("stale");
  await expect(sender.inbox()).rejects.toThrow("stale");
  expect(h.peers().peers.find(p => p.self)?.presence).toBe("online");
  h.close(); expect(f.open(contender.ref, "alice-native").identity.generation).toBe(1);
});

test("durable request journal deduplicates helper restart, response loss, reconnect and vendor-commit gap", async () => {
  const { f, a, sender, receiver, bob } = pair();
  const first = send(sender, bob.name, "durable-key", "exact bytes"); sender.close();
  const restarted = f.open(a.ref, "alice-native");
  expect(send(restarted, bob.name, "durable-key", "exact bytes")).toMatchObject({ id: first.id, duplicate: true });
  expect(() => send(restarted, bob.name, "durable-key", "changed bytes")).toThrow("payload conflict");
  expect(() => send(restarted, bob.peerId, "durable-key", "exact bytes")).toThrow("payload conflict");
  // Recreate the durable crash boundary: vendor committed; control receipt did not.
  sql(paths(a.ref).control, db => db.query("UPDATE outbound SET receipt=NULL WHERE request_key=?").run("durable-key"));
  restarted.close(); const gap = f.open(a.ref, "alice-native");
  expect(send(gap, bob.name, "durable-key", "exact bytes")).toMatchObject({ id: first.id, duplicate: true });
  expect((await receiver.inbox()).messages).toHaveLength(1);
  gap.release(); f.bind(a.ref, "alice-native");
  expect(send(f.open(a.ref, "alice-native"), bob.name, "durable-key", "exact bytes").id).toBe(first.id);
  const row = sql(paths(a.ref).control, db => db.query("SELECT recipient,request,receipt FROM outbound WHERE request_key='durable-key'").get()) as any;
  expect(row.recipient).toBe(bob.peerId); expect(JSON.parse(row.receipt).id).toBe(first.id);
});

test("receipt expiry remains a refusal tombstone beyond vendor prune and new capability", () => {
  const { f, a, sender, bob } = pair();
  const receipt = send(sender, bob.peerId, "expiry-key"); sender.close();
  f.advance(30 * 24 * 60 * 60 * 1000);
  const next = f.run(); f.bind(next.ref, "alice-native");
  const current = f.open(next.ref, "alice-native");
  const store = createMessageStore({ path: paths(a.ref).messages, now: f.timing.now });
  try { store.prune(f.timing.now()); } finally { store.close(); }
  expect(() => send(current, bob.peerId, "expiry-key")).toThrow("horizon expired");
  expect(receipt.expiresAt).toBe(f.timing.now());
});

test("reply validation preserves peer pair and conversation; normal reply inherits conversation", async () => {
  const { f, alice, bob, sender, receiver } = pair();
  const initial = send(sender, bob.peerId);
  const original = (await receiver.inbox()).messages[0]!;
  const reply = receiver.send({ action: "send", to: alice.peerId, body: "reply", requestKey: "reply", replyTo: initial.id });
  expect((await sender.inbox()).messages[0]).toMatchObject({ id: reply.id, conversationId: original.conversationId, replyTo: initial.id });
  expect(() => receiver.send({ action: "send", to: alice.peerId, body: "bad", requestKey: "bad-conversation", replyTo: initial.id, conversationId: "different" })).toThrow("conversationId");
  expect(() => receiver.send({ action: "send", to: alice.peerId, body: "bad", requestKey: "missing-ref", replyTo: "missing" })).toThrow("missing or expired");
  const c = f.run(), third = f.bind(c.ref, "third");
  expect(() => receiver.send({ action: "send", to: third.peerId, body: "bad", requestKey: "foreign-reply", replyTo: initial.id })).toThrow("between these peers");
});

test("body UTF-8 bytes, mailbox queue, inbox and output budgets are enforced without implicit ack", async () => {
  const { a, f, sender, receiver, bob } = pair();
  expect(() => send(sender, bob.peerId, "large", "é".repeat(8001))).toThrow("16000");
  const body = "\u0001".repeat(16000); // Worst-case JSON escaping exercises output budget.
  for (let i = 0; i < 11; i++) send(sender, bob.peerId, `bounded-${i}`, body);
  expect((await receiver.inbox()).messages).toHaveLength(5);
  const result = await receiver.inbox({ limit: 10 });
  expect(result.messages).toHaveLength(10); expect(result.unread).toBe(11);
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(1024 * 1024);
  await expect(receiver.inbox({ limit: 11 })).rejects.toThrow();
  // Seed only this fixture through the actual vendor service to reach pending1000.
  const store = createMessageStore({ path: paths(a.ref).messages, now: f.timing.now });
  try {
    const service = createMessageService({ store, now: f.timing.now });
    for (let i = 11; i < 1000; i++) service.send({ namespace: sender.identity.namespace, from: sender.identity.peerId, to: bob.peerId, body: "queue", requestKey: `seed-${i}` });
  } finally { store.close(); }
  expect(() => send(sender, bob.peerId, "queue-retry")).toThrow("full");
  receiver.ack({ ids: [result.messages[0]!.id] });
  const enqueued = send(sender, bob.peerId, "queue-retry");
  expect(send(sender, bob.peerId, "queue-retry").id).toBe(enqueued.id);
  expect((await receiver.inbox()).unread).toBe(1000);
});

test("bounded polling releases control lock, wakes on explicit message, times out, and aborts", async () => {
  const { sender, receiver, bob } = pair();
  await expect(receiver.inbox({ waitMs: 10_001 })).rejects.toThrow();
  await expect(receiver.inbox({ waitMs: -1 })).rejects.toThrow();
  const start = performance.now(), waiting = receiver.inbox({ waitMs: 1000 });
  const message = send(sender, bob.peerId, "poll-message");
  expect((await waiting).messages[0]!.id).toBe(message.id);
  expect(performance.now() - start).toBeLessThan(900);
  receiver.ack({ ids: [message.id] });
  expect(await receiver.inbox({ waitMs: 20 })).toEqual({ messages: [], unread: 0, timedOut: true });
  const abort = new AbortController(), cancelled = receiver.inbox({ waitMs: 10_000 }, abort.signal);
  abort.abort(); await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  const preaborted = new AbortController(); preaborted.abort();
  await expect(receiver.inbox({}, preaborted.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(receiver.peers().total).toBe(2); // Cancelling a wait does not release ownership.
});

test("close and release stop waits; each later poll revalidates lease and owner", async () => {
  const { f, a, sender, receiver } = pair();
  const closing = sender.inbox({ waitMs: 10_000 }); sender.close();
  await expect(closing).rejects.toMatchObject({ name: "AbortError" });
  expect(() => sender.heartbeat()).toThrow("closed");
  const releasing = receiver.inbox({ waitMs: 10_000 }); receiver.release();
  await expect(releasing).rejects.toMatchObject({ name: "AbortError" });
  const current = f.open(a.ref, "alice-native"), expired = current.inbox({ waitMs: 1000 });
  f.advance(60_000);
  await expect(expired).rejects.toThrow("stale");
});

test("a poll fences a generation change made by another helper between reads", async () => {
  const { f, a, sender } = pair();
  const waiting = sender.inbox({ waitMs: 1000 });
  const lifecycle = f.open(a.ref, "alice-native"); lifecycle.release();
  const rebound = f.bind(a.ref, "alice-native");
  expect(rebound.generation).toBe(1);
  await expect(waiting).rejects.toThrow("stale");
});

test("output budget refuses oversized preexisting vendor data without mutating ownership", () => {
  const { a, f, sender } = pair(), p = paths(a.ref);
  const store = createMessageStore({ path: p.messages, now: f.timing.now });
  try {
    createDirectory({ store, now: f.timing.now }).register({ namespace: sender.identity.namespace, peerId: "fixture-large-peer", name: "x".repeat(1024 * 1024), endpoint: { host: "fixture", sessionId: "fixture", generation: 0, target: {} } });
  } finally { store.close(); }
  expect(() => sender.peers()).toThrow("output exceeds 1 MiB");
  sender.heartbeat(); // Output refusal leaves the current binding usable.
});

test("default project isolation; only explicit private version1 group manifest permits shared bus", async () => {
  const f = fixture(), second = join(f.root, "worktree"); mkdirSync(second, { mode: 0o700 });
  const secondBinding = bindProjectRoot(second), a = f.run(), b = f.run({ projectBinding: secondBinding });
  const alice = f.bind(a.ref, "group-alice"), bob = f.bind(b.ref, "group-bob");
  const ah = f.open(a.ref, "group-alice");
  expect(alice.busId).not.toBe(bob.busId); expect(ah.peers().total).toBe(1);
  expect(() => send(ah, bob.peerId)).toThrow("unknown peer");
  expect(() => f.run({ groupId: "missing" })).toThrow();
  const groups = join(f.stateRoot, "relay/groups"); mkdirSync(groups, { recursive: true, mode: 0o700 });
  const manifest = join(groups, "team.json"), content = JSON.stringify({ version: 1, projects: [bindProjectRoot(f.project), secondBinding] });
  writeFileSync(manifest, content, { mode: 0o600 });
  const ga = f.run({ groupId: "team" }), gb = f.run({ groupId: "team", projectBinding: secondBinding });
  const gai = f.bind(ga.ref, "group-alice"), gbi = f.bind(gb.ref, "group-bob");
  expect(gai.busId).toBe(gbi.busId); expect(gai.namespace).toBe(gbi.namespace);
  const gah = f.open(ga.ref, "group-alice"), gbh = f.open(gb.ref, "group-bob");
  const receipt = send(gah, gbi.name); expect((await gbh.inbox()).messages[0]!.id).toBe(receipt.id);
  expect(ah.peers().total).toBe(1);
  writeFileSync(manifest, content + "\n");
  for (const op of [() => gah.peers(), () => gah.heartbeat(), () => gah.release(), () => send(gah, gbi.peerId), () => gah.ack({ ids: [] })]) expect(op).toThrow("binding changed");
  await expect(gah.inbox()).rejects.toThrow("binding changed");
  expect(() => f.open(ga.ref, "group-alice")).toThrow("binding changed");
});

test("group refuses unsafe IDs, unlisted/replaced projects and nonprivate or extended manifests", () => {
  const f = fixture(), groups = join(f.stateRoot, "relay/groups"); mkdirSync(groups, { recursive: true, mode: 0o700 });
  for (const groupId of ["../escape", "a/b", "", "x".repeat(65)]) expect(() => f.run({ groupId })).toThrow("group ID");
  const manifest = join(groups, "team.json"), project = bindProjectRoot(f.project);
  for (const content of [{ version: 2, projects: [project] }, { version: 1, projects: [project], extra: true }, { version: 1, projects: [] }, { version: 1, projects: [project, project] }]) {
    writeFileSync(manifest, JSON.stringify(content), { mode: 0o600 });
    expect(() => f.run({ groupId: "team" })).toThrow();
  }
  const elsewhere = join(f.root, "elsewhere"); mkdirSync(elsewhere, { mode: 0o700 });
  writeFileSync(manifest, JSON.stringify({ version: 1, projects: [bindProjectRoot(elsewhere)] }));
  expect(() => f.run({ groupId: "team" })).toThrow("not listed");
  writeFileSync(manifest, JSON.stringify({ version: 1, projects: [project] })); chmodSync(manifest, 0o644);
  expect(() => f.run({ groupId: "team" })).toThrow("private regular file");
});

test("project path replacement refuses both stale binding and fresh adoption of old mailbox", () => {
  const { f, a, sender } = pair();
  renameSync(f.project, f.project + "-old"); mkdirSync(f.project, { mode: 0o700 });
  expect(() => sender.peers()).toThrow("PROJECT_DIRECTORY_CHANGED");
  expect(() => f.open(a.ref, "alice-native")).toThrow("PROJECT_DIRECTORY_CHANGED");
  expect(() => f.run()).toThrow("directory was replaced");
});

test("unsafe HOME, state, run, reference and database paths fail before mailbox mutation", () => {
  const f = fixture(), valid = f.run();
  const invoke = (overrides: Partial<WorkspaceRelayRunOptions>) => provisionWorkspaceRelayRun({ ...valid.options, ...overrides }, f.timing);
  expect(() => invoke({ stateRoot: "/tmp/not-owned-relay-state" })).toThrow("home");
  expect(() => invoke({ stateRoot: join(f.project, "state") })).toThrow("outside");
  expect(() => invoke({ stateRoot: join(f.installRoot, "state") })).toThrow("outside");
  expect(() => invoke({ runRoot: f.root })).toThrow("stateRoot/runs");
  expect(() => invoke({ runRoot: join(f.stateRoot, "runs") })).toThrow("stateRoot/runs");
  chmodSync(f.stateRoot, 0o777); expect(() => invoke({})).toThrow("shared write"); chmodSync(f.stateRoot, 0o700);
  const linked = join(f.stateRoot, "runs/linked"); symlinkSync(valid.options.runRoot, linked);
  expect(() => invoke({ runRoot: linked })).toThrow("owned directories");
  chmodSync(valid.options.runRoot, 0o755); expect(() => invoke({})).toThrow("0700"); chmodSync(valid.options.runRoot, 0o700);
  f.bind(valid.ref, "private-native"); const helper = f.open(valid.ref, "private-native"), p = paths(valid.ref);
  chmodSync(valid.ref, 0o644); expect(() => helper.heartbeat()).toThrow("private regular file"); chmodSync(valid.ref, 0o600);
  const hardlink = valid.ref + ".hard"; linkSync(valid.ref, hardlink);
  expect(() => f.open(valid.ref, "private-native")).toThrow("private regular file"); rmSync(hardlink);
  helper.close();
  writeFileSync(p.messages + "-journal", "unsafe", { mode: 0o644 });
  expect(() => f.open(valid.ref, "private-native")).toThrow("private owned regular files"); rmSync(p.messages + "-journal");
  renameSync(p.control, p.control + ".old"); symlinkSync(p.control + ".old", p.control);
  expect(() => f.open(valid.ref, "private-native")).toThrow("private owned regular files");
});

test("opening never registers, rebinds or releases; endpoint and capability tampering are fenced", () => {
  const f = fixture(), a = f.run();
  expect(() => f.open(a.ref, "never-bound")).toThrow();
  const id = f.bind(a.ref, "native"), helper = f.open(a.ref, "native"), p = paths(a.ref);
  const store = createMessageStore({ path: p.messages, now: f.timing.now });
  try {
    const directory = createDirectory({ store, now: f.timing.now });
    directory.rebind({ namespace: id.namespace, peerId: id.peerId, expectedGeneration: 0, endpoint: { host: "lab-workspace", sessionId: "native", generation: 1, target: { binding: "unexpected" } } });
  } finally { store.close(); }
  expect(() => helper.heartbeat()).toThrow("generation changed");
  expect(() => helper.release()).toThrow("generation changed");
  expect(() => f.open(a.ref, "native")).toThrow("generation changed");
  const raw = readFileSync(a.ref, "utf8"), ref = JSON.parse(raw); ref.capability = "0".repeat(64); writeFileSync(a.ref, JSON.stringify(ref));
  expect(() => helper.peers()).toThrow("reference changed");
  expect(() => f.open(a.ref, "native")).toThrow("capability is not active");
});

test("provisioning intent recovers before reference publication and before ready commit", () => {
  const f = fixture(), a = f.run(), p = paths(a.ref);
  const original = readFileSync(a.ref, "utf8");
  sql(p.control, db => db.query("UPDATE runs SET phase='provisioning'").run()); rmSync(a.ref);
  expect(provisionWorkspaceRelayRun(a.options, f.timing)).toBe(a.ref);
  expect(readFileSync(a.ref, "utf8")).toBe(original);
  sql(p.control, db => db.query("UPDATE runs SET phase='provisioning'").run());
  expect(provisionWorkspaceRelayRun(a.options, f.timing)).toBe(a.ref);
  expect(f.bind(a.ref, "recovered").generation).toBe(0);
});

test("registration intent recovery matches exact ID/name/endpoint on either side of vendor commit", () => {
  const f = fixture(), a = f.run(), first = f.bind(a.ref, "register-crash"), p = paths(a.ref);
  // Crash snapshot before vendor registration: durable control intent, no peer.
  sql(p.control, db => db.query("UPDATE sessions SET phase='intent'").run());
  sql(p.messages, db => db.query("DELETE FROM peers").run());
  expect(f.bind(a.ref, "register-crash")).toEqual(first);
  // Snapshot after vendor registration, before control activation.
  sql(p.control, db => db.query("UPDATE sessions SET phase='intent'").run());
  expect(f.bind(a.ref, "register-crash")).toEqual(first);
  // An alias match by itself must never be adopted as the intended peer.
  sql(p.control, db => db.query("UPDATE sessions SET phase='intent',peer_id='wrong-id'").run());
  expect(() => f.bind(a.ref, "register-crash")).toThrow("registration cannot rebind");
});

test("rebind intent recovers before/after CAS without advancing generation twice", () => {
  const f = fixture(), a = f.run(), initial = f.bind(a.ref, "rebind-crash"), p = paths(a.ref);
  f.open(a.ref, "rebind-crash").release();
  const b = f.run(), bRef = paths(b.ref).ref, owner = createHash("sha256").update(bRef.capability).digest("hex");
  const previous = sql(p.control, db => db.query("SELECT endpoint FROM sessions").get()) as { endpoint: string };
  const endpoint = { host: "lab-workspace", sessionId: "rebind-crash", generation: 1, target: { binding: "crash-intended" } };
  sql(p.control, db => {
    db.query("UPDATE sessions SET owner=?,phase='intent',generation=1,lease_until=?,endpoint=?,previous_endpoint=?").run(owner, f.timing.now() + 60_000, JSON.stringify(endpoint), previous.endpoint);
    db.query("UPDATE runs SET session_id='rebind-crash' WHERE id=?").run(owner);
  });
  const recovered = f.bind(b.ref, "rebind-crash");
  expect(recovered.peerId).toBe(initial.peerId); expect(recovered.generation).toBe(1);
  sql(p.control, db => db.query("UPDATE sessions SET phase='intent'").run());
  expect(f.bind(b.ref, "rebind-crash")).toEqual(recovered);
  expect(f.open(b.ref, "rebind-crash").identity).toEqual(recovered);
});

test("expired abandoned intent completes exact pending generation before a new owner advances", () => {
  const f = fixture(), a = f.run(), initial = f.bind(a.ref, "abandoned"), p = paths(a.ref);
  sql(p.control, db => db.query("UPDATE sessions SET phase='intent'").run());
  sql(p.messages, db => db.query("DELETE FROM peers").run());
  f.advance(60_000); const b = f.run(), recovered = f.bind(b.ref, "abandoned");
  expect(recovered.peerId).toBe(initial.peerId); expect(recovered.generation).toBe(1);
});

test("process restart after a discarded send response recovers the same durable receipt", async () => {
  const { f, a, bob, sender, receiver } = pair(); sender.close();
  const script = join(f.root, "lost-response.ts"), config = join(f.root, "lost-response.json");
  writeFileSync(config, JSON.stringify({ ref: a.ref, to: bob.peerId }), { mode: 0o600 });
  const module = new URL("../src/relay/workspace.ts", import.meta.url).pathname;
  writeFileSync(script, `import { readFileSync } from 'node:fs';
import { openBoundWorkspaceRelay } from ${JSON.stringify(module)};
const { ref, to } = JSON.parse(readFileSync(new URL('./lost-response.json', import.meta.url), 'utf8'));
const h = openBoundWorkspaceRelay(ref, 'alice-native', { now: () => ${f.timing.now()} });
h.send({ action: 'send', to, body: 'discarded response', requestKey: 'process-restart' });
// Deliberately exit without returning the receipt or running helper cleanup.
process.exit(0);
`, { mode: 0o600 });
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", script], { stdout: "pipe", stderr: "pipe", env: { HOME: homedir(), PATH: "/usr/bin:/bin" } });
  expect(await child.exited).toBe(0);
  expect(await new Response(child.stdout).text()).toBe(""); expect(await new Response(child.stderr).text()).toBe("");
  const retry = send(f.open(a.ref, "alice-native"), bob.peerId, "process-restart", "discarded response");
  expect(retry.duplicate).toBe(true);
  expect((await receiver.inbox()).messages.map(m => m.id)).toEqual([retry.id]);
});

test("two processes competing for one native session serialize to exactly one owner", async () => {
  const f = fixture(), a = f.run(), b = f.run();
  const script = join(f.root, "compete.ts"), module = new URL("../src/relay/workspace.ts", import.meta.url).pathname;
  // Capability paths are private fixture files read inside the child, never argv/output.
  const config = join(f.root, "competition.json"); writeFileSync(config, JSON.stringify({ refs: [a.ref, b.ref] }), { mode: 0o600 });
  writeFileSync(script, `import { readFileSync } from 'node:fs';
import { bindWorkspaceRelaySession } from ${JSON.stringify(module)};
const { refs } = JSON.parse(readFileSync(new URL('./competition.json', import.meta.url), 'utf8'));
try { bindWorkspaceRelaySession(refs[Number(process.argv[2])], 'competing-native', { now: () => ${f.timing.now()} }); process.stdout.write('bound'); }
catch { process.stdout.write('refused'); }
`, { mode: 0o600 });
  const children = [0, 1].map(index => Bun.spawn([process.execPath, "--no-env-file", "--no-install", script, String(index)], { stdout: "pipe", stderr: "pipe", env: { HOME: homedir(), PATH: "/usr/bin:/bin" } }));
  const results = await Promise.all(children.map(async child => ({ exit: await child.exited, out: await new Response(child.stdout).text(), err: await new Response(child.stderr).text() })));
  expect(results.map(r => r.exit)).toEqual([0, 0]); expect(results.map(r => r.err)).toEqual(["", ""]);
  expect(results.map(r => r.out).sort()).toEqual(["bound", "refused"]);
  const owner = sql(paths(a.ref).control, db => db.query("SELECT phase,generation FROM sessions").all());
  expect(owner).toEqual([{ phase: "active", generation: 0 }]);
});
