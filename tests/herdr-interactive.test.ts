import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyHerdrInteractive } from "../src/herdr/interactive.ts";
test("interactive attachment refuses unpinned binaries before starting any process", () => {
  const root=mkdtempSync(join(tmpdir(),"herdr-unpinned-"));
  try { const file=join(root,"fake");writeFileSync(file,"not an official runtime");expect(()=>verifyHerdrInteractive(file)).toThrow("unverified"); }
  finally { rmSync(root,{recursive:true,force:true}); }
});

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const actual = process.env.LAB_HERDR_ACTUAL === "1" ? test : test.skip;
actual("actual pinned Herdr client forwards keyboard, resize, interrupt and verifies owned cleanup", async () => {
  mkdirSync(resolve(".tmp"), { recursive: true }); const root = mkdtempSync(resolve(".tmp/interactive-test-"));
  const worker = join(root, "worker.sh"), driver = join(root, "driver.ts");
  writeFileSync(worker, '#!/bin/sh\ntrap \'printf "130\\n" > "$1/exit"; exit 130\' INT\nprintf "READY\\n"\nprintf ready > "$1/ready"\nread -r first\nprintf "%s" "$first" > "$1/first"\nstty size > "$1/before"\nread -r second\nprintf "%s" "$second" > "$1/second"\nstty size > "$1/after"\nwhile :; do read -r line || :; done\n', { mode: 0o700 });
  writeFileSync(driver, `import {runHerdrInteractive} from ${JSON.stringify(resolve("src/herdr/interactive.ts"))};\nconst code=await runHerdrInteractive({executable:${JSON.stringify(resolve(".tmp/herdr/herdr"))},command:['/bin/sh',${JSON.stringify(worker)},${JSON.stringify(root)}],cwd:${JSON.stringify(resolve("."))},stateRoot:${JSON.stringify(root)},exitFile:${JSON.stringify(join(root,"exit"))},environment:{}}); await Bun.write(${JSON.stringify(join(root,"driver-result"))}, String(code)); console.log('RESULT',code);`);
  let raw = "", resolveEOF!: () => void;
  const ptyEOF = new Promise<void>(done => { resolveEOF = done; });
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", driver], {
    terminal: { cols: 80, rows: 24, data(_term, data) { raw += new TextDecoder().decode(data); }, exit() { resolveEOF(); } },
  });
  const pause = (ms: number) => new Promise(done => setTimeout(done, ms));
  const waitFile = async (name: string) => {
    const until = Date.now() + 10000;
    while (!existsSync(join(root, name))) {
      if (Date.now() > until || child.exitCode !== null) throw new Error(`Timed out waiting for ${name}; terminal tail: ${raw.slice(-1500)}`);
      await pause(25);
    }
  };
  const timeout = setTimeout(() => child.kill("SIGTERM"), 18000);
  try {
    await waitFile("ready"); await pause(400); child.terminal!.write("first\r"); await waitFile("before");
    child.terminal!.resize(110, 40); await pause(400); child.terminal!.write("second\r"); await waitFile("after");
    child.terminal!.write("\x03"); expect(await child.exited).toBe(0);
    await Promise.race([ptyEOF, pause(2000).then(() => { throw new Error("PTY output did not reach EOF after driver exit"); })]);
    // Assert the actual adapter return, worker INT trap and delivered keys
    // through independent owned files, rather than a trailing rendered marker.
    expect(readFileSync(join(root, "driver-result"), "utf8")).toBe("130");
    expect(readFileSync(join(root, "exit"), "utf8").trim()).toBe("130");
    expect(readFileSync(join(root, "first"), "utf8")).toBe("first");
    expect(readFileSync(join(root, "second"), "utf8")).toBe("second");
    expect(raw.length).toBeGreaterThan(0);
    const before = readFileSync(join(root, "before"), "utf8").trim().split(/\s+/).map(Number);
    const after = readFileSync(join(root, "after"), "utf8").trim().split(/\s+/).map(Number);
    expect(after[0]!).toBeGreaterThan(before[0]!); expect(after[1]!).toBeGreaterThan(before[1]!);
    const evidence = JSON.parse(readFileSync(join(root, "attachment.json"), "utf8"));
    expect(evidence.cleanup).toEqual({ serverExited: true, clientExited: true, workerStopped: true, socketsRemoved: true });
  } finally {
    clearTimeout(timeout); if (child.exitCode === null) { child.kill("SIGTERM"); await child.exited; }
    child.terminal!.close(); writeFileSync(join(root, "raw-terminal.log"), raw);
  }
}, 25000);
