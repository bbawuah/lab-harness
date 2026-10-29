import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { callback, CONCEPT_ROOT, Ledger } from "../src/ledger.ts";
import { canonical } from "../src/util.ts";
import { fresh } from "./helpers.ts";
import type { Delivery, ReceiveBinding } from "../src/protocol.ts";

test("REAL owned process SIGKILL after SQLite ingest commit preserves duplicate fence", async () => {
  const f = fresh(), binding = { busId: "crash-bus", namespace: "crash", peerId: "receiver" };
  const delivery = { busId: binding.busId, namespace: binding.namespace, recipient: binding.peerId, messageId: "M-crash", body: canonical(callback(f.claim, 2, { kind: "started" })) };
  const packet = join(f.root, "packet.json"); writeFileSync(packet, JSON.stringify({ binding, delivery })); f.ledger.close();
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", join(CONCEPT_ROOT, "tests/crash-child.ts"), join(f.root, "lab"), packet], { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
  try {
    const data = await child.stdout.getReader().read(); expect(new TextDecoder().decode(data.value)).toContain("durably-committed");
    child.kill("SIGKILL"); await child.exited;
  } finally { clearTimeout(timer); if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; } f.ledger = new Ledger(join(f.root, "lab")); }
  expect(f.ledger.get("T1").version).toBe(3); expect(f.ledger.ingest(delivery, binding).status).toBe("duplicate"); expect(f.ledger.get("T1").version).toBe(3);
}, 5000);

test("REAL first-owner SIGKILL reopens committed schema and ingestion without a prior clean close", async () => {
  const f = fresh(), state = join(f.root, "first-owner");
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", join(CONCEPT_ROOT, "tests/first-owner-crash-child.ts"), state], { stdout: "pipe", stderr: "pipe" });
  const deadline = setTimeout(() => child.kill("SIGKILL"), 3000);
  let reopened: Ledger | undefined;
  try {
    const data = await child.stdout.getReader().read();
    const packet = JSON.parse(new TextDecoder().decode(data.value)) as { binding: ReceiveBinding; delivery: Delivery };
    child.kill("SIGKILL"); await child.exited;
    reopened = new Ledger(state); expect(reopened.get("first-owner").version).toBe(3);
    expect(reopened.ingest(packet.delivery, packet.binding).status).toBe("duplicate"); expect(reopened.get("first-owner").version).toBe(3);
  } finally { clearTimeout(deadline); if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; } reopened?.close(); }
}, 5000);
