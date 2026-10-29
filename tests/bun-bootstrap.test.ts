import { expect, test } from "bun:test";
import { chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

test("verified cached Bun repairs execute permissions offline; corruption refuses before execution", () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "lab-bun-"));
  try {
    for (const path of ["scripts", "contracts", ".tmp/bun/1.4.2"]) mkdirSync(join(root, path), { recursive: true });
    const binary = join(root, ".tmp/bun/1.4.2/bun"), content = "#!/bin/sh\nprintf '1.4.2\\n'\n";
    writeFileSync(binary, content, { mode: 0o600 }); writeFileSync(join(root, ".bun-version"), "1.4.2\n");
    const hash = createHash("sha256").update(content).digest("hex");
    const os = process.platform === "darwin" ? "Darwin" : "Linux", arch = process.arch === "arm64" ? "arm64" : "x86_64";
    writeFileSync(join(root, "contracts/bun-runtime.txt"), `${os} ${arch} fixture.zip 1 ${"0".repeat(64)} ${hash}\n`);
    copyFileSync(resolve(import.meta.dir, "../scripts/runtime-bun.sh"), join(root, "scripts/runtime-bun.sh"));
    const driver = join(root, "driver.sh");
    writeFileSync(driver, '#!/bin/sh\nset -eu\nproject_root="$TEST_PROJECT"\nlab_offline=1\n. "$project_root/scripts/runtime-bun.sh"\n"$lab_bun" --version\n');
    const run = () => Bun.spawnSync(["/bin/sh", driver], { env: { PATH: "/usr/bin:/bin", TEST_PROJECT: root }, stdout: "pipe", stderr: "pipe" });
    const result = run(); expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(result.stdout.toString()).toBe("1.4.2\n"); expect(lstatSync(binary).mode & 0o777).toBe(0o700);
    writeFileSync(binary, "corrupt");
    expect(run().stderr.toString()).toContain("checksum mismatch");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
