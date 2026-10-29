import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { HerdrSmokeError, isolatedEnvironment, runHerdrSmoke } from "../src/herdr/index.ts";

test("Herdr child environment is an allowlist with no inherited credentials or dotenv", () => {
  const env = isolatedEnvironment("/owned", "lab-owned");
  expect(env.PATH).toBe("/usr/bin:/bin");
  expect(env.HOME).toBe("/owned/home");
  expect(env.HERDR_SOCKET_PATH).toBe("/owned/s.sock");
  expect(env.ENV).toBeUndefined(); expect(env.BASH_ENV).toBeUndefined();
  expect(env.ANTHROPIC_API_KEY).toBeUndefined(); expect(env.OPENAI_API_KEY).toBeUndefined();
  expect(env.HERDR_MACOS_SERVER_CONTEXT).toBeUndefined();
});
test("Herdr refuses state outside .tmp and symlink escape", async () => {
  await expect(runHerdrSmoke({ stateRoot: "." })).rejects.toThrow("inside this project's .tmp");
  await mkdir(".tmp", { recursive: true });
  const root = await mkdtemp(resolve(".tmp/e-"));
  try {
    await symlink(resolve("."), join(root, "escape"));
    await expect(runHerdrSmoke({ stateRoot: join(root, "escape") })).rejects.toThrow("symlink escapes");
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("Herdr unavailable or unverified runtime never reports smoke success", async () => {
  await mkdir(".tmp", { recursive: true });
  const root = await mkdtemp(resolve(".tmp/f-"));
  try {
    const fake = join(root, "not-herdr"); await writeFile(fake, "not a runtime");
    for (const executable of [join(root, "missing"), fake]) {
      let failure: unknown;
      try { await runHerdrSmoke({ stateRoot: ".tmp", executable }); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(HerdrSmokeError);
      const observation = (failure as HerdrSmokeError).observation;
      expect(observation.observedOutput).toBe(""); expect(observation.serverPid).toBeUndefined();
      expect(observation.taskAcceptance).toBe("unchanged");
      await rm(observation.runDirectory as string, { recursive: true, force: true });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
