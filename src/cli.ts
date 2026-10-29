import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { admission } from "./admission.ts";
import { CONCEPT_ROOT, Ledger } from "./ledger.ts";
import { fixtureEvents, fixtureTask } from "./fixtures.ts";
import { RelayBus, RELAY_PIN } from "./relay.ts";
import { canonical, LabError, requireThat } from "./util.ts";
import type { Candidate, ContextPack, Result, TaskContract } from "./protocol.ts";
import { Workspace } from "./workspace.ts";
import { buildContext, verifyContext, type ContextSelection, type ProvenanceContext } from "./context.ts";
import { SearchService, type SearchOptions } from "./search/index.ts";

function print(value: unknown): void { process.stdout.write(JSON.stringify(value, null, 2) + "\n"); }
function input(path: string | undefined): unknown { requireThat(path, "INPUT_FILE_REQUIRED"); return JSON.parse(readFileSync(path, "utf8")); }
function verifyTaskContext(db: Ledger, taskId: string): void {
  const pack = db.readContext(db.get(taskId).contract.contextHash);
  if ("sourceProvenance" in pack) {
    const selected = pack as ProvenanceContext;
    requireThat(typeof selected.workspacePath === "string", "CONTEXT_WORKSPACE_REQUIRED");
    verifyContext(resolve(CONCEPT_ROOT, selected.workspacePath), selected);
  }
}
function demo(): void {
  mkdirSync(join(CONCEPT_ROOT, ".tmp"), { recursive: true, mode: 0o700 });
  const state = mkdtempSync(join(CONCEPT_ROOT, ".tmp/demo-"));
  const ledger = new Ledger(join(state, "lab")), bus = new RelayBus(join(state, "relay"));
  try {
    const task = fixtureTask(ledger, "demo-task"); ledger.create(task);
    const bound = ledger.grant(task.taskId, "fake-session-1");
    const namespace = "offline-demo", worker = bus.register(namespace, "worker"), coordinator = bus.register(namespace, "coordinator");
    const mailbox = bus.mailbox(namespace, coordinator);
    const events = fixtureEvents(ledger, task.taskId, bound.claim, bound.bindingHash);
    const transitions: unknown[] = [];
    for (const event of events) {
      const receipt = bus.send(namespace, worker, coordinator, canonical(event), event.eventId);
      transitions.push({ kind: event.payload.kind, relayStored: receipt.state, ingest: ledger.receive(mailbox), task: ledger.get(task.taskId).state, outcome: ledger.get(task.taskId).outcome });
    }
    const before = ledger.get(task.taskId);
    requireThat(before.result, "DEMO_RESULT_MISSING");
    const accepted = ledger.accept(task.taskId, before.result.resultId, task, "Operator explicitly accepts this OFFLINE FIXTURE result.");
    const interrupted = fixtureTask(ledger, "interrupted-task"); ledger.create(interrupted); const old = ledger.grant(interrupted.taskId, "fake-session-2"); ledger.cancel(interrupted.taskId); ledger.prune(interrupted.taskId);
    let staleRejected = false; try { ledger.apply({ ...events[0], claim: old.claim }); } catch { staleRejected = true; }
    print({ label: "OFFLINE CONCEPT — FAKE GATEWAY/WORKER, REAL PINNED RELAY/SQLITE", developmentPlatform: process.platform, nativeIntegration: admission(), relaySourceSHA: RELAY_PIN, stateDirectory: state, transitions, beforeOperatorAcceptance: before.state, afterOperatorAcceptance: accepted.state, cancellation: ledger.get(interrupted.taskId).outcome, staleAfterRetirementAndPruneRejected: staleRejected, actualModelCalls: 0 });
  } finally { bus.close(); ledger.close(); }
}

try {
  const args = process.argv.slice(2), command = args.shift() ?? "help";
  if (command === "demo") demo();
  else if (command === "terminal-demo") print(await (await import("./terminal-demo.ts")).terminalDemo());
  else if (command === "herdr-smoke") print(await (await import("./herdr/index.ts")).runHerdrSmoke({ stateRoot: join(CONCEPT_ROOT, ".tmp") }));
  else if (command === "admission") print(admission());
  else if (command === "activate-pi") throw new LabError("NATIVE_PI_UNQUALIFIED");
  else if (command === "search" || command === "files") { requireThat(args[0] && args[1], "SEARCH_ROOT_QUERY_REQUIRED"); const options: SearchOptions = {}; if (args[2]) options.limit = Number(args[2]); if (args[3]) options.engine = args[3] as SearchOptions["engine"]; const service = new SearchService(resolve(args[0]), options); print(command === "search" ? service.text(args[1]) : service.files(args[1])); }
  else if (command === "skill") { requireThat(args[0] && args[1], "SKILL_ROOT_PATH_REQUIRED"); print(new Workspace(resolve(args[0])).skill(args[1])); }
  else if (command === "context") { requireThat(args[0] && args[1], "CONTEXT_ROOT_INPUT_REQUIRED"); print(buildContext(resolve(args[0]), input(args[1]) as ContextSelection)); }
  else if (command === "verify-context") { requireThat(args[0] && args[1], "CONTEXT_ROOT_INPUT_REQUIRED"); const data = input(args[1]) as { pack: ProvenanceContext }; verifyContext(resolve(args[0]), data.pack); print({ valid: true, nativePi: "blocked-unqualified" }); }
  else if (command === "help") print({ commands: ["demo (fixtures)", "terminal-demo (real Herdr; leaves result awaiting acceptance)", "herdr-smoke", "search ROOT QUERY [LIMIT] [auto|fallback|rg]", "files ROOT QUERY [LIMIT]", "context ROOT INPUT.json", "verify-context ROOT CONTEXT.json", "skill ROOT PATH", "admission", "activate-pi (blocked)", "--state PATH create FILE", "--state PATH show TASK", "--state PATH claim TASK SESSION", "--state PATH event FILE", "--state PATH accept FILE", "--state PATH cancel TASK", "--state PATH recover"], scope: "owned project subdirectories; acceptance is operator workflow, not same-user authentication" });
  else {
    requireThat(command === "--state", "EXPLICIT_STATE_REQUIRED"); const state = args.shift(); requireThat(state, "EXPLICIT_STATE_REQUIRED"); const operation = args.shift(); const db = new Ledger(resolve(state));
    try {
      if (operation === "create") { const data = input(args[0]) as { contract: TaskContract; context: ContextPack; workspaceRoot?: string }; if ("sourceProvenance" in data.context) { requireThat(data.workspaceRoot, "CONTEXT_WORKSPACE_REQUIRED"); verifyContext(resolve(data.workspaceRoot), data.context as ProvenanceContext); } const contextHash = db.context(data.context); requireThat(contextHash === data.contract.contextHash, "CONTEXT_HASH_MISMATCH"); print(db.create(data.contract)); }
      else if (operation === "show") print(db.get(args[0] ?? ""));
      else if (operation === "claim") { verifyTaskContext(db, args[0] ?? ""); print(db.grant(args[0] ?? "", args[1] ?? "")); }
      else if (operation === "event") { const data = input(args[0]) as { claim?: { taskId: string } }; requireThat(data.claim, "INVALID_CLAIM"); verifyTaskContext(db, data.claim.taskId); print({ disposition: db.apply(data) }); }
      else if (operation === "accept") { const data = input(args[0]) as Candidate & { taskId: string; resultId: string; reason: string; waived?: string[] }; verifyTaskContext(db, data.taskId); print(db.accept(data.taskId, data.resultId, data, data.reason, data.waived)); }
      else if (operation === "cancel") print(db.cancel(args[0] ?? ""));
      else if (operation === "recover") print({ retired: db.recover() });
      else throw new LabError("UNKNOWN_OPERATOR_COMMAND");
    } finally { db.close(); }
  }
} catch (error) { process.stderr.write(JSON.stringify({ error: error instanceof LabError ? error.code : "CONCEPT_OPERATION_FAILED" }) + "\n"); process.exitCode = 1; }
