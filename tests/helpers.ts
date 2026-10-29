import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach } from "bun:test";
import { CONCEPT_ROOT, Ledger } from "../src/ledger.ts";
import { fixtureTask } from "../src/fixtures.ts";

const opened: { ledger: Ledger; root: string }[] = [];
export function fresh() {
  mkdirSync(join(CONCEPT_ROOT, ".tmp"), { recursive: true, mode: 0o700 });
  const root = mkdtempSync(join(CONCEPT_ROOT, ".tmp/test-")); const f = { root, ledger: new Ledger(join(root, "lab")) };
  opened.push(f); const contract = fixtureTask(f.ledger, "T1"); f.ledger.create(contract); const bound = f.ledger.grant(contract.taskId, "S1");
  return Object.assign(f, { contract, ...bound });
}
afterEach(() => { for (const f of opened.splice(0)) { f.ledger.close(); rmSync(f.root, { recursive: true, force: true }); } });
