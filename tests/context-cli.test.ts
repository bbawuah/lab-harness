import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildContext } from "../src/context.ts";
import { fixtureEvents } from "../src/fixtures.ts";
import { CONCEPT_ROOT } from "../src/ledger.ts";
import { Workspace } from "../src/workspace.ts";
import { fresh } from "./helpers.ts";

test("operator CLI revalidates stored source context at claim and acceptance while recovery stays available", () => {
  const f = fresh(), workspace = new Workspace(join(f.root, "workspace")), path = join(workspace.root, "source.txt");
  writeFileSync(path, "selected source\n");
  const selected = buildContext(workspace.root, { candidateSHA: f.contract.candidateSHA, dirtyHash: f.contract.dirtyHash, requirements: f.contract.requirements, sources: [{ path: "source.txt", contentHash: workspace.read("source.txt").contentHash, lineStart: 1, lineEnd: 1, text: "" }] });
  const contract = { ...f.contract, taskId: "source-bound", contextHash: f.ledger.context(selected.pack) }; f.ledger.create(contract);
  const cli = (...args: string[]) => Bun.spawnSync([process.execPath, "--no-env-file", "--no-install", join(CONCEPT_ROOT, "src/cli.ts"), "--state", join(f.root, "lab"), ...args], { env: { PATH: process.env.PATH ?? "" }, stdout: "pipe", stderr: "pipe" });
  writeFileSync(path, "changed source\n");
  expect(cli("claim", contract.taskId, "selected-session").stderr.toString()).toContain("STALE_CONTEXT_SOURCE");
  expect(f.ledger.get(contract.taskId).state).toBe("ready");
  writeFileSync(path, "selected source\n");
  const bound = f.ledger.grant(contract.taskId, "selected-session");
  for (const event of fixtureEvents(f.ledger, contract.taskId, bound.claim, bound.bindingHash)) f.ledger.apply(event);
  const task = f.ledger.get(contract.taskId), reviewPath = join(f.root, "review.json");
  writeFileSync(reviewPath, JSON.stringify({ ...contract, resultId: task.result!.resultId, reason: "Operator review" }));
  writeFileSync(path, "changed after result\n");
  expect(cli("accept", reviewPath).stderr.toString()).toContain("STALE_CONTEXT_SOURCE");
  expect(f.ledger.get(contract.taskId).acceptance).toBeNull();
  expect(cli("cancel", contract.taskId).exitCode).toBe(0);
});
