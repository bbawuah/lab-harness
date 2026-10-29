import { readFileSync } from "node:fs";
import { Ledger } from "../src/ledger.ts";
import type { Delivery, ReceiveBinding } from "../src/protocol.ts";
const [state, packet] = process.argv.slice(2);
if (!state || !packet) throw new Error("fixture inputs required");
const { delivery, binding } = JSON.parse(readFileSync(packet, "utf8")) as { delivery: Delivery; binding: ReceiveBinding };
const ledger = new Ledger(state); ledger.ingest(delivery, binding);
process.stdout.write("durably-committed-before-ack\n");
setInterval(() => {}, 1000);
