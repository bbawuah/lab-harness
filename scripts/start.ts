import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("LAB-HARNESS interactive Pi workspace\nUsage: ./lab [--configure] [--offline]\nFirst launch asks for an explicit model endpoint and model.\nControlled LAB task execution remains unavailable (request admission unqualified).");
  process.exit(0);
}

try {
  // Acquisitions validate/reuse warm caches. Installation sends no model prompts.
  for (const script of ["scripts/herdr/acquire.ts", "scripts/acquire-rg.ts", "scripts/acquire-fd.ts", "scripts/pi/acquire.ts"]) {
    const code = await new Promise<number>((done, reject) => {
      const child = spawn(process.execPath, ["--no-env-file", "--no-install", join(root, script), ...(args.includes("--offline") ? ["--offline"] : [])], { cwd: root, stdio: "inherit" });
      child.once("error", reject); child.once("exit", code => done(code ?? 1));
    });
    if (code !== 0) process.exit(code);
  }
  const { runInteractiveWorkspace } = await import("../src/pi/workspace.ts");
  process.exitCode = await runInteractiveWorkspace({ configure: args.includes("--configure") });
} catch (error) {
  // These are local startup errors. Never dump arbitrary provider or input payloads.
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "WORKSPACE_START_FAILED";
  const message = error instanceof Error && /^(?:LAB interactive workspace requires a terminal|First run requires a terminal|Private key input requires an interactive terminal|Route setup cancelled|Endpoint must be an explicit HTTP|Local route requires localhost|Invalid workspace route|Pinned Pi runtime|Herdr is missing|Project ripgrep is missing)/.test(error.message)
    ? error.message : `${code}. Check installation and local route; use ./lab --configure to change it.`;
  console.error(`LAB: ${message}`);
  process.exitCode = 1;
}
