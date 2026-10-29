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

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const actual = process.env.LAB_HERDR_INTERACTIVE_ACTUAL === "1" ? test : test.skip;
actual("actual pinned Herdr client forwards keyboard, resize, interrupt and verifies owned cleanup", () => {
  mkdirSync(resolve(".tmp"),{recursive:true}); const root=mkdtempSync(resolve(".tmp/interactive-test-"));
  const worker=join(root,"worker.sh"), driver=join(root,"driver.ts");
  writeFileSync(worker,'#!/bin/sh\ntrap \'printf "130\\n" > "$1/exit"; exit 130\' INT\nprintf "READY\\n"\nread -r first\nstty size > "$1/before"\nread -r second\nstty size > "$1/after"\nwhile :; do read -r line || :; done\n',{mode:0o700});
  writeFileSync(driver,`import {runHerdrInteractive} from ${JSON.stringify(resolve("src/herdr/interactive.ts"))};\nconst code=await runHerdrInteractive({executable:${JSON.stringify(resolve(".tmp/herdr/herdr"))},command:['/bin/sh',${JSON.stringify(worker)},${JSON.stringify(root)}],cwd:${JSON.stringify(resolve("."))},stateRoot:${JSON.stringify(root)},exitFile:${JSON.stringify(join(root,"exit"))},environment:{}}); console.log('RESULT',code);`);
  const program = String.raw`
import os, pty, subprocess, sys, time, select, fcntl, termios, struct, signal
root, bun, driver = sys.argv[1:]
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 80, 0, 0))
def setup():
    os.setsid()
    fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
p = subprocess.Popen([bun, '--no-env-file', '--no-install', driver], stdin=slave, stdout=slave, stderr=slave, preexec_fn=setup, close_fds=True)
os.close(slave)
data = bytearray()
def drain(seconds):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        if select.select([master],[],[],0.05)[0]:
            try: data.extend(os.read(master,65536))
            except OSError: return
try:
    drain(1.5)
    os.write(master,b'first\r')
    drain(0.5)
    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 110, 0, 0))
    os.killpg(p.pid, signal.SIGWINCH)
    drain(0.5)
    os.write(master,b'second\r')
    drain(0.5)
    os.write(master,b'\x03')
    drain(2)
    p.wait(timeout=5)
    assert p.returncode == 0, 'driver failed'
    assert b'RESULT 130' in data, 'interrupt did not reach owned worker'
    print('actual keyboard resize interrupt cleanup passed')
finally:
    open(root+'/raw-terminal.log','wb').write(data)
    if p.poll() is None:
        p.terminate()
        try: p.wait(timeout=5)
        except subprocess.TimeoutExpired: p.kill(); p.wait()
    os.close(master)
`;
  const result=spawnSync("python3",["-c",program,root,process.execPath,driver],{encoding:"utf8",timeout:20000,maxBuffer:65536});
  expect(result.status, result.stderr).toBe(0);
  const before=readFileSync(join(root,"before"),"utf8").trim().split(/\s+/).map(Number), after=readFileSync(join(root,"after"),"utf8").trim().split(/\s+/).map(Number);
  expect(after[0]!).toBeGreaterThan(before[0]!); expect(after[1]!).toBeGreaterThan(before[1]!);
  const evidence=JSON.parse(readFileSync(join(root,"attachment.json"),"utf8"));
  expect(evidence.cleanup).toEqual({serverExited:true,clientExited:true,workerStopped:true,socketsRemoved:true});
  // Keep this one bounded local raw transcript for inspection; never publish host paths.
  console.log(`Actual attachment evidence retained at ${root}`);
}, 25000);
