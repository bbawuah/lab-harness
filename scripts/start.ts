import { spawn } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";
import { verifyInstalledRuntime } from "../src/runtime/verify.ts";
import { shellHelp } from "../src/pi/commands.ts";

const root = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
let project: string | undefined;
let relayGroup: string | undefined;
const caller = process.env.LAB_CALLER_CWD;
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--project") {
    if (project || !args[index + 1] || args[index + 1]!.startsWith("--")) { console.error("LAB: use --project DIR once."); process.exit(2); }
    const value = args[++index]!;
    project = isAbsolute(value) ? resolve(value) : resolve(caller ?? process.cwd(), value);
  } else if (args[index] === "--relay-group") {
    const value = args[++index];
    if (relayGroup || !value || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) { console.error("LAB: use --relay-group ID once; configure its private project allowlist first."); process.exit(2); }
    relayGroup = value;
  } else if (!["--help", "--configure", "--offline"].includes(args[index]!)) { console.error("LAB: unknown option. Run lab --help."); process.exit(2); }
}
if (args.includes("--help")) {
  console.log(shellHelp());
  process.exit(0);
}

try {
  let ready = false;
  try { verifyInstalledRuntime(); ready = true; } catch {}
  // A healthy launch only reads the release. Explicit missing/corrupt dependency
  // repair is installation work; it sends no model prompts.
  for (const script of ready ? [] : ["scripts/herdr/acquire.ts", "scripts/acquire-rg.ts", "scripts/acquire-fd.ts", "scripts/pi/acquire.ts"]) {
    const code = await new Promise<number>((done, reject) => {
      const child = spawn(process.execPath, ["--no-env-file", "--no-install", join(root, script), ...(args.includes("--offline") ? ["--offline"] : [])], { cwd: root, stdio: "inherit" });
      child.once("error", reject); child.once("exit", code => done(code ?? 1));
    });
    if (code !== 0) process.exit(code);
  }
  const { runInteractiveWorkspace } = await import("../src/pi/workspace.ts");
  const workspaceOptions = { configure: args.includes("--configure"), project: project ?? caller ?? process.cwd(), relayGroup };
  process.exitCode = await runInteractiveWorkspace(workspaceOptions);
} catch (error) {
  // These are local startup errors. Never dump arbitrary provider or input payloads.
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "WORKSPACE_START_FAILED";
  const message = code === "PROJECT_SELECTION_CANCELLED" ? "Project selection cancelled; no workspace started." : code.startsWith("RELAY_") ? code + ". Check the selected project, private Relay state and explicit group configuration." : code.startsWith("PROJECT_") || code === "INVALID_PROJECT_DIRECTORY" ? `${code}. Choose an existing project with --project DIR.` : error instanceof Error && /^(?:LAB interactive workspace requires a terminal|First run requires a terminal|Private key input requires an interactive terminal|Route setup cancelled|Endpoint must be an explicit HTTP|Local route requires localhost|Invalid workspace route|Workspace state|Stable workspace state|LAB_WORKSPACE_STATE_ROOT|Pinned Pi runtime|Herdr is missing|Project ripgrep is missing)/.test(error.message)
    ? error.message : `${code}. Check installation and local route; use ./lab --configure to change it.`;
  console.error(`LAB: ${message}`);
  process.exitCode = 1;
}
