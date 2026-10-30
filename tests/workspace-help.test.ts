import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shellHelp, shellOptions, workspaceCommands, workspaceHelp } from "../src/pi/commands.ts";
import extension from "../src/pi/workspace-extension.ts";

test("shell help is available without TTY, configuration or model startup; unknown options fail", () => {
  const cli = resolve(import.meta.dir, "../scripts/start.ts");
  const help = Bun.spawnSync([process.execPath, "--no-env-file", "--no-install", cli, "--help"], { env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent-lab-fixture" } });
  expect(help.exitCode, help.stderr.toString()).toBe(0); expect(help.stdout.toString().trim()).toBe(shellHelp());
  const bad = Bun.spawnSync([process.execPath, "--no-env-file", "--no-install", cli, "--not-a-command"]);
  expect(bad.exitCode).toBe(2); expect(bad.stderr.toString()).toContain("unknown option");
  expect(help.stdout.toString()).toContain("model requests may still use the network");
});

test("LAB help is an operator command, preserves native help and reports only available LAB commands", async () => {
  const commands = new Map<string, any>(), messages: any[] = [], options: unknown[] = [];
  extension({ on() {}, registerTool() {}, registerCommand(name, command) { commands.set(name, command); }, sendMessage(message, option) { messages.push(message); options.push(option); } });
  expect(commands.has("help")).toBe(false);
  await commands.get("lab-help").handler("", {});
  expect(messages).toEqual([{ customType: "lab-help", content: workspaceHelp(), display: true }]);
  expect(options).toEqual([{ triggerTurn: false }]);
  const guide = readFileSync(resolve(import.meta.dir, "../docs/user-guide.md"), "utf8");
  for (const command of workspaceCommands) { expect(commands.has(command.name)).toBe(true); expect(guide).toContain("/" + command.name); }
  for (const [option] of shellOptions) expect(guide).toContain(option.split(" ")[0]!);
  expect(workspaceHelp()).toContain("/relay-send");
  expect(workspaceHelp()).toContain("/hotkeys");
  expect(workspaceHelp()).not.toContain("Pi /help");
  expect(guide).toContain("no built-in /help");
  expect(shellHelp()).not.toContain("--profile");
});
