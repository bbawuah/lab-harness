/** Explicit opt-in: actual Pi startup only, through a fresh owned Herdr server/pane. */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedEnvironment } from "../../src/herdr/index.ts";
import { request } from "../../src/herdr/protocol.ts";
import provenance from "../../contracts/herdr-source.json";
import { NATIVE_LAB_LABEL } from "../../src/pi/header.ts";

export const PI_STARTUP_FLAGS = ["--offline", "--no-extensions", "--no-mcp", "--no-skills",
  "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-session", "--no-tools"] as const;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const root = fileURLToPath(new URL("../../", import.meta.url));
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const exited = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null;
async function waitExit(child: ChildProcess, ms: number) {
  const deadline = Date.now() + ms;
  while (!exited(child) && Date.now() < deadline) await delay(25);
  return exited(child);
}
async function absent(path: string) {
  try { await lstat(path); return false; } catch (e: any) { if (e.code === "ENOENT") return true; throw e; }
}

export async function smokeHeader(options: { herdr: string; pi: string; node: string }) {
  const pi = await realpath(resolve(options.pi));
  const node = await realpath(resolve(options.node));
  const herdr = await realpath(resolve(options.herdr));
  // Refuse a different CLI/package until its source flags and startup behavior are reviewed.
  const packageRoot = resolve(dirname(pi), "../..");
  const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  if (metadata.name !== "@earendil-works/pi-coding-agent" || metadata.version !== "1.4.0" || !pi.endsWith("/dist/bundle/cli.js")) {
    throw new Error("This smoke is source-reviewed only for the installed Pi 1.4.0 bundle");
  }
  const binarySha256 = hash(await readFile(herdr));
  const artifact = provenance.runtime.artifacts.find(artifact => artifact.sha256 === binarySha256);
  if (!artifact) throw new Error("Herdr must match a pinned official runtime artifact");
  await mkdir(join(root, ".tmp"), { recursive: true, mode: 0o700 });
  const run = await mkdtemp(join(root, ".tmp/p-"));
  const session = `lab-header-${randomBytes(6).toString("hex")}`;
  const env: NodeJS.ProcessEnv = {
    ...isolatedEnvironment(run, session),
    PATH: `${dirname(node)}:/usr/bin:/bin`, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8",
    PI_CODING_AGENT_DIR: join(run, "pi"), PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1",
    DO_NOT_TRACK: "1", COLORTERM: "truecolor",
  };
  const socket = env.HERDR_SOCKET_PATH!;
  if (Buffer.byteLength(socket.replace(/\.sock$/, "-client.sock")) >= 104) throw new Error("Project path too long for an isolated Unix socket");
  for (const folder of ["home", "tmp", "cfg", "state", "cache", "data", "pi"]) await mkdir(join(run, folder), { mode: 0o700 });
  await writeFile(env.HERDR_CONFIG_PATH!, '[update]\nversion_check = false\nmanifest_check = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[session]\nresume_agents_on_restore = false\n[experimental]\npane_history = false\n', { mode: 0o600 });
  // Only the disposable state gets settings. No user's settings, sessions or credentials are read.
  await writeFile(join(run, "pi/settings.json"), JSON.stringify({ theme: "dark", quietStartup: false }), { mode: 0o600 });
  const runtimeVersion = spawnSync(node, [pi, "--version"], { cwd: run, env, encoding: "utf8", timeout: 10000 });
  if (runtimeVersion.status !== 0 || runtimeVersion.stdout.trim() !== "1.4.0") throw new Error("Actual Pi --version was not 1.4.0");
  const extension = join(root, "src/pi/header.ts");
  const flags = [...PI_STARTUP_FLAGS, "-e", extension];
  const observation: Record<string, any> = {
    label: "actual-pi-no-model-owned-herdr-startup", nativeLabActivation: "blocked-unqualified",
    taskAcceptance: "unchanged", runtimeVersion: runtimeVersion.stdout.trim(),
    piBundleSha256: hash(await readFile(pi)), herdrVersion: provenance.runtime.version,
    herdrBinarySha256: binarySha256, herdrSourcePinMatch: false,
    flags, promptSubmitted: false, providerRequest: "not invoked; startup observation only",
    environmentKeys: Object.keys(env).sort(), runDirectory: run, session,
  };
  let server: ChildProcess | undefined, paneId: string | undefined, workerPid: number | undefined;
  let error: unknown;
  let serverLog = "";
  try {
    server = spawn(herdr, ["server"], { cwd: run, env, stdio: ["ignore", "pipe", "pipe"] });
    let spawnError: Error | undefined;
    server.on("error", e => { spawnError = e; });
    const append = (bytes: Buffer) => { serverLog = (serverLog + bytes.toString()).slice(-16384); };
    server.stdout!.on("data", append); server.stderr!.on("data", append);
    const deadline = Date.now() + 20000;
    const remaining = () => {
      if (spawnError) throw spawnError;
      if (exited(server!)) throw new Error("Owned Herdr server exited early");
      if (Date.now() >= deadline) throw new Error("Startup timeout; launch/outcome may be unknown");
      return Math.min(1000, deadline - Date.now());
    };
    while (true) {
      remaining();
      try { observation.ping = await request(socket, "ping", {}, remaining()); break; }
      catch (e: any) { if (!["ENOENT", "ECONNREFUSED"].includes(e.code)) throw e; await delay(25); }
    }
    if (observation.ping.version !== provenance.runtime.version) throw new Error("Herdr ping version mismatch");
    const created = await request(socket, "workspace.create", { cwd: run, label: session }, remaining());
    const workspaceId = created.workspace?.workspace_id;
    if (typeof workspaceId !== "string") throw new Error("No owned workspace id");
    // Wrapper records its own PID, then exec replaces it with the actual installed Pi CLI.
    const wrapper = join(run, "startup.sh");
    await writeFile(wrapper, 'printf "%s\\n" "$$" > worker.pid\nexec "$@"\n', { mode: 0o600 });
    const launched = await request(socket, "layout.apply", {
      workspace_id: workspaceId, tab_label: session, focus: false,
      root: { type: "pane", cwd: run, label: session, command: ["/bin/sh", wrapper, node, pi, ...flags] },
    }, remaining());
    paneId = launched.layout?.focused_pane_id;
    if (typeof paneId !== "string") throw new Error("No owned pane id; launch outcome unknown");
    observation.paneId = paneId;
    while (true) {
      const visible = await request(socket, "pane.read", { pane_id: paneId, source: "visible", lines: 80, format: "text", strip_ansi: true }, remaining());
      observation.visible = visible;
      const text = visible.read?.text;
      if (typeof text === "string" && text.includes("LAB-HARNESS") && text.includes("Powered by Pi") && text.includes(NATIVE_LAB_LABEL) && /[▀▄]/.test(text)) break;
      await delay(100);
    }
    observation.visibleRaw = await request(socket, "pane.read", { pane_id: paneId, source: "visible", lines: 80, format: "text", strip_ansi: false }, remaining());
    observation.processInfo = await request(socket, "pane.process_info", { pane_id: paneId }, remaining());
    workerPid = Number((await readFile(join(run, "worker.pid"), "utf8")).trim());
    if (!Number.isSafeInteger(workerPid) || workerPid <= 1 || observation.processInfo.process_info?.shell_pid !== workerPid) throw new Error("Owned Pi PID mismatch");
    observation.workerPid = workerPid;
  } catch (e) { error = e; observation.failure = e instanceof Error ? e.message : String(e); }
  finally {
    const cleanup: Record<string, any> = { errors: [] };
    if (server && !exited(server)) {
      if (paneId) {
        try { await request(socket, "pane.close", { pane_id: paneId }, 1000); cleanup.paneCloseAcknowledged = true; }
        catch (e) { cleanup.errors.push(String(e)); }
      }
      try { await request(socket, "server.stop", {}, 1000); cleanup.serverStopAcknowledged = true; }
      catch (e) { cleanup.errors.push(String(e)); }
      if (!await waitExit(server, 2000)) {
        server.kill("SIGTERM"); cleanup.forcedSignal = "SIGTERM";
        if (!await waitExit(server, 1000)) { server.kill("SIGKILL"); cleanup.forcedSignal = "SIGKILL"; await waitExit(server, 1000); }
      }
    }
    cleanup.serverExited = server ? exited(server) : true;
    cleanup.socketsRemoved = await absent(socket) && await absent(socket.replace(/\.sock$/, "-client.sock"));
    if (!workerPid) {
      try { const pid = Number((await readFile(join(run, "worker.pid"), "utf8")).trim()); if (Number.isSafeInteger(pid) && pid > 1) workerPid = pid; } catch {}
    }
    cleanup.workerStopped = "unknown";
    if (workerPid) {
      for (let i = 0; i < 40; i++) {
        try { process.kill(workerPid, 0); cleanup.workerStopped = false; }
        catch (e: any) { cleanup.workerStopped = e.code === "ESRCH"; }
        if (cleanup.workerStopped) break;
        await delay(25);
      }
    }
    observation.cleanup = cleanup;
    observation.serverLog = serverLog;
    await writeFile(join(run, "observation.json"), JSON.stringify(observation, null, 2) + "\n", { mode: 0o600 });
  }
  if (error || !observation.cleanup.serverExited || !observation.cleanup.socketsRemoved || observation.cleanup.workerStopped !== true) {
    throw new Error(`${observation.failure ?? "Cleanup not verified"}; evidence: ${join(run, "observation.json")}`);
  }
  return observation;
}

if (import.meta.main) {
  const argument = (name: string) => {
    const index = process.argv.indexOf(name);
    if (index < 0 || !process.argv[index + 1] || process.argv[index + 1]!.startsWith("--")) throw new Error(`Required ${name} absolute path`);
    return process.argv[index + 1]!;
  };
  const result = await smokeHeader({ herdr: argument("--herdr"), pi: argument("--pi"), node: argument("--node") });
  console.log(JSON.stringify(result, null, 2));
}
