import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { HerdrSmokeOptions, TerminalObservation } from "../integration-contracts.ts";
import provenance from "../../contracts/herdr-source.json";
import { request } from "./protocol.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const describe = (error: unknown) => error instanceof Error ? error.message : String(error);
export class HerdrSmokeError extends Error {
  constructor(message: string, public readonly observation: TerminalObservation) { super(message); this.name = "HerdrSmokeError"; }
}

export function isolatedEnvironment(root: string, session: string): NodeJS.ProcessEnv {
  return {
    PATH: "/usr/bin:/bin", HOME: join(root, "home"), SHELL: "/bin/sh", TERM: "xterm-256color",
    LANG: "C", LC_ALL: "C", TMPDIR: join(root, "tmp"),
    XDG_CONFIG_HOME: join(root, "cfg"), XDG_STATE_HOME: join(root, "state"),
    XDG_CACHE_HOME: join(root, "cache"), XDG_DATA_HOME: join(root, "data"), XDG_RUNTIME_DIR: join(root, "tmp"),
    HERDR_SESSION: session, HERDR_SOCKET_PATH: join(root, "s.sock"),
    HERDR_CONFIG_PATH: join(root, "config.toml"), HERDR_DISABLE_SOUND: "1",
  };
}

function exited(child: ChildProcess): boolean { return child.exitCode !== null || child.signalCode !== null; }
async function waitForExit(child: ChildProcess, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (!exited(child) && Date.now() < until) await delay(20);
  return exited(child);
}
async function socketGone(path: string): Promise<boolean> {
  // A failed ping alone does not prove absence. Verify both socket files are removed.
  for (const p of [path, path.replace(/\.sock$/, "-client.sock")]) {
    try { await lstat(p); return false; } catch (e: any) { if (e.code !== "ENOENT") throw e; }
  }
  return true;
}

/** Actual, disposable Herdr process evidence. Throws with partial evidence on every failure. */
export async function runHerdrSmoke(options: HerdrSmokeOptions): Promise<TerminalObservation> {
  if (!["darwin", "linux"].includes(process.platform)) throw new Error("Herdr smoke supports Unix only");
  const timeoutMs = options.timeoutMs ?? 15000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error("timeoutMs must be 1..120000");
  const tmpRoot = join(projectRoot, ".tmp");
  await mkdir(tmpRoot, { recursive: true, mode: 0o700 });
  const requestedRoot = resolve(options.stateRoot);
  if (requestedRoot !== tmpRoot && !requestedRoot.startsWith(tmpRoot + sep)) throw new Error("stateRoot must be inside this project's .tmp");
  await mkdir(requestedRoot, { recursive: true, mode: 0o700 });
  const actualRoot = await realpath(requestedRoot);
  const actualTmp = await realpath(tmpRoot);
  const rel = relative(actualTmp, actualRoot);
  if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) throw new Error("stateRoot symlink escapes .tmp");
  const root = await mkdtemp(join(actualRoot, "h-"));
  await chmod(root, 0o700);
  const session = `lab-${randomBytes(6).toString("hex")}`;
  const observation: TerminalObservation = {
    label: "actual-herdr-owned-process", session, sourcePin: provenance.sourcePin,
    observedOutput: "", stopped: false, taskAcceptance: "unchanged", runDirectory: root,
    cleanup: { serverExited: false, socketsRemoved: false, workerStopped: false },
  };
  let child: ChildProcess | undefined;
  let processError: Error | undefined;
  let failure: unknown;
  let paneId: string | undefined;
  let workerPid: number | undefined;
  // Installed release paths can exceed Unix socket limits. Keep only sockets
  // in a fresh short owned directory; retain evidence in the project run dir.
  const socketDirectory = await mkdtemp("/tmp/lab-s-");
  let log = "";
  const env = isolatedEnvironment(root, session);
  env.HERDR_SOCKET_PATH = join(socketDirectory, "s.sock");
  const socket = env.HERDR_SOCKET_PATH!;
  const deadline = Date.now() + timeoutMs;
  const remaining = () => {
    const ms = deadline - Date.now();
    if (ms <= 0) throw new Error("Herdr smoke timeout; launch/outcome may be unknown");
    if (processError) throw processError;
    if (child && exited(child)) throw new Error(`Herdr server exited early (${child.exitCode ?? child.signalCode})`);
    return Math.min(ms, 1000);
  };
  try {
    if (Buffer.byteLength(socket.replace(/\.sock$/, "-client.sock")) >= 104) throw new Error("Unix socket path too long; use a shorter stateRoot/project path");
    for (const name of ["home", "tmp", "cfg", "state", "cache", "data"]) await mkdir(join(root, name), { mode: 0o700 });
    await writeFile(env.HERDR_CONFIG_PATH!, '[update]\nversion_check = false\nmanifest_check = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[session]\nresume_agents_on_restore = false\n[experimental]\npane_history = false\n', { mode: 0o600 });
    const executable = resolve(options.executable ?? join(tmpRoot, "herdr/herdr"));
    const binaryHash = createHash("sha256").update(await readFile(executable)).digest("hex");
    const artifact = provenance.runtime.artifacts.find(a => a.sha256 === binaryHash);
    if (!artifact) throw new Error("Herdr executable hash is not a pinned official runtime artifact; run scripts/herdr/acquire.ts");
    observation.runtime = { version: provenance.runtime.version, releaseCommit: provenance.runtime.releaseCommit, sourcePinMatch: false, binarySha256: binaryHash, artifact: artifact.name };
    remaining();
    // Direct foreground server: retain the child handle; never discover or signal another server.
    child = spawn(executable, ["server"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    child.on("error", error => { processError = error; });
    const append = (chunk: Buffer) => { log = (log + chunk.toString()).slice(-16384); };
    child.stdout!.on("data", append); child.stderr!.on("data", append);
    observation.serverPid = child.pid;
    let ping: Record<string, any>;
    while (true) {
      const ms = remaining();
      try { ping = await request(socket, "ping", {}, ms); break; }
      catch (error: any) {
        if (!["ENOENT", "ECONNREFUSED"].includes(error.code)) throw error;
        await delay(25);
      }
    }
    if (ping.type !== "pong" || ping.version !== provenance.runtime.version || !Number.isInteger(ping.protocol)) throw new Error("Unexpected runtime version/protocol in ping");
    observation.status = ping;
    const workspace = await request(socket, "workspace.create", { cwd: root, label: session }, remaining());
    const workspaceId = workspace.workspace?.workspace_id;
    if (typeof workspaceId !== "string") throw new Error("workspace.create missing owned workspace id");
    observation.workspaceId = workspaceId;
    const marker = `LAB_HERDR_OK_${randomBytes(8).toString("hex")}`;
    // Hold the worker until explicit cleanup. Marker is emitted by execution, never echoed input.
    await writeFile(join(root, "worker.sh"), 'printf "%s\\n" "$1"\nprintf "%s\\n" "$$" > worker.pid\nwhile :; do read -r line || exit 0; [ "$line" = stop ] && exit 0; done\n', { mode: 0o600 });
    const launch = await request(socket, "layout.apply", {
      workspace_id: workspaceId, tab_label: session, focus: false,
      root: { type: "pane", label: session, cwd: root, command: ["/bin/sh", join(root, "worker.sh"), marker] },
    }, remaining());
    paneId = launch.layout?.focused_pane_id;
    if (typeof paneId !== "string" || !paneId) throw new Error("layout.apply missing owned pane id; launch outcome unknown");
    observation.paneId = paneId; observation.launch = launch;
    while (true) {
      const read = await request(socket, "pane.read", { pane_id: paneId, source: "visible", lines: 40, format: "text", strip_ansi: true }, remaining());
      if (typeof read.read?.text !== "string") throw new Error("pane.read missing output");
      observation.observedOutput = read.read.text;
      if (read.read.text.split(/\r?\n/).some((line: string) => line.trim() === marker)) break;
      await delay(25);
    }
    const pid = Number((await readFile(join(root, "worker.pid"), "utf8")).trim());
    if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("Worker did not report a valid pid");
    workerPid = pid; observation.workerPid = pid;
    const status = await request(socket, "pane.process_info", { pane_id: paneId }, remaining());
    if (status.process_info?.shell_pid !== workerPid) throw new Error("Owned worker PID does not match Herdr process status");
    observation.workerStatus = status;
  } catch (error) { failure = error; }
  finally {
    // Cleanup gets a separate bounded budget even if the operation timed out.
    const cleanup: Record<string, any> = { serverExited: !child, socketsRemoved: false, workerStopped: !child, errors: [] };
    if (child && !processError) {
      if (paneId && !exited(child)) {
        try { await request(socket, "pane.close", { pane_id: paneId }, 1000); cleanup.paneCloseAcknowledged = true; }
        catch (error) { cleanup.errors.push(describe(error)); }
      }
      if (!exited(child)) {
        try { await request(socket, "server.stop", {}, 1000); cleanup.stopAcknowledged = true; }
        catch (error) { cleanup.errors.push(describe(error)); }
      }
      if (!await waitForExit(child, 2000)) {
        cleanup.forcedSignal = "SIGTERM"; child.kill("SIGTERM");
        if (!await waitForExit(child, 1000)) { cleanup.forcedSignal = "SIGKILL"; child.kill("SIGKILL"); await waitForExit(child, 1000); }
      }
      cleanup.serverExited = exited(child);
      cleanup.exitCode = child.exitCode; cleanup.signal = child.signalCode;
    } else if (processError) { cleanup.serverExited = true; }
    cleanup.socketsRemoved = await socketGone(socket).catch(() => false);
    if (cleanup.socketsRemoved) await rm(socketDirectory, { recursive: true, force: true });
    // PID is diagnostic only: never signal it, because PID reuse cannot prove ownership.
    if (!workerPid) {
      try { const pid = Number((await readFile(join(root, "worker.pid"), "utf8")).trim()); if (Number.isSafeInteger(pid) && pid > 1) workerPid = pid; } catch {}
    }
    if (workerPid) {
      const until = Date.now() + 1000;
      do {
        try { process.kill(workerPid, 0); cleanup.workerStopped = false; }
        catch (error: any) { cleanup.workerStopped = error.code === "ESRCH"; }
        if (cleanup.workerStopped) break;
        await delay(25);
      } while (Date.now() < until);
    } else { cleanup.workerStopped = child ? "unknown" : true; }
    observation.cleanup = cleanup;
    observation.stopped = cleanup.serverExited === true && cleanup.socketsRemoved === true && cleanup.workerStopped === true;
    observation.serverLog = log;
    if (failure) observation.failure = describe(failure);
    await writeFile(join(root, "observation.json"), JSON.stringify(observation, null, 2) + "\n", { mode: 0o600 });
  }
  if (failure || !observation.stopped) throw new HerdrSmokeError(describe(failure ?? "Owned process cleanup could not be verified"), observation);
  return observation;
}
