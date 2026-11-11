import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lab-update-test-"));
  const source = join(root, "source"), home = join(root, "home"), bin = join(root, "bin"), temporary = join(root, "temporary");
  for (const path of [join(source, "scripts"), home, bin, temporary]) mkdirSync(path, { recursive: true });
  for (const file of ["lab", "scripts/update.sh"]) copyFileSync(resolve(import.meta.dir, "..", file), join(source, file));
  const bootstrap = join(root, "bootstrap.sh"), called = join(root, "called"), fetched = join(root, "fetched");
  const saved = join(home, "workspace.json"); writeFileSync(saved, "existing route and sessions fixture\n");
  writeFileSync(bootstrap, '#!/bin/sh\nprintf "%s\\n" "$@" > "$TEST_CALLED"\nexit "${TEST_BOOTSTRAP_EXIT:-0}"\n');
  writeFileSync(join(bin, "curl"), '#!/bin/sh\nprintf "%s\\n" "$@" > "$TEST_FETCHED"\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = -o ]; then shift; cp "$TEST_BOOTSTRAP" "$1"; exit "${TEST_CURL_EXIT:-0}"; fi\n  shift\ndone\nexit 99\n', { mode: 0o700 });
  const env = { HOME: home, PATH: `${bin}:/usr/bin:/bin`, TMPDIR: temporary, TEST_BOOTSTRAP: bootstrap, TEST_CALLED: called, TEST_FETCHED: fetched };
  const run = (args: string[] = ["update"], extra: Record<string, string> = {}) => Bun.spawnSync(["/bin/sh", join(source, "lab"), ...args], { cwd: home, env: { ...env, ...extra } });
  return { root, bootstrap, called, fetched, temporary, saved, run, clean() { rmSync(root, { recursive: true, force: true }); } };
}

test("update runs without Bun or project setup and invokes install-only after complete HTTPS download", () => {
  const f = fixture();
  try {
    const result = f.run();
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(readFileSync(f.called, "utf8")).toBe("--install-only\n");
    const args = readFileSync(f.fetched, "utf8");
    expect(args).toContain("--proto\n=https\n--proto-redir\n=https");
    expect(args).toContain("https://raw.githubusercontent.com/bbawuah/lab-harness/main/bootstrap.sh");
    expect(readFileSync(f.saved, "utf8")).toBe("existing route and sessions fixture\n");
    expect(result.stdout.toString()).toContain("LAB update complete");
    expect(readdirSync(f.temporary)).toEqual([]);
  } finally { f.clean(); }
});

test("a failed download never executes even a syntactically valid partial bootstrap", () => {
  const f = fixture();
  try {
    const result = f.run(["update"], { TEST_CURL_EXIT: "18" });
    expect(result.exitCode).toBe(1); expect(existsSync(f.called)).toBe(false);
    expect(result.stderr.toString()).toContain("download failed");
    expect(readFileSync(f.saved, "utf8")).toBe("existing route and sessions fixture\n");
    expect(readdirSync(f.temporary)).toEqual([]);
  } finally { f.clean(); }
});

test("bootstrap failure is propagated without reporting update success", () => {
  const f = fixture();
  try {
    const result = f.run(["update"], { TEST_BOOTSTRAP_EXIT: "23" });
    expect(result.exitCode).toBe(23); expect(result.stderr.toString()).toContain("LAB update failed");
    expect(result.stdout.toString()).not.toContain("update complete");
    expect(readdirSync(f.temporary)).toEqual([]);
  } finally { f.clean(); }
});

test("help, invalid workspace options and offline mode never download or start a session", () => {
  const f = fixture();
  try {
    expect(f.run(["update", "--help"]).exitCode).toBe(0);
    for (const args of [["update", "--offline"], ["update", "--project", "."], ["update", "--help", "extra"]]) expect(f.run(args).exitCode).toBe(2);
    expect(f.run(["update"], { LAB_INSTALL_OFFLINE: "1" }).exitCode).toBe(1);
    expect(existsSync(f.fetched)).toBe(false); expect(existsSync(f.called)).toBe(false);
    expect(readdirSync(f.temporary)).toEqual([]);
  } finally { f.clean(); }
});

test("empty or invalid bootstrap is refused before execution", () => {
  const f = fixture();
  try {
    for (const text of ["", "if then\n"]) {
      writeFileSync(f.bootstrap, text);
      const result = f.run();
      expect(result.exitCode).toBe(1); expect(existsSync(f.called)).toBe(false);
      expect(result.stderr.toString()).toContain("invalid bootstrap");
      expect(readdirSync(f.temporary)).toEqual([]);
    }
  } finally { f.clean(); }
});
