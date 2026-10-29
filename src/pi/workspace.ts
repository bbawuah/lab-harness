import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { verifyPiRuntime } from "../runtime/pi.ts";
import { runHerdrInteractive, verifyHerdrInteractive } from "../herdr/interactive.ts";
import rgSource from "../../contracts/ripgrep-source.json";
import { configureWorkspace, loadWorkspaceRoute, modelsForRoute, privateDirectory, writePrivate } from "./workspace-config.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export function verifyWorkspaceRg(): string {
  const executable = join(projectRoot, ".tmp/rg/rg"), stat = lstatSync(executable);
  const artifact = rgSource.artifacts.find(artifact => artifact.platform === process.platform && artifact.arch === process.arch);
  const hash = createHash("sha256").update(readFileSync(executable)).digest("hex");
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !artifact || artifact.binarySHA256 !== hash) throw new Error("Project ripgrep is missing or unverified; run ./install.sh");
  return executable;
}
/** Starts native Pi coding. No ledger task grant, ingest, or acceptance exists here. */
export async function runInteractiveWorkspace(options: { configure?: boolean } = {}): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("LAB interactive workspace requires a terminal");
  const runtime = verifyPiRuntime();
  const herdr = join(projectRoot, ".tmp/herdr/herdr");
  verifyHerdrInteractive(herdr); const rg = verifyWorkspaceRg();
  privateDirectory(join(projectRoot, ".tmp"));
  const state = join(projectRoot, ".tmp/workspace"); privateDirectory(state);
  const routePath = join(state, "route.json");
  if (options.configure || !lstatSync(routePath, { throwIfNoEntry: false })) await configureWorkspace(state);
  const { route, key } = loadWorkspaceRoute(state);
  const agent = join(state, "agent"); privateDirectory(agent);
  writePrivate(join(agent, "models.json"), JSON.stringify(modelsForRoute(route)) + "\n");
  // Extensions/skills/context are explicit: do not load global user integrations.
  // Persistent native Pi sessions and its own approvals remain native behavior.
  writePrivate(join(agent, "settings.json"), JSON.stringify({ defaultProvider: "lab-workspace", defaultModel: route.model, packages: [], quietStartup: false }) + "\n");
  const runs = join(state, "runs"); privateDirectory(runs);
  const run = mkdtempSync(join(runs, "h-"));
  const exitFile = join(run, "pi-exit");
  const wrapper = join(run, "pi.sh");
  writeFileSync(wrapper, '#!/bin/sh\numask 077\nexit_file="$1"\nshift\n"$@"\nstatus=$?\nprintf "%s\\n" "$status" > "$exit_file"\nexit "$status"\n', { flag: "wx", mode: 0o700 });
  const command = ["/bin/sh", wrapper, exitFile, ...runtime.command,
    "--offline", "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files",
    "--provider", "lab-workspace", "--model", route.model,
    "-e", join(projectRoot, "src/pi/workspace-extension.ts"),
    "--append-system-prompt", "This is the LAB-HARNESS native Pi interactive coding workspace. Controlled LAB ledger tasks are unavailable. Use lab_search and lab_files for bounded source search with hashes. Skills are loaded only by the operator with /lab-skill after /lab-skills. No tool result accepts a LAB task.",
  ];
  process.stdout.write("Starting LAB interactive workspace. Controlled LAB tasks remain unavailable.\nExit Pi with /exit; native sessions persist beneath this checkout's .tmp/workspace.\n");
  return runHerdrInteractive({ executable: herdr, command, cwd: projectRoot, stateRoot: run, exitFile,
    environment: {
      PATH: `${dirname(rg)}:${dirname(process.execPath)}:/usr/bin:/bin`, TERM: process.env.TERM ?? "xterm-256color", COLORTERM: process.env.COLORTERM,
      ...(process.env.NO_COLOR !== undefined ? { NO_COLOR: process.env.NO_COLOR } : {}),
      PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1", LAB_WORKSPACE_API_KEY: key || "lab-local-no-key",
      LAB_WORKSPACE_BUN: process.execPath, LAB_WORKSPACE_ROOT: projectRoot, LAB_WORKSPACE_USER_HOME: homedir(),
    },
  });
}
