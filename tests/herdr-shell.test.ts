import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildRegularShell, shellLeaf } from "../src/herdr/shell.ts";
import { request } from "../src/herdr/protocol.ts";

/** Failure-only, read-only diagnostics. Discovery stays within the driver's descendants. */
async function startupDiagnostics(pid: number, deadline: number): Promise<unknown> {
  const remaining = () => Math.max(1, Math.min(150, deadline - Date.now()));
  const run = (argv: string[]) => Bun.spawnSync(argv, { timeout: remaining(), maxBuffer: 128 * 1024 });
  try {
    const ps = Bun.which("ps"), lsof = Bun.which("lsof");
    if (!ps || !lsof) return { unavailable: "ps/lsof missing" };
    const tree = run([ps, "-axo", "pid=,ppid="]).stdout.toString().split("\n").map(line => line.trim().split(/\s+/).map(Number));
    const owned = new Set([pid]);
    for (let changed = true; changed && owned.size < 64;) {
      changed = false;
      for (const [child, parent] of tree) if (Number.isInteger(child) && owned.has(parent) && !owned.has(child)) { owned.add(child); changed = true; }
    }
    const fields = run([lsof, "-a", "-p", [...owned].join(","), "-U", "-Fn"]).stdout.toString();
    const paths = [...new Set(fields.split("\n").flatMap(line => /^n(\/(?:private\/)?tmp\/lab-h-[A-Za-z0-9_-]+\/s\.sock)(?:\s|$)/.exec(line)?.slice(1) ?? []))];
    const observations: unknown[] = [];
    for (const socket of paths.slice(0, 2)) {
      if (Date.now() >= deadline) break;
      try {
        const pong = await request(socket, "ping", {}, remaining());
        if (pong.type !== "pong" || pong.version !== "0.9.5") continue;
        const workspaces = await request(socket, "workspace.list", {}, remaining());
        for (const workspace of (workspaces.workspaces ?? []).slice(0, 2)) {
          const panes = await request(socket, "pane.list", { workspace_id: workspace.workspace_id }, remaining());
          for (const pane of (panes.panes ?? []).slice(0, 3)) {
            if (Date.now() >= deadline) break;
            const read = await request(socket, "pane.read", { pane_id: pane.pane_id, source: "visible", lines: 12, format: "text", strip_ansi: true }, remaining());
            observations.push({ pane: pane.pane_id, focused: pane.focused, text: String(read.read?.text ?? "").slice(-1600) });
          }
        }
      } catch (error) { observations.push({ error: String(error).slice(0, 300) }); }
    }
    return { ownedProcesses: owned.size, candidates: paths.length, observations };
  } catch (error) { return { unavailable: String(error).slice(0, 300) }; }
}

test("capture preserves presence and strips Pi-only names", () => {
  const shell = buildRegularShell({ HOME: "/synthetic", SHELL: "/bin/sh", PATH: "/bin", LAB_WORKSPACE_API_KEY: "sentinel", LAB_RELAY_RUN_REF: "sentinel", PI_CODING_AGENT_DIR: "sentinel" });
  expect(shell.environment.HOME).toBe("/synthetic");
  expect(shell.environment.TMPDIR).toBeUndefined();
  expect(shell.environment.LAB_WORKSPACE_API_KEY).toBeUndefined();
  expect(shell.environment.LAB_RELAY_RUN_REF).toBeUndefined();
  expect(shell.environment.PI_CODING_AGENT_DIR).toBeUndefined();
  const leaf = shellLeaf(shell, "/synthetic-project", { HOME: "/isolated", PATH: "/isolated-bin", TMPDIR: "/isolated-tmp" });
  expect(leaf.env.HOME).toBe("/synthetic");
  expect(leaf.env.PATH).toBe("/bin");
  expect(leaf.env._LAB_SHELL_UNSET.split(" ")).toContain("TMPDIR");
  expect(leaf.env._LAB_SHELL_UNSET.split(" ")).not.toContain("HOME");
  expect(JSON.stringify(leaf.command)).not.toContain("/synthetic");
  expect(JSON.stringify(leaf.command)).not.toContain("sentinel");
  expect(() => buildRegularShell({ SHELL: "relative" })).toThrow();
  expect(() => buildRegularShell({ SHELL: "/bin/sh", HOME: "bad\0value" })).toThrow();
});

const actual = process.env.LAB_HERDR_ACTUAL === "1" ? test : test.skip;
for (const name of ["bash", "zsh"]) actual(`actual split preserves synthetic ${name} startup, focus, Ctrl-C and shell exit`, async () => {
  const shellExecutable = Bun.which(name, { PATH: "/usr/bin:/bin" });
  if (!shellExecutable) throw new Error(`Missing actual-shell test prerequisite: ${name} in /usr/bin:/bin. Linux CI must provision zsh before actual terminal tests; no shell substitution or skip is allowed.`);
  mkdirSync(resolve(".tmp"), { recursive: true });
  const root = mkdtempSync(resolve(".tmp/split-test-")), home = join(root, "synthetic-user"), project = join(root, "project");
  mkdirSync(home); mkdirSync(project); mkdirSync(join(project, "after-rc"));
  const rc = name === "bash" ? ".bashrc" : ".zshrc";
  const marker = `PI_READY_${root.slice(-6)}`;
  // All values and startup files here are synthetic; never consult the user's RC.
  const presence = name === "bash" ? `[ "$TMPDIR" = '${root}' ] && [ "$XDG_CONFIG_HOME" = '${home}/config' ]` : `[ "${"${TMPDIR+x}"}" = '' ] && [ "${"${XDG_CONFIG_HOME+x}"}" = '' ] && [ "$ZDOTDIR" = '${home}' ]`;
  writeFileSync(join(home, rc), `printf started > '${root}/rc-started'\n[ "$HOME" = '${home}' ] && [ "$PATH" = '/usr/bin:/bin' ] && [ "$SHELL" = '${shellExecutable}' ] && [ "$LANG" = 'C' ] && ${presence} && [ "${"${LAB_WORKSPACE_API_KEY+x}"}" = '' ] && [ "${"${LAB_RELAY_RUN_REF+x}"}" = '' ] && [ "${"${PI_CODING_AGENT_DIR+x}"}" = '' ] && printf ok > '${root}/env-ok'\npwd > '${root}/shell-cwd'\ncd '${project}/after-rc'\npwd > '${root}/shell-after-rc'\nprintf '%s' $$ > '${root}/shell-pid'\nprintf 'shell-ready\\n' > '${root}/shell-ready'\n`);
  const worker = join(root, "pi.sh"), driver = join(root, "driver.ts");
  writeFileSync(worker, `#!/bin/sh\ntrap 'stty size > "$1/resized"' WINCH\nprintf '${marker}\\n'\n[ "$LAB_WORKSPACE_API_KEY" = 'pi-only-key' ] && [ "$LAB_RELAY_RUN_REF" = 'pi-only-relay' ] && [ "$PI_CODING_AGENT_DIR" = 'pi-only-dir' ] && printf ok > "$1/pi-env"\nwhile :; do read -r line || continue; printf '%s' "$line" > "$1/pi-input"; [ "$line" = done ] && break; done\nprintf 0 > "$1/exit"\n`, { mode: 0o700 });
  const captured = { HOME: home, PATH: "/usr/bin:/bin", SHELL: shellExecutable, LANG: "C", ...(name === "zsh" ? { ZDOTDIR: home } : { TMPDIR: root, XDG_CONFIG_HOME: `${home}/config` }), LAB_WORKSPACE_API_KEY: "incoming-key", LAB_RELAY_RUN_REF: "incoming-ref", PI_CODING_AGENT_DIR: "incoming-dir" };
  writeFileSync(driver, `import {runHerdrInteractive} from ${JSON.stringify(resolve("src/herdr/interactive.ts"))};\nimport {buildRegularShell} from ${JSON.stringify(resolve("src/herdr/shell.ts"))};\nconst code=await runHerdrInteractive({executable:${JSON.stringify(resolve(".tmp/herdr/herdr"))},command:['/bin/sh',${JSON.stringify(worker)},${JSON.stringify(root)}],cwd:${JSON.stringify(project)},stateRoot:${JSON.stringify(root)},exitFile:${JSON.stringify(join(root,"exit"))},environment:{LAB_WORKSPACE_API_KEY:'pi-only-key',LAB_RELAY_RUN_REF:'pi-only-relay',PI_CODING_AGENT_DIR:'pi-only-dir'},shell:buildRegularShell(${JSON.stringify(captured)})}); await Bun.write(${JSON.stringify(join(root,"result"))}, String(code));`);
  let raw = "";
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", driver], { terminal: { cols: 150, rows: 40, data(_term, data) { raw += new TextDecoder().decode(data); } } });
  const pause = (ms: number) => new Promise(done => setTimeout(done, ms));
  const wait = async (description: string, predicate: () => boolean) => {
    const end = Date.now() + 10000;
    while (!predicate()) {
      if (Date.now() > end || child.exitCode !== null) {
        const flags = Object.fromEntries(["shell-ready", "pi-env", "rc-started", "shell-pid", "env-ok"].map(file => [file, existsSync(join(root, file))]));
        const diagnostic = { description, shellExecutable, markerRendered: raw.includes(marker), flags, driverExit: child.exitCode, native: await startupDiagnostics(child.pid, Date.now() + 750), tail: raw.slice(-800) };
        writeFileSync(join(root, "startup-diagnostic.json"), JSON.stringify(diagnostic));
        throw new Error(`${name}: waiting for ${description}; evidence ${root}; ${JSON.stringify(diagnostic)}`);
      }
      await pause(25);
    }
  };
  const has = (file: string) => existsSync(join(root, file));
  const timeout = setTimeout(() => child.kill("SIGTERM"), 25000);
  try {
    await wait("both startup markers", () => raw.includes(marker) && has("shell-ready") && has("pi-env"));
    expect(has("env-ok")).toBe(true);
    expect(readFileSync(join(root, "shell-cwd"), "utf8").trim()).toBe(project);
    expect(readFileSync(join(root, "shell-after-rc"), "utf8").trim()).toBe(join(project, "after-rc"));
    child.terminal!.write("first\r"); await wait("Pi input", () => has("pi-input"));
    expect(readFileSync(join(root, "pi-input"), "utf8")).toBe("first");
    rmSync(join(root, "resized"), { force: true });
    child.terminal!.resize(105, 30); await wait("Pi WINCH acknowledgement", () => has("resized") && readFileSync(join(root, "resized"), "utf8").trim().length > 0);
    child.terminal!.write("\x02z"); await pause(300); child.terminal!.write("\x02z"); await pause(300);
    child.terminal!.write("\x02l"); await pause(250);
    child.terminal!.write(`printf '%s' $$ > '${root}/shell-pid-after'; printf shell > '${root}/shell-input'\r`); await wait("shell input", () => has("shell-input"));
    expect(readFileSync(join(root, "shell-pid-after"), "utf8")).toBe(readFileSync(join(root, "shell-pid"), "utf8"));
    expect(readFileSync(join(root, "pi-input"), "utf8")).toBe("first");
    child.terminal!.write(`printf busy > '${root}/busy'; sleep 30\r`); await wait("foreground job", () => has("busy"));
    child.terminal!.write("\x03"); await pause(250);
    child.terminal!.write(`printf alive > '${root}/shell-alive'\r`); await wait("shell after Ctrl-C", () => has("shell-alive"));
    child.terminal!.write(`printf busy > '${root}/busy-again'; sleep 30\r`); await wait("second foreground job", () => has("busy-again"));
    child.kill("SIGINT"); await pause(250);
    child.terminal!.write(`printf alive > '${root}/shell-after-signal'\r`); await wait("shell after parent SIGINT", () => has("shell-after-signal"));
    expect(readFileSync(join(root, "pi-input"), "utf8")).toBe("first");
    child.terminal!.write("\x02\t"); await pause(250);
    child.terminal!.write("cycled\r"); await wait("focus cycle to Pi", () => readFileSync(join(root, "pi-input"), "utf8") === "cycled");
    child.terminal!.write("\x02l"); await pause(250);
    child.terminal!.write("exit\r"); await pause(500);
    child.terminal!.write("done\r");
    expect(await child.exited).toBe(0);
    expect(readFileSync(join(root, "result"), "utf8")).toBe("0");
    expect(readFileSync(join(root, "pi-input"), "utf8")).toBe("done");
    const observation = JSON.parse(readFileSync(join(root, "attachment.json"), "utf8"));
    expect(observation.cleanup).toEqual({ serverExited: true, clientExited: true, workerStopped: true, socketsRemoved: true });
  } finally {
    clearTimeout(timeout); if (child.exitCode === null) { child.kill("SIGTERM"); await child.exited; }
    child.terminal!.close(); writeFileSync(join(root, "raw-terminal.log"), raw);
  }
}, 30000);

for (const scenario of ["shell-rc-exit", "fast-pi-single", "fast-pi-split", "malformed-pi-single", "malformed-pi-split", "stale-status"] as const) actual(`startup lifecycle: ${scenario}`, async () => {
  mkdirSync(resolve(".tmp"), { recursive: true });
  const root = mkdtempSync(resolve(".tmp/split-start-")), home = join(root, "user"), project = join(root, "project");
  mkdirSync(home); mkdirSync(project);
  writeFileSync(join(home, ".bashrc"), scenario === "shell-rc-exit" ? `printf '%s' $$ > '${root}/shell-pid'\nexit\n` : `printf '%s' $$ > '${root}/shell-pid'\nprintf ready > '${root}/shell-ready'\n`);
  const worker = join(root, "worker.sh"), driver = join(root, "driver.ts");
  const marker = `START_READY_${root.slice(-6)}`;
  const fast = scenario !== "shell-rc-exit";
  writeFileSync(worker, fast ? `printf '${scenario.startsWith("malformed") ? "bad" : "37"}\\n' > "$1/exit"\nexit 37\n` : `printf '${marker}\\n'\nwhile read -r line; do printf '%s' "$line" > "$1/input"; [ "$line" = done ] && break; done\nprintf 0 > "$1/exit"\n`);
  if (scenario === "stale-status") writeFileSync(join(root, "exit"), "37\n");
  const shell = scenario.endsWith("single") ? "undefined" : `buildRegularShell({SHELL:'/bin/bash',HOME:${JSON.stringify(home)},PATH:'/usr/bin:/bin'})`;
  writeFileSync(driver, `import {runHerdrInteractive} from ${JSON.stringify(resolve("src/herdr/interactive.ts"))}; import {buildRegularShell} from ${JSON.stringify(resolve("src/herdr/shell.ts"))};\ntry {const n=await runHerdrInteractive({executable:${JSON.stringify(resolve(".tmp/herdr/herdr"))},command:['/bin/sh',${JSON.stringify(worker)},${JSON.stringify(root)}],cwd:${JSON.stringify(project)},stateRoot:${JSON.stringify(root)},exitFile:${JSON.stringify(join(root,"exit"))},environment:{},shell:${shell}}); await Bun.write(${JSON.stringify(join(root,"result"))},String(n));} catch(e) {await Bun.write(${JSON.stringify(join(root,"error"))},String(e));}`);
  let raw = "";
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", driver], { terminal: { cols: 150, rows: 40, data(_term, data) { raw += new TextDecoder().decode(data); } } });
  const pause = (ms: number) => new Promise(done => setTimeout(done, ms));
  const wait = async (what: string, predicate: () => boolean) => {
    const until = Date.now() + 10000;
    while (!predicate()) { if (Date.now() > until || child.exitCode !== null) throw new Error(`${scenario}: waiting for ${what}; ${root}; ${JSON.stringify(raw.slice(-1000))}`); await pause(25); }
  };
  const timeout = setTimeout(() => child.kill("SIGTERM"), 20000);
  try {
    if (!fast) {
      await wait("native Pi readiness", () => raw.includes(marker));
      child.terminal!.write("done\r");
    }
    expect(await child.exited).toBe(0);
    if (scenario === "stale-status") {
      expect(readFileSync(join(root, "error"), "utf8")).toContain("already exists before launch");
      expect(existsSync(join(root, "attachment.json"))).toBe(false);
      return;
    }
    if (scenario.startsWith("malformed")) expect(readFileSync(join(root, "error"), "utf8")).toContain("Invalid Pi exit status");
    else expect(readFileSync(join(root, "result"), "utf8")).toBe(fast ? "37" : "0");
    if (!fast) expect(readFileSync(join(root, "input"), "utf8")).toBe("done");
    const observation = JSON.parse(readFileSync(join(root, "attachment.json"), "utf8"));
    expect(observation.cleanup.serverExited).toBe(true);
    expect(observation.cleanup.clientExited).toBe(true);
    expect(observation.cleanup.socketsRemoved).toBe(true);
    expect(observation.startupProof.bootstrapStopped).toBe(true);
    expect(observation.failed).toBe(scenario.startsWith("malformed"));
    if (existsSync(join(root, "shell-pid"))) {
      const pid = Number(readFileSync(join(root, "shell-pid"), "utf8"));
      expect(() => process.kill(pid, 0)).toThrow();
      if (observation.regularShellPid === undefined) expect(observation.startupProof.shell).toBe("native-pane-absent");
    }
    if (observation.shellPid === undefined && fast && !scenario.startsWith("malformed")) {
      expect(observation.cleanup.workerStopped).toBe("unknown");
      expect(observation.startupProof.pi).toBe("authoritative-exit-and-pane-absent");
    } else if (observation.shellPid !== undefined) expect(observation.cleanup.workerStopped).toBe(true);
  } finally {
    clearTimeout(timeout); if (child.exitCode === null) { child.kill("SIGTERM"); await child.exited; }
    child.terminal!.close(); writeFileSync(join(root, "raw-terminal.log"), raw);
  }
}, 25000);

for (const { signal, split, malformed } of [
  { signal: "TERM", split: false, malformed: false }, { signal: "TERM", split: true, malformed: false },
  { signal: "HUP", split: false, malformed: false }, { signal: "HUP", split: true, malformed: false },
  { signal: "TERM", split: true, malformed: true },
] as const) actual(`fast startup Pi exit preserves ${signal} priority (${split ? "split" : "single"}${malformed ? ", malformed" : ""})`, async () => {
  mkdirSync(resolve(".tmp"), { recursive: true });
  const root = mkdtempSync(resolve(".tmp/split-signal-")), home = join(root, "user"), project = join(root, "project");
  mkdirSync(home); mkdirSync(project);
  writeFileSync(join(home, ".bashrc"), `printf '%s' $$ > '${root}/shell-pid'\n`);
  const worker = join(root, "worker.sh"), driver = join(root, "driver.ts");
  // The owned worker signals its adapter before writing the authoritative exit.
  writeFileSync(worker, `kill -${signal} "$2"\nprintf '${malformed ? "bad" : "37"}\\n' > "$1/exit"\nexit 37\n`);
  const shell = split ? `buildRegularShell({SHELL:'/bin/bash',HOME:${JSON.stringify(home)},PATH:'/usr/bin:/bin'})` : "undefined";
  writeFileSync(driver, `import {runHerdrInteractive} from ${JSON.stringify(resolve("src/herdr/interactive.ts"))}; import {buildRegularShell} from ${JSON.stringify(resolve("src/herdr/shell.ts"))};\ntry {const n=await runHerdrInteractive({executable:${JSON.stringify(resolve(".tmp/herdr/herdr"))},command:['/bin/sh',${JSON.stringify(worker)},${JSON.stringify(root)},String(process.pid)],cwd:${JSON.stringify(project)},stateRoot:${JSON.stringify(root)},exitFile:${JSON.stringify(join(root,"exit"))},environment:{},shell:${shell}}); await Bun.write(${JSON.stringify(join(root,"result"))},String(n));} catch(e) {await Bun.write(${JSON.stringify(join(root,"error"))},String(e));}`);
  let raw = "";
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", driver], { terminal: { cols: 150, rows: 40, data(_term, data) { raw += new TextDecoder().decode(data); } } });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 20000);
  try {
    expect(await child.exited).toBe(0);
    if (malformed) expect(readFileSync(join(root, "error"), "utf8")).toContain("Invalid Pi exit status");
    else {
      if (existsSync(join(root, "error"))) throw new Error(readFileSync(join(root, "error"), "utf8"));
      expect(readFileSync(join(root, "exit"), "utf8").trim()).toBe("37");
      expect(readFileSync(join(root, "result"), "utf8")).toBe(signal === "TERM" ? "143" : "129");
    }
    const observation = JSON.parse(readFileSync(join(root, "attachment.json"), "utf8"));
    expect(observation.failed).toBe(!!malformed);
    expect(observation.startupProof.bootstrapStopped).toBe(true);
    if (!malformed) expect(observation.startupProof.pi).toBe("authoritative-exit-and-pane-absent");
    else expect(observation.startupProof.pi).toBeUndefined();
    expect(observation.cleanup).toEqual({ serverExited: true, clientExited: true, workerStopped: "unknown", socketsRemoved: true });
    if (existsSync(join(root, "shell-pid"))) expect(() => process.kill(Number(readFileSync(join(root, "shell-pid"), "utf8")), 0)).toThrow();
  } finally {
    clearTimeout(timeout); if (child.exitCode === null) { child.kill("SIGTERM"); await child.exited; }
    child.terminal!.close(); writeFileSync(join(root, "raw-terminal.log"), raw);
  }
}, 25000);

for (const scenario of ["native-shell-close", "native-pi-close", "workspace-close", "detach", "TERM", "HUP"] as const) actual(`actual split cleans up on ${scenario}`, async () => {
  mkdirSync(resolve(".tmp"), { recursive: true });
  const root = mkdtempSync(resolve(".tmp/split-life-")), home = join(root, "user"), project = join(root, "project");
  mkdirSync(home); mkdirSync(project);
  const marker = `LIFE_READY_${root.slice(-6)}`;
  writeFileSync(join(home, ".bashrc"), `printf ready > '${root}/shell-ready'\n`);
  const worker = join(root, "worker.sh"), driver = join(root, "driver.ts");
  writeFileSync(worker, `printf '${marker}\\n'\nwhile read -r line; do printf '%s' "$line" > "$1/input"; done\n`);
  writeFileSync(driver, `import {runHerdrInteractive} from ${JSON.stringify(resolve("src/herdr/interactive.ts"))}; import {buildRegularShell} from ${JSON.stringify(resolve("src/herdr/shell.ts"))};\nconst n=await runHerdrInteractive({executable:${JSON.stringify(resolve(".tmp/herdr/herdr"))},command:['/bin/sh',${JSON.stringify(worker)},${JSON.stringify(root)}],cwd:${JSON.stringify(project)},stateRoot:${JSON.stringify(root)},exitFile:${JSON.stringify(join(root,"absent-exit"))},environment:{},shell:buildRegularShell({SHELL:'/bin/bash',HOME:${JSON.stringify(home)},PATH:'/usr/bin:/bin'})}); await Bun.write(${JSON.stringify(join(root,"result"))},String(n));`);
  let raw = "";
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", driver], { terminal: { cols: 150, rows: 40, data(_term, data) { raw += new TextDecoder().decode(data); } } });
  const pause = (ms: number) => new Promise(done => setTimeout(done, ms));
  const wait = async (what: string, predicate: () => boolean) => {
    const end = Date.now() + 10000;
    while (!predicate()) { if (Date.now() > end || child.exitCode !== null) throw new Error(`${scenario}: waiting for ${what}; ${root}; ${JSON.stringify(raw.slice(-1000))}`); await pause(25); }
  };
  const timeout = setTimeout(() => child.kill("SIGTERM"), 20000);
  try {
    await wait("native ready", () => raw.includes(marker) && existsSync(join(root, "shell-ready")));
    if (scenario === "native-shell-close") {
      child.terminal!.write("\x02l"); await pause(250);
      child.terminal!.write("\x02x"); await pause(500);
      child.terminal!.write("still-running\r"); await wait("Pi input after shell close", () => existsSync(join(root, "input")));
      expect(readFileSync(join(root, "input"), "utf8")).toBe("still-running");
      child.kill("SIGTERM");
    } else if (scenario === "native-pi-close") child.terminal!.write("\x02x");
    else if (scenario === "workspace-close") { child.terminal!.write("\x02D"); await pause(350); child.terminal!.write("\r"); }
    else if (scenario === "detach") child.terminal!.write("\x02q");
    else {
      if (scenario === "TERM") {
        child.terminal!.write("\x02l"); await pause(250);
        child.terminal!.write(`sh -c 'echo $$ > ${root}/job-pid; exec sleep 30'\r`);
        await wait("foreground shell job", () => existsSync(join(root, "job-pid")));
      }
      child.kill(scenario === "TERM" ? "SIGTERM" : "SIGHUP");
    }
    expect(await child.exited).toBe(0);
    expect(readFileSync(join(root, "result"), "utf8")).toBe(scenario === "HUP" ? "129" : scenario === "TERM" || scenario === "native-shell-close" ? "143" : "1");
    const observation = JSON.parse(readFileSync(join(root, "attachment.json"), "utf8"));
    expect(observation.cleanup).toEqual({ serverExited: true, clientExited: true, workerStopped: true, socketsRemoved: true });
    expect(observation.regularShellPid).toBeGreaterThan(1);
    expect(observation.failed).toBe(false);
    if (scenario === "TERM") {
      const job = Number(readFileSync(join(root, "job-pid"), "utf8"));
      expect(() => process.kill(job, 0)).toThrow();
    }
  } finally {
    clearTimeout(timeout); if (child.exitCode === null) { child.kill("SIGTERM"); await child.exited; }
    child.terminal!.close(); writeFileSync(join(root, "raw-terminal.log"), raw);
  }
}, 25000);
