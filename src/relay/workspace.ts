/** Same-user identity fence for the built-in, message-only Relay bus.
 * Lock order is always control IMMEDIATE -> Relay. No host work runs under a lock.
 * The host owns the 15s heartbeat timer; leases last 60s. This is not an OS sandbox.
 */
import { Database } from "bun:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, rmSync, writeFileSync, type Stats } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { verifyProjectBinding, type ProjectBinding } from "../project.ts";
import { readPrivate, workspaceStateRoot } from "../pi/workspace-config.ts";
import { createMessageStore } from "../../vendor/relay/src/storage/store.ts";
import { publishNoReplace } from "../../vendor/relay/src/storage/publish.ts";
import { createMessageService } from "../../vendor/relay/src/messages/service.ts";
import { createDirectory, resolvePeer } from "../../vendor/relay/src/directory/index.ts";
import { MessageError, type Endpoint, type Envelope, type MessageStore, type Receipt } from "../../vendor/relay/src/messages/contracts.ts";

export type { ProjectBinding, Envelope, Receipt };
export type WorkspaceRelayRunOptions = {
  stateRoot: string; installRoot: string; projectBinding: ProjectBinding; runRoot: string; groupId?: string;
};
export type RelayIdentity = { busId: string; namespace: string; peerId: string; name: string; generation: number };
export type RelayRequest =
  | { action: "peers"; limit?: number; offset?: number }
  | { action: "send"; to: string; body: string; requestKey: string; conversationId?: string; replyTo?: string }
  | { action: "inbox"; limit?: number; waitMs?: number }
  | { action: "ack"; ids: string[] };
export type WorkspaceRelayClock = { now?: () => number };
export interface BoundWorkspaceRelay {
  readonly identity: RelayIdentity;
  peers(input?: { limit?: number; offset?: number }): {
    peers: { id: string; name: string; presence: string; lastSeenAt: number; self: boolean }[];
    total: number; nextOffset?: number;
  };
  send(input: Extract<RelayRequest, { action: "send" }>): Receipt;
  inbox(input?: { limit?: number; waitMs?: number }, signal?: AbortSignal): Promise<{
    messages: Envelope[]; unread: number; timedOut: boolean;
  }>;
  ack(input: { ids: string[] }): { acknowledged: number; ignored: number };
  heartbeat(): void;
  release(): void;
  close(): void;
}

const LEASE_MS = 60_000, HORIZON_MS = 30 * 24 * 60 * 60 * 1000;
const CONTROL_APP = 0x4c525931;
const SCHEMA = [
  "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  "CREATE TABLE projects (root TEXT PRIMARY KEY, device INTEGER NOT NULL, inode INTEGER NOT NULL)",
  "CREATE TABLE runs (id TEXT PRIMARY KEY, run_root TEXT NOT NULL UNIQUE, ref_path TEXT NOT NULL UNIQUE, reference TEXT NOT NULL, phase TEXT NOT NULL, session_id TEXT)",
  "CREATE TABLE sessions (namespace TEXT NOT NULL, session_id TEXT NOT NULL, peer_id TEXT NOT NULL, name TEXT NOT NULL, generation INTEGER NOT NULL, owner TEXT NOT NULL, phase TEXT NOT NULL, lease_until INTEGER NOT NULL, endpoint TEXT NOT NULL, previous_endpoint TEXT, PRIMARY KEY(namespace,session_id), UNIQUE(namespace,peer_id))",
  "CREATE TABLE outbound (namespace TEXT NOT NULL, session_id TEXT NOT NULL, request_key TEXT NOT NULL, request TEXT NOT NULL, recipient TEXT NOT NULL, fingerprint TEXT NOT NULL, started_at INTEGER NOT NULL, receipt TEXT, PRIMARY KEY(namespace,session_id,request_key))",
];
type RunReference = WorkspaceRelayRunOptions & { version: 1; capability: string; busId: string; namespace: string; busRoot: string; groupDigest?: string };
type RunRow = { id: string; run_root: string; ref_path: string; reference: string; phase: string; session_id: string | null };
type SessionRow = { namespace: string; session_id: string; peer_id: string; name: string; generation: number; owner: string; phase: string; lease_until: number; endpoint: string; previous_endpoint: string | null };
type OutboundRow = { request: string; recipient: string; fingerprint: string; started_at: number; receipt: string | null };
function fail(detail: string): never { throw new MessageError("invalid", detail); }
function conflict(detail: string): never { throw new MessageError("conflict", detail); }
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const child = (path: string, parent: string) => path.startsWith(parent + sep);
function clock(now: () => number): number {
  const time = now();
  if (!Number.isSafeInteger(time) || time < 0 || !Number.isSafeInteger(time + HORIZON_MS)) fail("Invalid Relay clock");
  return time;
}
function record(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key => typeof key !== "string" || !keys.includes(key))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(descriptor => !Object.hasOwn(descriptor, "value"))) fail("Unknown or invalid Relay request field");
  let encoded: string;
  try { encoded = JSON.stringify(value); } catch { return fail("Invalid Relay request"); }
  if (Buffer.byteLength(encoded, "utf8") > 128 * 1024) fail("Relay input exceeds 128 KiB");
}
function address(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value || value.length > 128 || value.trim() !== value || /[\x00-\x1f\x7f]/.test(value)) fail(`Invalid Relay ${label} (maximum 128 characters)`);
}
function integer(value: unknown, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) fail(`Invalid Relay ${label}`);
  return value as number;
}
function output<T>(value: T): T {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 1024 * 1024) fail("Relay output exceeds 1 MiB");
  return value;
}

/** Guard existing paths before opening, never repair shared or linked state. */
function privateTree(path: string, create = false): void {
  const home = resolve(homedir());
  if (!isAbsolute(path) || resolve(path) !== path || !child(path, home)) fail("Relay private path must be beneath this user's HOME");
  const parts: string[] = [];
  for (let cursor = path; cursor !== home; cursor = dirname(cursor)) parts.push(cursor);
  // Also reject symlink ancestors above HOME without imposing private mode on /Users.
  for (let cursor = home;; cursor = dirname(cursor)) {
    const st = lstatSync(cursor);
    if (!st.isDirectory() || st.isSymbolicLink() || (cursor === home && st.uid !== process.getuid?.())) fail("Relay private path has a linked or unowned HOME ancestor");
    if (dirname(cursor) === cursor) break;
  }
  for (const cursor of parts.reverse()) {
    let st = lstatSync(cursor, { throwIfNoEntry: false });
    if (!st && create) {
      try { mkdirSync(cursor, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      st = lstatSync(cursor);
    }
    if (!st || !st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid?.() || (st.mode & 0o022)) fail("Relay requires owned directories without shared write access");
  }
  if ((lstatSync(path).mode & 0o077) !== 0) fail("Relay state directory must be private (0700)");
}
function privateFile(path: string, optional = false): Stats | undefined {
  const st = lstatSync(path, { throwIfNoEntry: false });
  if (!st && optional) return undefined;
  if (!st || !st.isFile() || st.isSymbolicLink() || st.uid !== process.getuid?.() || st.nlink !== 1 || (st.mode & 0o077)) fail("Relay requires private owned regular files (0600)");
  return st;
}
function databaseFiles(path: string, optional = false): void {
  privateTree(dirname(path)); privateFile(path, optional);
  for (const suffix of ["-wal", "-shm", "-journal"]) privateFile(path + suffix, true);
}
function syncFile(path: string, text: string): void {
  const temporary = `${path}.${randomUUID()}`;
  try {
    const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
    if (!publishNoReplace(temporary, path)) conflict("Relay reference publication conflict");
    const parent = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { fsyncSync(parent); } finally { closeSync(parent); }
  } finally { rmSync(temporary, { force: true }); }
}
function controlDatabase(path: string): Database {
  databaseFiles(path, true);
  try { closeSync(openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  databaseFiles(path);
  const db = new Database(path, { create: false, strict: true });
  try {
    db.exec("PRAGMA busy_timeout=1000; PRAGMA synchronous=FULL");
    db.transaction(() => {
      const app = (db.query("PRAGMA application_id").get() as { application_id: number }).application_id;
      const version = (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
      const schema = () => (db.query("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { sql: string }[]).map(row => row.sql);
      if (app === 0 && version === 0 && schema().length === 0) {
        for (const sql of SCHEMA) db.exec(sql);
        db.exec(`PRAGMA application_id=${CONTROL_APP}; PRAGMA user_version=1`);
      } else if (app !== CONTROL_APP || version !== 1) fail("Unknown Relay control database");
      if (!same(schema(), [...SCHEMA].sort((a, b) => a.split(" ")[2].localeCompare(b.split(" ")[2])))) fail("Unknown Relay control schema");
    }).immediate();
    db.exec("PRAGMA journal_mode=WAL");
    return db;
  } catch (error) { db.close(true); throw error; }
}
function selectScope(options: WorkspaceRelayRunOptions): Pick<RunReference, "busId" | "namespace" | "busRoot" | "groupDigest"> {
  const project = verifyProjectBinding(options.projectBinding);
  const key = hash(JSON.stringify(["workspace-relay-project-v1", project.root]));
  if (options.groupId === undefined) return { busId: `project-v1-${key}`, namespace: `lab-project-v1-${key}`, busRoot: join(options.stateRoot, "relay/projects", key) };
  if (typeof options.groupId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(options.groupId)) fail("Invalid Relay group ID");
  const manifestPath = join(options.stateRoot, "relay/groups", `${options.groupId}.json`);
  privateTree(dirname(manifestPath));
  const raw = readPrivate(manifestPath), manifest = JSON.parse(raw);
  record(manifest, ["version", "projects"]);
  if (manifest.version !== 1 || !Array.isArray(manifest.projects) || !manifest.projects.length) fail("Relay group requires version 1 and explicit projects");
  const roots = new Set<string>();
  for (const binding of manifest.projects) {
    const verified = verifyProjectBinding(binding);
    if (roots.has(verified.root)) fail("Duplicate Relay group project");
    roots.add(verified.root);
  }
  if (!manifest.projects.some((binding: ProjectBinding) => binding.root === project.root && binding.device === project.device && binding.inode === project.inode)) fail("Project is not listed in Relay group");
  const groupDigest = hash(raw);
  return { busId: `group-v1-${options.groupId}`, namespace: `lab-group-v1-${groupDigest}`, busRoot: join(options.stateRoot, "relay/groups", options.groupId), groupDigest };
}
function validateOptions(options: WorkspaceRelayRunOptions, create = false): void {
  if (!isAbsolute(options.stateRoot) || resolve(options.stateRoot) !== options.stateRoot || !isAbsolute(options.installRoot)) fail("Relay requires explicit absolute state/install roots");
  verifyProjectBinding(options.projectBinding);
  if (create) workspaceStateRoot(options.installRoot, options.stateRoot, options.projectBinding.root);
  privateTree(options.stateRoot);
  for (const excluded of [resolve(options.installRoot), options.projectBinding.root]) {
    if (options.stateRoot === excluded || child(options.stateRoot, excluded) || child(excluded, options.stateRoot)) fail("Relay state must be separate from installation/project");
  }
  if (!isAbsolute(options.runRoot) || resolve(options.runRoot) !== options.runRoot || !child(options.runRoot, join(options.stateRoot, "runs"))) fail("Relay run must be a private child of stateRoot/runs");
  privateTree(join(options.stateRoot, "runs")); privateTree(options.runRoot);
}
function checkScope(ref: RunReference): void {
  validateOptions(ref);
  const current = selectScope(ref);
  for (const key of ["busId", "namespace", "busRoot", "groupDigest"] as const) if (current[key] !== ref[key]) conflict("Relay project/group binding changed");
  privateTree(ref.busRoot);
}
function projectRecord(db: Database, project: ProjectBinding): void {
  const prior = db.query("SELECT device,inode FROM projects WHERE root=?").get(project.root) as { device: number; inode: number } | null;
  if (prior && (prior.device !== project.device || prior.inode !== project.inode)) conflict("Relay project directory was replaced");
  if (!prior) db.query("INSERT INTO projects VALUES (?,?,?)").run(project.root, project.device, project.inode);
}
function busRecord(db: Database, busId: string): void {
  const existing = db.query("SELECT value FROM meta WHERE key='bus'").get() as { value: string } | null;
  if (existing && existing.value !== busId) conflict("Relay control database belongs to a different bus");
  if (!existing) db.query("INSERT INTO meta VALUES ('bus',?)").run(busId);
}
/** Filesystem/JSON errors can include the capability path or file contents.
 * Discard the original error entirely, including its cause and extra fields.
 */
function privateReference<T>(fn: () => T): T {
  try { return fn(); }
  catch { throw new MessageError("invalid", "Invalid private Relay run reference"); }
}
function assertReference(path: string, expected: string): void {
  privateReference(() => {
    privateTree(dirname(path));
    if (readPrivate(path) !== expected) fail("Invalid private Relay run reference");
  });
}
function readReference(path: string): RunReference {
  return privateReference(() => {
    if (!isAbsolute(path) || resolve(path) !== path) fail("Invalid private Relay run reference");
    privateTree(dirname(path));
    const ref = JSON.parse(readPrivate(path)) as RunReference;
    record(ref, ["stateRoot", "installRoot", "projectBinding", "runRoot", "groupId", "version", "capability", "busId", "namespace", "busRoot", "groupDigest"]);
    if (ref.version !== 1 || typeof ref.capability !== "string" || !/^[a-f0-9]{64}$/.test(ref.capability) || dirname(path) !== ref.runRoot) fail("Invalid private Relay run reference");
    checkScope(ref);
    return ref;
  });
}

/** Durable provisioning intent precedes publishing the private reference. */
export function provisionWorkspaceRelayRun(options: WorkspaceRelayRunOptions, timing: WorkspaceRelayClock = {}): string {
  record(options, ["stateRoot", "installRoot", "projectBinding", "runRoot", "groupId"]);
  clock(timing.now ?? Date.now); validateOptions(options, true);
  const scope = selectScope(options); privateTree(scope.busRoot, true);
  const db = controlDatabase(join(scope.busRoot, "control.sqlite"));
  try {
    const run = db.transaction(() => {
      busRecord(db, scope.busId);
      projectRecord(db, options.projectBinding);
      const existing = db.query("SELECT * FROM runs WHERE run_root=?").get(options.runRoot) as RunRow | null;
      if (existing) {
        const ref = privateReference(() => JSON.parse(existing.reference)) as RunReference;
        if (ref.stateRoot !== options.stateRoot || ref.installRoot !== options.installRoot || ref.runRoot !== options.runRoot || ref.groupId !== options.groupId
          || ref.projectBinding.root !== options.projectBinding.root || ref.projectBinding.device !== options.projectBinding.device || ref.projectBinding.inode !== options.projectBinding.inode
          || !same(selectScope(ref), scope)) conflict("Relay run provisioning conflict");
        return existing;
      }
      const ref: RunReference = { ...options, ...scope, version: 1, capability: randomBytes(32).toString("hex") };
      const path = join(options.runRoot, `relay-${randomUUID()}.json`), reference = JSON.stringify(ref);
      const id = hash(ref.capability);
      db.query("INSERT INTO runs VALUES (?,?,?,?,?,NULL)").run(id, options.runRoot, path, reference, "provisioning");
      return { id, run_root: options.runRoot, ref_path: path, reference, phase: "provisioning", session_id: null };
    }).immediate();
    // The stored exact reference recovers a crash before/after this publication.
    db.transaction(() => {
      privateReference(() => {
        const st = privateFile(run.ref_path, true);
        if (st) assertReference(run.ref_path, run.reference);
        else syncFile(run.ref_path, run.reference);
      });
      db.query("UPDATE runs SET phase='ready' WHERE id=?").run(run.id);
    }).immediate();
    return run.ref_path;
  } finally { db.close(true); }
}

class Handles {
  readonly db: Database;
  readonly store: MessageStore;
  readonly directory: ReturnType<typeof createDirectory>;
  readonly service: ReturnType<typeof createMessageService>;
  readonly owner: string;
  readonly controlPath: string;
  readonly messagePath: string;
  private readonly files: { path: string; dev: number; ino: number }[];
  private closed = false;
  private operationTime: number | undefined;
  constructor(readonly refPath: string, readonly ref: RunReference, readonly now: () => number, createRelay = false) {
    this.owner = hash(ref.capability);
    this.controlPath = join(ref.busRoot, "control.sqlite"); this.messagePath = join(ref.busRoot, "messages.sqlite");
    databaseFiles(this.controlPath);
    this.db = controlDatabase(this.controlPath);
    try {
      // Opening a helper cannot create/register a missing vendor database.
      databaseFiles(this.messagePath, createRelay);
      // Vendor expiry checks and timestamps must share the adapter's sample.
      // Independent clock reads can expire a retry between journal check and
      // vendor receipt lookup, silently enqueueing a second message.
      const operationNow = () => this.operationTime ?? fail("Relay operation requires a control transaction");
      this.store = createMessageStore({ path: this.messagePath, now: operationNow });
      this.directory = createDirectory({ store: this.store, now: operationNow });
      this.service = createMessageService({ store: this.store, now: operationNow, maxPending: 1000, maxBodyBytes: 16000 });
      this.files = [this.controlPath, this.messagePath].map(path => { const st = privateFile(path)!; return { path, dev: st.dev, ino: st.ino }; });
    } catch (error) { this.db.close(true); throw error; }
  }
  lock<T>(fn: (time: number, run: RunRow) => T): T {
    if (this.closed) fail("Relay helper is closed");
    return this.db.transaction(() => {
      checkScope(this.ref);
      assertReference(this.refPath, JSON.stringify(this.ref));
      for (const file of this.files) {
        databaseFiles(file.path); const st = privateFile(file.path)!;
        if (st.dev !== file.dev || st.ino !== file.ino) conflict("Relay database changed");
      }
      const run = this.db.query("SELECT * FROM runs WHERE id=?").get(this.owner) as RunRow | null;
      if (!run || run.phase !== "ready" || run.ref_path !== this.refPath || run.reference !== JSON.stringify(this.ref)) conflict("Relay capability is not active");
      busRecord(this.db, this.ref.busId);
      projectRecord(this.db, this.ref.projectBinding);
      const time = clock(this.now);
      this.operationTime = time;
      try { return fn(time, run); }
      finally { this.operationTime = undefined; }
    }).immediate();
  }
  session(sessionId: string): SessionRow | null {
    return this.db.query("SELECT * FROM sessions WHERE namespace=? AND session_id=?").get(this.ref.namespace, sessionId) as SessionRow | null;
  }
  /** Exact endpoint match recovers the two-database commit gap, never alias adoption. */
  finish(row: SessionRow): void {
    const endpoint = JSON.parse(row.endpoint) as Endpoint;
    let peer = this.store.getPeer(row.namespace, row.peer_id);
    if (!peer && row.previous_endpoint === null) peer = this.directory.register({ namespace: row.namespace, peerId: row.peer_id, name: row.name, endpoint });
    else if (peer && !same(peer.endpoint, endpoint) && row.previous_endpoint !== null && same(peer.endpoint, JSON.parse(row.previous_endpoint))) {
      peer = this.directory.rebind({ namespace: row.namespace, peerId: row.peer_id, expectedGeneration: row.generation - 1, endpoint });
    }
    if (!peer || peer.id !== row.peer_id || peer.name !== row.name || !same(peer.endpoint, endpoint)) conflict("Relay registration intent does not match endpoint");
    this.directory.setPresence(row.namespace, row.peer_id, "online");
    this.db.query("UPDATE sessions SET phase='active' WHERE namespace=? AND session_id=?").run(row.namespace, row.session_id);
  }
  fence(sessionId: string, generation: number, time: number, run: RunRow): SessionRow {
    const row = this.session(sessionId);
    if (run.session_id !== sessionId || !row || row.owner !== this.owner || row.phase !== "active" || row.lease_until <= time || row.generation !== generation) conflict("Relay owner/lease/generation is stale");
    const peer = this.store.getPeer(row.namespace, row.peer_id);
    if (!peer || peer.name !== row.name || !same(peer.endpoint, JSON.parse(row.endpoint))) conflict("Relay endpoint generation changed");
    return row;
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.store.close(); } finally { this.db.close(true); }
  }
}
function identity(ref: RunReference, row: SessionRow): RelayIdentity {
  return Object.freeze({ busId: ref.busId, namespace: row.namespace, peerId: row.peer_id, name: row.name, generation: row.generation });
}

export function bindWorkspaceRelaySession(runRef: string, sessionId: string, timing: WorkspaceRelayClock = {}): RelayIdentity {
  address(sessionId, "native session ID");
  const ref = readReference(runRef), handles = new Handles(runRef, ref, timing.now ?? Date.now, true);
  try {
    handles.lock((time, run) => {
      if (run.session_id && run.session_id !== sessionId) {
        const prior = handles.session(run.session_id);
        if (prior && prior.owner === handles.owner && prior.phase !== "released") conflict("Release the previous Relay session before switching");
      }
      let row = handles.session(sessionId);
      if (row?.owner === handles.owner && row.phase !== "released") {
        if (row.lease_until <= time) conflict("Expired Relay ownership requires a new run capability");
        if (row.phase === "active") handles.fence(sessionId, row.generation, time, run);
        return; // Same active session and pending bind retries are idempotent.
      }
      if (row && row.phase !== "released" && row.lease_until > time) conflict("Relay session already has a live owner");
      // Finish an abandoned intent exactly before advancing its generation.
      if (row?.phase === "intent") { handles.finish(row); row = handles.session(sessionId)!; }
      const peerId = row?.peer_id ?? `pi-${hash(JSON.stringify([ref.namespace, sessionId]))}`;
      const readable = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 24) || "session";
      const name = row?.name ?? `${readable(basename(ref.projectBinding.root))}/${readable(sessionId)}-${randomBytes(6).toString("hex")}`;
      const generation = row ? row.generation + 1 : 0;
      if (!Number.isSafeInteger(generation)) conflict("Relay generation exhausted");
      const endpoint: Endpoint = { host: "lab-workspace", sessionId, generation, target: { binding: randomUUID() } };
      handles.db.query("INSERT OR REPLACE INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?)").run(ref.namespace, sessionId, peerId, name, generation, handles.owner, "intent", time + LEASE_MS, JSON.stringify(endpoint), row?.endpoint ?? null);
      handles.db.query("UPDATE runs SET session_id=? WHERE id=?").run(sessionId, handles.owner);
    }); // Durable intent commits before touching vendor registration/rebind.
    return handles.lock((time, run) => {
      const row = handles.session(sessionId);
      if (!row || run.session_id !== sessionId || row.owner !== handles.owner || row.lease_until <= time || !["intent", "active"].includes(row.phase)) conflict("Relay bind ownership changed");
      if (row.phase === "intent") handles.finish(row);
      handles.fence(sessionId, row.generation, time, run);
      return identity(ref, row);
    });
  } finally { handles.close(); }
}

export function openBoundWorkspaceRelay(runRef: string, sessionId: string, options: WorkspaceRelayClock = {}): BoundWorkspaceRelay {
  address(sessionId, "native session ID");
  const ref = readReference(runRef), h = new Handles(runRef, ref, options.now ?? Date.now);
  let bound: RelayIdentity;
  try {
    bound = h.lock((time, run) => {
      const row = h.session(sessionId);
      if (!row) conflict("Relay session is not bound");
      h.fence(sessionId, row.generation, time, run);
      return identity(ref, row);
    });
  } catch (error) { h.close(); throw error; }
  const waiters = new Set<AbortController>();
  const locked = <T>(fn: (time: number, row: SessionRow) => T): T => h.lock((time, run) => fn(time, h.fence(sessionId, bound.generation, time, run)));
  const stopWaits = () => { for (const waiter of waiters) waiter.abort(); };
  return {
    identity: bound,
    peers(input = {}) {
      record(input, ["limit", "offset"]);
      const limit = integer(input.limit, 20, 1, 50, "peer limit"), offset = integer(input.offset, 0, 0, Number.MAX_SAFE_INTEGER, "peer offset");
      return locked(time => {
        const peers = h.store.listPeers(ref.namespace), total = peers.length;
        return output({ peers: peers.slice(offset, offset + limit).map(peer => {
          const owner = h.db.query("SELECT phase,lease_until FROM sessions WHERE namespace=? AND peer_id=?").get(ref.namespace, peer.id) as { phase: string; lease_until: number } | null;
          return { id: peer.id, name: peer.name, presence: owner?.phase === "active" && owner.lease_until > time ? peer.presence : "offline", lastSeenAt: peer.lastSeenAt, self: peer.id === bound.peerId };
        }), total, ...(offset < total - limit ? { nextOffset: offset + limit } : {}) });
      });
    },
    send(input) {
      record(input, ["action", "to", "body", "requestKey", "conversationId", "replyTo"]);
      if (input.action !== "send") fail("Invalid Relay send action");
      address(input.to, "recipient"); address(input.requestKey, "request key");
      for (const field of ["conversationId", "replyTo"] as const) if (input[field] !== undefined) address(input[field], field);
      if (typeof input.body !== "string" || Buffer.byteLength(input.body, "utf8") > 16000) fail("Relay body exceeds 16000 UTF-8 bytes or is invalid");
      const request = JSON.stringify({ to: input.to, body: input.body, conversationId: input.conversationId ?? null, replyTo: input.replyTo ?? null });
      const fingerprint = (recipient: string) => hash(JSON.stringify({ namespace: ref.namespace, from: bound.peerId, to: recipient, body: input.body, conversationId: input.conversationId ?? null, replyTo: input.replyTo ?? null }));
      const journal = () => h.db.query("SELECT request,recipient,fingerprint,started_at,receipt FROM outbound WHERE namespace=? AND session_id=? AND request_key=?").get(ref.namespace, sessionId, input.requestKey) as OutboundRow | null;
      const check = (row: OutboundRow, time: number) => {
        if (row.request !== request || row.fingerprint !== fingerprint(row.recipient)) conflict("Relay request key payload conflict");
        if (time >= row.started_at + HORIZON_MS || (row.receipt && time >= (JSON.parse(row.receipt) as Receipt).expiresAt)) conflict("Relay request key receipt horizon expired; automatic retry refused");
      };
      locked(time => {
        const prior = journal();
        if (prior) { check(prior, time); return; }
        const recipient = resolvePeer(h.store, ref.namespace, input.to);
        h.db.query("INSERT INTO outbound VALUES (?,?,?,?,?,?,?,NULL)").run(ref.namespace, sessionId, input.requestKey, request, recipient.id, fingerprint(recipient.id), time);
      }); // Persist resolved recipient + exact payload before vendor enqueue.
      return locked(time => {
        const row = journal()!; check(row, time);
        if (row.receipt) return output({ ...JSON.parse(row.receipt) as Receipt, duplicate: true });
        const receipt = h.service.send({ namespace: ref.namespace, from: bound.peerId, to: row.recipient, body: input.body, requestKey: input.requestKey,
          ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }), ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }) });
        h.db.query("UPDATE outbound SET receipt=? WHERE namespace=? AND session_id=? AND request_key=?").run(JSON.stringify(receipt), ref.namespace, sessionId, input.requestKey);
        return output(receipt);
      });
    },
    async inbox(input = {}, signal) {
      record(input, ["limit", "waitMs"]);
      const limit = integer(input.limit, 5, 1, 10, "inbox limit"), waitMs = integer(input.waitMs, 0, 0, 10_000, "wait duration");
      const waiter = new AbortController(); waiters.add(waiter);
      const onAbort = () => waiter.abort(); signal?.addEventListener("abort", onAbort, { once: true });
      const deadline = performance.now() + waitMs;
      try {
        for (;;) {
          if (signal?.aborted || waiter.signal.aborted) throw new DOMException("Relay inbox cancelled", "AbortError");
          const result = locked(() => ({ messages: h.service.read({ namespace: ref.namespace, peerId: bound.peerId, limit }), unread: h.store.unread(ref.namespace, bound.peerId), timedOut: false }));
          if (result.messages.length) return output(result);
          const remaining = deadline - performance.now();
          if (remaining <= 0) return output({ ...result, timedOut: waitMs > 0 });
          // No transaction survives the await; each poll fences afresh.
          await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(timer); waiter.signal.removeEventListener("abort", abort); reject(new DOMException("Relay inbox cancelled", "AbortError")); };
            const timer = setTimeout(() => { waiter.signal.removeEventListener("abort", abort); resolve(); }, Math.min(250, remaining));
            waiter.signal.addEventListener("abort", abort, { once: true });
            if (waiter.signal.aborted) abort();
          });
        }
      } finally { signal?.removeEventListener("abort", onAbort); waiters.delete(waiter); }
    },
    ack(input) {
      record(input, ["ids"]);
      if (!Array.isArray(input.ids) || input.ids.length > 100) fail("Relay ack requires at most 100 IDs");
      for (const id of input.ids) address(id, "message ID");
      return locked(() => {
        const ids = [...new Set(input.ids)];
        for (const id of ids) {
          const message = h.store.getMessageReference(ref.namespace, id);
          if (message && message.to !== bound.peerId) conflict("Relay ack contains a foreign recipient message");
        }
        const acknowledged = h.service.ack({ namespace: ref.namespace, peerId: bound.peerId, ids });
        return output({ acknowledged, ignored: ids.length - acknowledged });
      });
    },
    heartbeat() {
      locked(time => {
        h.directory.setPresence(ref.namespace, bound.peerId, "online");
        h.db.query("UPDATE sessions SET lease_until=? WHERE namespace=? AND session_id=?").run(time + LEASE_MS, ref.namespace, sessionId);
      });
    },
    release() {
      locked(() => {
        h.directory.setPresence(ref.namespace, bound.peerId, "offline");
        h.db.query("UPDATE sessions SET phase='released',lease_until=0 WHERE namespace=? AND session_id=?").run(ref.namespace, sessionId);
      });
      stopWaits();
    },
    close() { stopWaits(); h.close(); },
  };
}
