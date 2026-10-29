import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BoundMailbox, Callback, Candidate, Claim, ContextBinding, ContextPack, Delivery, IngestDisposition, ReceiveBinding, Result, TaskContract, TaskView, WorkerPayload } from "./protocol.ts";
import { requireFixture } from "./admission.ts";
import { canonical, candidate, digest, equalCandidate, hash, LabError, nonempty, record, requireThat, textHash } from "./util.ts";

export const CONCEPT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const APPLICATION_ID = 0x4c414243;
const SCHEMA_VERSION = 1;
const CLAIM_KEYS = ["taskId", "contractRevision", "attemptId", "attemptGeneration", "claimToken", "workerSessionId", "adapterInstanceId", "grantTaskVersion"] as const;
type BlobRow = { body: string; kind: string };

export function ownedState(path: string): string {
  const root = resolve(path); requireThat(root.startsWith(CONCEPT_ROOT + "/"), "STATE_OUTSIDE_CONCEPT");
  let cursor = root;
  while (cursor.startsWith(CONCEPT_ROOT)) {
    const stat = lstatSync(cursor, { throwIfNoEntry: false });
    if (stat) requireThat(stat.isDirectory() && !stat.isSymbolicLink(), "UNSAFE_STATE_PATH");
    if (cursor === CONCEPT_ROOT) break; cursor = dirname(cursor);
  }
  mkdirSync(root, { recursive: true, mode: 0o700 }); return root;
}
function requirements(value: unknown): asserts value is { id: string; text: string }[] {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "INVALID_REQUIREMENTS");
  const ids = new Set<string>();
  for (const r of value) { record(r); nonempty(r.id); nonempty(r.text); requireThat(!ids.has(r.id), "DUPLICATE_REQUIREMENT"); ids.add(r.id); }
}
function validateClaim(value: unknown): asserts value is Claim {
  record(value); requireThat(Object.keys(value).length === CLAIM_KEYS.length, "INVALID_CLAIM");
  for (const k of CLAIM_KEYS) {
    if (["contractRevision", "attemptGeneration", "grantTaskVersion"].includes(k)) requireThat(Number.isSafeInteger(value[k]) && (value[k] as number) > 0, "INVALID_CLAIM");
    else nonempty(value[k]);
  }
}
export function callback(claim: Claim, version: number, payload: WorkerPayload, eventId: string = randomUUID()): Callback {
  return { schemaVersion: 1, eventId, claim: structuredClone(claim), transitionExpectedVersion: version, payloadHash: hash(payload), payload: structuredClone(payload) };
}

export class Ledger {
  private readonly db: Database;
  readonly path: string;
  constructor(stateDir: string) {
    const root = ownedState(stateDir); this.path = join(root, "ledger.sqlite");
    const stat = lstatSync(this.path, { throwIfNoEntry: false });
    if (stat) {
      requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, "UNSAFE_DATABASE");
      const header = readFileSync(this.path).subarray(0, 100);
      requireThat(header.length === 100 && header.subarray(0, 16).toString() === "SQLite format 3\0", "UNKNOWN_DATABASE");
      const inspect = new Database(this.path, { readonly: true });
      try {
        // Committed schema/markers may still be in WAL after the first owner crashes.
        const identity = inspect.query<{ application_id: number }, []>("PRAGMA application_id").get();
        requireThat(identity?.application_id === APPLICATION_ID, "UNKNOWN_DATABASE");
        const version = inspect.query<{ user_version: number }, []>("PRAGMA user_version").get();
        requireThat(version?.user_version === SCHEMA_VERSION, "UNSUPPORTED_SCHEMA_VERSION");
        for (const [table, columns] of Object.entries({ blobs: ["hash", "kind", "body"], tasks: ["id", "version", "body"], events: ["id", "fingerprint", "task_id", "generation"], ingest: ["bus", "namespace", "id", "recipient", "fingerprint", "task_id", "disposition"], outbound: ["id", "fingerprint", "body", "receipt"], results: ["id", "fingerprint", "task_id"] })) {
          const actual = inspect.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map(r => r.name);
          requireThat(canonical(actual) === canonical(columns), "UNKNOWN_DATABASE_SCHEMA");
        }
      } finally { inspect.close(); }
    }
    this.db = new Database(this.path, { create: true, strict: true });
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;");
    if (!stat) this.atomic(() => this.db.exec(`CREATE TABLE blobs(hash TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,hash));
      CREATE TABLE tasks(id TEXT PRIMARY KEY,version INTEGER NOT NULL,body TEXT NOT NULL);
      CREATE TABLE events(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,task_id TEXT NOT NULL,generation INTEGER NOT NULL);
      CREATE TABLE ingest(bus TEXT NOT NULL,namespace TEXT NOT NULL,id TEXT NOT NULL,recipient TEXT NOT NULL,fingerprint TEXT NOT NULL,task_id TEXT,disposition TEXT NOT NULL,PRIMARY KEY(bus,namespace,id));
      CREATE TABLE outbound(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,body TEXT NOT NULL,receipt TEXT);
      CREATE TABLE results(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,task_id TEXT NOT NULL);
      PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${SCHEMA_VERSION};`));
  }
  close(): void { this.db.close(); }
  private atomic<T>(fn: () => T): T { return this.db.transaction(fn).immediate(); }
  private blob(kind: string, body: string): string {
    const id = textHash(body); this.db.query("INSERT OR IGNORE INTO blobs VALUES(?,?,?)").run(id, kind, body); return id;
  }
  private readBlob(id: string, kind: string): string {
    digest(id); const row = this.db.query<BlobRow, [string, string]>("SELECT body,kind FROM blobs WHERE hash=? AND kind=?").get(id, kind);
    requireThat(row && row.kind === kind && textHash(row.body) === id, "ARTIFACT_HASH_MISMATCH"); return row.body;
  }
  artifact(text: string): string { nonempty(text); return this.blob("artifact", text); }
  context(pack: ContextPack): string {
    candidate(pack); requireThat(pack.schemaVersion === 1, "INVALID_SCHEMA"); requirements(pack.requirements);
    requireThat(Array.isArray(pack.corrections) && Array.isArray(pack.snippets) && Array.isArray(pack.skills), "INVALID_CONTEXT");
    for (const s of pack.snippets) { nonempty(s.path); digest(s.contentHash); nonempty(s.text); requireThat(textHash(s.text) === s.contentHash, "SNIPPET_HASH_MISMATCH"); }
    for (const s of pack.skills) { nonempty(s.id); digest(s.contentHash); }
    for (const correction of pack.corrections) nonempty(correction);
    requireThat(canonical(pack).length <= 64000, "CONTEXT_BUDGET"); return this.blob("context", canonical(pack));
  }
  readContext(id: string): ContextPack { return JSON.parse(this.readBlob(id, "context")) as ContextPack; }
  create(contract: TaskContract): TaskView {
    return this.atomic(() => {
      candidate(contract); requireThat(contract.schemaVersion === 1 && Number.isSafeInteger(contract.contractRevision) && contract.contractRevision > 0, "INVALID_SCHEMA");
      for (const s of [contract.taskId, contract.workspaceId, contract.objective, contract.profile.id, contract.profile.alias, contract.profile.capabilityRevision]) nonempty(s);
      requireThat(["fixture", "verified-local"].includes(contract.profile.mode), "INVALID_PROFILE"); requirements(contract.requirements);
      const pack = this.readContext(contract.contextHash);
      requireThat(equalCandidate(pack, contract) && canonical(pack.requirements) === canonical(contract.requirements), "CONTEXT_CONTRACT_MISMATCH");
      requireThat(!this.db.query("SELECT id FROM tasks WHERE id=?").get(contract.taskId), "TASK_ALREADY_EXISTS");
      const view: TaskView = { contract: structuredClone(contract), version: 1, generation: 0, state: "ready", outcome: "pending", claim: null, bindingHash: null, result: null, acceptance: null };
      this.db.query("INSERT INTO tasks VALUES(?,?,?)").run(contract.taskId, 1, canonical(view)); return structuredClone(view);
    });
  }
  get(id: string): TaskView {
    nonempty(id); const row = this.db.query<{ body: string }, [string]>("SELECT body FROM tasks WHERE id=?").get(id); requireThat(row, "UNKNOWN_TASK"); return JSON.parse(row.body) as TaskView;
  }
  list(): TaskView[] { return this.db.query<{ body: string }, []>("SELECT body FROM tasks ORDER BY id").all().map(r => JSON.parse(r.body) as TaskView); }
  private save(view: TaskView, expected: number): void {
    view.version = expected + 1;
    const result = this.db.query("UPDATE tasks SET version=?,body=? WHERE id=? AND version=?").run(view.version, canonical(view), view.contract.taskId, expected);
    requireThat(result.changes === 1, "STALE_CAS");
  }
  grant(id: string, workerSessionId: string, baseLeafEntryId = "fixture-root"): { claim: Claim; bindingHash: string } {
    return this.atomic(() => {
      nonempty(workerSessionId); nonempty(baseLeafEntryId); const view = this.get(id); requireFixture(view.contract.profile);
      requireThat(!view.claim && ["ready", "outcome_unknown"].includes(view.state), "TASK_NOT_CLAIMABLE");
      requireThat(!this.list().some(t => t.claim?.workerSessionId === workerSessionId), "SESSION_OCCUPIED");
      this.readContext(view.contract.contextHash);
      const claim: Claim = { taskId: id, contractRevision: view.contract.contractRevision, attemptId: randomUUID(), attemptGeneration: view.generation + 1, claimToken: randomUUID(), workerSessionId, adapterInstanceId: randomUUID(), grantTaskVersion: view.version + 1 };
      const binding: ContextBinding = { contextHash: view.contract.contextHash, claim, candidateSHA: view.contract.candidateSHA, dirtyHash: view.contract.dirtyHash, piSessionId: workerSessionId, baseLeafEntryId, profileHash: hash(view.contract.profile) };
      view.claim = claim; view.generation = claim.attemptGeneration; view.bindingHash = this.blob("binding", canonical(binding)); view.result = null; view.state = "running"; view.outcome = "pending";
      this.save(view, view.version); return { claim: structuredClone(claim), bindingHash: view.bindingHash };
    });
  }
  private validateResult(view: TaskView, result: Result): void {
    candidate(result); nonempty(result.resultId); nonempty(result.summary);
    requireThat(equalCandidate(view.contract, result) && result.contextBindingHash === view.bindingHash, "RESULT_BINDING_MISMATCH");
    const binding = JSON.parse(this.readBlob(result.contextBindingHash, "binding")) as ContextBinding;
    requireThat(binding.contextHash === view.contract.contextHash && canonical(binding.claim) === canonical(view.claim) && binding.piSessionId === view.claim?.workerSessionId && binding.profileHash === hash(view.contract.profile) && equalCandidate(binding, view.contract), "CONTEXT_BINDING_MISMATCH");
    this.readContext(view.contract.contextHash);
    requireThat(Array.isArray(result.requirements) && result.requirements.length === view.contract.requirements.length, "OBLIGATION_MISMATCH");
    const seen = new Set<string>();
    for (const r of result.requirements) {
      requireThat(view.contract.requirements.some(req => req.id === r.id) && !seen.has(r.id), "OBLIGATION_MISMATCH"); seen.add(r.id);
      requireThat(["pass", "failed", "unproven"].includes(r.status) && Array.isArray(r.evidence), "INVALID_RESULT");
      requireThat(r.status !== "pass" || r.evidence.length > 0, "MISSING_EVIDENCE");
      for (const evidence of r.evidence) {
        candidate(evidence); nonempty(evidence.description); requireThat(evidence.requirementId === r.id && equalCandidate(evidence, view.contract), "EVIDENCE_BINDING_MISMATCH");
        requireThat(["fixture", "inspection"].includes(evidence.kind), "INVALID_EVIDENCE_KIND"); this.readBlob(evidence.artifactHash, "artifact");
      }
    }
  }
  apply(input: unknown): "processed" | "duplicate" {
    return this.atomic(() => {
      record(input); requireThat(input.schemaVersion === 1, "INVALID_SCHEMA"); validateClaim(input.claim); nonempty(input.eventId); digest(input.payloadHash);
      requireThat(Number.isSafeInteger(input.transitionExpectedVersion) && (input.transitionExpectedVersion as number) > 0, "INVALID_CAS");
      record(input.payload); requireThat(hash(input.payload) === input.payloadHash, "PAYLOAD_HASH_MISMATCH");
      const c = input as unknown as Callback; const view = this.get(c.claim.taskId);
      requireThat(view.claim && CLAIM_KEYS.every(k => view.claim?.[k] === c.claim[k]), "STALE_OR_FOREIGN_CLAIM");
      const fp = hash(c), old = this.db.query<{ fingerprint: string }, [string]>("SELECT fingerprint FROM events WHERE id=?").get(c.eventId);
      if (old) { requireThat(old.fingerprint === fp, "EVENT_ID_CONFLICT"); return "duplicate"; }
      requireThat(view.version === c.transitionExpectedVersion, "STALE_CAS");
      if (c.payload.kind === "started") { requireThat(view.outcome === "pending", "INVALID_LIFECYCLE"); view.outcome = "running"; }
      else if (c.payload.kind === "settled") {
        requireThat(typeof c.payload.aborted === "boolean" && typeof c.payload.failed === "boolean" && view.outcome === "running", "INVALID_LIFECYCLE");
        view.outcome = c.payload.aborted ? "aborted" : c.payload.failed ? "failed" : "settled";
        if (c.payload.aborted || c.payload.failed) { view.state = "outcome_unknown"; view.claim = null; }
      } else if (c.payload.kind === "result") {
        requireThat(["running", "settled"].includes(view.outcome), "INVALID_LIFECYCLE"); this.validateResult(view, c.payload.result);
        const previous = this.db.query<{ fingerprint: string; task_id: string }, [string]>("SELECT fingerprint,task_id FROM results WHERE id=?").get(c.payload.result.resultId);
        requireThat(!previous || previous.fingerprint === hash(c.payload.result) && previous.task_id === view.contract.taskId, "RESULT_ID_CONFLICT");
        this.db.query("INSERT OR IGNORE INTO results VALUES(?,?,?)").run(c.payload.result.resultId, hash(c.payload.result), view.contract.taskId);
        view.result = structuredClone(c.payload.result); view.state = "result_available";
      } else throw new LabError("UNKNOWN_WORKER_OPERATION");
      this.db.query("INSERT INTO events VALUES(?,?,?,?)").run(c.eventId, fp, view.contract.taskId, view.generation); this.save(view, view.version); return "processed";
    });
  }
  accept(id: string, resultId: string, current: Candidate, reason: string, waived: string[] = []): TaskView {
    return this.atomic(() => {
      candidate(current); nonempty(reason); const v = this.get(id);
      requireThat(v.state === "result_available" && v.claim && v.result?.resultId === resultId && v.outcome === "settled", "NOT_ACCEPTABLE");
      requireThat(equalCandidate(v.contract, current), "CURRENT_CANDIDATE_MISMATCH"); this.validateResult(v, v.result);
      requireThat(new Set(waived).size === waived.length && waived.every(id => v.contract.requirements.some(r => r.id === id)), "INVALID_WAIVER");
      requireThat(v.result.requirements.every(r => r.status === "pass" || waived.includes(r.id)), "UNPROVEN_REQUIREMENTS");
      v.acceptance = { reason, at: Date.now(), waived: [...waived] }; v.state = "accepted"; v.claim = null; this.save(v, v.version); return structuredClone(v);
    });
  }
  cancel(id: string): TaskView {
    return this.atomic(() => { const v = this.get(id); requireThat(v.claim, "NO_ACTIVE_CLAIM"); v.claim = null; v.state = "outcome_unknown"; v.outcome = "cancellation_requested"; this.save(v, v.version); return v; });
  }
  recover(): number {
    return this.atomic(() => { let n = 0; for (const v of this.list()) if (v.claim) { v.claim = null; v.state = "outcome_unknown"; v.outcome = "outcome_unknown"; this.save(v, v.version); n++; } return n; });
  }
  prune(id: string): void {
    this.atomic(() => { const v = this.get(id); requireThat(!v.claim, "CLAIM_STILL_ACCEPTABLE"); this.db.query("DELETE FROM events WHERE task_id=?").run(id); this.db.query("DELETE FROM ingest WHERE task_id=?").run(id); });
  }
  ingest(delivery: Delivery, binding: ReceiveBinding): IngestDisposition {
    requireThat(delivery.busId === binding.busId && delivery.namespace === binding.namespace && delivery.recipient === binding.peerId, "FOREIGN_MAILBOX");
    nonempty(delivery.messageId); requireThat(typeof delivery.body === "string" && Buffer.byteLength(delivery.body) <= 16000, "INVALID_DELIVERY");
    return this.atomic(() => {
      const fp = textHash(delivery.body); const old = this.db.query<{ fingerprint: string; recipient: string }, [string, string, string]>("SELECT fingerprint,recipient FROM ingest WHERE bus=? AND namespace=? AND id=?").get(delivery.busId, delivery.namespace, delivery.messageId);
      if (old) { requireThat(old.fingerprint === fp && old.recipient === delivery.recipient, "MESSAGE_ID_CONFLICT"); return { status: "duplicate", detail: "durable ingest already exists" }; }
      let disposition: IngestDisposition, taskId: string | null = null;
      try {
        const parsed: unknown = JSON.parse(delivery.body); record(parsed); if (parsed.claim && typeof parsed.claim === "object") { const claim = parsed.claim as Record<string, unknown>; if (typeof claim.taskId === "string") taskId = claim.taskId; }
        disposition = { status: this.apply(parsed), detail: "worker event checked" };
      } catch (error) {
        if (!(error instanceof LabError || error instanceof SyntaxError || error instanceof TypeError)) throw error;
        disposition = { status: "quarantined", detail: error instanceof LabError ? error.code : "MALFORMED_EVENT" };
      }
      this.db.query("INSERT INTO ingest VALUES(?,?,?,?,?,?,?)").run(delivery.busId, delivery.namespace, delivery.messageId, delivery.recipient, fp, taskId, canonical(disposition)); return disposition;
    });
  }
  receive(mailbox: BoundMailbox, afterCommit?: () => void): IngestDisposition[] {
    const outcomes: IngestDisposition[] = [];
    for (const d of mailbox.inbox()) { const disposition = this.ingest(d, mailbox.binding); afterCommit?.(); mailbox.ack([d.messageId]); outcomes.push(disposition); }
    return outcomes;
  }
  queueMessage(busId: string, namespace: string, sender: string, recipient: string, body: string, requestKey: string): void {
    for (const s of [busId, namespace, sender, recipient, requestKey]) nonempty(s);
    requireThat(typeof body === "string" && Buffer.byteLength(body) <= 16000, "INVALID_DELIVERY");
    this.atomic(() => {
      const message = { busId, namespace, sender, recipient, body, requestKey }, fp = hash(message);
      const existing = this.db.query<{ fingerprint: string }, [string]>("SELECT fingerprint FROM outbound WHERE id=?").get(requestKey);
      if (existing) { requireThat(existing.fingerprint === fp, "OUTBOUND_KEY_CONFLICT"); return; }
      this.db.query("INSERT INTO outbound VALUES(?,?,?,NULL)").run(requestKey, fp, canonical({ ...message, createdAt: Date.now() }));
    });
  }
  deliverMessages(bus: { busId: string; send(namespace: string, sender: string, recipient: string, body: string, key: string): { id: string; state: "stored"; duplicate: boolean; expiresAt: number } }, afterStoreBeforeReceipt?: () => void): number {
    let n = 0;
    for (const row of this.db.query<{ id: string; body: string; fingerprint: string }, []>("SELECT id,body,fingerprint FROM outbound WHERE receipt IS NULL ORDER BY id").all()) {
      const m = JSON.parse(row.body) as { busId: string; namespace: string; sender: string; recipient: string; body: string; requestKey: string; createdAt: number };
      requireThat(hash({ busId: m.busId, namespace: m.namespace, sender: m.sender, recipient: m.recipient, body: m.body, requestKey: m.requestKey }) === row.fingerprint, "OUTBOUND_INTEGRITY_MISMATCH");
      requireThat(m.busId === bus.busId, "OUTBOUND_BUS_MISMATCH");
      requireThat(Date.now() < m.createdAt + 30 * 86400_000, "OUTBOUND_RECEIPT_HORIZON_UNKNOWN");
      const receipt = bus.send(m.namespace, m.sender, m.recipient, m.body, m.requestKey);
      afterStoreBeforeReceipt?.();
      this.db.query("UPDATE outbound SET receipt=? WHERE id=? AND receipt IS NULL").run(canonical(receipt), row.id); n++;
    }
    return n;
  }
}
