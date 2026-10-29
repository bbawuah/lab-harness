import { expect, test } from "bun:test";
import { CONCEPT_ROOT, Ledger } from "../src/ledger.ts";
import { terminalDemo } from "../src/terminal-demo.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const actual = process.env.LAB_HERDR_ACTUAL === "1" ? test : test.skip;
actual("actual integrated Herdr/Relay/source context leaves explicit operator acceptance pending", async () => {
  const result = await terminalDemo();
  expect(result.state).toBe("result_available"); expect(result.acceptance).toBeNull(); expect(result.actualModelCalls).toBe(0);
  expect(result.selectedSkill).toMatchObject({ executed: false });
  const root = result.stateDirectory as string, ledger = new Ledger(join(root, "lab"));
  try {
    const task = ledger.get(result.taskId as string), context = ledger.readContext(task.contract.contextHash);
    expect(context.requirements).toEqual(task.contract.requirements);
    expect(task.contract.profile.mode).toBe("fixture"); expect(task.outcome).toBe("settled");
    const review = JSON.parse(readFileSync(join(root, "review.json"), "utf8"));
    // This trusted test operator explicitly accepts only after checking the stored evidence.
    const operator = Bun.spawnSync([process.execPath, "--no-env-file", "--no-install", join(CONCEPT_ROOT, "src/cli.ts"), "--skill-sources", join(root, "skill-origins.json"), "--state", join(root, "lab"), "accept", join(root, "review.json")], { env: { PATH: process.env.PATH ?? "" }, stdout: "pipe", stderr: "pipe" });
    expect(operator.exitCode).toBe(0);
    expect(ledger.get(review.taskId).state).toBe("accepted");
  } finally { ledger.close(); }
}, 20000);
