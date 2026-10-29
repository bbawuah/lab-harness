/** Herdr owns the actual PTY; its native client owns rendering, input and resize. */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import provenance from "../../contracts/herdr-source.json";
import { request } from "./protocol.ts";
import { isolatedEnvironment } from "./index.ts";
import { privateDirectory } from "../pi/workspace-config.ts";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export function verifyHerdrInteractive(executable: string): void {
  const stat = lstatSync(executable);
  const hash = createHash("sha256").update(readFileSync(executable)).digest("hex");
  const name = `herdr-${process.platform === "darwin" ? "macos" : process.platform}-${process.arch === "arm64" ? "aarch64" : "x86_64"}`;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !provenance.runtime.artifacts.some(artifact => artifact.name === name && artifact.sha256 === hash)) throw new Error("Herdr is missing or unverified; run ./install.sh");
}
export type HerdrInteractiveOptions = { executable: string; command: string[]; cwd: string; stateRoot: string; environment: NodeJS.ProcessEnv; exitFile?: string };
function ended(child: ChildProcess): boolean { return child.exitCode !== null || child.signalCode !== null; }
async function waitExit(child: ChildProcess, ms: number): Promise<boolean> { const until = Date.now() + ms; while (!ended(child) && Date.now() < until) await delay(25); return ended(child); }
export async function runHerdrInteractive(options: HerdrInteractiveOptions): Promise<number> {
  verifyHerdrInteractive(options.executable);
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("LAB interactive workspace requires a terminal");
  privateDirectory(options.stateRoot);
  // Unix sockets have a 104-byte path bound on macOS. This fresh, short owned
  // directory contains sockets only; persistent state remains project-local.
  const sockets = mkdtempSync("/tmp/lab-h-");
  const session = `lab-${randomBytes(6).toString("hex")}`;
  const env: NodeJS.ProcessEnv = { ...isolatedEnvironment(options.stateRoot, session), ...options.environment, HERDR_SESSION: session, HERDR_SOCKET_PATH: join(sockets, "s.sock") };
  const socket = env.HERDR_SOCKET_PATH!;
  for (const name of ["home", "tmp", "cfg", "state", "cache", "data"]) privateDirectory(join(options.stateRoot, name));
  writeFileSync(env.HERDR_CONFIG_PATH!, 'onboarding = false\n[update]\nversion_check = false\nmanifest_check = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[session]\nresume_agents_on_restore = false\n[experimental]\npane_history = false\n', { mode: 0o600 });
  let server: ChildProcess | undefined, client: ChildProcess | undefined, pane: string | undefined;
  let serverError: Error | undefined, clientError: Error | undefined, interrupted = false, rawBefore = process.stdin.isRaw;
  const terminate = () => { interrupted = true; if (client && !ended(client)) client.kill("SIGTERM"); };
  process.on("SIGTERM", terminate); process.on("SIGHUP", terminate);
  const interrupt = () => { if (pane) void request(socket, "pane.send_keys", { pane_id: pane, keys: ["Ctrl-c"] }).catch(() => {}); };
  process.on("SIGINT", interrupt);
  let result = 1, failure: unknown;
  try {
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
    if (typeof workspace.workspace?.workspace_id !== "string") throw new Error("Herdr workspace creation returned no ID");
    const launch = await request(socket, "layout.apply", { workspace_id: workspace.workspace.workspace_id, tab_label: "LAB workspace", focus: true, root: { type: "pane", label: "Pi interactive", cwd: options.cwd, command: options.command } });
    pane = launch.layout?.focused_pane_id;
    if (typeof pane !== "string") throw new Error("Herdr launch returned no pane ID; outcome unknown");
    client = spawn(options.executable, ["client"], { cwd: options.cwd, env, stdio: "inherit" });
    client.on("error", error => { clientError = error; });
    let piExit: number | undefined;
    while (!ended(client) && !clientError && !interrupted) {
      if (serverError || ended(server)) throw new Error("Owned Herdr server exited during interactive workspace");
      if (options.exitFile && lstatSync(options.exitFile, { throwIfNoEntry: false })) {
        const text = readFileSync(options.exitFile, "utf8").trim();
        if (!/^\d{1,3}$/.test(text) || Number(text) > 255) throw new Error("Invalid Pi exit status");
        piExit = Number(text); break;
      }
      await delay(100);
    }
    if (clientError) throw clientError;
    result = interrupted ? 143 : piExit ?? client.exitCode ?? 1;
  } catch (error) { failure = error; }
  finally {
    process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); process.off("SIGHUP", terminate);
    if (client && !ended(client)) { client.kill("SIGTERM"); if (!await waitExit(client, 1000)) { client.kill("SIGKILL"); await waitExit(client, 1000); } }
    if (process.stdin.isTTY) process.stdin.setRawMode(rawBefore);
    if (pane && server && !ended(server)) await request(socket, "pane.close", { pane_id: pane }).catch(() => {});
    if (server && !ended(server)) await request(socket, "server.stop").catch(() => {});
    if (server && !await waitExit(server, 2000)) { server.kill("SIGTERM"); if (!await waitExit(server, 1000)) { server.kill("SIGKILL"); await waitExit(server, 1000); } }
    if (server && !ended(server) || client && !ended(client)) failure ??= new Error("Owned Herdr processes did not exit during cleanup");
    rmSync(sockets, { recursive: true, force: true });
  }
  if (failure) throw failure;
  return result;
}
