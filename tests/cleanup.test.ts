import { expect, test } from "bun:test";
import { join } from "node:path";
import { CONCEPT_ROOT } from "../src/ledger.ts";

for (const signal of ["SIGTERM", "SIGINT"] as const) test(`stub-only smoke parent ${signal} stops both owned direct children`, async () => {
  const parent = Bun.spawn([process.execPath, "--no-env-file", "--no-install", join(CONCEPT_ROOT, "tests/cleanup-child.ts")], { stdout: "pipe", stderr: "pipe" });
  const deadline = setTimeout(() => parent.kill("SIGKILL"), 4000);
  let children: number[] = [];
  try {
    const first = await parent.stdout.getReader().read();
    children = (JSON.parse(new TextDecoder().decode(first.value)) as { children: number[] }).children;
    expect(children).toHaveLength(2); parent.kill(signal); await parent.exited;
    expect(parent.exitCode).toBe(signal === "SIGTERM" ? 143 : 130);
    for (const pid of children) expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    clearTimeout(deadline); if (parent.exitCode === null) { parent.kill("SIGKILL"); await parent.exited; }
    // Fallback touches only direct child PIDs obtained from this owned fixture.
    for (const pid of children) { try { process.kill(pid, "SIGKILL"); } catch {} }
  }
}, 5000);
