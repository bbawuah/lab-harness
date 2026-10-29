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
  const marker = `READY_${root.slice(-6)}`;
  writeFileSync(worker, `#!/bin/sh
trap 'printf "130\\n" > "$1/exit"; exit 130' INT
trap 'stty size > "$1/resized"' WINCH
printf '${marker}\\n'
printf ready > "$1/ready"
until read -r first; do :; done
printf "%s" "$first" > "$1/first"
stty size > "$1/before"
until read -r second; do :; done
printf "%s" "$second" > "$1/second"
stty size > "$1/after"
while :; do read -r line || :; done
`, { mode: 0o700 });
  writeFileSync(driver, `import {runHerdrInteractive} from ${JSON.stringify(resolve("src/herdr/interactive.ts"))};\nconst code=await runHerdrInteractive({executable:${JSON.stringify(resolve(".tmp/herdr/herdr"))},command:['/bin/sh',${JSON.stringify(worker)},${JSON.stringify(root)}],cwd:${JSON.stringify(resolve("."))},stateRoot:${JSON.stringify(root)},exitFile:${JSON.stringify(join(root,"exit"))},environment:{}}); await Bun.write(${JSON.stringify(join(root,"driver-result"))}, String(code)); console.log('RESULT',code);`);
  let raw = "", resolveEOF!: () => void;
  const ptyEOF = new Promise<void>(done => { resolveEOF = done; });
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", driver], {
    terminal: { cols: 80, rows: 24, data(_term, data) { raw += new TextDecoder().decode(data); }, exit() { resolveEOF(); } },
  });
  const pause = (ms: number) => new Promise(done => setTimeout(done, ms));
  const waitUntil = async (description: string, ready: () => boolean) => {
    const until = Date.now() + 10000;
    while (!ready()) {
      if (Date.now() > until || child.exitCode !== null) throw new Error(`Timed out waiting for ${description}; evidence: ${root}; terminal tail: ${JSON.stringify(raw.slice(-1500))}`);
      await pause(25);
    }
  };
  const waitFile = (name: string) => waitUntil(name, () => existsSync(join(root, name)) && readFileSync(join(root, name), "utf8").length > 0);
  const size = (name: string) => existsSync(join(root, name)) ? readFileSync(join(root, name), "utf8").trim().split(/\s+/).map(Number) : [];
  const timeout = setTimeout(() => child.kill("SIGTERM"), 18000);
  try {
    await waitFile("ready");
    // The worker starts before the native client. Its marker must travel back
    // through the attached client's renderer before keyboard input is safe.
    // Herdr v0.9.5 buffers keys during its capability probe, but input before
    // raw mode can be cooked or handled before the client has a focused pane.
    await waitUntil("native client rendering the worker marker", () => raw.includes(marker));
    child.terminal!.write("first\r"); await waitFile("before");
    const before = size("before");
    child.terminal!.resize(110, 40);
    // SIGWINCH is acknowledged by the actual worker PTY, not an outer render
    // or an elapsed sleep. Interrupted shell reads retry without consuming a key.
    await waitUntil("worker resize acknowledgment", () => {
      const resized = size("resized");
      return resized[0]! > before[0]! && resized[1]! > before[1]!;
    });
    child.terminal!.write("second\r"); await waitFile("after");
    child.terminal!.write("\x03"); expect(await child.exited).toBe(0);
    await Promise.race([ptyEOF, pause(2000).then(() => { throw new Error("PTY output did not reach EOF after driver exit"); })]);
    // Assert the actual adapter return, worker INT trap and delivered keys
    // through independent owned files, rather than a trailing rendered marker.
    expect(readFileSync(join(root, "driver-result"), "utf8")).toBe("130");
    expect(readFileSync(join(root, "exit"), "utf8").trim()).toBe("130");
    expect(readFileSync(join(root, "first"), "utf8")).toBe("first");
    expect(readFileSync(join(root, "second"), "utf8")).toBe("second");
    expect(raw.length).toBeGreaterThan(0);
    const after = readFileSync(join(root, "after"), "utf8").trim().split(/\s+/).map(Number);
    expect(after[0]!).toBeGreaterThan(before[0]!); expect(after[1]!).toBeGreaterThan(before[1]!);
    const evidence = JSON.parse(readFileSync(join(root, "attachment.json"), "utf8"));
    expect(evidence.cleanup).toEqual({ serverExited: true, clientExited: true, workerStopped: true, socketsRemoved: true });
  } finally {
    clearTimeout(timeout); if (child.exitCode === null) { child.kill("SIGTERM"); await child.exited; }
    child.terminal!.close(); writeFileSync(join(root, "raw-terminal.log"), raw);
  }
}, 25000);
