import { Ledger, callback } from "../src/ledger.ts";
import { fixtureTask } from "../src/fixtures.ts";
import { canonical } from "../src/util.ts";
const ledger = new Ledger(process.argv[2]!);
ledger.create(fixtureTask(ledger, "first-owner"));
const { claim } = ledger.grant("first-owner", "first-session");
const binding = { busId: "first-owner-bus", namespace: "crash", peerId: "receiver" };
const delivery = { busId: binding.busId, namespace: binding.namespace, recipient: binding.peerId, messageId: "first-message", body: canonical(callback(claim, 2, { kind: "started" })) };
ledger.ingest(delivery, binding);
console.log(JSON.stringify({ binding, delivery }));
// Deliberately keep the first connection open until the test sends SIGKILL.
setInterval(() => {}, 1000);
