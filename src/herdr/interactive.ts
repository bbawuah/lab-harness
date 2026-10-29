/** Herdr owns the actual PTY; its native client owns rendering, input and resize. */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import provenance from "../../contracts/herdr-source.json";
import { request } from "./protocol.ts";
import { isolatedEnvironment } from "./index.ts";
import { privateDirectory } from "../pi/workspace-config.ts";
import { shellLeaf, type RegularShell } from "./shell.ts";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export function verifyHerdrInteractive(executable: string): void {
  const stat = lstatSync(executable);
  const hash = createHash("sha256").update(readFileSync(executable)).digest("hex");
  const name = `herdr-${process.platform === "darwin" ? "macos" : process.platform}-${process.arch === "arm64" ? "aarch64" : "x86_64"}`;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !provenance.runtime.artifacts.some(artifact => artifact.name === name && artifact.sha256 === hash)) throw new Error("Herdr is missing or unverified; run ./install.sh");
}
export type HerdrInteractiveOptions = { executable: string; command: string[]; cwd: string; stateRoot: string; environment: NodeJS.ProcessEnv; exitFile?: string; shell?: RegularShell };
function ended(child: ChildProcess): boolean { return child.exitCode !== null || child.signalCode !== null; }
async function waitExit(child: ChildProcess, ms: number): Promise<boolean> { const until = Date.now() + ms; while (!ended(child) && Date.now() < until) await delay(25); return ended(child); }
async function waitPidGone(pid: number, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  do { try { process.kill(pid, 0); } catch (error: any) { if (error.code === "ESRCH") return true; } await delay(25); } while (Date.now() < until);
  return false;
}
export async function runHerdrInteractive(options: HerdrInteractiveOptions): Promise<number> {
  verifyHerdrInteractive(options.executable);
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("LAB interactive workspace requires a terminal");
  if (options.cwd.includes("\0") || !options.command.length || options.command.some(part => part.includes("\0"))) throw new Error("Invalid Pi command or working directory");
  if (options.exitFile && lstatSync(options.exitFile, { throwIfNoEntry: false })) throw new Error("Pi exit status already exists before launch");
  privateDirectory(options.stateRoot);
  // Unix sockets have a 104-byte path bound on macOS. This fresh, short owned
  // directory contains sockets only; persistent state remains project-local.
  const session = `lab-${randomBytes(6).toString("hex")}`;
  const piEnvironment: Record<string, string> = {};
  for (const [name, value] of Object.entries(options.environment)) {
    if (value === undefined) continue;
    if (name.includes("\0") || name.includes("=") || value.includes("\0")) throw new Error("Invalid Pi environment entry");
    piEnvironment[name] = value;
  }
  const sockets = mkdtempSync("/tmp/lab-h-");
  const env: NodeJS.ProcessEnv = { ...isolatedEnvironment(options.stateRoot, session), HERDR_SESSION: session, HERDR_SOCKET_PATH: join(sockets, "s.sock") };
  const socket = env.HERDR_SOCKET_PATH!;
  try {
    for (const name of ["home", "tmp", "cfg", "state", "cache", "data"]) privateDirectory(join(options.stateRoot, name));
    writeFileSync(env.HERDR_CONFIG_PATH!, 'onboarding = false\n[update]\nversion_check = false\nmanifest_check = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[session]\nresume_agents_on_restore = false\n[experimental]\npane_history = false\n', { mode: 0o600 });
  } catch (error) { rmSync(sockets, { recursive: true, force: true }); throw error; }
  let server: ChildProcess | undefined, client: ChildProcess | undefined, pane: string | undefined, shellPid: number | undefined;
  let workspaceId: string | undefined, shellPane: string | undefined, regularShellPid: number | undefined;
  let piStartupProof: string | undefined, shellStartupProof: string | undefined, bootstrapStopped = false;
  let serverError: Error | undefined, clientError: Error | undefined, interruptError: unknown, interrupted = 0, rawBefore = process.stdin.isRaw;
  const terminate = (signal: number) => { interrupted = signal; if (client && !ended(client)) client.kill("SIGTERM"); };
  const onTerm = () => terminate(15), onHup = () => terminate(1);
  process.on("SIGTERM", onTerm); process.on("SIGHUP", onHup);
  // An externally delivered SIGINT must follow native focus, never the saved Pi ID.
  const interrupt = () => { void (async () => {
    if (!workspaceId) throw new Error("Cannot route SIGINT before a workspace is ready");
    const list = await request(socket, "pane.list", { workspace_id: workspaceId });
    const focused = list.panes?.find((item: any) => item.focused && (item.pane_id === pane || item.pane_id === shellPane));
    if (!focused) throw new Error("Cannot route SIGINT without an owned focused pane");
    await request(socket, "pane.send_keys", { pane_id: focused.pane_id, keys: ["ctrl+c"] });
  })().catch(error => { interruptError = error; }); };
  process.on("SIGINT", interrupt);
  let result = 1, failure: unknown;
  try {
    session: {
    const regularLeaf = options.shell ? shellLeaf(options.shell, options.cwd, env) : undefined;
    server = spawn(options.executable, ["server"], { cwd: options.stateRoot, env, stdio: ["ignore", "ignore", "pipe"] });
    server.on("error", error => { serverError = error; }); server.stderr!.resume();
    const deadline = Date.now() + 10000;
    for (;;) {
      if (serverError) throw serverError;
      if (ended(server)) throw new Error("Owned Herdr server exited before attachment");
      if (Date.now() > deadline) throw new Error("Owned Herdr server startup timed out");
      try { const ping = await request(socket, "ping"); if (ping.type !== "pong" || ping.version !== provenance.runtime.version) throw new Error("Herdr runtime protocol/version mismatch"); break; }
      catch (error: any) { if (!["ENOENT", "ECONNREFUSED"].includes(error.code)) throw error; await delay(25); }
    }
    const workspace = await request(socket, "workspace.create", { cwd: options.cwd, label: "LAB-HARNESS" });
    workspaceId = workspace.workspace?.workspace_id;
    const bootstrapTab = workspace.workspace?.active_tab_id;
    if (typeof workspaceId !== "string" || typeof bootstrapTab !== "string") throw new Error("Herdr workspace creation returned no workspace or bootstrap tab ID");
    const before = await request(socket, "pane.list", { workspace_id: workspaceId });
    const bootstrap = before.panes?.find((item: any) => item.tab_id === bootstrapTab);
    if (!bootstrap?.pane_id || before.panes.length !== 1) throw new Error("Unexpected Herdr bootstrap pane");
    const bootInfo = await request(socket, "pane.process_info", { pane_id: bootstrap.pane_id });
    const bootstrapPid = bootInfo.process_info?.shell_pid;
    if (!Number.isSafeInteger(bootstrapPid) || bootstrapPid <= 1) throw new Error("Herdr bootstrap process is unknown");
    const pi = { type: "pane", label: "Pi interactive", cwd: options.cwd, command: options.command, env: piEnvironment };
    const root = regularLeaf ? { type: "split", direction: "right", ratio: 0.6, first: pi, second: regularLeaf } : pi;
    const launch = await request(socket, "layout.apply", { tab_id: bootstrapTab, tab_label: "LAB workspace", focus: true, root });
    const layout = launch.layout;
    pane = options.shell ? layout?.root?.first?.pane_id : layout?.root?.pane_id;
    shellPane = options.shell ? layout?.root?.second?.pane_id : undefined;
    if (typeof pane !== "string") throw new Error("Herdr launch returned no pane ID; outcome unknown");
    if (layout.focused_pane_id !== pane || (options.shell && (typeof shellPane !== "string" || shellPane === pane))) throw new Error("Herdr launch returned unexpected focus or shell pane");
    const readExit = (): number | undefined => {
      if (!options.exitFile || !lstatSync(options.exitFile, { throwIfNoEntry: false })) return undefined;
      const text = readFileSync(options.exitFile, "utf8").trim();
      if (!/^\d{1,3}$/.test(text) || Number(text) > 255) throw new Error("Invalid Pi exit status");
      return Number(text);
    };
    const missing = (error: unknown, method: string, code: string) => error instanceof Error && error.message.startsWith(`${method}: {"code":"${code}"`);
    const startupPanes = async (): Promise<string[]> => {
      const workspaces = await request(socket, "workspace.list");
      if (!Array.isArray(workspaces.workspaces)) throw new Error("Invalid Herdr workspace list");
      if (!workspaces.workspaces.some((item: any) => item.workspace_id === workspaceId)) return [];
      try {
        const list = await request(socket, "pane.list", { workspace_id: workspaceId });
        if (!Array.isArray(list.panes)) throw new Error("Invalid Herdr pane list");
        return list.panes.map((item: any) => item.pane_id);
      } catch (error) {
        if (!missing(error, "pane.list", "workspace_not_found")) throw error;
        const latest = await request(socket, "workspace.list");
        if (Array.isArray(latest.workspaces) && !latest.workspaces.some((item: any) => item.workspace_id === workspaceId)) return [];
        throw error;
      }
    };
    let present = await startupPanes();
    if (present.some(id => id === bootstrap.pane_id || (id !== pane && id !== shellPane))) throw new Error("Bootstrap tab was not replaced");
    if (!await waitPidGone(bootstrapPid, 1500)) throw new Error("Bootstrap shell did not stop");
    bootstrapStopped = true;
    // Only explicit not-found responses can be reconciled with a fresh snapshot.
    const startupPid = async (id: string): Promise<number | undefined> => {
      if (!present.includes(id)) return undefined;
      try {
        const info = await request(socket, "pane.process_info", { pane_id: id });
        const pid = info.process_info?.shell_pid;
        if (Number.isSafeInteger(pid) && pid > 1) return pid;
      } catch (error) {
        if (!missing(error, "pane.process_info", "pane_not_found")) throw error;
        present = await startupPanes();
        if (present.includes(id)) throw error;
        return undefined;
      }
      present = await startupPanes();
      // A process can have exited while Herdr still exposes its pane. Wait only
      // for a closing shell, or for Pi after its wrapper has written status.
      if (present.includes(id) && (id === shellPane || readExit() !== undefined)) {
        const until = Date.now() + 1000;
        while (present.includes(id) && Date.now() < until) {
          await delay(25);
          present = await startupPanes();
        }
      }
      if (present.includes(id)) throw new Error("Owned pane worker PID is unknown");
      return undefined;
    };
    if (shellPane) {
      regularShellPid = await startupPid(shellPane);
      if (regularShellPid === undefined) shellStartupProof = "native-pane-absent";
    }
    shellPid = await startupPid(pane);
    if (shellPid === undefined) {
      const status = readExit();
      if (status === undefined) throw new Error("Pi disappeared during startup without an exit status");
      piStartupProof = "authoritative-exit-and-pane-absent";
      result = interrupted ? 128 + interrupted : status;
      break session;
    }
    client = spawn(options.executable, ["client"], { cwd: options.cwd, env, stdio: "inherit" });
    client.on("error", error => { clientError = error; });
    let piExit: number | undefined;
    while (!ended(client) && !clientError && !interrupted) {
      if (interruptError) throw interruptError;
      if (serverError || ended(server)) throw new Error("Owned Herdr server exited during interactive workspace");
      piExit = readExit();
      if (piExit !== undefined) break;
      const workspaces = await request(socket, "workspace.list");
      if (!Array.isArray(workspaces.workspaces)) throw new Error("Invalid Herdr workspace list");
      if (!workspaces.workspaces.some((item: any) => item.workspace_id === workspaceId)) break;
      let panes: Record<string, any>;
      try { panes = await request(socket, "pane.list", { workspace_id: workspaceId }); }
      catch (error) {
        // The workspace can disappear between the two read-only observations.
        if (!missing(error, "pane.list", "workspace_not_found")) throw error;
        const latest = await request(socket, "workspace.list");
        if (Array.isArray(latest.workspaces) && !latest.workspaces.some((item: any) => item.workspace_id === workspaceId)) break;
        throw error;
      }
      if (!Array.isArray(panes.panes)) throw new Error("Invalid Herdr pane list");
      if (!panes.panes.some((item: any) => item.pane_id === pane)) break;
      await delay(100);
    }
    if (clientError) throw clientError;
    // A worker can write its status while Herdr is removing its last pane.
    if (piExit === undefined) piExit = readExit();
    result = interrupted ? 128 + interrupted : piExit ?? (ended(client) ? (client.exitCode || 1) : 1);
    }
  } catch (error) { failure = error; }
  finally {
    process.off("SIGINT", interrupt); process.off("SIGTERM", onTerm); process.off("SIGHUP", onHup);
    if (client && !ended(client)) { client.kill("SIGTERM"); if (!await waitExit(client, 1000)) { client.kill("SIGKILL"); await waitExit(client, 1000); } }
    if (process.stdin.isTTY) process.stdin.setRawMode(rawBefore);
    if (workspaceId && server && !ended(server)) await request(socket, "workspace.close", { workspace_id: workspaceId }).catch(() => {});
    if (server && !ended(server)) await request(socket, "server.stop").catch(() => {});
    if (server && !await waitExit(server, 2000)) { server.kill("SIGTERM"); if (!await waitExit(server, 1000)) { server.kill("SIGKILL"); await waitExit(server, 1000); } }
    if (server && !ended(server) || client && !ended(client)) failure ??= new Error("Owned Herdr processes did not exit during cleanup");
    let workerStopped = shellPid === undefined ? "unknown" : false;
    if (shellPid !== undefined) {
      const deadline = Date.now() + 1500;
      do {
        try { process.kill(shellPid, 0); }
        catch (error: any) { if (error.code === "ESRCH") { workerStopped = true; break; } }
        await delay(25);
      } while (Date.now() < deadline);
      if (workerStopped !== true) failure ??= new Error("Owned Herdr worker exit could not be verified");
    }
    if (regularShellPid !== undefined && !await waitPidGone(regularShellPid, 1500)) failure ??= new Error("Owned regular shell exit could not be verified");
    const socketsRemoved = !lstatSync(socket, { throwIfNoEntry: false }) && !lstatSync(socket.replace(/\.sock$/, "-client.sock"), { throwIfNoEntry: false });
    if (!socketsRemoved) failure ??= new Error("Owned Herdr sockets remained after server exit");
    writeFileSync(join(options.stateRoot, "attachment.json"), JSON.stringify({
      label: "actual-herdr-native-client", runtimeVersion: provenance.runtime.version,
      paneId: pane, shellPaneId: shellPane, serverPid: server?.pid, clientPid: client?.pid, shellPid, regularShellPid,
      exitCode: result, failed: failure !== undefined,
      startupProof: { bootstrapStopped, pi: piStartupProof, shell: shellStartupProof },
      cleanup: { serverExited: !server || ended(server), clientExited: !client || ended(client), workerStopped, socketsRemoved },
    }, null, 2) + "\n", { mode: 0o600 });
    if ((!server || ended(server)) && (!client || ended(client))) rmSync(sockets, { recursive: true, force: true });
  }
  if (failure) throw failure;
  return result;
}
