import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { HerdrSmokeError, runHerdrSmoke } from "../src/herdr/index.ts";

// Explicit opt-in. These use a real verified runtime, never a fake socket/server.
const actual = process.env.LAB_HERDR_ACTUAL === "1" ? test : test.skip;
actual("actual Herdr: output, process status and full owned cleanup", async () => {
  const result = await runHerdrSmoke({ stateRoot: ".tmp" });
  expect(result.label).toBe("actual-herdr-owned-process");
  expect(result.observedOutput).toMatch(/^LAB_HERDR_OK_[0-9a-f]{16}\r?\n/);
  expect(result.stopped).toBe(true); expect(result.taskAcceptance).toBe("unchanged");
  expect((result.cleanup as any).forcedSignal).toBeUndefined();
  expect((result.workerStatus as any).process_info.shell_pid).toBe(result.workerPid);
  const persisted = JSON.parse(await readFile(`${result.runDirectory}/observation.json`, "utf8"));
  expect(persisted.stopped).toBe(true);
}, 20000);
actual("actual Herdr: deadline failure cleans up without affecting a concurrent run", async () => {
  const good = runHerdrSmoke({ stateRoot: ".tmp" });
  let failure: unknown;
  // Fast hosts may finish before 100ms. Tighten the deadline, never demand a race.
  for (const timeoutMs of [100, 10, 1]) {
    try { await runHerdrSmoke({ stateRoot: ".tmp", timeoutMs }); } catch (error) { failure = error; break; }
  }
  const result = await good;
  expect(failure).toBeInstanceOf(HerdrSmokeError);
  const failed = (failure as HerdrSmokeError).observation;
  expect(failed.failure).toMatch(/timeout/);
  expect((failed.cleanup as any).serverExited).toBe(true);
  expect((failed.cleanup as any).socketsRemoved).toBe(true);
  expect(failed.session).not.toBe(result.session);
  expect(failed.runDirectory).not.toBe(result.runDirectory);
  expect(result.stopped).toBe(true); expect(result.taskAcceptance).toBe("unchanged");
  // Evidence retained under .tmp for parent inspection.
}, 20000);
