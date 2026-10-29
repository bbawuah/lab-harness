import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { admission } from "./admission.ts";
import { captureCandidate } from "./candidate.ts";
import { buildContext, verifyContext } from "./context.ts";
import { runHerdrSmoke } from "./herdr/index.ts";
import { callback, CONCEPT_ROOT, Ledger } from "./ledger.ts";
import type { Result, TaskContract, WorkerPayload } from "./protocol.ts";
import { RelayBus } from "./relay.ts";
import { SearchService } from "./search/index.ts";
import { discoverSkills, loadSkill, selectSkill, verifySkill } from "./skills/index.ts";
import { canonical, requireThat, textHash } from "./util.ts";

/** Real process evidence in an explicitly fixture-mode task envelope. Never calls acceptance. */
export async function terminalDemo(): Promise<Record<string, unknown>> {
  const tmp = join(CONCEPT_ROOT, ".tmp"); mkdirSync(tmp, { recursive: true, mode: 0o700 });
  const state = mkdtempSync(join(tmp, "terminal-demo-")), workspace = join(state, "workspace");
  mkdirSync(workspace, { mode: 0o700 });
  writeFileSync(join(workspace, "requirement.txt"), "Observe the owned terminal worker and preserve separate operator acceptance.\n", { mode: 0o600 });
  const source = new SearchService(workspace).text("owned terminal").hits;
  requireThat(source.length === 1, "DEMO_SOURCE_MISSING");
  const candidate = captureCandidate();
  const origins = [{ id: "bundled-example", root: join(CONCEPT_ROOT, "examples/skills") }];
  const inventory = discoverSkills(origins), skill = inventory.skills.find(s => s.name === "terminal-evidence");
  requireThat(skill, "DEMO_SKILL_MISSING");
  const loadedSkill = loadSkill(selectSkill(skill), origins, inventory);
  const verifySelectedSkill = (selection: Parameters<typeof verifySkill>[0]) => verifySkill(selection, origins, inventory);
  const requirements = [
    { id: "R1", text: "Observe an executed owned Herdr worker marker and verified normal cleanup." },
    { id: "R2", text: "Retain source provenance and leave the result awaiting explicit operator acceptance." },
  ];
  const selected = buildContext(workspace, { ...candidate, requirements, corrections: ["Terminal state never decides acceptance. This is not a Pi/model qualification."], sources: source, skills: [loadedSkill.selection] }, verifySelectedSkill);
  const ledger = new Ledger(join(state, "lab")), bus = new RelayBus(join(state, "relay"));
  const taskId = `terminal-${randomUUID()}`;
  const contract: TaskContract = {
    ...candidate, schemaVersion: 1, taskId, contractRevision: 1, workspaceId: "disposable-terminal-example", objective: "Inspect a real Herdr process using a fixture-only coordinator envelope", requirements,
    contextHash: selected.contextHash, profile: { id: "fixture-terminal-adapter-v1", alias: "no-model", capabilityRevision: "fixture-envelope-real-terminal-evidence", mode: "fixture" },
  };
  let granted = false;
  try {
    verifyContext(workspace, selected.pack, verifySelectedSkill); ledger.context(selected.pack); ledger.create(contract);
    const binding = ledger.grant(taskId, `fixture-terminal-binding-${randomUUID()}`, "fixture-no-pi-transcript"); granted = true;
    const namespace = "owned-terminal-demo", sender = bus.register(namespace, "terminal-adapter"), recipient = bus.register(namespace, "operator");
    const mailbox = bus.mailbox(namespace, recipient);
    const send = (payload: WorkerPayload): void => {
      const event = callback(binding.claim, ledger.get(taskId).version, payload);
      // Persist outgoing bytes before store; receiver commits processing before ack.
      ledger.queueMessage(bus.busId, namespace, sender, recipient, canonical(event), event.eventId);
      requireThat(ledger.deliverMessages(bus) === 1, "DEMO_DELIVERY_FAILED");
      requireThat(ledger.receive(mailbox).every(d => d.status === "processed"), "DEMO_INGEST_FAILED");
    };
    send({ kind: "started" });
    const terminal = await runHerdrSmoke({ stateRoot: tmp });
    verifyContext(workspace, selected.pack, verifySelectedSkill);
    requireThat(canonical(captureCandidate()) === canonical(candidate), "STALE_CANDIDATE");
    requireThat(terminal.stopped && /^LAB_HERDR_OK_[0-9a-f]{16}\r?\n/.test(terminal.observedOutput), "DEMO_TERMINAL_EVIDENCE_FAILED");
    const evidence = { label: terminal.label, sourcePin: terminal.sourcePin, runtime: terminal.runtime, outputHash: textHash(terminal.observedOutput), stopped: terminal.stopped, cleanup: terminal.cleanup, taskAcceptance: terminal.taskAcceptance };
    const artifactHash = ledger.artifact(canonical(evidence));
    const result: Result = {
      ...candidate, resultId: randomUUID(), contextBindingHash: binding.bindingHash,
      summary: "Actual owned Herdr worker observed and stopped. Fixture-only task envelope; no Pi/model run. Operator acceptance remains required.",
      requirements: requirements.map(r => ({ id: r.id, status: "pass", evidence: [{ ...candidate, requirementId: r.id, kind: "inspection", artifactHash, description: r.id === "R1" ? "Real pinned-release Herdr marker, process status and cleanup observations." : "Coordinator revalidated immutable source bytes and has no automatic acceptance step." }] })),
    };
    send({ kind: "result", result }); send({ kind: "settled", aborted: false, failed: false });
    const final = ledger.get(taskId); requireThat(final.state === "result_available" && final.acceptance === null, "DEMO_ACCEPTANCE_CHANGED");
    const reviewPath = join(state, "review.json");
    writeFileSync(reviewPath, JSON.stringify({ ...candidate, taskId, resultId: result.resultId, reason: "Operator inspected the terminal evidence and explicitly accepts this bounded example." }, null, 2) + "\n", { mode: 0o600 });
    writeFileSync(join(state, "context.json"), JSON.stringify(selected, null, 2) + "\n", { mode: 0o600 });
    const originPath = join(state, "skill-origins.json"); writeFileSync(originPath, JSON.stringify({ origins }, null, 2) + "\n", { mode: 0o600 });
    return { label: "REAL HERDR/SQLITE/RELAY; FIXTURE TASK ENVELOPE; NO PI OR MODEL", candidate, stateDirectory: state, taskId, state: final.state, outcome: final.outcome, acceptance: final.acceptance, contextHash: selected.contextHash, sourceReferences: selected.pack.sourceProvenance, selectedSkill: { ...loadedSkill.selection, instructionBytes: Buffer.byteLength(loadedSkill.text), executed: false }, evidence, operatorReview: { file: reviewPath, next: `--state ${join(state, "lab")} show ${taskId}`, acceptAfterInspection: `--skill-sources ${originPath} --state ${join(state, "lab")} accept ${reviewPath}` }, nativeIntegration: admission(), actualModelCalls: 0 };
  } catch (error) {
    // Do not leave a valid claim available for delayed success after uncertain execution.
    if (granted) ledger.cancel(taskId);
    throw error;
  } finally { bus.close(); ledger.close(); }
}
