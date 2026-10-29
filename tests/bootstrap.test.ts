import { expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "lab-bootstrap-"));
  const home = join(root, "home ' with spaces"), bin = join(root, "bin"), source = join(root, "source"), log = join(root, "calls");
  mkdirSync(home); mkdirSync(bin); mkdirSync(source);
  const executable = (path: string, body: string) => { writeFileSync(path, `#!/bin/sh\n${body}\n`); chmodSync(path, 0o700); };
  executable(join(source, "install.sh"), 'printf "install\\n" >> "$TEST_LOG"; exit "${TEST_INSTALL_STATUS:-0}"');
  executable(join(source, "lab"), 'printf "launch\\n" >> "$TEST_LOG"; test -t 0 || exit 91; printf "TTY_READY\\n"; read -r answer; printf "TTY_ANSWER:%s\\n" "$answer"');
  const archive = join(root, "harness.tar.gz");
  const pack = Bun.spawnSync(["tar", "-czf", archive, "-C", root, "source"]); if (pack.exitCode) throw new Error("fixture tar failed");
  const hash = createHash("sha256").update(readFileSync(archive)).digest("hex");
  const script = join(root, "bootstrap.sh");
  const text = readFileSync(resolve(import.meta.dir, "../bootstrap.sh"), "utf8")
    .replace(/bootstrap_commit=[^\n]+/, `bootstrap_commit=${"a".repeat(40)}`)
    .replace(/bootstrap_sha256=[^\n]+/, `bootstrap_sha256=${hash}`);
  writeFileSync(script, text);
  for (const name of ["uname", "tar", "mktemp", "diff", "find", "sed", "mkdir", "mv", "rm", "chmod", "head", "tail", "grep", "cat", "sh"]) symlinkSync(Bun.which(name)!, join(bin, name));
  const hashName = Bun.which("sha256sum") ? "sha256sum" : "shasum";
  executable(join(bin, hashName), `exec '${Bun.which(hashName)!.replace(/'/g, "'\\''")}' "$@"`);
  executable(join(bin, "curl"), 'while [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then shift; cp "$TEST_ARCHIVE" "$1"; exit 0; fi; shift; done; exit 94');
  symlinkSync(Bun.which("cp")!, join(bin, "cp"));
  for (const tool of ["git", "bun", "pi"]) executable(join(bin, tool), 'printf "unexpected prerequisite\\n" >> "$TEST_LOG"; exit 99');
  const env = { PATH: `${bin}:/usr/bin:/bin`, HOME: home, TEST_ARCHIVE: archive, TEST_LOG: log, TEST_BOOTSTRAP_SCRIPT: script, SHELL: "/bin/sh", TERM: "xterm-256color" };
  const run = (args: string[] = [], extra: Record<string, string> = {}) => Bun.spawnSync(["/bin/sh", script, ...args], { env: { ...env, ...extra }, stdout: "pipe", stderr: "pipe", timeout: 10000 });
  const calls = () => { try { return readFileSync(log, "utf8"); } catch { return ""; } };
  return { root, home, script, archive, env, run, calls, destination: join(home, ".local/share/lab-harness/releases", "a".repeat(40)), clean: () => rmSync(root, { recursive: true, force: true }) };
}

test("public bootstrap installs outside a checkout without Git/Bun/Pi, reuses verified source and quotes owned launcher", () => {
  const f = fixture();
  try {
    const first = f.run(); expect(first.exitCode, first.stderr.toString().slice(-2000) + first.stdout.toString().slice(-1000)).toBe(0); expect(f.calls()).toBe("install\n");
    expect(first.stdout.toString()).toContain("Installation only");
    const second = f.run(["--install-only"]); expect(second.exitCode, second.stderr.toString().slice(-2000)).toBe(0); expect(f.calls()).toBe("install\ninstall\n");
    const launcher = readFileSync(join(f.home, ".local/share/lab-harness/lab"), "utf8");
    expect(launcher).toContain("LAB_WORKSPACE_STATE_ROOT");
    expect(Bun.spawnSync(["/bin/sh", "-n", join(f.home, ".local/share/lab-harness/lab")]).exitCode).toBe(0);
    expect(readFileSync(join(f.destination, "lab"), "utf8")).toContain("TTY_READY");
  } finally { f.clean(); }
});

test("bootstrap checksum, existing-source and installation failures never report success or overwrite launcher", () => {
  const f = fixture();
  try {
    expect(f.run([], { TEST_INSTALL_STATUS: "37" }).exitCode).not.toBe(0); expect(f.calls()).toBe("install\n");
    const repaired = f.run(); expect(repaired.exitCode, repaired.stderr.toString().slice(-2000)).toBe(0);
    writeFileSync(join(f.destination, "install.sh"), "modified source");
    expect(f.run().stderr.toString()).toContain("Installed release source changed");
    writeFileSync(f.archive, "corrupt");
    expect(f.run().stderr.toString()).toContain("Harness checksum mismatch");
    expect(f.calls()).toBe("install\ninstall\n");
  } finally { f.clean(); }
});

test("bootstrap refuses a symlink user-data installation root", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.home, ".local/share"), { recursive: true });
    symlinkSync(f.root, join(f.home, ".local/share/lab-harness"));
    expect(f.run().stderr.toString()).toContain("Refusing symlink installation path"); expect(f.calls()).toBe("");
  } finally { f.clean(); }
});

test("piped bootstrap attaches interactive input to controlling TTY instead of consuming script bytes", async () => {
  const f = fixture();
  try {
    let output = "", sent = false;
    const child = Bun.spawn(["/bin/sh", "-c", 'cat "$TEST_BOOTSTRAP_SCRIPT" | sh'], {
      env: f.env,
      terminal: { cols: 80, rows: 24, data(terminal, data) {
        output += new TextDecoder().decode(data);
        if (!sent && output.includes("TTY_READY")) { sent = true; terminal.write("PIPE_SAFE_INPUT\n"); }
      } },
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 8000);
    try { expect(await child.exited).toBe(0); } finally { clearTimeout(timer); child.terminal!.close(); }
    expect(output).toContain("TTY_READY"); expect(output).toContain("TTY_ANSWER:PIPE_SAFE_INPUT");
    expect(f.calls()).toBe("install\nlaunch\n");
  } finally { f.clean(); }
});
