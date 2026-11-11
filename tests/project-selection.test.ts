import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lab-home-selection-")));
  const home = join(root, "new home"), source = join(root, "source"), bin = join(root, "bin");
  const project = join(home, "Projects", "project B with spaces"), capture = join(root, "launch.json");
  for (const path of [home, project, bin, join(source, "scripts"), join(source, "src/pi"), join(source, "src/runtime"), join(source, "src/herdr"), join(source, "src/relay"), join(source, "contracts"), join(source, ".tmp/rg")]) mkdirSync(path, { recursive: true, mode: 0o700 });
  // Real public bootstrap, launcher, CLI, selection, route setup and workspace.
  // Dependency acquisition/verification and final attachment are fixture adapters;
  // no provider or model is started by this regression.
  for (const path of ["lab", "scripts/start.ts", "src/project.ts", "src/util.ts", "src/herdr/shell.ts", "src/pi/commands.ts", "src/pi/relay-extension.ts", "src/pi/relay-delivery.ts", "src/pi/relay-display.ts", "src/pi/header.ts", "src/pi/terminal-mark.json", "src/pi/workspace.ts", "src/pi/workspace-config.ts", "src/pi/workspace-project.ts", "src/pi/appearance.ts", "src/pi/appearance-store.ts", "src/pi/appearance-store-helper.ts", "src/pi/appearance-theme.ts", "src/pi/appearance-read.ts", "src/pi/workspace-appearance.ts", "src/pi/workspace-appearance-store.ts", "src/pi/permission-extension.ts", "src/pi/permission.ts", "src/pi/status-indicator.ts", "src/pi/display.ts"]) copyFileSync(resolve(import.meta.dir, "..", path), join(source, path));
  writeFileSync(join(source, "src/pi/agent-host.ts"), "export async function startAgentHost(){throw new Error(\"fixture does not start agents\");}\n");
  writeFileSync(join(source, "scripts/runtime-bun.sh"), 'lab_bun="$TEST_REAL_BUN"\n');
  writeFileSync(join(source, "install.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  writeFileSync(join(source, "src/runtime/verify.ts"), "export function verifyInstalledRuntime(){}\n");
  writeFileSync(join(source, "src/relay/workspace.ts"),'import {writeFileSync} from "node:fs";import {join} from "node:path";export function provisionWorkspaceRelayRun(options){const path=join(options.runRoot,"relay-run.json");writeFileSync(path,"fixture",{mode:0o600});return path;}\n');
  writeFileSync(join(source, "src/runtime/pi.ts"), 'export function verifyPiRuntime(){return {command:["/fixture/no-provider"],version:"fixture"};}\n');
  writeFileSync(join(source, "src/herdr/interactive.ts"), 'import {writeFileSync} from "node:fs"; export function verifyHerdrInteractive(){} export async function runHerdrInteractive(options){writeFileSync(process.env.TEST_CAPTURE,JSON.stringify(options));console.log("FIXTURE_PROJECT_LAUNCHED");return 0;}\n');
  writeFileSync(join(source, ".tmp/rg/rg"), "fixture rg", { mode: 0o700 });
  writeFileSync(join(source, "contracts/ripgrep-source.json"), JSON.stringify({ artifacts: [{ platform: process.platform, arch: process.arch, binarySHA256: createHash("sha256").update("fixture rg").digest("hex") }] }));
  writeFileSync(join(project, "project-only.md"), "PROJECT_SOURCE\n");
  writeFileSync(join(home, ".private-home-fixture"), "MUST_NOT_DISCOVER\n");
  symlinkSync(project, join(home, "project link"));
  const archive = join(root, "harness.tar.gz");
  const pack = Bun.spawnSync(["tar", "-czf", archive, "-C", root, "source"]); if (pack.exitCode) throw new Error("fixture archive failed");
  const script = join(root, "bootstrap.sh"), commit = "b".repeat(40);
  writeFileSync(script, readFileSync(resolve(import.meta.dir, "../bootstrap.sh"), "utf8").replace(/bootstrap_commit=[^\n]+/, `bootstrap_commit=${commit}`).replace(/bootstrap_sha256=[^\n]+/, `bootstrap_sha256=${createHash("sha256").update(readFileSync(archive)).digest("hex")}`));
  writeFileSync(join(bin, "curl"), '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then shift; cp "$TEST_ARCHIVE" "$1"; exit 0; fi; shift; done\ncat "$TEST_BOOTSTRAP"\n', { mode: 0o700 });
  const env: NodeJS.ProcessEnv = { PATH: `${bin}:/usr/bin:/bin`, HOME: home, TERM: "xterm-256color", TEST_ARCHIVE: archive, TEST_BOOTSTRAP: script, TEST_REAL_BUN: process.execPath, TEST_CAPTURE: capture };
  const launcher = join(home, ".local/share/lab-harness/lab"), state = join(home, ".local/share/lab-harness/workspace");
  return { root, home, project, capture, source, env, launcher, state, install: join(home, ".local/share/lab-harness/releases", commit), clean: () => rmSync(root, { recursive: true, force: true }) };
}

async function terminalRun(f: ReturnType<typeof fixture>, command: string[], cwd: string, responses: Array<[string, string]>) {
  let output = "", cursor = 0;
  const child = Bun.spawn(command, { cwd, env: f.env, terminal: { cols: 100, rows: 30, data(terminal, bytes) {
    output += new TextDecoder().decode(bytes);
    const next = responses[0];
    if (next) {
      const at = output.indexOf(next[0], cursor);
      if (at >= 0) { cursor = at + next[0].length; responses.shift(); terminal.write(next[1]); }
    }
  } } });
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  try { return { code: await child.exited, output, remaining: responses.length }; }
  finally { clearTimeout(timer); child.terminal!.close(); }
}

test("bootstrap and global launcher use the caller directory, including HOME and the harness checkout", async () => {
  const f = fixture();
  try {
    const result = await terminalRun(f, ["/bin/sh", "-c", "curl -fsSL https://fixture.invalid/bootstrap.sh | sh"], f.home, [
      ["Route (anthropic, openai, local or litellm): ", "local\n"], ["base URL (including /v1 where required): ", "http://127.0.0.1:9/v1\n"],
      ["model ID or existing LiteLLM alias: ", "fixture-no-inference\n"], ["API key (private; blank for unauthenticated local server): ", "\n"],
    ]);
    expect(result.code, result.output).toBe(0); expect(result.remaining).toBe(0);
    expect(result.output).not.toContain("Project directory:");
    expect(JSON.parse(readFileSync(f.capture,"utf8")).cwd).toBe(f.home);
    for (const cwd of [f.project, f.install, f.home]) {
      const next = await terminalRun(f, [f.launcher, "--offline"], cwd, []);
      expect(next.code, next.output).toBe(0); expect(next.output).not.toContain("Project directory:");
      expect(JSON.parse(readFileSync(f.capture,"utf8")).cwd).toBe(cwd);
    }
    const selected = await terminalRun(f, [f.launcher, "--project", "Projects/project B with spaces"], f.home, []);
    expect(selected.code, selected.output).toBe(0);
    expect(JSON.parse(readFileSync(f.capture,"utf8")).cwd).toBe(f.project);
  } finally { f.clean(); }
}, 20000);

test("invalid directories and private application state remain refused", async () => {
  const f = fixture();
  try {
    const install = Bun.spawnSync(["/bin/sh", "-c", "curl -fsSL https://fixture.invalid/bootstrap.sh | sh"], { cwd:f.home, env:f.env });
    expect(install.exitCode).toBe(0);
    mkdirSync(f.state,{recursive:true});
    for (const path of [f.state, join(f.home,"missing"), join(f.home,"project link")]) {
      const result = await terminalRun(f,[f.launcher,"--project",path],f.home,[]);
      expect(result.code,result.output).toBe(1);
      expect(existsSync(f.capture)).toBe(false);
    }
  } finally { f.clean(); }
});
