import { callback, Ledger } from "./ledger.ts";
import type { Claim, Result, WorkerPayload } from "./protocol.ts";
import { LabError } from "./util.ts";

/** Trusted fixture adapter fills the claim/CAS; model-facing arguments cannot select authority. */
export class BoundWorker {
  constructor(private readonly ledger: Ledger, private readonly claim: Claim) {}
  private send(payload: WorkerPayload): void { this.ledger.apply(callback(this.claim, this.ledger.get(this.claim.taskId).version, payload)); }
  started(): void { this.send({ kind: "started" }); }
  settled(aborted = false, failed = false): void { this.send({ kind: "settled", aborted, failed }); }
  submitResult(result: Result): void { this.send({ kind: "result", result }); }
  callTool(name: string, input: unknown): void {
    if (name !== "submit_result") throw new LabError("WORKER_CAPABILITY_UNAVAILABLE");
    this.submitResult(input as Result);
  }
}
