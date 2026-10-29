import { OwnedProcesses } from "../src/owned-processes.ts";
const owned = new OwnedProcesses();
owned.onSignals(() => {});
const children = [0, 1].map(() => owned.adopt(Bun.spawn([process.execPath, "--no-env-file", "--no-install", "-e", "setInterval(() => {}, 1000)"], { stdout: "ignore", stderr: "ignore" })));
console.log(JSON.stringify({ children: children.map(child => child.pid) }));
await Promise.all(children.map(child => child.exited));
