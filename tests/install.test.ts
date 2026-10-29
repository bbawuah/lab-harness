import { expect, test } from "bun:test";
import { chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const source = resolve(import.meta.dir, "..");
type Call = { args: string[]; cwd: string; cache?: string; transpiler?: string; path: string; loader?: string; nodeEnv?: string };

// Stubs exercise the actual shell entrypoint without network or recursive check.
// The loader-refusal case delegates the capability probe to real immutable Relay.
function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "lab-install-"));
  const project = join(root, "clone with spaces"), bin = join(root, "bin"), log = join(root, "calls.jsonl");
  mkdirSync(project); mkdirSync(bin);
  copyFileSync(join(source, "install.sh"), join(project, "install.sh"));
  copyFileSync(join(source, ".bun-version"), join(project, ".bun-version"));
  const executable = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, name), 0o700);
  };
  for (const utility of ["cat", "dirname"]) symlinkSync(Bun.which(utility)!, join(bin, utility));
  executable("git", 'exit "${TEST_GIT_STATUS:-0}"');
  executable("uname", 'if [ "$1" = -s ]; then printf "%s\\n" "${TEST_OS:-Darwin}"; else printf "%s\\n" "${TEST_ARCH:-arm64}"; fi');
  executable("tar", "exit 0");
  executable("bun", 'exec "$TEST_REAL_BUN" --no-env-file --no-install "$TEST_DRIVER" "$@"');
  const driver = join(root, "driver.ts");
  writeFileSync(driver, `
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args.includes("--version")) { console.log(process.env.TEST_BUN_VERSION ?? "1.4.2"); process.exit(0); }
appendFileSync(process.env.TEST_LOG!, JSON.stringify({ args, cwd: process.cwd(), cache: process.env.BUN_INSTALL_CACHE_DIR, transpiler: process.env.BUN_RUNTIME_TRANSPILER_CACHE_PATH, path: process.env.PATH, loader: process.env.LD_LIBRARY_PATH, nodeEnv: process.env.NODE_ENV }) + "\\n");
const stage = args.includes("-e") ? "capability" : args.includes("install") ? "install" : args.at(-1);
if (stage === process.env.TEST_FAIL) { console.error("deliberate failure: " + stage); process.exit(37); }
if (stage === "capability" && process.env.TEST_REAL_PROBE) {
  const result = Bun.spawnSync([process.env.TEST_REAL_BUN!, ...args], { stdout: "inherit", stderr: "inherit" });
  process.exit(result.exitCode);
}
`);
  const run = (extra: Record<string, string> = {}, args: string[] = []) => Bun.spawnSync(["/bin/sh", join(project, "install.sh"), ...args], {
    cwd: root, timeout: 15000, stdout: "pipe", stderr: "pipe",
    env: { PATH: bin, TEST_REAL_BUN: process.execPath, TEST_DRIVER: driver, TEST_LOG: log, ...extra },
  });
  const calls = (): Call[] => { try { return readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line)); } catch { return []; } };
  return { root, project, bin, run, calls, clean: () => rmSync(root, { recursive: true, force: true }) };
}

test("installer resolves spaces/wrong cwd, installs frozen without scripts, scopes caches/PATH and prints next commands", () => {
  const f = fixture();
  try {
    const result = f.run({ NODE_ENV: "production", BUN_INSTALL_CACHE_DIR: "/outside-cache" });
    expect(result.exitCode).toBe(0);
    const calls = f.calls();
    expect(calls.map(call => call.args.at(-1))).toEqual([
      'import { assertPublishCapability } from "./vendor/relay/src/storage/publish.ts"; assertPublishCapability();',
      join(f.project, ".tmp/bun-cache"), "setup:herdr", "setup:rg", "check", "smoke:herdr",
    ]);
    for (const call of calls) {
      expect(call.cwd).toBe(f.project);
      expect(call.cache).toBe(join(f.project, ".tmp/bun-cache"));
      expect(call.transpiler).toBe(join(f.project, ".tmp/bun-transpiler-cache"));
      expect(call.args[0]).toBe("--no-env-file");
    }
    expect(calls[1]!.args).toEqual(["--no-env-file", "install", "--frozen-lockfile", "--ignore-scripts", "--prefer-offline", "--cache-dir", join(f.project, ".tmp/bun-cache")]);
    expect(calls[1]!.nodeEnv).toBe("development");
    expect(calls[4]!.path).toBe(`${f.project}/.tmp/rg:${f.bin}`);
    expect(result.stdout.toString()).toContain("bun --no-env-file run demo:terminal");
    expect(result.stdout.toString()).toContain("bun --no-env-file run check:actual");
    expect(result.stdout.toString()).toContain("Native Pi activation remains blocked");
  } finally { f.clean(); }
});

for (const [name, env, missing, message] of [
  ["missing Git", {}, "git", "Git is required"],
  ["broken Git", { TEST_GIT_STATUS: "1" }, "", "Git is not working"],
  ["missing Bun", {}, "bun", "Bun 1.4.2 is required"],
  ["wrong Bun", { TEST_BUN_VERSION: "1.4.1" }, "", "found 1.4.1"],
  ["unsupported OS", { TEST_OS: "FreeBSD" }, "", "Unsupported platform FreeBSD/arm64"],
  ["unavailable pinned rg", { TEST_OS: "Linux", TEST_ARCH: "aarch64" }, "", "Unsupported platform Linux/aarch64"],
  ["missing tar", {}, "tar", "tar is required"],
] as const) {
  test(`installer refuses ${name} before downloads`, () => {
    const f = fixture();
    try {
      if (missing) rmSync(join(f.bin, missing));
      const result = f.run(env);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain(message);
      expect(f.calls()).toEqual([]);
    } finally { f.clean(); }
  });
}

for (const stage of ["capability", "install", "setup:herdr", "setup:rg", "check", "smoke:herdr"]) {
  test(`installer propagates ${stage} failure and never reports success`, () => {
    const f = fixture();
    try {
      const result = f.run({ TEST_FAIL: stage });
      expect(result.exitCode).toBe(37);
      expect(result.stderr.toString()).toContain(`deliberate failure: ${stage}`);
      expect(result.stdout.toString()).not.toContain("Installation complete");
      const last = f.calls().at(-1)!;
      expect(stage === "capability" ? last.args.includes("-e") : last.args.includes(stage)).toBe(true);
    } finally { f.clean(); }
  });
}

test("installer preserves loader variables and real Relay refusal before dependency install", () => {
  const f = fixture();
  try {
    cpSync(join(source, "vendor"), join(f.project, "vendor"), { recursive: true });
    const result = f.run({ TEST_REAL_PROBE: "1", LD_LIBRARY_PATH: "/untrusted-loader" });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("Atomic message database publication is unavailable");
    expect(f.calls()).toHaveLength(1);
    expect(f.calls()[0]!.loader).toBe("/untrusted-loader");
  } finally { f.clean(); }
});

test("installer rejects unknown arguments before invoking tools", () => {
  const f = fixture();
  try {
    expect(f.run({}, ["--offline"]).stderr.toString()).toContain("Usage: ./install.sh");
    expect(f.calls()).toEqual([]);
  } finally { f.clean(); }
});
