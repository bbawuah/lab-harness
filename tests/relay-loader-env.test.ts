import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CONCEPT_ROOT } from "../src/ledger.ts";
import { fresh } from "./helpers.ts";

test("fresh Relay processes reject loader redirection and preserve real publication in a clean tool phase", () => {
  const f = fresh();
  for (const key of ["LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH"]) {
    const state = join(f.root, key.toLowerCase());
    // The empty value cannot redirect the loader, but the pinned vendor guard
    // intentionally rejects key presence. Never mutate this test process's env.
    const denied = Bun.spawnSync([process.execPath, "--no-env-file", "--no-install", join(CONCEPT_ROOT, "tests/relay-loader-env-child.ts"), state], { env: { PATH: process.env.PATH ?? "", [key]: "" }, stdout: "pipe", stderr: "pipe" });
    expect(denied.exitCode).toBe(1);
    expect(JSON.parse(denied.stdout.toString())).toMatchObject({ publication: "refused", message: "Atomic message database publication is unavailable on this platform." });
    expect(existsSync(join(state, "messages.sqlite"))).toBe(false);
    // A separate cold process avoids native-capability cache effects and really
    // stores a message; this is not an injected/fake capability response.
    const clean = Bun.spawnSync([process.execPath, "--no-env-file", "--no-install", join(CONCEPT_ROOT, "tests/relay-loader-env-child.ts"), state], { env: { PATH: process.env.PATH ?? "" }, stdout: "pipe", stderr: "pipe" });
    expect(clean.exitCode).toBe(0);
    expect(JSON.parse(clean.stdout.toString())).toEqual({ publication: "available", stored: true });
    expect(existsSync(join(state, "messages.sqlite"))).toBe(true);
  }
});
