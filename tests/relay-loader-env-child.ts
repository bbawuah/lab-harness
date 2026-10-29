import { RelayBus } from "../src/relay.ts";

try {
  const bus = new RelayBus(process.argv[2]!);
  try {
    const sender = bus.register("loader-probe", "sender"), recipient = bus.register("loader-probe", "recipient");
    bus.send("loader-probe", sender, recipient, "Owned fresh-process publication probe", "probe");
    if (bus.mailbox("loader-probe", recipient).inbox().length !== 1) throw new Error("PROBE_MESSAGE_MISSING");
    console.log(JSON.stringify({ publication: "available", stored: true }));
  } finally { bus.close(); }
} catch (error) {
  console.log(JSON.stringify({ publication: "refused", message: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
}
