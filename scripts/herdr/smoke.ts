import { HerdrSmokeError, runHerdrSmoke } from "../../src/herdr/index.ts";
import { fileURLToPath } from "node:url";

try {
  console.log(JSON.stringify(await runHerdrSmoke({ stateRoot: fileURLToPath(new URL("../../.tmp", import.meta.url)) }), null, 2));
} catch (error) {
  console.error(JSON.stringify(error instanceof HerdrSmokeError ? error.observation : { error: String(error) }, null, 2));
  process.exitCode = 1;
}
