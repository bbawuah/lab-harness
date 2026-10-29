import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { callback, Ledger } from "../src/ledger.ts";
import { fixtureEvents, fixtureResult, fixtureTask } from "../src/fixtures.ts";
import { hash } from "../src/util.ts";
import type { Callback, Claim } from "../src/protocol.ts";
import { BoundWorker } from "../src/bound-worker.ts";
import { fresh } from "./helpers.ts";

const mutations: { [K in keyof Claim]: Claim[K] } = { taskId: "other", contractRevision: 999, attemptId: "other", attemptGeneration: 999, claimToken: "other", workerSessionId: "other", adapterInstanceId: "other", grantTaskVersion: 999 };
describe("claim/CAS authority", () => {
  for (const field of Object.keys(mutations) as (keyof Claim)[]) {
    test(`rejects changed claim.${field} without a task transition`, () => {
      const f = fresh(), before = f.ledger.get("T1"), e = callback(f.claim, before.version, { kind: "started" });
      Object.assign(e.claim, { [field]: mutations[field] }); expect(() => f.ledger.apply(e)).toThrow(); expect(f.ledger.get("T1")).toEqual(before);
    });
    test(`rejects omitted claim.${field}`, () => {
      const f = fresh(), before = f.ledger.get("T1"), e: unknown = JSON.parse(JSON.stringify(callback(f.claim, before.version, { kind: "started" })));
      delete (e as { claim: Record<string, unknown> }).claim[field]; expect(() => f.ledger.apply(e)).toThrow(); expect(f.ledger.get("T1")).toEqual(before);
    });
  }
  test("immutable grant version and changing transition CAS", () => {
    const f = fresh(); f.ledger.apply(callback(f.claim, 2, { kind: "started" }));
    expect(() => f.ledger.apply(callback(f.claim, 2, { kind: "settled", aborted: false, failed: false }))).toThrow("STALE_CAS");
    f.ledger.apply(callback(f.claim, 3, { kind: "settled", aborted: false, failed: false }));
    expect(f.ledger.get("T1").claim?.grantTaskVersion).toBe(2); expect(f.ledger.get("T1").version).toBe(4);
  });
  test("one current task per worker session", () => { const f = fresh(); f.ledger.create(fixtureTask(f.ledger, "T2")); expect(() => f.ledger.grant("T2", "S1")).toThrow("SESSION_OCCUPIED"); });
});

describe("immutable context and candidate evidence", () => {
  test("caller mutations do not mutate storage", () => {
    const f = fresh(); f.contract.requirements[0]!.text = "changed"; const inspected = f.ledger.get("T1"); inspected.contract.requirements.pop();
    expect(f.ledger.get("T1").contract.requirements).toHaveLength(2); expect(f.ledger.get("T1").contract.requirements[0]!.text).not.toBe("changed");
  });
  test("same IDs but changed obligation text is rejected", () => {
    const f = fresh(), contract = fixtureTask(f.ledger, "T2"); contract.requirements[0]!.text = "altered";
    expect(() => f.ledger.create(contract)).toThrow("CONTEXT_CONTRACT_MISMATCH");
  });
  test("duplicate contract requirements rejected", () => { const f = fresh(), c = fixtureTask(f.ledger, "T2"); c.requirements[1] = c.requirements[0]!; expect(() => f.ledger.create(c)).toThrow("DUPLICATE_REQUIREMENT"); });
  for (const change of ["omit", "duplicate", "unknown", "dirty", "candidate", "evidence-candidate", "evidence-requirement", "empty-proof", "path-only", "binding"] as const) {
    test(`rejects result ${change}`, () => {
      const f = fresh(); f.ledger.apply(callback(f.claim, 2, { kind: "started" })); const result = fixtureResult(f.ledger, "T1", f.bindingHash);
      if (change === "omit") result.requirements.pop();
      if (change === "duplicate") result.requirements[1] = result.requirements[0]!;
      if (change === "unknown") result.requirements[0]!.id = "unknown";
      if (change === "dirty") result.dirtyHash = "b".repeat(64);
      if (change === "candidate") result.candidateSHA = "b".repeat(40);
      if (change === "evidence-candidate") result.requirements[0]!.evidence[0]!.candidateSHA = "b".repeat(40);
      if (change === "evidence-requirement") result.requirements[0]!.evidence[0]!.requirementId = "R2";
      if (change === "empty-proof") result.requirements[0]!.evidence = [];
      if (change === "path-only") result.requirements[0]!.evidence[0]!.artifactHash = "/existing-file-is-not-proof";
      if (change === "binding") result.contextBindingHash = "b".repeat(64);
      const before = f.ledger.get("T1"); expect(() => f.ledger.apply(callback(f.claim, 3, { kind: "result", result }))).toThrow(); expect(f.ledger.get("T1")).toEqual(before);
    });
  }
  test("stored content hashes are recomputed", () => {
    const f = fresh(), db = new Database(f.ledger.path); db.query("UPDATE blobs SET body=? WHERE hash=?").run("{}", f.contract.contextHash); db.close();
    expect(() => f.ledger.readContext(f.contract.contextHash)).toThrow("ARTIFACT_HASH_MISMATCH");
  });
});

describe("event observations and explicit acceptance", () => {
  test("exact duplicate once; same ID changed bytes conflicts", () => {
    const f = fresh(), event = callback(f.claim, 2, { kind: "started" }); f.ledger.apply(event); expect(f.ledger.apply(event)).toBe("duplicate");
    const changed = { ...event, payload: { kind: "settled", aborted: false, failed: false } } as Callback; changed.payloadHash = hash(changed.payload);
    expect(() => f.ledger.apply(changed)).toThrow("EVENT_ID_CONFLICT"); expect(f.ledger.get("T1").version).toBe(3);
    changed.payloadHash = event.payloadHash; expect(() => f.ledger.apply(changed)).toThrow("PAYLOAD_HASH_MISMATCH");
  });
  test("result and settlement are not acceptance", () => {
    const f = fresh(), events = fixtureEvents(f.ledger, "T1", f.claim, f.bindingHash); f.ledger.apply(events[0]); f.ledger.apply(events[1]); const r = f.ledger.get("T1").result!;
    expect(f.ledger.get("T1").state).toBe("result_available"); expect(() => f.ledger.accept("T1", r.resultId, f.contract, "review")).toThrow("NOT_ACCEPTABLE");
    f.ledger.apply(events[2]); expect(f.ledger.get("T1").acceptance).toBeNull();
    expect(() => f.ledger.accept("T1", r.resultId, { ...f.contract, candidateSHA: "b".repeat(40) }, "review")).toThrow("CURRENT_CANDIDATE_MISMATCH");
    expect(f.ledger.accept("T1", r.resultId, f.contract, "explicit operator review").state).toBe("accepted");
  });
  test("waiver preserves unproven status; duplicates/unknown waiver rejected", () => {
    const f = fresh(), worker = new BoundWorker(f.ledger, f.claim); worker.started(); const r = fixtureResult(f.ledger, "T1", f.bindingHash); r.requirements[1]!.status = "unproven"; r.requirements[1]!.evidence = []; worker.submitResult(r); worker.settled();
    expect(() => f.ledger.accept("T1", r.resultId, f.contract, "review")).toThrow("UNPROVEN_REQUIREMENTS");
    expect(() => f.ledger.accept("T1", r.resultId, f.contract, "waiver", ["R2", "R2"])).toThrow("INVALID_WAIVER");
    expect(f.ledger.accept("T1", r.resultId, f.contract, "operator accepts unproven R2 explicitly", ["R2"]).result!.requirements[1]!.status).toBe("unproven");
  });
  for (const failure of ["aborted", "failed"] as const) test(`${failure} cannot accept`, () => {
    const f = fresh(); f.ledger.apply(callback(f.claim, 2, { kind: "started" })); f.ledger.apply(callback(f.claim, 3, { kind: "settled", aborted: failure === "aborted", failed: failure === "failed" }));
    expect(f.ledger.get("T1").outcome).toBe(failure); expect(f.ledger.get("T1").acceptance).toBeNull();
  });
  test("bound worker has no operator acceptance capability", () => { const f = fresh(); expect(() => new BoundWorker(f.ledger, f.claim).callTool("operator.accept", {})).toThrow("WORKER_CAPABILITY_UNAVAILABLE"); });
  test("native mode never falls back to fixture", () => { const f = fresh(), c = fixtureTask(f.ledger, "native"); c.profile.mode = "verified-local"; f.ledger.create(c); expect(() => f.ledger.grant("native", "S2")).toThrow("NATIVE_PI_UNQUALIFIED"); });
});

describe("durable retirement", () => {
  test("pruning an active claim is refused; retired claim survives prune and successor", () => {
    const f = fresh(), old = callback(f.claim, 2, { kind: "started" }); expect(() => f.ledger.prune("T1")).toThrow("CLAIM_STILL_ACCEPTABLE");
    f.ledger.cancel("T1"); f.ledger.prune("T1"); const next = f.ledger.grant("T1", "S2"); expect(next.claim.attemptGeneration).toBe(2);
    expect(() => f.ledger.apply(old)).toThrow("STALE_OR_FOREIGN_CLAIM"); expect(f.ledger.get("T1").claim).toEqual(next.claim);
    expect(() => f.ledger.create(f.contract)).toThrow("TASK_ALREADY_EXISTS");
  });
  test("reopen persists state; explicit recovery retires old claim", () => {
    const f = fresh(); f.ledger.close(); f.ledger = new Ledger(f.root + "/lab"); expect(f.ledger.recover()).toBe(1);
    expect(() => f.ledger.apply(callback(f.claim, 2, { kind: "started" }))).toThrow("STALE_OR_FOREIGN_CLAIM"); expect(f.ledger.get("T1").outcome).toBe("outcome_unknown");
  });
});
