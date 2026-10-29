import { acquirePiRuntime } from "../../src/runtime/pi.ts";

const args = process.argv.slice(2);
if (args.some(arg => arg !== "--offline") || args.length > 1) {
  console.error("Usage: bun --no-env-file --no-install scripts/pi/acquire.ts [--offline]");
  process.exitCode = 2;
} else {
  try { console.log(JSON.stringify(await acquirePiRuntime({ offline: args.includes("--offline") }))); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
