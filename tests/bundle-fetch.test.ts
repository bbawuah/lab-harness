import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { digest } from "../scripts/bundle/common.ts";

test("release fetch verifies before publication and preserves existing output files", () => {
  const parent = resolve(import.meta.dir, "../.tmp"); mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "fetch-test-")), bin = join(root, "bin"), out = join(root, "out"); mkdirSync(bin);
  const fixture = join(root, "asset"), sums = join(root, "sums"), name = "lab-harness-0.2.0-linux-x64.tar.gz";
  writeFileSync(fixture, "fixture archive"); writeFileSync(sums, `${digest("fixture archive")}  ${name}\n`);
  writeFileSync(join(bin, "curl"), '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do case "$1" in https:*) url=$1;; -o) shift; output=$1;; esac; shift; done\ncase "$url" in */SHA256SUMS) cp "$FIXTURE_SUMS" "$output";; *) cp "$FIXTURE_ASSET" "$output";; esac\n'); chmodSync(join(bin, "curl"), 0o700);
  const run = () => Bun.spawnSync(["sh", resolve(import.meta.dir, "../scripts/release/fetch.sh"), "v0.2.0", out], { env: { PATH: `${bin}:/usr/bin:/bin`, FIXTURE_SUMS: sums, FIXTURE_ASSET: fixture }, stdout: "pipe", stderr: "pipe" });
  try {
    const first = run(); expect(first.exitCode, first.stderr.toString()).toBe(0); expect(readFileSync(join(out, name), "utf8")).toBe("fixture archive");
    expect(run().exitCode).not.toBe(0); expect(readFileSync(join(out, name), "utf8")).toBe("fixture archive");
    rmSync(join(out, name)); writeFileSync(sums, `${"0".repeat(64)}  ${name}\n`); expect(run().stderr.toString()).toContain("checksum mismatch");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
