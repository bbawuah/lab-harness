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
  for (const path of ["lab", "scripts/start.ts", "src/project.ts", "src/util.ts", "src/pi/commands.ts", "src/pi/relay-extension.ts", "src/pi/workspace.ts", "src/pi/workspace-config.ts", "src/pi/workspace-project.ts"]) copyFileSync(resolve(import.meta.dir, "..", path), join(source, path));
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

test("curl from fresh HOME selects a valid project before route setup, retries unsafe/bad paths and launches only B", async () => {
  const f = fixture();
  try {
    const result = await terminalRun(f, ["/bin/sh", "-c", "curl -fsSL https://fixture.invalid/bootstrap.sh | sh"], f.home, [
      ["Project directory: ", "~\n"], ["Project directory: ", "missing\n"], ["Project directory: ", ".local/share/lab-harness\n"],
      ["Project directory: ", "project link\n"], ["Project directory: ", "~/Projects/project B with spaces\n"],
      ["Route (local or litellm): ", "local\n"], ["base URL (including /v1 where required): ", "http://127.0.0.1:9/v1\n"],
      ["model ID or existing LiteLLM alias: ", "fixture-no-inference\n"], ["API key (private; blank for unauthenticated local server): ", "\n"],
    ]);
    expect(result.code, result.output.slice(-3000)).toBe(0); expect(result.remaining).toBe(0);
    expect(result.output).toContain("LAB will not search your home folder"); expect(result.output).toContain("FIXTURE_PROJECT_LAUNCHED");
    const launch = JSON.parse(readFileSync(f.capture, "utf8"));
    expect(launch.cwd).toBe(f.project); expect(launch.environment.LAB_WORKSPACE_ROOT).toBe(f.project);
    expect(launch.environment.LAB_INSTALL_ROOT).toBe(f.install); expect(launch.stateRoot.startsWith(join(f.state, "runs") + "/")).toBe(true);
    expect(existsSync(join(f.project, ".local"))).toBe(false); expect(result.output).not.toContain("MUST_NOT_DISCOVER");
    // The exact generated launcher still works from a known project without selection.
    const again = await terminalRun(f, [f.launcher, "--offline"], f.project, []);
    expect(again.code, again.output.slice(-2000)).toBe(0); expect(again.output).not.toContain("Project directory: ");
    expect(JSON.parse(readFileSync(f.capture, "utf8")).cwd).toBe(f.project);
    // Relative selections use the original caller, even when --project named
    // another unsafe application ancestor with a different valid relative path.
    const caller = join(f.home, "caller"), requested = join(f.home, ".local/share/lab-harness");
    for (const path of [join(caller, "project"), join(requested, "project")]) mkdirSync(path, { recursive: true });
    const selected = await terminalRun(f, [f.launcher, "--project", requested], caller, [["Project directory: ", "project\n"]]);
    expect(selected.code, selected.output.slice(-2000)).toBe(0); expect(selected.remaining).toBe(0);
    expect(JSON.parse(readFileSync(f.capture, "utf8")).cwd).toBe(join(caller, "project"));
  } finally { f.clean(); }
}, 20000);

test("HOME selection blank, Ctrl-C and Ctrl-D cancel without private state or workspace startup", async () => {
  for (const answer of ["\n", "\x03", "\x04"]) {
    const f = fixture();
    try {
      const result = await terminalRun(f, ["/bin/sh", "-c", "curl -fsSL https://fixture.invalid/bootstrap.sh | sh"], f.home, [["Project directory: ", answer]]);
      expect(result.code, result.output.slice(-2000)).toBe(1); expect(result.remaining).toBe(0);
      expect(result.output).toContain("Project selection cancelled"); expect(existsSync(f.capture)).toBe(false); expect(existsSync(f.state)).toBe(false);
    } finally { f.clean(); }
  }
}, 30000);

test("noTTY HOME bootstrap is install-only; direct selection refuses; invalid explicit project never starts", async () => {
  const f = fixture();
  try {
    const install = Bun.spawnSync(["/bin/sh", "-c", "curl -fsSL https://fixture.invalid/bootstrap.sh | sh"], { cwd: f.home, env: f.env });
    expect(install.exitCode, install.stderr.toString()).toBe(0); expect(install.stdout.toString()).toContain("Installation only");
    expect(existsSync(f.state)).toBe(false); expect(existsSync(f.capture)).toBe(false);
    const script = `import {selectWorkspaceProject} from ${JSON.stringify(join(f.install, "src/pi/workspace-project.ts"))}; try { await selectWorkspaceProject(process.cwd(),${JSON.stringify(f.install)}); } catch(e) { console.log(e.code); process.exitCode=1; }`;
    const noTTY = Bun.spawnSync([process.execPath, "--no-env-file", "--eval", script], { cwd: f.home, env: f.env });
    expect(noTTY.exitCode).toBe(1); expect(noTTY.stdout.toString()).toContain("PROJECT_SELECTION_REQUIRES_TTY");
    const invalid = await terminalRun(f, [f.launcher, "--project", join(f.home, "missing")], f.home, []);
    expect(invalid.code, invalid.output).toBe(1); expect(invalid.output).not.toContain("Route (local");
    expect(existsSync(f.state)).toBe(false); expect(existsSync(f.capture)).toBe(false);
  } finally { f.clean(); }
});
