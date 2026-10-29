import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { Ledger, callback } from "../src/ledger.ts";
import { RelayBus } from "../src/relay.ts";
import { canonical } from "../src/util.ts";
import type { BoundMailbox, Delivery } from "../src/protocol.ts";
import { fresh } from "./helpers.ts";

test("REAL pinned Relay: crash after ingest commit before ack redelivers once", () => {
  const f = fresh(), bus = new RelayBus(f.root + "/relay");
  try {
    const from = bus.register("test", "worker"), to = bus.register("test", "coordinator"), box = bus.mailbox("test", to);
    const event = callback(f.claim, 2, { kind: "started" }), receipt = bus.send("test", from, to, canonical(event), "stable-key");
    expect(bus.send("test", from, to, canonical(event), "stable-key")).toMatchObject({ id: receipt.id, duplicate: true });
    expect(() => f.ledger.receive(box, () => { throw new Error("injected after-commit crash"); })).toThrow("after-commit");
    expect(box.inbox()).toHaveLength(1); expect(f.ledger.get("T1").version).toBe(3);
    f.ledger.close(); f.ledger = new Ledger(f.root + "/lab");
    expect(f.ledger.receive(box)[0]!.status).toBe("duplicate"); expect(box.inbox()).toEqual([]); expect(f.ledger.get("T1").version).toBe(3);
    expect(bus.mailbox("test", from).ack([receipt.id])).toBe(0);
  } finally { bus.close(); }
});
test("REAL pinned Relay: outgoing intent survives lost send receipt", () => {
  const f = fresh(), bus = new RelayBus(f.root + "/relay");
  try {
    const from = bus.register("out", "worker"), to = bus.register("out", "coordinator");
    f.ledger.queueMessage(bus.busId, "out", from, to, "exact bytes", "K1");
    expect(() => f.ledger.deliverMessages(bus, () => { throw new Error("lost receipt"); })).toThrow("lost receipt");
    f.ledger.close(); f.ledger = new Ledger(f.root + "/lab"); expect(f.ledger.deliverMessages(bus)).toBe(1);
    expect(bus.mailbox("out", to).inbox()).toHaveLength(1); expect(f.ledger.deliverMessages(bus)).toBe(0);
    expect(() => f.ledger.queueMessage(bus.busId, "out", from, to, "different bytes", "K1")).toThrow("OUTBOUND_KEY_CONFLICT");
  } finally { bus.close(); }
});
test("mail scope, malformed quarantine, and event duplicates across message IDs", () => {
  const f = fresh(), binding = { busId: "bus1", namespace: "ns1", peerId: "P1" }, event = callback(f.claim, 2, { kind: "started" });
  const delivery: Delivery = { busId: binding.busId, namespace: binding.namespace, recipient: binding.peerId, messageId: "M1", body: canonical(event) };
  for (const altered of [{ busId: "other" }, { namespace: "other" }, { recipient: "other" }]) expect(() => f.ledger.ingest({ ...delivery, ...altered }, binding)).toThrow("FOREIGN_MAILBOX");
  expect(f.ledger.ingest(delivery, binding).status).toBe("processed");
  expect(f.ledger.ingest({ ...delivery, messageId: "M2" }, binding).status).toBe("duplicate");
  expect(f.ledger.ingest({ ...delivery, busId: "bus2" }, { ...binding, busId: "bus2" }).status).toBe("duplicate");
  expect(f.ledger.get("T1").version).toBe(3);
  expect(f.ledger.ingest({ ...delivery, messageId: "bad", body: "{bad" }, binding).status).toBe("quarantined");
  expect(() => f.ledger.ingest({ ...delivery, body: "different" }, binding)).toThrow("MESSAGE_ID_CONFLICT");
});
test("storage failure rolls back ingestion and never acknowledges", () => {
  const f = fresh(), db = new Database(f.ledger.path); db.exec("DROP TABLE events"); db.close(); let acks = 0;
  const box: BoundMailbox = { binding: { busId: "B", namespace: "N", peerId: "P" }, inbox: () => [{ busId: "B", namespace: "N", recipient: "P", messageId: "M", body: canonical(callback(f.claim, 2, { kind: "started" })) }], ack: () => { acks++; return 1; } };
  expect(() => f.ledger.receive(box)).toThrow(); expect(acks).toBe(0); expect(f.ledger.get("T1").version).toBe(2);
  const inspect = new Database(f.ledger.path); expect(inspect.query("SELECT COUNT(*) AS n FROM ingest").get()).toEqual({ n: 0 }); inspect.close();
});
test("ack failure retains committed ingestion for bounded retry", () => {
  const f = fresh(); let attempts = 0;
  const box: BoundMailbox = { binding: { busId: "B", namespace: "N", peerId: "P" }, inbox: () => [{ busId: "B", namespace: "N", recipient: "P", messageId: "M", body: canonical(callback(f.claim, 2, { kind: "started" }, "E1")) }], ack: () => { attempts++; if (attempts === 1) throw new Error("ack failed"); return 1; } };
  expect(() => f.ledger.receive(box)).toThrow("ack failed"); expect(f.ledger.receive(box)[0]!.status).toBe("duplicate"); expect(f.ledger.get("T1").version).toBe(3);
});
